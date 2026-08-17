import {
  decodeFlowNodeOccurrencePublicationResult,
  FlowNodeOccurrencePublicationResultKind,
} from "@bpmn-lean/platform-contracts";
import type {
  FlowNodeOccurrencePage,
} from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

import { ExecutionPublicationProjectionStatus } from "./execution-publication-contracts.js";
import {
  applyFlowNodeOccurrencePage,
  createEmptyFlowNodeOccurrenceProjection,
  FlowNodeOccurrenceProjectionStatus,
  FlowNodeOccurrenceStoredValueError,
  occurrenceIdentityFromRegistration,
} from "./flow-node-occurrence-projection.js";
import type {
  FlowNodeOccurrenceGateway,
  FlowNodeOccurrenceProjectionImage,
} from "./flow-node-occurrence-projection.js";
import {
  readPostgresqlOccurrenceSnapshot,
} from "./flow-node-occurrence-storage.js";
import type {
  PostgresqlOccurrenceSnapshot,
} from "./flow-node-occurrence-storage.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";
import { decodeOperateRecoveryCandidateKey } from "./postgresql-operate-recovery-candidates.js";
import { applyPreparedFlowNodeOccurrencePage } from "./postgresql-flow-node-occurrence-recovery-storage.js";
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

/** Dependencies for preparing one lease-fenced flow-node occurrence recovery step. */
export type PostgresqlFlowNodeOccurrenceRecoveryStepOptions = Readonly<{
  /** Caller-owned runtime used only for the coherent E1/occurrence preparation read. */
  runtime: PostgresqlRuntime;
  /** Product 1 occurrence gateway invoked outside the PostgreSQL lease transaction. */
  gateway: FlowNodeOccurrenceGateway;
}>;

/**
 * Prepares one occurrence page only after reading its retained E1 authority coherently.
 *
 * E1 is the authority for which semantic revisions may exist. If the producer returns an occurrence
 * page ahead of retained E1, the step retries until E1 recovery catches up instead of accepting an
 * occurrence the platform cannot yet corroborate. Preparation performs no durable mutation or
 * gateway call inside a transaction. A Complete result carries the sole apply callback, which the
 * recovery loop invokes under the current lease token and which revalidates the exact retained image.
 */
export class PostgresqlFlowNodeOccurrenceRecoveryStep {
  readonly #options: PostgresqlFlowNodeOccurrenceRecoveryStepOptions;

  constructor(options: PostgresqlFlowNodeOccurrenceRecoveryStepOptions) {
    this.#options = options;
  }

  async prepare(
    candidateKey: Uint8Array,
  ): Promise<PostgresqlOperateRecoveryStepResult> {
    const processInstanceId = decodeOperateRecoveryCandidateKey(candidateKey);
    let snapshot: PostgresqlOccurrenceSnapshot | null;
    try {
      snapshot = await readPostgresqlOccurrenceSnapshot(
        this.#options.runtime,
        processInstanceId,
      );
    } catch (error: unknown) {
      if (isStoredValueFailure(error)) {
        return fail(
          PostgresqlOperateRecoveryFailureCode.StoredCorruption,
          PostgresqlOperateRecoveryFailureEvidence.RegistrationAndProjection,
        );
      }
      throw error;
    }
    if (snapshot === null) {
      return completeWithoutDatabaseChange();
    }
    if (!hasReadyExecutionAuthority(snapshot)) {
      return retry(PostgresqlOperateRecoveryRetryReason.ExecutionAuthorityNotReady);
    }
    if (snapshot.occurrence?.status === FlowNodeOccurrenceProjectionStatus.Gap) {
      return fail(
        PostgresqlOperateRecoveryFailureCode.ProducerGap,
        PostgresqlOperateRecoveryFailureEvidence.RegistrationAndProjection,
      );
    }
    return await this.#preparePage(snapshot);
  }

  async #preparePage(
    snapshotValue: PostgresqlOccurrenceSnapshot & Readonly<{
      execution: NonNullable<PostgresqlOccurrenceSnapshot["execution"]>;
    }>,
  ): Promise<PostgresqlOperateRecoveryStepResult> {
    const snapshot = structuredClone(snapshotValue);
    const identity = occurrenceIdentityFromRegistration(snapshot.registration);
    const afterRevision = snapshot.occurrence?.headRevision ?? 0;
    let observed: unknown;
    try {
      observed = await this.#options.gateway.observe({
        locator: snapshot.registration.locator,
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
      result = decodeFlowNodeOccurrencePublicationResult(observed, {
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
      case FlowNodeOccurrencePublicationResultKind.Available:
        return prepareAvailable(
          snapshot.registration,
          snapshot.execution,
          snapshot.occurrence,
          structuredClone(result.page),
        );
      case FlowNodeOccurrencePublicationResultKind.NotReady:
        return retry(PostgresqlOperateRecoveryRetryReason.ProducerNotReady);
      case FlowNodeOccurrencePublicationResultKind.Unavailable:
        return retry(PostgresqlOperateRecoveryRetryReason.GatewayUnavailable);
      case FlowNodeOccurrencePublicationResultKind.Gap:
        return fail(
          PostgresqlOperateRecoveryFailureCode.ProducerGap,
          PostgresqlOperateRecoveryFailureEvidence.ProducerResult,
        );
      case FlowNodeOccurrencePublicationResultKind.NotFound:
        return fail(
          PostgresqlOperateRecoveryFailureCode.ImpossibleAuthority,
          PostgresqlOperateRecoveryFailureEvidence.ProducerResult,
        );
    }
  }
}

function isStoredValueFailure(error: unknown): boolean {
  return error instanceof FlowNodeOccurrenceStoredValueError;
}

function hasReadyExecutionAuthority(
  snapshot: PostgresqlOccurrenceSnapshot,
): snapshot is PostgresqlOccurrenceSnapshot & Readonly<{
  execution: NonNullable<PostgresqlOccurrenceSnapshot["execution"]>;
}> {
  const execution = snapshot.execution;
  return execution !== null &&
    execution.status === ExecutionPublicationProjectionStatus.Healthy &&
    execution.current !== null &&
    execution.headRevision === execution.producerHeadRevision &&
    execution.headRevision >= (snapshot.occurrence?.headRevision ?? 0);
}

function prepareAvailable(
  registration: OperateProcessRegistration,
  execution: NonNullable<PostgresqlOccurrenceSnapshot["execution"]>,
  image: FlowNodeOccurrenceProjectionImage | null,
  page: FlowNodeOccurrencePage,
): PostgresqlOperateRecoveryStepResult {
  if (page.headRevision > execution.headRevision) {
    // Producer occurrence publication may race ahead of retained E1. This is convergence lag, not a
    // producer gap: E1 recovery must establish the authority before this page can be applied.
    return retry(PostgresqlOperateRecoveryRetryReason.ExecutionAuthorityNotReady);
  }
  const prior = image ?? createEmptyFlowNodeOccurrenceProjection(
    occurrenceIdentityFromRegistration(registration),
  );
  try {
    // Retained E1 may legitimately be ahead of this occurrence page. The fold still requires exact
    // overlap and forbids the occurrence page itself from advancing beyond E1 authority.
    applyFlowNodeOccurrencePage(prior, page, execution, "mayBeAhead");
  } catch {
    return fail(
      PostgresqlOperateRecoveryFailureCode.ChangedOverlap,
      PostgresqlOperateRecoveryFailureEvidence.PreparedPage,
    );
  }
  return {
    kind: PostgresqlOperateRecoveryStepKind.Complete,
    apply: async (session) => {
      await applyPreparedFlowNodeOccurrencePage(
        session,
        registration,
        image,
        page,
      );
    },
  };
}
