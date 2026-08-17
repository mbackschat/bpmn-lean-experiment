import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

import type { ConfirmedProcessInstancePublication } from "./confirmed-process-instance-contracts.js";
import type {
  MessageStartPublicationRecord,
  MessageStartPublicationState,
} from "./message-start-publication-contracts.js";
import {
  confirmProcessInstanceForRecovery,
} from "./postgresql-confirmed-process-instance-recovery-storage.js";
import { encodePostgresqlText } from "./postgresql-definition-values.js";
import {
  decodePostgresqlMessageStartPublicationRecord,
} from "./postgresql-message-start-publication-repository.js";
import {
  PostgresqlDefinitionsRecoveryStoredValueError,
} from "./postgresql-definitions-recovery-step.js";

export async function readMessageStartRecoveryRecord(
  session: PostgresqlSession,
  publicationId: string,
  lock: boolean,
): Promise<MessageStartPublicationRecord | null> {
  const result = await session.query({
    text: `
      SELECT * FROM bpmn_platform.message_start_publications
      WHERE publication_id = $1${lock ? " FOR UPDATE" : ""}
    `,
    values: [encodePostgresqlText(publicationId)],
  });
  const row = result.rows[0];
  if (row === undefined) return null;
  try {
    return decodePostgresqlMessageStartPublicationRecord(row);
  } catch {
    throw new PostgresqlDefinitionsRecoveryStoredValueError();
  }
}

/** Applies an exact publication transition and optional confirmation atomically. */
export async function applyMessageStartRecovery(
  session: PostgresqlSession,
  expected: MessageStartPublicationRecord,
  next: MessageStartPublicationState | null,
  confirmation: ConfirmedProcessInstancePublication | null,
): Promise<boolean> {
  const current = await readMessageStartRecoveryRecord(
    session,
    expected.publicationId,
    true,
  );
  if (current === null || JSON.stringify(current) !== JSON.stringify(expected)) return false;
  if (next !== null) {
    const result = await session.query({
      text: `
        UPDATE bpmn_platform.message_start_publications
        SET state = $1
        WHERE publication_id = $2 AND state = $3
      `,
      values: [next, encodePostgresqlText(expected.publicationId), expected.state],
    });
    if (result.rowCount !== 1) return false;
  }
  if (confirmation !== null) {
    await confirmProcessInstanceForRecovery(session, confirmation);
  }
  return true;
}
