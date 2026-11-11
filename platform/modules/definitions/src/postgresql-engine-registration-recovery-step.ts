import type { DefinitionVersionRegistrar } from "@bpmn-lean/platform-engine-gateway";
import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";

import { DefinitionArtifactIntegrityError } from "./contracts.js";
import type { DefinitionEngineRegistration, DefinitionMetadata, ExactArtifactStore } from "./contracts.js";
import { readRetainedDefinitionArtifacts } from "./definition-artifacts.js";
import { registerRetainedDefinitionVersion } from "./definition-engine-registration.js";
import {
  PostgresqlDefinitionRepository,
  recordPostgresqlEngineRegistration,
} from "./postgresql-definition-repository.js";
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
  retryHostUnavailable,
} from "./postgresql-definitions-recovery-step.js";
import type { PostgresqlDefinitionsRecoveryStepResult } from "./postgresql-definitions-recovery-step.js";

export type PostgresqlEngineRegistrationRecoveryStepOptions = Readonly<{
  runtime: PostgresqlRuntime;
  artifacts: ExactArtifactStore;
  registrar: DefinitionVersionRegistrar;
}>;

/**
 * Registers one process's versions that have no recorded engine answer, in version order, as a deploy whose replica
 * stopped before the answer was recorded would have. Every answer, a refusal included, is recorded in the fenced
 * transaction; a host failure records nothing and retries the whole process, which the engine answers as before.
 */
export class PostgresqlEngineRegistrationRecoveryStep {
  readonly #options: PostgresqlEngineRegistrationRecoveryStepOptions;
  readonly #definitions: PostgresqlDefinitionRepository;

  constructor(options: PostgresqlEngineRegistrationRecoveryStepOptions) {
    this.#options = options;
    this.#definitions = new PostgresqlDefinitionRepository(options.runtime);
  }

  async prepare(itemKey: Uint8Array): Promise<PostgresqlDefinitionsRecoveryStepResult> {
    const candidate = decodeDefinitionsRecoveryCandidateKey(DefinitionsRecoveryFamily.EngineRegistration, itemKey);
    if (candidate.family !== DefinitionsRecoveryFamily.EngineRegistration) {
      throw new TypeError("engine-registration candidate family drifted");
    }
    const pending = await this.#definitions.listPendingEngineRegistrations(candidate.processId);
    if (pending.length === 0) return completeWithoutDatabaseChange();
    const answers: Array<Readonly<{ definition: DefinitionMetadata; registration: DefinitionEngineRegistration }>> = [];
    for (const definition of pending) {
      let retained;
      try {
        retained = await readRetainedDefinitionArtifacts(this.#options.artifacts, definition);
      } catch (error: unknown) {
        if (!(error instanceof DefinitionArtifactIntegrityError)) throw error;
        return failRecovery(PostgresqlDefinitionsRecoveryFailureCode.MissingArtifact, PostgresqlDefinitionsRecoveryFailureEvidence.Artifact);
      }
      try {
        answers.push({
          definition,
          registration: await registerRetainedDefinitionVersion(this.#options.registrar, definition, retained),
        });
      } catch {
        return retryHostUnavailable();
      }
    }
    return {
      kind: PostgresqlDefinitionsRecoveryStepKind.Complete,
      apply: async (session) => {
        for (const { definition, registration } of answers) {
          await recordPostgresqlEngineRegistration(
            session,
            { processId: definition.processId, version: definition.version },
            registration,
          );
        }
      },
    };
  }
}
