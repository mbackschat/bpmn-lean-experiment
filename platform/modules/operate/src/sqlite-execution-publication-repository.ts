import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import {
  decodeExecutionPublicationExport,
  decodeExecutionPublicationPage,
  decodePublicProcessInstanceIdentity,
  executionPublicationExportFormat,
  serializeCanonicalExecutionPublicationValue,
} from "@bpmn-lean/platform-contracts";
import type {
  CommittedTransitionBatch,
  CurrentCommittedExecution,
  ExecutionPublicationExport,
  ExecutionPublicationIdentity,
  ExecutionPublicationPage,
  ExecutionPublicationRequest,
} from "@bpmn-lean/platform-contracts";

import {
  ExecutionPublicationIntegrityError,
  ExecutionPublicationProjectionStatus,
  ExecutionPublicationStoredValueError,
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
import type { OperateProcessRegistration } from "./incident-contracts.js";
import { initializeOperateSchema } from "./sqlite-operate-schema.js";

const defaultBusyTimeoutMs = 5_000;

/** Durable atomic owner of one complete committed-publication prefix per Process instance. */
export class SqliteExecutionPublicationRepository
  implements ExecutionPublicationRepository
{
  readonly #database: DatabaseSync;

  constructor(databaseFile: string, busyTimeoutMs: number = defaultBusyTimeoutMs) {
    requirePositive(busyTimeoutMs, "busyTimeoutMs");
    this.#database = new DatabaseSync(databaseFile);
    this.#database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    try {
      initializeOperateSchema(this.#database);
    } catch (error: unknown) {
      this.#database.close();
      throw error;
    }
  }

  get isOpen(): boolean {
    return this.#database.isOpen;
  }

  async get(
    processInstanceId: string,
  ): Promise<ExecutionPublicationProjectionImage | null> {
    try {
      return this.#read(requireText(processInstanceId, "processInstanceId"));
    } catch (error: unknown) {
      if (error instanceof ExecutionPublicationStoredValueError) throw error;
      throw new ExecutionPublicationStoredValueError(error);
    }
  }

  async applyPage(
    registration: OperateProcessRegistration,
    page: ExecutionPublicationPage,
  ): Promise<ExecutionPublicationProjectionImage> {
    return this.#transaction(() => {
      this.#requireRegistration(registration);
      const identity = projectionIdentityFromRegistration(registration);
      const prior = this.#read(registration.instance.processInstanceId) ??
        createEmptyExecutionPublicationProjection(identity);
      const next = applyExecutionPublicationPage(prior, page);
      if (!sameJson(prior, next)) {
        this.#writeHeader(next);
        this.#insertBatches(
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
    let candidate = createEmptyExecutionPublicationProjection(
      projectionIdentityFromRegistration(registration),
    );
    for (const page of pages) {
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
    return this.#transaction(() => {
      this.#requireRegistration(registration);
      this.#replace(candidate);
      return structuredClone(candidate);
    });
  }

  async mark(
    registration: OperateProcessRegistration,
    status:
      | ExecutionPublicationProjectionStatus.Gap
      | ExecutionPublicationProjectionStatus.Unavailable,
  ): Promise<void> {
    this.#transaction(() => {
      this.#requireRegistration(registration);
      const identity = projectionIdentityFromRegistration(registration);
      const prior = this.#read(registration.instance.processInstanceId) ??
        createEmptyExecutionPublicationProjection(identity);
      if (prior.status !== status) this.#writeHeader({ ...prior, status });
    });
  }

  async page(
    processInstanceId: string,
    request: ExecutionPublicationRequest,
  ): Promise<ExecutionPublicationPage | null> {
    const image = await this.get(processInstanceId);
    if (!isReadable(image)) return null;
    requireCursor(request.afterRevision, image);
    const limit = request.limit ?? 50;
    requirePageLimit(limit);
    const batches = image.batches
      .filter(({ fromRevision }) => fromRevision >= request.afterRevision)
      .slice(0, limit);
    const pageThroughRevision = batches.at(-1)?.throughRevision ??
      request.afterRevision;
    return decodeExecutionPublicationPage({
      ...image.identity,
      requestedAfterRevision: request.afterRevision,
      pageThroughRevision,
      headRevision: image.headRevision,
      batches,
      current: pageThroughRevision === image.headRevision ? image.current : null,
    }, {
      ...image.identity,
      afterRevision: request.afterRevision,
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    });
  }

  async export(
    processInstanceId: string,
  ): Promise<ExecutionPublicationExport | null> {
    const image = await this.get(processInstanceId);
    if (!isReadable(image) || image.batches.length === 0) return null;
    const first = image.batches[0];
    if (first === undefined) return null;
    return decodeExecutionPublicationExport({
      format: executionPublicationExportFormat,
      ...image.identity,
      headRevision: image.headRevision,
      batches: [first, ...image.batches.slice(1)],
      current: image.current,
    }, image.identity);
  }

  close(): void {
    if (this.#database.isOpen) this.#database.close();
  }

  #read(processInstanceId: string): ExecutionPublicationProjectionImage | null {
    const row = this.#database.prepare(`
      SELECT
        e.identity_json,
        e.status,
        e.head_revision,
        e.producer_head_revision,
        e.last_logical_time_ms,
        e.control_tokens_json,
        e.scopes_json,
        e.current_json,
        p.public_identity_json
      FROM execution_publications e
      JOIN process_instances p USING (process_instance_id)
      WHERE e.process_instance_id = ?
    `).get(processInstanceId);
    if (row === undefined) return null;
    const publicInstance = decodeExactJson(
      requireText(row.public_identity_json, "public_identity_json"),
      decodePublicProcessInstanceIdentity,
      JSON.stringify,
    );
    const identity = projectionIdentityFromRegistration({ instance: publicInstance });
    const storedIdentity = decodeExactJson(
      requireText(row.identity_json, "identity_json"),
      (value) => value as ExecutionPublicationIdentity,
      canonicalText,
    );
    if (!sameJson(identity, storedIdentity)) {
      throw new TypeError("stored publication identity disagrees with registration");
    }
    const status = requireStatus(row.status);
    const headRevision = requireNonnegative(row.head_revision, "head_revision");
    const producerHeadRevision = row.producer_head_revision === null
      ? null
      : requirePositive(row.producer_head_revision, "producer_head_revision");
    const storedLastLogicalTime = row.last_logical_time_ms === null
      ? null
      : requireNonnegative(row.last_logical_time_ms, "last_logical_time_ms");
    const storedTokens = decodeExactJson(
      requireText(row.control_tokens_json, "control_tokens_json"),
      requireArray,
      canonicalText,
    );
    const storedScopes = decodeExactJson(
      requireText(row.scopes_json, "scopes_json"),
      requireArray,
      canonicalText,
    );
    const storedCurrent = row.current_json === null
      ? null
      : decodeExactJson(
          requireText(row.current_json, "current_json"),
          (value) => value as CurrentCommittedExecution,
          canonicalText,
        );
    const batches = this.#readBatches(processInstanceId);
    const records = this.#database.prepare(`
      SELECT revision, batch_from_revision, record_json
      FROM execution_publication_records
      WHERE process_instance_id = ?
      ORDER BY revision ASC
    `).all(processInstanceId);
    requireExactRecordRows(batches, records);

    let image = createEmptyExecutionPublicationProjection(identity);
    if (headRevision > 0) {
      if (producerHeadRevision === null) {
        throw new TypeError("positive stored head has no producer head");
      }
      for (const batch of batches) {
        const reachesProducer = batch.throughRevision === producerHeadRevision;
        image = applyExecutionPublicationPage(image, decodeExecutionPublicationPage({
          ...identity,
          requestedAfterRevision: batch.fromRevision,
          pageThroughRevision: batch.throughRevision,
          headRevision: producerHeadRevision,
          batches: [batch],
          current: reachesProducer ? storedCurrent : null,
        }, {
          ...identity,
          afterRevision: batch.fromRevision,
          limit: 1,
        }));
      }
    } else if (batches.length > 0 || producerHeadRevision !== null || storedCurrent !== null) {
      throw new TypeError("revision-zero projection retained positive publication content");
    }
    if (
      image.headRevision !== headRevision ||
      image.lastLogicalTimeMs !== storedLastLogicalTime ||
      !sameJson(image.controlTokens, storedTokens) ||
      !sameJson(image.scopes, storedScopes) ||
      !sameJson(image.current, storedCurrent)
    ) {
      throw new TypeError("stored publication projection columns disagree");
    }
    return { ...image, status };
  }

  #readBatches(processInstanceId: string): CommittedTransitionBatch[] {
    return this.#database.prepare(`
      SELECT from_revision, through_revision, command_id, batch_json
      FROM execution_publication_batches
      WHERE process_instance_id = ?
      ORDER BY from_revision ASC
    `).all(processInstanceId).map((row) => {
      const batch = decodeExactJson(
        requireText(row.batch_json, "batch_json"),
        (value) => value as CommittedTransitionBatch,
        canonicalText,
      );
      if (
        batch.fromRevision !== requireNonnegative(row.from_revision, "from_revision") ||
        batch.throughRevision !== requirePositive(row.through_revision, "through_revision") ||
        batch.commandId !== requireText(row.command_id, "command_id")
      ) {
        throw new TypeError("stored publication batch columns disagree");
      }
      return batch;
    });
  }

  #requireRegistration(registration: OperateProcessRegistration): void {
    const row = this.#database.prepare(`
      SELECT public_identity_json, process_locator
      FROM process_instances WHERE process_instance_id = ?
    `).get(registration.instance.processInstanceId);
    if (row === undefined) {
      throw new ExecutionPublicationIntegrityError(
        "execution publication has no confirmed Process instance",
      );
    }
    const instance = decodeExactJson(
      requireText(row.public_identity_json, "public_identity_json"),
      decodePublicProcessInstanceIdentity,
      JSON.stringify,
    );
    if (
      !sameJson(instance, registration.instance) ||
      requireText(row.process_locator, "process_locator") !== registration.locator
    ) {
      throw new ExecutionPublicationIntegrityError(
        "execution publication registration changed",
      );
    }
  }

  #writeHeader(image: ExecutionPublicationProjectionImage): void {
    const id = image.identity.processInstanceId;
    this.#database.prepare(`
      INSERT INTO execution_publications (
        process_instance_id,
        identity_json,
        status,
        head_revision,
        producer_head_revision,
        last_logical_time_ms,
        control_tokens_json,
        scopes_json,
        current_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(process_instance_id) DO UPDATE SET
        identity_json = excluded.identity_json,
        status = excluded.status,
        head_revision = excluded.head_revision,
        producer_head_revision = excluded.producer_head_revision,
        last_logical_time_ms = excluded.last_logical_time_ms,
        control_tokens_json = excluded.control_tokens_json,
        scopes_json = excluded.scopes_json,
        current_json = excluded.current_json
    `).run(
      id,
      canonicalText(image.identity),
      image.status,
      image.headRevision,
      image.producerHeadRevision,
      image.lastLogicalTimeMs,
      canonicalText(image.controlTokens),
      canonicalText(image.scopes),
      image.current === null ? null : canonicalText(image.current),
    );
  }

  #replace(image: ExecutionPublicationProjectionImage): void {
    const id = image.identity.processInstanceId;
    this.#writeHeader(image);
    this.#database.prepare(`
      DELETE FROM execution_publication_records WHERE process_instance_id = ?
    `).run(id);
    this.#database.prepare(`
      DELETE FROM execution_publication_batches WHERE process_instance_id = ?
    `).run(id);
    this.#insertBatches(id, image.batches);
  }

  #insertBatches(
    processInstanceId: string,
    batches: readonly CommittedTransitionBatch[],
  ): void {
    const insertBatch = this.#database.prepare(`
      INSERT INTO execution_publication_batches (
        process_instance_id, from_revision, through_revision, command_id, batch_json
      ) VALUES (?, ?, ?, ?, ?)
    `);
    const insertRecord = this.#database.prepare(`
      INSERT INTO execution_publication_records (
        process_instance_id, revision, batch_from_revision, record_json
      ) VALUES (?, ?, ?, ?)
    `);
    for (const batch of batches) {
      insertBatch.run(
        processInstanceId,
        batch.fromRevision,
        batch.throughRevision,
        batch.commandId,
        canonicalText(batch),
      );
      for (const record of batch.transitions) {
        insertRecord.run(
          processInstanceId,
          record.revision,
          batch.fromRevision,
          canonicalText(record),
        );
      }
    }
  }

  #transaction<T>(run: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.#database.exec("COMMIT");
      return result;
    } catch (error: unknown) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
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
    !Number.isSafeInteger(afterRevision) ||
    afterRevision < 0 ||
    afterRevision > image.headRevision ||
    (afterRevision !== image.headRevision &&
      !image.batches.some(({ fromRevision }) => fromRevision === afterRevision))
  ) {
    throw new RangeError("afterRevision must name a retained batch boundary");
  }
}

function requirePageLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be from 1 through 100");
  }
}

function requireExactRecordRows(
  batches: readonly CommittedTransitionBatch[],
  rows: readonly Record<string, SQLOutputValue>[],
): void {
  const expected = batches.flatMap((batch) => batch.transitions.map((record) => ({
    revision: record.revision,
    batchFromRevision: batch.fromRevision,
    encoded: canonicalText(record),
  })));
  if (expected.length !== rows.length) {
    throw new TypeError("stored publication record count disagrees");
  }
  expected.forEach((record, index) => {
    const row = rows[index];
    if (
      row === undefined ||
      requirePositive(row.revision, "revision") !== record.revision ||
      requireNonnegative(row.batch_from_revision, "batch_from_revision") !==
        record.batchFromRevision ||
      requireText(row.record_json, "record_json") !== record.encoded
    ) {
      throw new TypeError("stored publication record changed");
    }
  });
}

function requireStatus(value: SQLOutputValue | undefined): ExecutionPublicationProjectionStatus {
  switch (value) {
    case ExecutionPublicationProjectionStatus.Healthy:
    case ExecutionPublicationProjectionStatus.Gap:
    case ExecutionPublicationProjectionStatus.Unavailable:
      return value;
    default:
      throw new TypeError("stored publication status is invalid");
  }
}

function decodeExactJson<T>(
  encoded: string,
  decode: (value: unknown) => T,
  encode: (value: T) => string,
): T {
  const value: unknown = JSON.parse(encoded);
  const decoded = decode(value);
  if (encode(decoded) !== encoded) {
    throw new TypeError("stored publication JSON is not canonical");
  }
  return decoded;
}

function requireArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError("stored publication collection is invalid");
  return value;
}

function requireText(value: SQLOutputValue | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be nonempty text`);
  }
  return value;
}

function requirePositive(value: SQLOutputValue | number | undefined, name: string): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return number;
}

function requireNonnegative(value: SQLOutputValue | undefined, name: string): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer`);
  }
  return number;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalText(left) === canonicalText(right);
}

function canonicalText(value: unknown): string {
  return new TextDecoder().decode(serializeCanonicalExecutionPublicationValue(value));
}
