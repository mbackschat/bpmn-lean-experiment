import type {
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  ConfirmedProcessInstanceState,
} from "./confirmed-process-instance-contracts.js";
import type {
  ConfirmedProcessInstancePublication,
  ConfirmedProcessInstanceRecord,
} from "./confirmed-process-instance-contracts.js";
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
} from "./postgresql-definitions-recovery-step.js";
import type {
  PostgresqlDefinitionsRecoveryStepResult,
} from "./postgresql-definitions-recovery-step.js";
import {
  readConfirmedRecoveryRecord,
  sameConfirmedRecord,
} from "./postgresql-confirmed-process-instance-recovery-storage.js";
import { encodePostgresqlText } from "./postgresql-definition-values.js";

export type PostgresqlConfirmedRegistrationSubscriber = Readonly<{
  recordConfirmedProcessInstance: (
    session: PostgresqlSession,
    publication: ConfirmedProcessInstancePublication,
  ) => Promise<void>;
}>;

export type PostgresqlConfirmedRegistrationRecoveryStepOptions = Readonly<{
  runtime: PostgresqlRuntime;
  operate: PostgresqlConfirmedRegistrationSubscriber;
  work: PostgresqlConfirmedRegistrationSubscriber;
}>;

/** Prepares atomic subscriber delivery and acknowledgements for one exact row. */
export class PostgresqlConfirmedRegistrationRecoveryStep {
  readonly #options: PostgresqlConfirmedRegistrationRecoveryStepOptions;

  constructor(options: PostgresqlConfirmedRegistrationRecoveryStepOptions) {
    this.#options = options;
  }

  async prepare(itemKey: Uint8Array): Promise<PostgresqlDefinitionsRecoveryStepResult> {
    const candidate = decodeDefinitionsRecoveryCandidateKey(
      DefinitionsRecoveryFamily.ConfirmedRegistration,
      itemKey,
    );
    if (candidate.family !== DefinitionsRecoveryFamily.ConfirmedRegistration) {
      throw new TypeError("confirmed-registration candidate family drifted");
    }
    let current;
    try {
      current = await readConfirmedRecoveryRecord(
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
    if (
      current === null ||
      current.state !== ConfirmedProcessInstanceState.Confirmed ||
      (!current.operatePending && !current.workPending)
    ) {
      return completeWithoutDatabaseChange();
    }
    const expected = structuredClone(current);
    return {
      kind: PostgresqlDefinitionsRecoveryStepKind.Complete,
      apply: async (session) => {
        await this.#apply(session, expected);
      },
    };
  }

  async #apply(
    session: PostgresqlSession,
    expected: ConfirmedProcessInstanceRecord,
  ): Promise<void> {
    const current = await readConfirmedRecoveryRecord(
      session,
      expected.instance.processInstanceId,
      true,
    );
    if (!sameConfirmedRecord(current, expected)) return;
    const publication = {
      instance: structuredClone(expected.instance),
      locator: expected.locator,
    };
    if (expected.operatePending) {
      await this.#options.operate.recordConfirmedProcessInstance(
        session,
        structuredClone(publication),
      );
    }
    if (expected.workPending) {
      await this.#options.work.recordConfirmedProcessInstance(
        session,
        structuredClone(publication),
      );
    }
    const result = await session.query({
      text: `
        UPDATE bpmn_platform.confirmed_process_instances
        SET operate_pending = CASE WHEN $1 THEN false ELSE operate_pending END,
          work_pending = CASE WHEN $2 THEN false ELSE work_pending END
        WHERE process_instance_id = $3 AND state = 'confirmed'
      `,
      values: [
        expected.operatePending,
        expected.workPending,
        encodePostgresqlText(expected.instance.processInstanceId),
      ],
    });
    if (result.rowCount !== 1) {
      throw new TypeError("locked confirmed-registration acknowledgement changed");
    }
  }
}
