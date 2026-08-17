import {
  decodeExecutionPublicationResult,
  ExecutionPublicationResultKind,
} from "@bpmn-lean/platform-contracts";
import type {
  ExecutionPublicationPage,
} from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

import type {
  ExecutionPublicationGateway,
  ExecutionPublicationProjectionImage,
} from "./execution-publication-contracts.js";
import {
  ExecutionPublicationProjectionStatus,
  ExecutionPublicationStoredValueError,
} from "./execution-publication-contracts.js";
import {
  applyExecutionPublicationPage,
  createEmptyExecutionPublicationProjection,
  projectionIdentityFromRegistration,
} from "./execution-publication-projection.js";
import {
  readStoredExecutionPublication,
} from "./execution-publication-storage.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";
import { decodeOperateRecoveryCandidateKey } from "./postgresql-operate-recovery-candidates.js";
import { applyPreparedExecutionPublicationPage } from "./postgresql-execution-recovery-storage.js";
import {
  completeWithoutDatabaseChange,
  fail,
  PostgresqlOperateRecoveryFailureCode,
  PostgresqlOperateRecoveryFailureEvidence,
  PostgresqlOperateRecoveryRetryReason,
  PostgresqlOperateRecoveryStepKind,
  retry,
} from "./postgresql-operate-recovery-step.js";
import type { PostgresqlOperateRecoveryStepResult } from "./postgresql-operate-recovery-step.js";

/** Dependencies for preparing one lease-fenced committed-execution recovery step. */
export type PostgresqlExecutionRecoveryStepOptions = Readonly<{
  /** Caller-owned runtime used only for the coherent preparation read. */
  runtime: PostgresqlRuntime;
  /** Product 1 publication gateway invoked outside the PostgreSQL lease transaction. */
  gateway: ExecutionPublicationGateway;
}>;

/**
 * Prepares at most one committed-execution page without changing durable state.
 *
 * Preparation reads the exact retained image, observes Product 1 outside any database transaction,
 * and returns a closed Complete, Retry, or Fail result. A Complete result carries the only mutation;
 * the recovery loop must invoke that callback inside its current-token lease fence. The callback
 * revalidates the prepared image before applying the suffix, so a stale lease or competing writer
 * cannot commit an obsolete page. Stored gaps and changed overlap are permanent failures, while
 * producer readiness and gateway availability are retryable.
 */
export class PostgresqlExecutionRecoveryStep {
  readonly #options: PostgresqlExecutionRecoveryStepOptions;

  constructor(options: PostgresqlExecutionRecoveryStepOptions) {
    this.#options = options;
  }

  async prepare(
    candidateKey: Uint8Array,
  ): Promise<PostgresqlOperateRecoveryStepResult> {
    const processInstanceId = decodeOperateRecoveryCandidateKey(candidateKey);
    let stored;
    try {
      stored = await readStoredExecutionPublication(
        this.#options.runtime,
        processInstanceId,
        false,
      );
    } catch (error: unknown) {
      if (error instanceof ExecutionPublicationStoredValueError) {
        return fail(
          PostgresqlOperateRecoveryFailureCode.StoredCorruption,
          PostgresqlOperateRecoveryFailureEvidence.RegistrationAndProjection,
        );
      }
      throw error;
    }
    if (stored === null) {
      return completeWithoutDatabaseChange();
    }
    if (stored.image?.status === ExecutionPublicationProjectionStatus.Gap) {
      return fail(
        PostgresqlOperateRecoveryFailureCode.ProducerGap,
        PostgresqlOperateRecoveryFailureEvidence.RegistrationAndProjection,
      );
    }
    return await this.#preparePage(stored.registration, stored.image);
  }

  async #preparePage(
    registrationValue: OperateProcessRegistration,
    imageValue: ExecutionPublicationProjectionImage | null,
  ): Promise<PostgresqlOperateRecoveryStepResult> {
    const registration = structuredClone(registrationValue);
    const image = imageValue === null ? null : structuredClone(imageValue);
    const identity = projectionIdentityFromRegistration(registration);
    const afterRevision = image?.headRevision ?? 0;
    let observed: unknown;
    try {
      observed = await this.#options.gateway.observe({
        locator: registration.locator,
        definition: identity.definition,
        processId: identity.processId,
        processInstanceId: identity.processInstanceId,
        afterRevision,
        limit: 100,
      });
    } catch {
      return retry(PostgresqlOperateRecoveryRetryReason.GatewayUnavailable);
    }
    let result;
    try {
      result = decodeExecutionPublicationResult(observed, {
        ...identity,
        afterRevision,
        limit: 100,
      });
    } catch {
      return fail(
        PostgresqlOperateRecoveryFailureCode.DecoderDivergence,
        PostgresqlOperateRecoveryFailureEvidence.ProducerResult,
      );
    }
    switch (result.kind) {
      case ExecutionPublicationResultKind.Available:
        return prepareAvailable(registration, image, structuredClone(result.page));
      case ExecutionPublicationResultKind.NotReady:
        return retry(PostgresqlOperateRecoveryRetryReason.ProducerNotReady);
      case ExecutionPublicationResultKind.Unavailable:
        return retry(PostgresqlOperateRecoveryRetryReason.GatewayUnavailable);
      case ExecutionPublicationResultKind.Gap:
        return fail(
          PostgresqlOperateRecoveryFailureCode.ProducerGap,
          PostgresqlOperateRecoveryFailureEvidence.ProducerResult,
        );
      case ExecutionPublicationResultKind.NotFound:
        return fail(
          PostgresqlOperateRecoveryFailureCode.ImpossibleAuthority,
          PostgresqlOperateRecoveryFailureEvidence.ProducerResult,
        );
    }
  }
}

function prepareAvailable(
  registration: OperateProcessRegistration,
  image: ExecutionPublicationProjectionImage | null,
  page: ExecutionPublicationPage,
): PostgresqlOperateRecoveryStepResult {
  const prior = image ?? createEmptyExecutionPublicationProjection(
    projectionIdentityFromRegistration(registration),
  );
  try {
    applyExecutionPublicationPage(prior, page);
  } catch {
    return fail(
      PostgresqlOperateRecoveryFailureCode.ChangedOverlap,
      PostgresqlOperateRecoveryFailureEvidence.PreparedPage,
    );
  }
  return {
    kind: PostgresqlOperateRecoveryStepKind.Complete,
    apply: async (session) => {
      await applyPreparedExecutionPublicationPage(
        session,
        registration,
        image,
        page,
      );
    },
  };
}
