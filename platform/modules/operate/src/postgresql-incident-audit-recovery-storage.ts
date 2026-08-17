import type {
  PostgresqlRow,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  OperateIncidentIntegrityError,
  OperateIncidentStoredValueError,
} from "./incident-contracts.js";
import type { IncidentAuditOutboxItem } from "./incident-contracts.js";
import { sameJson, snapshotAuditEvent } from "./incident-values.js";
import {
  encodePostgresqlByteText,
  requirePostgresqlByteText,
  requirePostgresqlSafeInteger,
  requirePostgresqlString,
} from "./process-instance-values.js";

export function decodePostgresqlIncidentAuditItem(
  row: PostgresqlRow,
): IncidentAuditOutboxItem {
  try {
    const encoded = requirePostgresqlString(row, "event_json");
    const event = snapshotAuditEvent(JSON.parse(encoded));
    if (
      JSON.stringify(event) !== encoded ||
      requirePostgresqlByteText(row, "event_id") !== event.eventId ||
      requirePostgresqlByteText(row, "action_id") !== event.actionId ||
      requirePostgresqlString(row, "action_outcome") !== event.outcome ||
      typeof row.delivered !== "boolean"
    ) {
      throw new TypeError("stored incident audit columns disagree");
    }
    return {
      ordinal: requirePostgresqlSafeInteger(row, "ordinal", 1),
      event,
    };
  } catch (error: unknown) {
    throw new OperateIncidentStoredValueError(error);
  }
}

/** Revalidates and acknowledges one exact prepared source item in the caller transaction. */
export async function applyPostgresqlIncidentAuditAcknowledgement(
  session: PostgresqlSession,
  expected: IncidentAuditOutboxItem,
): Promise<void> {
  const exact = snapshotPostgresqlIncidentAuditRecoveryItem(expected);
  const result = await session.query({
    text: `
      SELECT ordinal::text AS ordinal, event_id, action_id, action_outcome,
        event_json, delivered
      FROM bpmn_platform.operate_incident_action_audit_outbox
      WHERE ordinal = $1
      FOR UPDATE
    `,
    values: [exact.ordinal],
  });
  const row = result.rows[0];
  if (row === undefined || result.rows.length !== 1) {
    throw new OperateIncidentIntegrityError(
      `prepared incident audit ordinal ${exact.ordinal} is unavailable`,
    );
  }
  const current = decodePostgresqlIncidentAuditItem(row);
  if (current.ordinal !== exact.ordinal || !sameJson(current.event, exact.event)) {
    throw new OperateIncidentIntegrityError(
      `prepared incident audit ordinal ${exact.ordinal} changed`,
    );
  }
  const acknowledged = await session.query({
    text: `
      UPDATE bpmn_platform.operate_incident_action_audit_outbox
      SET delivered = true
      WHERE ordinal = $1 AND event_id = $2
    `,
    values: [exact.ordinal, encodePostgresqlByteText(exact.event.eventId)],
  });
  if (acknowledged.rowCount !== 1) {
    throw new OperateIncidentIntegrityError(
      `prepared incident audit ordinal ${exact.ordinal} was not acknowledged`,
    );
  }
}

export function snapshotPostgresqlIncidentAuditRecoveryItem(
  value: IncidentAuditOutboxItem,
): IncidentAuditOutboxItem {
  if (!Number.isSafeInteger(value.ordinal) || value.ordinal <= 0) {
    throw new TypeError("incident audit recovery ordinal must be a positive safe integer");
  }
  return {
    ordinal: value.ordinal,
    event: snapshotAuditEvent(structuredClone(value.event)),
  };
}
