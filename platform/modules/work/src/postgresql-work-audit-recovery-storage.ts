import { decodeWorkAuditEvent } from "@bpmn-lean/platform-contracts";
import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

import { WorkRepositoryIntegrityError } from "./work-contracts.js";
import type { WorkAuditOutboxItem } from "./work-contracts.js";
import {
  decodePostgresqlOutbox,
  encodePostgresqlWorkText,
} from "./postgresql-work-values.js";
import { sameJson } from "./work-repository-values.js";

/** Revalidates and acknowledges one exact prepared source item in the caller transaction. */
export async function applyPostgresqlWorkAuditAcknowledgement(
  session: PostgresqlSession,
  expected: WorkAuditOutboxItem,
): Promise<void> {
  const exact = snapshotPostgresqlWorkAuditRecoveryItem(expected);
  const result = await session.query({
    text: `
      SELECT ordinal::text AS ordinal, event_id, action_id, action_outcome,
        event_json, delivered
      FROM bpmn_platform.work_audit_outbox
      WHERE ordinal = $1
      FOR UPDATE
    `,
    values: [exact.ordinal],
  });
  const row = result.rows[0];
  if (row === undefined || result.rows.length !== 1 || typeof row.delivered !== "boolean") {
    throw new WorkRepositoryIntegrityError(
      `prepared Work audit ordinal ${exact.ordinal} is unavailable`,
    );
  }
  const current = decodePostgresqlOutbox(row);
  if (current.ordinal !== exact.ordinal || !sameJson(current.event, exact.event)) {
    throw new WorkRepositoryIntegrityError(
      `prepared Work audit ordinal ${exact.ordinal} changed`,
    );
  }
  const acknowledged = await session.query({
    text: `
      UPDATE bpmn_platform.work_audit_outbox
      SET delivered = true
      WHERE ordinal = $1 AND event_id = $2
    `,
    values: [
      exact.ordinal,
      encodePostgresqlWorkText(exact.event.eventId, "eventId"),
    ],
  });
  if (acknowledged.rowCount !== 1) {
    throw new WorkRepositoryIntegrityError(
      `prepared Work audit ordinal ${exact.ordinal} was not acknowledged`,
    );
  }
}

export function snapshotPostgresqlWorkAuditRecoveryItem(
  value: WorkAuditOutboxItem,
): WorkAuditOutboxItem {
  if (!Number.isSafeInteger(value.ordinal) || value.ordinal <= 0) {
    throw new TypeError("Work audit recovery ordinal must be a positive safe integer");
  }
  return {
    ordinal: value.ordinal,
    event: decodeWorkAuditEvent(structuredClone(value.event)),
  };
}
