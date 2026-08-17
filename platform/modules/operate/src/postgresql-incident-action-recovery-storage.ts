import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

import type {
  IncidentActionBinding,
  IncidentActionResult,
  IncidentAuditEvent,
  StoredIncidentAction,
} from "./incident-contracts.js";
import { OperateIncidentIntegrityError } from "./incident-contracts.js";
import {
  decodeStoredAction,
  sameJson,
  snapshotActionResult,
  snapshotAuditEvent,
} from "./incident-values.js";
import { encodePostgresqlByteText } from "./process-instance-values.js";

export type PostgresqlIncidentActionRecoveryStorage = Readonly<{
  loadForUpdate: (
    session: PostgresqlSession,
    actionId: string,
  ) => Promise<StoredIncidentAction | null>;
  getReservedAuditDelivery: (
    session: PostgresqlSession,
    binding: IncidentActionBinding,
  ) => Promise<Readonly<{ kind: "pending" | "acknowledged" }>>;
  recordOutbox: (
    session: PostgresqlSession,
    audit: IncidentAuditEvent,
  ) => Promise<void>;
  requireAuditMatches: (
    audit: IncidentAuditEvent,
    binding: IncidentActionBinding,
    outcome: IncidentAuditEvent["outcome"],
  ) => void;
}>;

/** Applies only the database half of a lease-fenced undispatched-action step. */
export async function applyPostgresqlIncidentRecoverySubmission(
  storage: PostgresqlIncidentActionRecoveryStorage,
  session: PostgresqlSession,
  expectedValue: StoredIncidentAction,
): Promise<void> {
  const expected = snapshotStoredAction(expectedValue);
  if (expected.state !== "reserved" && expected.state !== "indeterminate") {
    throw new TypeError("recovery submission requires one undispatched action");
  }
  const current = await storage.loadForUpdate(
    session,
    expected.binding.actionId,
  );
  if (current === null) return;
  requireSameRecoveryBinding(current, expected);
  if (
    current.state !== expected.state ||
    !sameJson(current.result, expected.result)
  ) return;
  const audit = await storage.getReservedAuditDelivery(
    session,
    expected.binding,
  );
  if (audit.kind !== "acknowledged") {
    throw new OperateIncidentIntegrityError(
      "reserved audit lost acknowledgement before recovery",
    );
  }
  const updated = await session.query({
    text: `
      UPDATE bpmn_platform.operate_incident_actions
      SET state = 'submitting', result_json = NULL
      WHERE action_id = $1 AND state = $2
    `,
    values: [
      encodePostgresqlByteText(expected.binding.actionId),
      expected.state,
    ],
  });
  requireOneRecoveryMutation(updated.rowCount, "submission");
}

/** Applies one exact prepared Product 1 outcome and its outbox row behind the lease fence. */
export async function applyPostgresqlIncidentRecoveryOutcome(
  storage: PostgresqlIncidentActionRecoveryStorage,
  session: PostgresqlSession,
  expectedValue: StoredIncidentAction,
  resultValue: IncidentActionResult,
  auditValue: IncidentAuditEvent,
): Promise<void> {
  const expected = snapshotStoredAction(expectedValue);
  if (expected.state !== "submitting") {
    throw new TypeError("recovery outcome requires one submitting action");
  }
  const result = snapshotActionResult(resultValue);
  const audit = snapshotAuditEvent(auditValue);
  if (
    result.actionId !== expected.binding.actionId ||
    !sameJson(result.interaction, expected.binding.interaction)
  ) {
    throw new TypeError("recovery outcome does not match its expected action");
  }
  storage.requireAuditMatches(audit, expected.binding, result.state);
  const current = await storage.loadForUpdate(
    session,
    expected.binding.actionId,
  );
  if (current === null) return;
  requireSameRecoveryBinding(current, expected);
  if (
    current.state !== expected.state ||
    !sameJson(current.result, expected.result)
  ) return;
  const updated = await session.query({
    text: `
      UPDATE bpmn_platform.operate_incident_actions
      SET state = $1, result_json = $2
      WHERE action_id = $3 AND state = 'submitting'
    `,
    values: [
      result.state,
      JSON.stringify(result),
      encodePostgresqlByteText(expected.binding.actionId),
    ],
  });
  requireOneRecoveryMutation(updated.rowCount, "outcome");
  await storage.recordOutbox(session, audit);
}

function snapshotStoredAction(value: StoredIncidentAction): StoredIncidentAction {
  const snapshot = decodeStoredAction(
    JSON.stringify(value.binding),
    value.state,
    value.result === null ? null : JSON.stringify(value.result),
  );
  if (!sameJson(snapshot, value)) {
    throw new TypeError("expected recovery action must be exact");
  }
  return snapshot;
}

function requireSameRecoveryBinding(
  current: StoredIncidentAction,
  expected: StoredIncidentAction,
): void {
  if (!sameJson(current.binding, expected.binding)) {
    throw new OperateIncidentIntegrityError(
      "incident recovery action binding changed",
    );
  }
}

function requireOneRecoveryMutation(
  rowCount: number | null,
  operation: string,
): void {
  if (rowCount !== 1) {
    throw new OperateIncidentIntegrityError(
      `incident recovery ${operation} did not change one exact action`,
    );
  }
}
