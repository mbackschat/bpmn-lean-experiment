import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";

import type { ExactArtifactStore } from "./contracts.js";
import type { ProcessWorkLocatorFactory } from "./confirmed-process-instance-contracts.js";
import {
  DefinitionScheduleHostPhase,
  DefinitionScheduleState,
} from "./definition-schedule-contracts.js";
import type {
  DefinitionScheduleHost,
  DefinitionScheduleHostRequest,
  DefinitionScheduleHostResult,
  DefinitionScheduleRecord,
  DefinitionScheduleTransition,
} from "./definition-schedule-contracts.js";
import { toPublicDefinition } from "./definition-public-values.js";
import {
  decodeDefinitionsRecoveryCandidateKey,
  DefinitionsRecoveryFamily,
} from "./postgresql-definitions-recovery-candidate-source.js";
import {
  completeWithoutDatabaseChange,
  failRecovery,
  PostgresqlDefinitionsRecoveryFailureCode,
  PostgresqlDefinitionsRecoveryFailureEvidence,
  PostgresqlDefinitionsRecoveryStepKind,
  PostgresqlDefinitionsRecoveryStoredValueError,
  retryHostUnavailable,
} from "./postgresql-definitions-recovery-step.js";
import type {
  PostgresqlDefinitionsRecoveryStepResult,
} from "./postgresql-definitions-recovery-step.js";
import {
  applyDefinitionScheduleRecovery,
  readDefinitionScheduleRecoveryRecord,
} from "./postgresql-definition-schedule-recovery-storage.js";

export type PostgresqlDefinitionScheduleRecoveryStepOptions = Readonly<{
  runtime: PostgresqlRuntime;
  artifacts: ExactArtifactStore;
  host: Pick<DefinitionScheduleHost, "createOrCompare" | "inspect" | "pause" | "delete">;
  locators: Pick<ProcessWorkLocatorFactory, "scheduleExecutionLocator">;
}>;

/** Prepares one bounded Schedule lifecycle step and defers every write to its fence. */
export class PostgresqlDefinitionScheduleRecoveryStep {
  readonly #options: PostgresqlDefinitionScheduleRecoveryStepOptions;

  constructor(options: PostgresqlDefinitionScheduleRecoveryStepOptions) {
    this.#options = options;
  }

  async prepare(itemKey: Uint8Array): Promise<PostgresqlDefinitionsRecoveryStepResult> {
    const candidate = decodeDefinitionsRecoveryCandidateKey(
      DefinitionsRecoveryFamily.Schedule,
      itemKey,
    );
    if (candidate.family !== DefinitionsRecoveryFamily.Schedule) {
      throw new TypeError("Schedule candidate family drifted");
    }
    let record;
    try {
      record = await readDefinitionScheduleRecoveryRecord(
        this.#options.runtime,
        candidate.reference,
        false,
      );
    } catch (error: unknown) {
      if (!(error instanceof PostgresqlDefinitionsRecoveryStoredValueError)) {
        throw error;
      }
      return failRecovery(
        PostgresqlDefinitionsRecoveryFailureCode.StoredCorruption,
        PostgresqlDefinitionsRecoveryFailureEvidence.StoredRow,
      );
    }
    if (record === null) return completeWithoutDatabaseChange();
    switch (record.state) {
      case DefinitionScheduleState.Creating:
        return apply(record, { state: DefinitionScheduleState.CreatingHost });
      case DefinitionScheduleState.CreatingHost:
        return await this.#observe(record, "createOrCompare");
      case DefinitionScheduleState.Scheduled:
        return await this.#observe(record, "inspect");
      case DefinitionScheduleState.Cancelling:
        return await this.#cancel(record);
      case DefinitionScheduleState.Started:
        return await this.#finish(record, true);
      case DefinitionScheduleState.Missed:
      case DefinitionScheduleState.Cancelled:
        return await this.#finish(record, false);
      default:
        return assertNever(record.state);
    }
  }

  async #observe(
    record: DefinitionScheduleRecord,
    operation: "createOrCompare" | "inspect",
  ): Promise<PostgresqlDefinitionsRecoveryStepResult> {
    const request = await this.#request(record);
    if (isFailure(request)) return request;
    let result;
    try {
      result = await this.#options.host[operation](request);
    } catch {
      return retryHostUnavailable();
    }
    return applyHostResult(record, result, false);
  }

  async #cancel(
    record: DefinitionScheduleRecord,
  ): Promise<PostgresqlDefinitionsRecoveryStepResult> {
    const request = await this.#request(record);
    if (isFailure(request)) return request;
    if (record.cancellationOrigin === DefinitionScheduleState.CreatingHost) {
      let created;
      try {
        created = await this.#options.host.createOrCompare(request);
      } catch {
        return retryHostUnavailable();
      }
      if (created.phase !== DefinitionScheduleHostPhase.Pending) {
        return applyHostResult(record, created, false);
      }
      if (created.paused) {
        return failRecovery(
          PostgresqlDefinitionsRecoveryFailureCode.HostIntegrityFailure,
          PostgresqlDefinitionsRecoveryFailureEvidence.HostResult,
        );
      }
    } else if (record.cancellationOrigin !== DefinitionScheduleState.Scheduled) {
      return failRecovery(
        PostgresqlDefinitionsRecoveryFailureCode.StoredCorruption,
        PostgresqlDefinitionsRecoveryFailureEvidence.Lifecycle,
      );
    }
    let paused;
    try {
      paused = await this.#options.host.pause(request);
    } catch {
      return retryHostUnavailable();
    }
    return applyHostResult(record, paused, true);
  }

  async #finish(
    record: DefinitionScheduleRecord,
    confirmStarted: boolean,
  ): Promise<PostgresqlDefinitionsRecoveryStepResult> {
    const confirmation = confirmStarted ? this.#confirmation(record) : null;
    if (record.cleanupComplete) {
      return confirmation === null
        ? completeWithoutDatabaseChange()
        : apply(record, null, confirmation);
    }
    const request = await this.#request(record);
    if (isFailure(request)) return request;
    try {
      await this.#options.host.delete(request);
    } catch {
      return retryHostUnavailable();
    }
    return apply(
      record,
      { state: record.state, cleanupComplete: true },
      confirmation,
    );
  }

  async #request(
    record: DefinitionScheduleRecord,
  ): Promise<DefinitionScheduleHostRequest | PostgresqlDefinitionsRecoveryStepResult> {
    const artifact = await this.#options.artifacts.get(
      record.definition.source.sha256,
    );
    if (artifact === null || artifact.byteLength !== record.definition.source.byteLength) {
      return failRecovery(
        PostgresqlDefinitionsRecoveryFailureCode.MissingArtifact,
        PostgresqlDefinitionsRecoveryFailureEvidence.Artifact,
      );
    }
    return {
      bytes: Uint8Array.from(artifact),
      definition: structuredClone(record.definition),
      timerStart: { ...record.timerStart },
      activationAt: record.activationAt,
      dueAt: record.dueAt,
      processInstanceId: record.identity.processInstanceId,
      hostScheduleId: record.identity.hostScheduleId,
      configuredWorkflowIdBase: record.identity.configuredWorkflowIdBase,
    };
  }

  #confirmation(record: DefinitionScheduleRecord) {
    if (record.executionWorkflowId === null) {
      throw new TypeError("started Schedule has no execution Workflow identity");
    }
    return {
      instance: {
        processInstanceId: record.identity.processInstanceId,
        definition: toPublicDefinition(record.definition),
      },
      locator: this.#options.locators.scheduleExecutionLocator(
        record.executionWorkflowId,
      ),
    };
  }
}

function applyHostResult(
  record: DefinitionScheduleRecord,
  result: DefinitionScheduleHostResult,
  expectPaused: boolean,
): PostgresqlDefinitionsRecoveryStepResult {
  switch (result.phase) {
    case DefinitionScheduleHostPhase.IntegrityFailure:
      return failRecovery(
        PostgresqlDefinitionsRecoveryFailureCode.HostIntegrityFailure,
        PostgresqlDefinitionsRecoveryFailureEvidence.HostResult,
      );
    case DefinitionScheduleHostPhase.Pending:
      if (result.paused !== expectPaused) {
        return failRecovery(
          PostgresqlDefinitionsRecoveryFailureCode.HostIntegrityFailure,
          PostgresqlDefinitionsRecoveryFailureEvidence.HostResult,
        );
      }
      if (expectPaused) {
        return apply(record, { state: DefinitionScheduleState.Cancelled });
      }
      return record.state === DefinitionScheduleState.CreatingHost
        ? apply(record, { state: DefinitionScheduleState.Scheduled })
        : completeWithoutDatabaseChange();
    case DefinitionScheduleHostPhase.Started:
      if (!isIdentity(result.executionWorkflowId) || !isIdentity(result.firstRunId)) {
        return failRecovery(
          PostgresqlDefinitionsRecoveryFailureCode.HostIntegrityFailure,
          PostgresqlDefinitionsRecoveryFailureEvidence.HostResult,
        );
      }
      return apply(record, {
        state: DefinitionScheduleState.Started,
        executionWorkflowId: result.executionWorkflowId,
        firstRunId: result.firstRunId,
      });
    case DefinitionScheduleHostPhase.Missed:
      return apply(record, { state: DefinitionScheduleState.Missed });
    default:
      return assertNever(result);
  }
}

function apply(
  record: DefinitionScheduleRecord,
  transition: DefinitionScheduleTransition | null,
  confirmation: Parameters<typeof applyDefinitionScheduleRecovery>[3] = null,
): PostgresqlDefinitionsRecoveryStepResult {
  const expected = structuredClone(record);
  const publication = confirmation === null ? null : structuredClone(confirmation);
  return {
    kind: PostgresqlDefinitionsRecoveryStepKind.Complete,
    apply: async (session) => {
      await applyDefinitionScheduleRecovery(
        session,
        expected,
        transition,
        publication,
      );
    },
  };
}

function isFailure(
  value: DefinitionScheduleHostRequest | PostgresqlDefinitionsRecoveryStepResult,
): value is PostgresqlDefinitionsRecoveryStepResult {
  return "kind" in value;
}

function isIdentity(value: string): boolean {
  return value.length > 0 && value.isWellFormed();
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Schedule recovery variant: ${String(value)}`);
}
