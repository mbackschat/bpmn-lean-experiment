import {
  decodeExecutionPublicationExport,
  decodeExecutionPublicationPage,
  decodeExecutionPublicationRequest,
  executionPublicationExportFormat,
} from "@bpmn-lean/platform-contracts";
import type {
  CurrentCommittedExecution,
  ExecutionPublicationExport,
  ExecutionPublicationIdentity,
  ExecutionPublicationPage,
  ExecutionPublicationRequest,
} from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  ExecutionPublicationIntegrityError,
  ExecutionPublicationProjectionStatus,
} from "./execution-publication-contracts.js";
import type {
  ExecutionPublicationProjectionImage,
  ExecutionPublicationRepository,
} from "./execution-publication-contracts.js";
import {
  applyExecutionPublicationPage,
  createEmptyExecutionPublicationProjection,
  projectionIdentityFromRegistration,
} from "./execution-publication-projection.js";
import {
  deleteExecutionPublicationPrefix,
  insertExecutionPublicationBatches,
  readStoredExecutionPublication,
  sameCanonicalValue,
  writeExecutionPublicationHeader,
} from "./execution-publication-storage.js";
import type { StoredExecutionPublication } from "./execution-publication-storage.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";
import {
  requireNonemptyString,
  requireObservation,
  requirePositiveSafeInteger,
  sameJson,
  snapshotConfirmedPublication,
} from "./incident-values.js";

/**
 * PostgreSQL owner of one exact committed-publication prefix per Process instance.
 * The caller owns the shared runtime and its lifecycle.
 */
export class PostgresqlExecutionPublicationRepository
  implements ExecutionPublicationRepository {
  readonly #runtime: PostgresqlRuntime;

  constructor(runtime: PostgresqlRuntime) {
    this.#runtime = runtime;
  }

  async get(
    processInstanceId: string,
  ): Promise<ExecutionPublicationProjectionImage | null> {
    const exactId = requireNonemptyString(processInstanceId, "processInstanceId");
    const stored = await readStoredExecutionPublication(this.#runtime, exactId, false);
    return stored?.image === null || stored === null
      ? null
      : structuredClone(stored.image);
  }

  async applyPage(
    registration: OperateProcessRegistration,
    page: ExecutionPublicationPage,
  ): Promise<ExecutionPublicationProjectionImage> {
    const exactRegistration = snapshotRegistration(registration);
    const identity = projectionIdentityFromRegistration(exactRegistration);
    const exactPage = snapshotPage(page, identity);
    return await this.#runtime.transaction(async (session: PostgresqlSession) => {
      const stored = await readStoredExecutionPublication(
        session,
        exactRegistration.instance.processInstanceId,
        true,
      );
      requireMatchingRegistration(stored, exactRegistration);
      const prior = stored?.image ?? createEmptyExecutionPublicationProjection(identity);
      const next = applyExecutionPublicationPage(prior, exactPage);
      if (!sameCanonicalValue(prior, next)) {
        await writeExecutionPublicationHeader(session, next);
        await insertExecutionPublicationBatches(
          session,
          next.identity.processInstanceId,
          next.batches.slice(prior.batches.length),
        );
      }
      return structuredClone(next);
    });
  }

  async replaceFromPages(
    registration: OperateProcessRegistration,
    pages: readonly ExecutionPublicationPage[],
  ): Promise<ExecutionPublicationProjectionImage> {
    const exactRegistration = snapshotRegistration(registration);
    const identity = projectionIdentityFromRegistration(exactRegistration);
    if (!Array.isArray(pages)) {
      throw new TypeError("execution publication rebuild pages must be an array");
    }
    const exactPages = pages.map((page) => snapshotPage(page, identity));
    let candidate = createEmptyExecutionPublicationProjection(identity);
    for (const page of exactPages) {
      candidate = applyExecutionPublicationPage(candidate, page);
    }
    if (
      candidate.headRevision === 0 ||
      candidate.current === null ||
      candidate.producerHeadRevision !== candidate.headRevision
    ) {
      throw new ExecutionPublicationIntegrityError(
        "rebuilt publication did not reach one complete positive head",
      );
    }
    const exactCandidate = structuredClone(candidate);
    return await this.#runtime.transaction(async (session: PostgresqlSession) => {
      const stored = await readStoredExecutionPublication(
        session,
        exactRegistration.instance.processInstanceId,
        true,
      );
      requireMatchingRegistration(stored, exactRegistration);
      await writeExecutionPublicationHeader(session, exactCandidate);
      await deleteExecutionPublicationPrefix(
        session,
        exactCandidate.identity.processInstanceId,
      );
      await insertExecutionPublicationBatches(
        session,
        exactCandidate.identity.processInstanceId,
        exactCandidate.batches,
      );
      return structuredClone(exactCandidate);
    });
  }

  async mark(
    registration: OperateProcessRegistration,
    status:
      | ExecutionPublicationProjectionStatus.Gap
      | ExecutionPublicationProjectionStatus.Unavailable,
  ): Promise<void> {
    const exactRegistration = snapshotRegistration(registration);
    const exactStatus = requireMarkStatus(status);
    await this.#runtime.transaction(async (session: PostgresqlSession) => {
      const stored = await readStoredExecutionPublication(
        session,
        exactRegistration.instance.processInstanceId,
        true,
      );
      requireMatchingRegistration(stored, exactRegistration);
      const identity = projectionIdentityFromRegistration(exactRegistration);
      const prior = stored?.image ?? createEmptyExecutionPublicationProjection(identity);
      if (prior.status !== exactStatus) {
        await writeExecutionPublicationHeader(session, { ...prior, status: exactStatus });
      }
    });
  }

  async page(
    processInstanceId: string,
    request: ExecutionPublicationRequest,
  ): Promise<ExecutionPublicationPage | null> {
    const exactId = requireNonemptyString(processInstanceId, "processInstanceId");
    const exactRequest = structuredClone(decodeExecutionPublicationRequest(request));
    const image = await this.get(exactId);
    if (!isReadable(image)) return null;
    requireCursor(exactRequest.afterRevision, image);
    const limit = exactRequest.limit ?? 50;
    const batches = image.batches
      .filter(({ fromRevision }) => fromRevision >= exactRequest.afterRevision)
      .slice(0, limit);
    const pageThroughRevision = batches.at(-1)?.throughRevision ??
      exactRequest.afterRevision;
    return decodeExecutionPublicationPage({
      ...image.identity,
      requestedAfterRevision: exactRequest.afterRevision,
      pageThroughRevision,
      headRevision: image.headRevision,
      batches,
      current: pageThroughRevision === image.headRevision ? image.current : null,
    }, {
      ...image.identity,
      afterRevision: exactRequest.afterRevision,
      ...(exactRequest.limit === undefined ? {} : { limit: exactRequest.limit }),
    });
  }

  async export(
    processInstanceId: string,
  ): Promise<ExecutionPublicationExport | null> {
    const exactId = requireNonemptyString(processInstanceId, "processInstanceId");
    const image = await this.get(exactId);
    if (!isReadable(image) || image.batches.length === 0) return null;
    return decodeExecutionPublicationExport({
      format: executionPublicationExportFormat,
      ...image.identity,
      headRevision: image.headRevision,
      batches: image.batches,
      current: image.current,
    }, image.identity);
  }
}

function snapshotRegistration(
  registration: OperateProcessRegistration,
): OperateProcessRegistration {
  const publication = snapshotConfirmedPublication({
    instance: registration.instance,
    locator: registration.locator,
  });
  return {
    ordinal: requirePositiveSafeInteger(registration.ordinal, "registration.ordinal"),
    ...publication,
    observation: requireObservation(registration.observation),
  };
}

function snapshotPage(
  page: ExecutionPublicationPage,
  identity: ExecutionPublicationIdentity,
): ExecutionPublicationPage {
  const batchCount = Array.isArray(page.batches) ? page.batches.length : 0;
  const decoded = decodeExecutionPublicationPage(page, {
    ...identity,
    afterRevision: page.requestedAfterRevision,
    limit: Math.max(1, Math.min(100, batchCount)),
  });
  return structuredClone(decoded);
}

function requireMatchingRegistration(
  stored: StoredExecutionPublication | null,
  expected: OperateProcessRegistration,
): void {
  if (stored === null) {
    throw new ExecutionPublicationIntegrityError(
      "execution publication has no confirmed Process instance",
    );
  }
  if (
    !sameJson(stored.registration.instance, expected.instance) ||
    stored.registration.locator !== expected.locator
  ) {
    throw new ExecutionPublicationIntegrityError(
      "execution publication registration changed",
    );
  }
}

function requireMarkStatus(
  status: unknown,
): ExecutionPublicationProjectionStatus.Gap | ExecutionPublicationProjectionStatus.Unavailable {
  switch (status) {
    case ExecutionPublicationProjectionStatus.Gap:
    case ExecutionPublicationProjectionStatus.Unavailable:
      return status;
    default:
      throw new TypeError("execution publication mark status is invalid");
  }
}

function isReadable(
  image: ExecutionPublicationProjectionImage | null,
): image is ExecutionPublicationProjectionImage & Readonly<{
  current: CurrentCommittedExecution;
}> {
  return image !== null &&
    image.status === ExecutionPublicationProjectionStatus.Healthy &&
    image.headRevision > 0 &&
    image.producerHeadRevision === image.headRevision &&
    image.current !== null;
}

function requireCursor(
  afterRevision: number,
  image: ExecutionPublicationProjectionImage,
): void {
  if (
    afterRevision > image.headRevision ||
    (afterRevision !== image.headRevision &&
      !image.batches.some(({ fromRevision }) => fromRevision === afterRevision))
  ) {
    throw new RangeError("afterRevision must name a retained batch boundary");
  }
}
