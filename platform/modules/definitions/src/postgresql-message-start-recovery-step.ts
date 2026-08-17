import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";

import type { ExactArtifactStore } from "./contracts.js";
import type { ProcessWorkLocatorFactory } from "./confirmed-process-instance-contracts.js";
import { toPublicDefinition } from "./definition-public-values.js";
import {
  messageStartPublicationHostRequest,
} from "./message-start-publication-host-request.js";
import {
  MessageStartPublicationState,
} from "./message-start-publication-contracts.js";
import type {
  MessageStartPublicationHost,
  MessageStartPublicationRecord,
  MessageStartPublicationState as MessageStartState,
} from "./message-start-publication-contracts.js";
import {
  decodeDefinitionsRecoveryCandidateKey,
  DefinitionsRecoveryFamily,
} from "./postgresql-definitions-recovery-candidate-source.js";
import {
  completeWithoutDatabaseChange,
  failRecovery,
  PostgresqlDefinitionsRecoveryFailureCode,
  PostgresqlDefinitionsRecoveryFailureEvidence,
  PostgresqlDefinitionsRecoveryIntermediateResult,
  PostgresqlDefinitionsRecoveryStepKind,
  PostgresqlDefinitionsRecoveryStoredValueError,
  retryHostUnavailable,
} from "./postgresql-definitions-recovery-step.js";
import type {
  PostgresqlDefinitionsRecoveryStepResult,
} from "./postgresql-definitions-recovery-step.js";
import {
  applyMessageStartRecovery,
  readMessageStartRecoveryRecord,
} from "./postgresql-message-start-recovery-storage.js";

export type PostgresqlMessageStartRecoveryStepOptions = Readonly<{
  runtime: PostgresqlRuntime;
  artifacts: ExactArtifactStore;
  host: Pick<MessageStartPublicationHost, "start" | "describe">;
  locators: Pick<ProcessWorkLocatorFactory, "canonicalLocator">;
}>;

/** Recovers one retained Message Start identity without preparation or redispatch. */
export class PostgresqlMessageStartRecoveryStep {
  readonly #options: PostgresqlMessageStartRecoveryStepOptions;

  constructor(options: PostgresqlMessageStartRecoveryStepOptions) {
    this.#options = options;
  }

  async prepare(itemKey: Uint8Array): Promise<PostgresqlDefinitionsRecoveryStepResult> {
    const candidate = decodeDefinitionsRecoveryCandidateKey(
      DefinitionsRecoveryFamily.MessageStart,
      itemKey,
    );
    if (candidate.family !== DefinitionsRecoveryFamily.MessageStart) {
      throw new TypeError("Message Start candidate family drifted");
    }
    let record;
    try {
      record = await readMessageStartRecoveryRecord(
        this.#options.runtime,
        candidate.publicationId,
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
      case MessageStartPublicationState.Reserved:
        return await this.#dispatch(record);
      case MessageStartPublicationState.Starting:
      case MessageStartPublicationState.Indeterminate:
        return await this.#observe(record);
      case MessageStartPublicationState.Accepted:
        return apply(record, null, this.#confirmation(record));
      case MessageStartPublicationState.IntegrityFailure:
        return completeWithoutDatabaseChange();
      default:
        return assertNever(record.state);
    }
  }

  async #dispatch(
    record: MessageStartPublicationRecord,
  ): Promise<PostgresqlDefinitionsRecoveryStepResult> {
    const artifact = await this.#options.artifacts.get(record.definition.source.sha256);
    if (artifact === null || artifact.byteLength !== record.definition.source.byteLength) {
      return failRecovery(
        PostgresqlDefinitionsRecoveryFailureCode.MissingArtifact,
        PostgresqlDefinitionsRecoveryFailureEvidence.Artifact,
      );
    }
    const request = messageStartPublicationHostRequest(
      artifact,
      record.definition,
      record.messageStart,
      record.identity,
    );
    const starting = {
      ...structuredClone(record),
      state: MessageStartPublicationState.Starting,
    };
    return {
      kind: PostgresqlDefinitionsRecoveryStepKind.Intermediate,
      applyWhileOwned: async (session) => {
        const applied = await applyMessageStartRecovery(
          session,
          record,
          MessageStartPublicationState.Starting,
          null,
        );
        return applied
          ? PostgresqlDefinitionsRecoveryIntermediateResult.Applied
          : PostgresqlDefinitionsRecoveryIntermediateResult.LeaseLost;
      },
      continue: async () => {
        let result;
        try {
          result = await this.#options.host.start({
            ...request,
            bytes: Uint8Array.from(request.bytes),
            expectedIntent: { ...record.intent },
          });
        } catch {
          return retryHostUnavailable();
        }
        switch (result.status) {
          case "started":
            return apply(
              starting,
              MessageStartPublicationState.Accepted,
              this.#confirmation(starting),
            );
          case "rejected":
          case "integrityFailure":
            return apply(starting, MessageStartPublicationState.IntegrityFailure);
          default:
            return assertNever(result);
        }
      },
    };
  }

  async #observe(
    record: MessageStartPublicationRecord,
  ): Promise<PostgresqlDefinitionsRecoveryStepResult> {
    let result;
    try {
      result = await this.#options.host.describe({
        workflowId: record.identity.workflowId,
        expectedIntent: { ...record.intent },
      });
    } catch {
      return retryHostUnavailable();
    }
    switch (result.status) {
      case "matching":
        return apply(
          record,
          MessageStartPublicationState.Accepted,
          this.#confirmation(record),
        );
      case "missing":
        return record.state === MessageStartPublicationState.Starting
          ? apply(record, MessageStartPublicationState.Indeterminate)
          : completeWithoutDatabaseChange();
      case "divergent":
        return apply(record, MessageStartPublicationState.IntegrityFailure);
      case "unavailable":
        return retryHostUnavailable();
      default:
        return assertNever(result.status);
    }
  }

  #confirmation(record: MessageStartPublicationRecord) {
    return {
      instance: {
        processInstanceId: record.identity.processInstanceId,
        definition: toPublicDefinition(record.definition),
      },
      locator: this.#options.locators.canonicalLocator(
        record.identity.processInstanceId,
      ),
    };
  }
}

function apply(
  record: MessageStartPublicationRecord,
  next: MessageStartState | null,
  confirmation: Parameters<typeof applyMessageStartRecovery>[3] = null,
): PostgresqlDefinitionsRecoveryStepResult {
  const expected = structuredClone(record);
  const publication = confirmation === null ? null : structuredClone(confirmation);
  return {
    kind: PostgresqlDefinitionsRecoveryStepKind.Complete,
    apply: async (session) => {
      await applyMessageStartRecovery(session, expected, next, publication);
    },
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Message Start recovery variant: ${String(value)}`);
}
