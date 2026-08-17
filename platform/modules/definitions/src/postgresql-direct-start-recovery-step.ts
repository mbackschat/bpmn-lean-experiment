import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";

import {
  ConfirmedProcessInstanceState,
} from "./confirmed-process-instance-contracts.js";
import type { DirectProcessInstanceHost } from "./confirmed-process-instance-contracts.js";
import {
  decodeDefinitionsRecoveryCandidateKey,
  DefinitionsRecoveryFamily,
} from "./postgresql-definitions-recovery-candidate-source.js";
import {
  failRecovery,
  PostgresqlDefinitionsRecoveryFailureCode,
  PostgresqlDefinitionsRecoveryFailureEvidence,
  PostgresqlDefinitionsRecoveryIntermediateResult,
  PostgresqlDefinitionsRecoveryStepKind,
  PostgresqlDefinitionsRecoveryStoredValueError,
  retryHostUnavailable,
  completeWithoutDatabaseChange,
} from "./postgresql-definitions-recovery-step.js";
import type {
  PostgresqlDefinitionsRecoveryStepResult,
} from "./postgresql-definitions-recovery-step.js";
import {
  applyConfirmedRecoveryState,
  directReservation,
  readConfirmedRecoveryRecord,
} from "./postgresql-confirmed-process-instance-recovery-storage.js";

export type PostgresqlDirectStartRecoveryStepOptions = Readonly<{
  runtime: PostgresqlRuntime;
  host: DirectProcessInstanceHost;
}>;

/** Prepares one content-bound direct-start lifecycle step without redispatch. */
export class PostgresqlDirectStartRecoveryStep {
  readonly #options: PostgresqlDirectStartRecoveryStepOptions;

  constructor(options: PostgresqlDirectStartRecoveryStepOptions) {
    this.#options = options;
  }

  async prepare(itemKey: Uint8Array): Promise<PostgresqlDefinitionsRecoveryStepResult> {
    const candidate = decodeDefinitionsRecoveryCandidateKey(
      DefinitionsRecoveryFamily.DirectStart,
      itemKey,
    );
    if (candidate.family !== DefinitionsRecoveryFamily.DirectStart) {
      throw new TypeError("direct-start candidate family drifted");
    }
    let record;
    try {
      record = await readConfirmedRecoveryRecord(
        this.#options.runtime,
        candidate.processInstanceId,
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
      case ConfirmedProcessInstanceState.Reserved:
        if (record.intent === null) {
          return failRecovery(
            PostgresqlDefinitionsRecoveryFailureCode.StoredCorruption,
            PostgresqlDefinitionsRecoveryFailureEvidence.RetainedIntent,
          );
        }
        return this.#dispatch(record);
      case ConfirmedProcessInstanceState.Starting:
      case ConfirmedProcessInstanceState.Indeterminate:
        return await this.#observe(record);
      case ConfirmedProcessInstanceState.Confirmed:
      case ConfirmedProcessInstanceState.IntegrityFailure:
        return completeWithoutDatabaseChange();
      default:
        return assertNever(record.state);
    }
  }

  #dispatch(
    record: NonNullable<Awaited<ReturnType<typeof readConfirmedRecoveryRecord>>>,
  ): PostgresqlDefinitionsRecoveryStepResult {
    const reservation = directReservation(record);
    const starting = {
      ...structuredClone(record),
      state: ConfirmedProcessInstanceState.Starting,
    };
    return {
      kind: PostgresqlDefinitionsRecoveryStepKind.Intermediate,
      applyWhileOwned: async (session) =>
        await applyConfirmedRecoveryState(
            session,
            record,
            ConfirmedProcessInstanceState.Starting,
          )
          ? PostgresqlDefinitionsRecoveryIntermediateResult.Applied
          : PostgresqlDefinitionsRecoveryIntermediateResult.LeaseLost,
      continue: async () => {
        let result;
        try {
          result = await this.#options.host.start(reservation);
        } catch {
          return retryHostUnavailable();
        }
        switch (result.status) {
          case "started":
            return transition(starting, ConfirmedProcessInstanceState.Confirmed);
          case "rejected":
          case "integrityFailure":
            return transition(starting, ConfirmedProcessInstanceState.IntegrityFailure);
          default:
            return assertNever(result);
        }
      },
    };
  }

  async #observe(
    record: NonNullable<Awaited<ReturnType<typeof readConfirmedRecoveryRecord>>>,
  ): Promise<PostgresqlDefinitionsRecoveryStepResult> {
    let description;
    try {
      description = await this.#options.host.describe(directReservation(record));
    } catch {
      return retryHostUnavailable();
    }
    switch (description.status) {
      case "matching":
        return transition(record, ConfirmedProcessInstanceState.Confirmed);
      case "missing":
        return record.state === ConfirmedProcessInstanceState.Starting
          ? transition(record, ConfirmedProcessInstanceState.Indeterminate)
          : completeWithoutDatabaseChange();
      case "divergent":
        return transition(record, ConfirmedProcessInstanceState.IntegrityFailure);
      case "unavailable":
        return retryHostUnavailable();
      default:
        return assertNever(description.status);
    }
  }
}

function transition(
  record: NonNullable<Awaited<ReturnType<typeof readConfirmedRecoveryRecord>>>,
  next: typeof ConfirmedProcessInstanceState[
    keyof typeof ConfirmedProcessInstanceState
  ],
): PostgresqlDefinitionsRecoveryStepResult {
  const expected = structuredClone(record);
  return {
    kind: PostgresqlDefinitionsRecoveryStepKind.Complete,
    apply: async (session) => {
      await applyConfirmedRecoveryState(session, expected, next);
    },
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported direct-start recovery variant: ${String(value)}`);
}
