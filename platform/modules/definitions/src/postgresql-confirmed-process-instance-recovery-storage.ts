import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

import {
  ConfirmedProcessInstanceState,
} from "./confirmed-process-instance-contracts.js";
import type {
  ConfirmedProcessInstancePublication,
  ConfirmedProcessInstanceRecord,
} from "./confirmed-process-instance-contracts.js";
import {
  encodeDirectIntent,
  encodePublicInstance,
  sameStartCommandBytes,
  sameIntent,
  samePublication,
  snapshotConfirmedPublication,
} from "./confirmed-process-instance-values.js";
import {
  decodePostgresqlConfirmedProcessInstanceRecord,
} from "./postgresql-confirmed-process-instance-repository.js";
import { encodePostgresqlText } from "./postgresql-definition-values.js";
import {
  PostgresqlDefinitionsRecoveryStoredValueError,
} from "./postgresql-definitions-recovery-step.js";

export async function readConfirmedRecoveryRecord(
  session: PostgresqlSession,
  processInstanceId: string,
  lock: boolean,
): Promise<ConfirmedProcessInstanceRecord | null> {
  const result = await session.query({
    text: `
      SELECT * FROM bpmn_platform.confirmed_process_instances
      WHERE process_instance_id = $1${lock ? " FOR UPDATE" : ""}
    `,
    values: [encodePostgresqlText(processInstanceId)],
  });
  const row = result.rows[0];
  if (row === undefined) return null;
  try {
    return decodePostgresqlConfirmedProcessInstanceRecord(row);
  } catch {
    throw new PostgresqlDefinitionsRecoveryStoredValueError();
  }
}

/** Applies a transition only while the exact prepared row remains current. */
export async function applyConfirmedRecoveryState(
  session: PostgresqlSession,
  expected: ConfirmedProcessInstanceRecord,
  next: ConfirmedProcessInstanceRecord["state"],
): Promise<boolean> {
  const current = await readConfirmedRecoveryRecord(
    session,
    expected.instance.processInstanceId,
    true,
  );
  if (!sameConfirmedRecord(current, expected)) return false;
  const result = await session.query({
    text: `
      UPDATE bpmn_platform.confirmed_process_instances
      SET state = $1,
        operate_pending = ($1 = 'confirmed'),
        work_pending = ($1 = 'confirmed')
      WHERE process_instance_id = $2 AND state = $3
    `,
    values: [
      next,
      encodePostgresqlText(expected.instance.processInstanceId),
      expected.state,
    ],
  });
  return result.rowCount === 1;
}

/** Inserts or compares one exact confirmation without resetting delivery markers. */
export async function confirmProcessInstanceForRecovery(
  session: PostgresqlSession,
  publicationValue: ConfirmedProcessInstancePublication,
): Promise<void> {
  const publication = snapshotConfirmedPublication(publicationValue);
  await session.query({
    text: `
      INSERT INTO bpmn_platform.confirmed_process_instances (
        process_instance_id, public_instance_json, work_locator,
        direct_intent_json, direct_start_command,
        state, operate_pending, work_pending
      ) VALUES ($1, $2, $3, NULL, NULL, 'confirmed', true, true)
      ON CONFLICT (process_instance_id) DO NOTHING
    `,
    values: [
      encodePostgresqlText(publication.instance.processInstanceId),
      encodePublicInstance(publication.instance),
      encodePostgresqlText(publication.locator),
    ],
  });
  const retained = await readConfirmedRecoveryRecord(
    session,
    publication.instance.processInstanceId,
    true,
  );
  if (
    retained === null ||
    retained.state !== ConfirmedProcessInstanceState.Confirmed ||
    retained.intent !== null ||
    retained.startCommandBytes !== null ||
    !samePublication(retained, publication)
  ) {
    throw new TypeError("recovery confirmation conflicts with retained identity");
  }
}

export function sameConfirmedRecord(
  left: ConfirmedProcessInstanceRecord | null,
  right: ConfirmedProcessInstanceRecord,
): boolean {
  return left !== null &&
    left.state === right.state &&
    left.operatePending === right.operatePending &&
    left.workPending === right.workPending &&
    samePublication(left, right) &&
    sameIntent(left.intent, right.intent) &&
    sameStartCommandBytes(left.startCommandBytes, right.startCommandBytes);
}

export function directReservation(
  record: ConfirmedProcessInstanceRecord,
) {
  if (record.intent === null || record.startCommandBytes === null) {
    throw new TypeError("direct recovery row has incomplete retained command evidence");
  }
  return {
    instance: structuredClone(record.instance),
    locator: record.locator,
    intent: JSON.parse(encodeDirectIntent(record.intent)!) as {
      protocol: string;
      intentSha256: string;
    },
    startCommandBytes: Uint8Array.from(record.startCommandBytes),
  };
}
