import type {
  PostgresqlRow,
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import type {
  IncidentActionBinding,
  IncidentActionOutcomeResult,
  IncidentActionRecoveryRepository,
  IncidentActionRepository,
  IncidentActionReservationResult,
  IncidentActionResult,
  IncidentActionSubmissionResult,
  IncidentAuditEvent,
  IncidentAuditOutboxItem,
  StoredIncidentAction,
} from "./incident-contracts.js";
import {
  OperateIncidentIntegrityError,
  OperateIncidentStoredValueError,
  requireIncidentAuditDeliveryLimit,
} from "./incident-contracts.js";
import {
  decodeStoredAction,
  requireNonemptyString,
  sameJson,
  snapshotActionBinding,
  snapshotActionResult,
  snapshotAuditEvent,
} from "./incident-values.js";
import {
  applyPostgresqlIncidentRecoveryOutcome,
  applyPostgresqlIncidentRecoverySubmission,
} from "./postgresql-incident-action-recovery-storage.js";
import { decodePostgresqlOperateRegistration } from "./postgresql-process-instance-repository.js";
import {
  encodePostgresqlByteText,
  requirePostgresqlByteText,
  requirePostgresqlSafeInteger,
  requirePostgresqlString,
} from "./process-instance-values.js";

const actionColumns = `
  action_id,
  actor_id,
  hosting_process_instance_id,
  incident_process_instance_id,
  incident_element_id,
  incident_activation,
  incident_generation,
  action_kind,
  binding_json,
  state,
  result_json
`;

/** Shared PostgreSQL incident-action CAS state and source-ordered audit outbox. */
export class PostgresqlIncidentActionRepository
  implements IncidentActionRepository, IncidentActionRecoveryRepository
{
  readonly #runtime: PostgresqlRuntime;

  constructor(runtime: PostgresqlRuntime) {
    this.#runtime = runtime;
  }

  async get(actionIdValue: string): Promise<StoredIncidentAction | null> {
    const actionId = encodePostgresqlByteText(requireNonemptyString(actionIdValue, "actionId"));
    const row = (await this.#runtime.query({
      text: `
        SELECT ${actionColumns}
        FROM bpmn_platform.operate_incident_actions
        WHERE action_id = $1
      `,
      values: [actionId],
    })).rows[0];
    return row === undefined ? null : decodeActionRow(row);
  }

  async getReservedAuditDelivery(
    bindingValue: IncidentActionBinding,
  ): Promise<Readonly<{ kind: "pending" | "acknowledged" }>> {
    return queryReservedAuditDelivery(this.#runtime, snapshotActionBinding(bindingValue));
  }

  async applyRecoverySubmission(
    session: PostgresqlSession, expectedValue: StoredIncidentAction,
  ): Promise<void> {
    await applyPostgresqlIncidentRecoverySubmission(
      incidentRecoveryStorage,
      session,
      expectedValue,
    );
  }

  async applyRecoveryOutcome(
    session: PostgresqlSession,
    expectedValue: StoredIncidentAction,
    resultValue: IncidentActionResult,
    auditValue: IncidentAuditEvent,
  ): Promise<void> {
    await applyPostgresqlIncidentRecoveryOutcome(
      incidentRecoveryStorage,
      session,
      expectedValue,
      resultValue,
      auditValue,
    );
  }

  async reserve(
    bindingValue: IncidentActionBinding,
    auditValue: IncidentAuditEvent,
  ): Promise<IncidentActionReservationResult> {
    const binding = snapshotActionBinding(bindingValue);
    const audit = snapshotAuditEvent(auditValue);
    requireAuditMatches(audit, binding, "reserved");
    const actionId = encodePostgresqlByteText(binding.actionId);
    return await this.#runtime.transaction(async (session) => {
      const retained = await selectAction(session, actionId, true);
      if (retained !== null) return classifyReservation(retained, binding);
      await requireRegistration(session, binding);
      const inserted = await session.query({
        text: `
          INSERT INTO bpmn_platform.operate_incident_actions (
            action_id,
            actor_id,
            hosting_process_instance_id,
            incident_process_instance_id,
            incident_element_id,
            incident_activation,
            incident_generation,
            action_kind,
            binding_json,
            state,
            result_json
          ) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, 'reserved', NULL)
          ON CONFLICT DO NOTHING
          RETURNING ${actionColumns}
        `,
        values: [
          actionId,
          encodePostgresqlByteText(binding.actorId),
          encodePostgresqlByteText(binding.hostingInstance.processInstanceId),
          encodePostgresqlByteText(
            binding.incident.id.effectId.processInstanceId,
          ),
          encodePostgresqlByteText(binding.incident.id.effectId.elementId),
          binding.incident.id.effectId.activation,
          binding.interaction.kind,
          JSON.stringify(binding),
        ],
      });
      const insertedRow = inserted.rows[0];
      if (insertedRow === undefined) {
        const raced = await selectAction(session, actionId, true);
        if (raced === null) {
          throw new OperateIncidentIntegrityError(
            "incident action conflict did not retain one action",
          );
        }
        return classifyReservation(raced, binding);
      }
      const action = decodeActionRow(insertedRow);
      await recordOutbox(session, audit);
      return { kind: "reserved", action };
    });
  }

  async beginSubmission(
    actionIdValue: string,
    bindingValue: IncidentActionBinding,
  ): Promise<IncidentActionSubmissionResult> {
    const actionIdText = requireNonemptyString(actionIdValue, "actionId");
    const binding = snapshotActionBinding(bindingValue);
    if (binding.actionId !== actionIdText) return { kind: "conflict" };
    const actionId = encodePostgresqlByteText(actionIdText);
    return await this.#runtime.transaction(async (session) => {
      const action = await selectAction(session, actionId, true);
      if (action === null || !sameJson(action.binding, binding)) {
        return { kind: "conflict" };
      }
      switch (action.state) {
        case "reserved":
        case "indeterminate": {
          const updated = await session.query({
            text: `
              UPDATE bpmn_platform.operate_incident_actions
              SET state = 'submitting', result_json = NULL
              WHERE action_id = $1 AND state = $2
              RETURNING ${actionColumns}
            `,
            values: [actionId, action.state],
          });
          const row = updated.rows[0];
          return row === undefined
            ? { kind: "conflict" }
            : { kind: "acquired", action: decodeActionRow(row) };
        }
        case "submitting":
        case "committed":
        case "rejected":
          return { kind: "retained", action };
      }
    });
  }

  async recordOutcome(
    bindingValue: IncidentActionBinding,
    resultValue: IncidentActionResult,
    auditValue: IncidentAuditEvent,
  ): Promise<IncidentActionOutcomeResult> {
    const binding = snapshotActionBinding(bindingValue);
    const result = snapshotActionResult(resultValue);
    const audit = snapshotAuditEvent(auditValue);
    if (
      result.actionId !== binding.actionId ||
      !sameJson(result.interaction, binding.interaction)
    ) {
      return { kind: "conflict" };
    }
    requireAuditMatches(audit, binding, result.state);
    const actionId = encodePostgresqlByteText(binding.actionId);
    return await this.#runtime.transaction(async (session) => {
      const current = await selectAction(session, actionId, true);
      if (current === null || !sameJson(current.binding, binding)) {
        return { kind: "conflict" };
      }
      if (current.state === "committed" || current.state === "rejected") {
        return sameJson(current.result, result)
          ? { kind: "retained", action: current }
          : { kind: "conflict" };
      }
      if (current.state === "indeterminate" && result.state === "indeterminate") {
        await recordOutbox(session, audit);
        return { kind: "retained", action: current };
      }
      if (current.state !== "submitting") return { kind: "conflict" };
      const updated = await session.query({
        text: `
          UPDATE bpmn_platform.operate_incident_actions
          SET state = $1, result_json = $2
          WHERE action_id = $3 AND state = 'submitting'
          RETURNING ${actionColumns}
        `,
        values: [result.state, JSON.stringify(result), actionId],
      });
      const row = updated.rows[0];
      if (row === undefined) return { kind: "conflict" };
      const action = decodeActionRow(row);
      await recordOutbox(session, audit);
      return { kind: "recorded", action };
    });
  }

  async listReconciliableActions(): Promise<ReadonlyArray<StoredIncidentAction>> {
    const result = await this.#runtime.query({
      text: `
        SELECT ${actionColumns}
        FROM bpmn_platform.operate_incident_actions
        WHERE state IN ('submitting', 'indeterminate')
        ORDER BY action_id ASC
      `,
    });
    return result.rows.map(decodeActionRow);
  }

  async listUndeliveredAuditEvents(limitValue?: number): Promise<
    ReadonlyArray<IncidentAuditOutboxItem>
  > {
    const limit = requireIncidentAuditDeliveryLimit(limitValue);
    const result = await this.#runtime.query({
      text: `
        SELECT ordinal, event_id, action_id, action_outcome, event_json, delivered
        FROM bpmn_platform.operate_incident_action_audit_outbox
        WHERE delivered = false
        ORDER BY ordinal ASC
        ${limit === undefined ? "" : "LIMIT $1"}
      `,
      ...(limit === undefined ? {} : { values: [limit] }),
    });
    return result.rows.map(decodeAuditItem);
  }

  async acknowledgeAuditEvent(eventIdValue: string): Promise<void> {
    const eventId = encodePostgresqlByteText(
      requireNonemptyString(eventIdValue, "eventId"),
    );
    const result = await this.#runtime.query({
      text: `
        UPDATE bpmn_platform.operate_incident_action_audit_outbox
        SET delivered = true
        WHERE event_id = $1
        RETURNING event_id
      `,
      values: [eventId],
    });
    if (result.rows.length > 1) {
      throw new OperateIncidentIntegrityError(
        "audit acknowledgement changed multiple rows",
      );
    }
  }
}

async function selectAction(
  session: PostgresqlSession,
  actionId: Buffer,
  forUpdate: boolean,
): Promise<StoredIncidentAction | null> {
  const row = (await session.query({
    text: `
      SELECT ${actionColumns}
      FROM bpmn_platform.operate_incident_actions
      WHERE action_id = $1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    values: [actionId],
  })).rows[0];
  return row === undefined ? null : decodeActionRow(row);
}

function classifyReservation(
  retained: StoredIncidentAction,
  binding: IncidentActionBinding,
): IncidentActionReservationResult {
  if (retained.binding.actorId !== binding.actorId) return { kind: "forbidden" };
  return sameJson(retained.binding, binding)
    ? { kind: "retained", action: retained }
    : { kind: "conflict" };
}

function decodeActionRow(row: PostgresqlRow): StoredIncidentAction {
  try {
    const action = decodeStoredAction(row.binding_json, row.state, row.result_json);
    if (
      requirePostgresqlByteText(row, "action_id") !== action.binding.actionId ||
      requirePostgresqlByteText(row, "actor_id") !== action.binding.actorId ||
      requirePostgresqlByteText(row, "hosting_process_instance_id") !==
        action.binding.hostingInstance.processInstanceId ||
      requirePostgresqlByteText(row, "incident_process_instance_id") !==
        action.binding.incident.id.effectId.processInstanceId ||
      requirePostgresqlByteText(row, "incident_element_id") !==
        action.binding.incident.id.effectId.elementId ||
      requirePostgresqlSafeInteger(row, "incident_activation", 1) !==
        action.binding.incident.id.effectId.activation ||
      requirePostgresqlSafeInteger(row, "incident_generation", 1) !== 1 ||
      requirePostgresqlString(row, "action_kind") !==
        action.binding.interaction.kind
    ) {
      throw new TypeError("stored incident-action columns disagree");
    }
    return action;
  } catch (error: unknown) {
    if (error instanceof OperateIncidentStoredValueError) throw error;
    throw new OperateIncidentStoredValueError(error);
  }
}

async function requireRegistration(
  session: PostgresqlSession,
  binding: IncidentActionBinding,
): Promise<void> {
  const row = (await session.query({
    text: `
      SELECT
        ordinal,
        process_instance_id,
        process_id,
        definition_version,
        source_sha256,
        public_identity_json,
        process_locator,
        observation
      FROM bpmn_platform.operate_process_instances
      WHERE process_instance_id = $1
      FOR SHARE
    `,
    values: [encodePostgresqlByteText(binding.hostingInstance.processInstanceId)],
  })).rows[0];
  if (row === undefined) {
    throw new OperateIncidentIntegrityError(
      "incident action has no hosting registration",
    );
  }
  try {
    const registration = decodePostgresqlOperateRegistration(row);
    if (
      !sameJson(registration.instance, binding.hostingInstance) ||
      registration.locator !== binding.locator
    ) {
      throw new OperateIncidentIntegrityError(
        "incident action hosting registration changed",
      );
    }
  } catch (error: unknown) {
    if (error instanceof OperateIncidentIntegrityError) throw error;
    throw new OperateIncidentStoredValueError(error);
  }
}

async function recordOutbox(
  session: PostgresqlSession,
  event: IncidentAuditEvent,
): Promise<void> {
  if (await findRetainedAudit(session, event, false)) return;
  await session.query({
    text: `
      SELECT head
      FROM bpmn_platform.operate_incident_action_audit_source_head
      WHERE singleton = true
      FOR UPDATE
    `,
  });
  if (await findRetainedAudit(session, event, true)) return;
  const allocated = await session.query({
    text: `
      UPDATE bpmn_platform.operate_incident_action_audit_source_head
      SET head = head + 1
      WHERE singleton = true
      RETURNING head
    `,
  });
  const ordinal = allocated.rows[0] === undefined
    ? null
    : requirePostgresqlSafeInteger(allocated.rows[0], "head", 1);
  if (ordinal === null) {
    throw new OperateIncidentIntegrityError("incident audit source head is absent");
  }
  await session.query({
    text: `
      INSERT INTO bpmn_platform.operate_incident_action_audit_outbox (
        ordinal, event_id, action_id, action_outcome, event_json, delivered
      ) VALUES ($1, $2, $3, $4, $5, false)
    `,
    values: [
      ordinal,
      encodePostgresqlByteText(event.eventId),
      encodePostgresqlByteText(event.actionId),
      event.outcome,
      JSON.stringify(event),
    ],
  });
}

async function findRetainedAudit(
  session: PostgresqlSession,
  event: IncidentAuditEvent,
  forUpdate: boolean,
): Promise<boolean> {
  const result = await session.query({
    text: `
      SELECT ordinal, event_id, action_id, action_outcome, event_json, delivered
      FROM bpmn_platform.operate_incident_action_audit_outbox
      WHERE event_id = $1 OR (action_id = $2 AND action_outcome = $3)
      ORDER BY ordinal ASC
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    values: [
      encodePostgresqlByteText(event.eventId),
      encodePostgresqlByteText(event.actionId),
      event.outcome,
    ],
  });
  let retained = false;
  for (const row of result.rows) {
    const item = decodeAuditItem(row);
    if (item.event.eventId === event.eventId) {
      if (!sameJson(item.event, event)) {
        throw new OperateIncidentIntegrityError(
          `incident audit event ${event.eventId} conflicts`,
        );
      }
      retained = true;
    }
    if (
      item.event.actionId === event.actionId &&
      item.event.outcome === event.outcome
    ) {
      if (!sameLogicalAudit(item.event, event)) {
        throw new OperateIncidentIntegrityError(
          `incident audit outcome ${event.actionId}/${event.outcome} conflicts`,
        );
      }
      retained = true;
    }
  }
  return retained;
}

function decodeAuditItem(row: PostgresqlRow): IncidentAuditOutboxItem {
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

function decodeReservedAuditDelivery(
  row: PostgresqlRow, binding: IncidentActionBinding,
): Readonly<{ kind: "pending" | "acknowledged" }> {
  try {
    const item = decodeAuditItem(row);
    requireAuditMatches(item.event, binding, "reserved");
    return row.delivered === true ? { kind: "acknowledged" } : { kind: "pending" };
  } catch (error: unknown) {
    if (error instanceof OperateIncidentStoredValueError) throw error;
    throw new OperateIncidentStoredValueError(error);
  }
}

async function queryReservedAuditDelivery(
  session: PostgresqlSession, binding: IncidentActionBinding,
): Promise<Readonly<{ kind: "pending" | "acknowledged" }>> {
  const row = (await session.query({
    text: `
      SELECT ordinal, event_id, action_id, action_outcome, event_json, delivered
      FROM bpmn_platform.operate_incident_action_audit_outbox
      WHERE action_id = $1 AND action_outcome = 'reserved'
    `,
    values: [encodePostgresqlByteText(binding.actionId)],
  })).rows[0];
  if (row === undefined) {
    throw new OperateIncidentIntegrityError(`incident action ${binding.actionId} has no reserved audit`);
  }
  return decodeReservedAuditDelivery(row, binding);
}

function requireAuditMatches(
  event: IncidentAuditEvent,
  binding: IncidentActionBinding,
  outcome: IncidentAuditEvent["outcome"],
): void {
  if (
    event.actorId !== binding.actorId ||
    event.hostingProcessInstanceId !== binding.hostingInstance.processInstanceId ||
    !sameJson(event.incidentId, binding.incident.id) ||
    event.actionId !== binding.actionId ||
    event.actionKind !== binding.interaction.kind ||
    event.outcome !== outcome
  ) {
    throw new TypeError("incident audit event does not match its action transition");
  }
}

function sameLogicalAudit(
  left: IncidentAuditEvent,
  right: IncidentAuditEvent,
): boolean {
  const { eventId: _leftEvent, recordedAt: _leftTime, ...leftLogical } = left;
  const { eventId: _rightEvent, recordedAt: _rightTime, ...rightLogical } = right;
  return sameJson(leftLogical, rightLogical);
}

const incidentRecoveryStorage = {
  loadForUpdate: async (session: PostgresqlSession, actionId: string) =>
    await selectAction(session, encodePostgresqlByteText(actionId), true),
  getReservedAuditDelivery: queryReservedAuditDelivery,
  recordOutbox,
  requireAuditMatches,
};
