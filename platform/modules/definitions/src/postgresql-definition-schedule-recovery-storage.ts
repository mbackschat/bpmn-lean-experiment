import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

import type {
  ConfirmedProcessInstancePublication,
} from "./confirmed-process-instance-contracts.js";
import type {
  DefinitionScheduleRecord,
  DefinitionScheduleReference,
  DefinitionScheduleTransition,
} from "./definition-schedule-contracts.js";
import {
  confirmProcessInstanceForRecovery,
} from "./postgresql-confirmed-process-instance-recovery-storage.js";
import {
  decodePostgresqlDefinitionScheduleRecord,
} from "./postgresql-definition-schedule-repository.js";
import {
  encodeNullablePostgresqlText,
  encodePostgresqlText,
} from "./postgresql-definition-values.js";
import {
  PostgresqlDefinitionsRecoveryStoredValueError,
} from "./postgresql-definitions-recovery-step.js";

export async function readDefinitionScheduleRecoveryRecord(
  session: PostgresqlSession,
  reference: DefinitionScheduleReference,
  lock: boolean,
): Promise<DefinitionScheduleRecord | null> {
  const result = await session.query({
    text: `
      SELECT * FROM bpmn_platform.definition_schedules
      WHERE process_id = $1 AND version = $2 AND schedule_id = $3
      ${lock ? "FOR UPDATE" : ""}
    `,
    values: [
      encodePostgresqlText(reference.processId),
      reference.version,
      encodePostgresqlText(reference.scheduleId),
    ],
  });
  const row = result.rows[0];
  if (row === undefined) return null;
  try {
    return decodePostgresqlDefinitionScheduleRecord(row);
  } catch {
    throw new PostgresqlDefinitionsRecoveryStoredValueError();
  }
}

/** Applies an exact state/cleanup change and optional confirmation behind one fence. */
export async function applyDefinitionScheduleRecovery(
  session: PostgresqlSession,
  expected: DefinitionScheduleRecord,
  transition: DefinitionScheduleTransition | null,
  confirmation: ConfirmedProcessInstancePublication | null,
): Promise<void> {
  const current = await readDefinitionScheduleRecoveryRecord(
    session,
    expected.reference,
    true,
  );
  if (!sameScheduleRecord(current, expected)) return;
  if (transition !== null) {
    const next = applyTransition(expected, transition);
    const result = await session.query({
      text: `
        UPDATE bpmn_platform.definition_schedules
        SET state = $1, cleanup_complete = $2, cancellation_origin = $3,
          execution_workflow_id = $4, first_run_id = $5
        WHERE process_id = $6 AND version = $7 AND schedule_id = $8
          AND state = $9
      `,
      values: [
        next.state,
        next.cleanupComplete,
        next.cancellationOrigin,
        encodeNullablePostgresqlText(next.executionWorkflowId),
        encodeNullablePostgresqlText(next.firstRunId),
        encodePostgresqlText(expected.reference.processId),
        expected.reference.version,
        encodePostgresqlText(expected.reference.scheduleId),
        expected.state,
      ],
    });
    if (result.rowCount !== 1) return;
  }
  if (confirmation !== null) {
    await confirmProcessInstanceForRecovery(session, confirmation);
  }
}

function sameScheduleRecord(
  left: DefinitionScheduleRecord | null,
  right: DefinitionScheduleRecord,
): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

function applyTransition(
  current: DefinitionScheduleRecord,
  transition: DefinitionScheduleTransition,
): DefinitionScheduleRecord {
  return {
    ...current,
    state: transition.state,
    cleanupComplete: transition.cleanupComplete ?? current.cleanupComplete,
    cancellationOrigin: transition.cancellationOrigin === undefined
      ? (transition.state === "cancelling" ? current.cancellationOrigin : null)
      : transition.cancellationOrigin,
    executionWorkflowId: transition.executionWorkflowId === undefined
      ? current.executionWorkflowId
      : transition.executionWorkflowId,
    firstRunId: transition.firstRunId === undefined
      ? current.firstRunId
      : transition.firstRunId,
  };
}
