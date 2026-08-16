import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import type {
  IncidentActionBinding,
  IncidentActionRepository,
  IncidentActionOutcomeResult,
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
} from "./incident-contracts.js";
import {
  decodeStoredAction,
  requireNonemptyString,
  requirePositiveSafeInteger,
  sameJson,
  snapshotActionBinding,
  snapshotActionResult,
  snapshotAuditEvent,
} from "./incident-values.js";
import {
  decodeStoredProcessInstanceIdentity,
} from "./process-instance-values.js";
import { initializeOperateSchema } from "./sqlite-operate-schema.js";

const defaultBusyTimeoutMs = 5_000;

/** Durable content-bound incident actions and their same-transaction audit outbox. */
export class SqliteIncidentActionRepository implements IncidentActionRepository {
  readonly #database: DatabaseSync;

  constructor(databaseFile: string, busyTimeoutMs = defaultBusyTimeoutMs) {
    requirePositiveSafeInteger(busyTimeoutMs, "busyTimeoutMs");
    this.#database = new DatabaseSync(databaseFile);
    this.#database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    try {
      initializeOperateSchema(this.#database);
    } catch (error: unknown) {
      this.#database.close();
      throw error;
    }
  }

  get isOpen(): boolean {
    return this.#database.isOpen;
  }

  async get(actionId: string): Promise<StoredIncidentAction | null> {
    const row = this.#actionRow(requireNonemptyString(actionId, "actionId"));
    return row === undefined ? null : decodeActionRow(row);
  }

  async reserve(
    bindingValue: IncidentActionBinding,
    auditValue: IncidentAuditEvent,
  ): Promise<IncidentActionReservationResult> {
    const binding = snapshotActionBinding(bindingValue);
    const audit = snapshotAuditEvent(auditValue);
    requireAuditMatches(audit, binding, "reserved");
    return this.#transaction(() => {
      const retainedRow = this.#actionRow(binding.actionId);
      if (retainedRow !== undefined) {
        const retained = decodeActionRow(retainedRow);
        if (retained.binding.actorId !== binding.actorId) return { kind: "forbidden" };
        return sameJson(retained.binding, binding)
          ? { kind: "retained", action: retained }
          : { kind: "conflict" };
      }
      this.#requireRegistration(binding);
      this.#database.prepare(`
        INSERT INTO incident_actions (
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
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'reserved', NULL)
      `).run(
        binding.actionId,
        binding.actorId,
        binding.hostingInstance.processInstanceId,
        binding.incident.id.effectId.processInstanceId,
        binding.incident.id.effectId.elementId,
        binding.incident.id.effectId.activation,
        binding.interaction.kind,
        JSON.stringify(binding),
      );
      this.#recordOutbox(audit);
      return {
        kind: "reserved",
        action: { binding, state: "reserved", result: null },
      };
    });
  }

  async beginSubmission(
    actionIdValue: string,
    bindingValue: IncidentActionBinding,
  ): Promise<IncidentActionSubmissionResult> {
    const actionId = requireNonemptyString(actionIdValue, "actionId");
    const binding = snapshotActionBinding(bindingValue);
    if (binding.actionId !== actionId) return { kind: "conflict" };
    return this.#transaction(() => {
      const row = this.#actionRow(actionId);
      if (row === undefined) return { kind: "conflict" };
      const action = decodeActionRow(row);
      if (!sameJson(action.binding, binding)) return { kind: "conflict" };
      switch (action.state) {
        case "reserved":
        case "indeterminate": {
          const changes = this.#database.prepare(`
            UPDATE incident_actions SET state = 'submitting', result_json = NULL
            WHERE action_id = ? AND state = ?
          `).run(actionId, action.state).changes;
          if (changes !== 1) return { kind: "conflict" };
          return {
            kind: "acquired",
            action: { binding, state: "submitting", result: null },
          };
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
    if (result.actionId !== binding.actionId || !sameJson(result.interaction, binding.interaction)) {
      return { kind: "conflict" };
    }
    requireAuditMatches(audit, binding, result.state);
    return this.#transaction(() => {
      const row = this.#actionRow(binding.actionId);
      if (row === undefined) return { kind: "conflict" };
      const current = decodeActionRow(row);
      if (!sameJson(current.binding, binding)) return { kind: "conflict" };
      if (current.state === "committed" || current.state === "rejected") {
        return sameJson(current.result, result)
          ? { kind: "retained", action: current }
          : { kind: "conflict" };
      }
      if (current.state === "indeterminate" && result.state === "indeterminate") {
        this.#recordOutbox(audit);
        return { kind: "retained", action: current };
      }
      if (current.state !== "submitting") return { kind: "conflict" };
      this.#database.prepare(`
        UPDATE incident_actions SET state = ?, result_json = ? WHERE action_id = ?
      `).run(result.state, JSON.stringify(result), binding.actionId);
      this.#recordOutbox(audit);
      return {
        kind: "recorded",
        action: { binding, state: result.state, result },
      };
    });
  }

  async listReconciliableActions(): Promise<ReadonlyArray<StoredIncidentAction>> {
    return this.#database.prepare(`
      SELECT binding_json, state, result_json FROM incident_actions
      WHERE state IN ('submitting','indeterminate')
      ORDER BY action_id COLLATE BINARY ASC
    `).all().map(decodeActionRow);
  }

  async listUndeliveredAuditEvents(): Promise<ReadonlyArray<IncidentAuditOutboxItem>> {
    return this.#database.prepare(`
      SELECT ordinal, event_json FROM incident_action_audit_outbox
      WHERE delivered = 0 ORDER BY ordinal ASC
    `).all().map((row) => ({
      ordinal: requirePositiveSafeInteger(row.ordinal, "outbox ordinal"),
      event: decodeAuditRow(row.event_json),
    }));
  }

  async acknowledgeAuditEvent(eventId: string): Promise<void> {
    const changes = this.#database.prepare(`
      UPDATE incident_action_audit_outbox SET delivered = 1 WHERE event_id = ?
    `).run(requireNonemptyString(eventId, "eventId")).changes;
    if (changes > 1) {
      throw new OperateIncidentIntegrityError("audit acknowledgement changed multiple rows");
    }
  }

  close(): void {
    if (this.#database.isOpen) this.#database.close();
  }

  #requireRegistration(binding: IncidentActionBinding): void {
    const row = this.#database.prepare(`
      SELECT public_identity_json, process_locator FROM process_instances
      WHERE process_instance_id = ?
    `).get(binding.hostingInstance.processInstanceId);
    if (row === undefined) {
      throw new OperateIncidentIntegrityError("incident action has no hosting registration");
    }
    try {
      const instance = decodeStoredProcessInstanceIdentity(
        requireNonemptyString(row.public_identity_json, "public_identity_json"),
      );
      const locator = requireNonemptyString(row.process_locator, "process_locator");
      if (!sameJson(instance, binding.hostingInstance) || locator !== binding.locator) {
        throw new OperateIncidentIntegrityError("incident action hosting registration changed");
      }
    } catch (error: unknown) {
      if (error instanceof OperateIncidentIntegrityError) throw error;
      throw new OperateIncidentStoredValueError(error);
    }
  }

  #actionRow(actionId: string): Record<string, SQLOutputValue> | undefined {
    return this.#database.prepare(`
      SELECT binding_json, state, result_json FROM incident_actions
      WHERE action_id = ?
    `).get(actionId);
  }

  #recordOutbox(event: IncidentAuditEvent): void {
    const encoded = JSON.stringify(event);
    const sameId = this.#database.prepare(`
      SELECT event_json FROM incident_action_audit_outbox WHERE event_id = ?
    `).get(event.eventId);
    if (sameId !== undefined) {
      if (requireNonemptyString(sameId.event_json, "event_json") !== encoded) {
        throw new OperateIncidentIntegrityError(`incident audit event ${event.eventId} conflicts`);
      }
      return;
    }
    const logical = this.#database.prepare(`
      SELECT event_json FROM incident_action_audit_outbox
      WHERE action_id = ? AND action_outcome = ?
    `).get(event.actionId, event.outcome);
    if (logical !== undefined) {
      const retained = decodeAuditRow(logical.event_json);
      if (!sameLogicalAudit(retained, event)) {
        throw new OperateIncidentIntegrityError(
          `incident audit outcome ${event.actionId}/${event.outcome} conflicts`,
        );
      }
      return;
    }
    this.#database.prepare(`
      INSERT INTO incident_action_audit_outbox (
        event_id, action_id, action_outcome, event_json, delivered
      ) VALUES (?, ?, ?, ?, 0)
    `).run(event.eventId, event.actionId, event.outcome, encoded);
  }

  #transaction<T>(run: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.#database.exec("COMMIT");
      return result;
    } catch (error: unknown) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}

function decodeActionRow(row: Record<string, SQLOutputValue>): StoredIncidentAction {
  try {
    return decodeStoredAction(row.binding_json, row.state, row.result_json);
  } catch (error: unknown) {
    throw new OperateIncidentStoredValueError(error);
  }
}

function decodeAuditRow(value: unknown): IncidentAuditEvent {
  try {
    return snapshotAuditEvent(JSON.parse(requireNonemptyString(value, "event_json")));
  } catch (error: unknown) {
    throw new OperateIncidentStoredValueError(error);
  }
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

function sameLogicalAudit(left: IncidentAuditEvent, right: IncidentAuditEvent): boolean {
  const { eventId: _leftEvent, recordedAt: _leftTime, ...leftLogical } = left;
  const { eventId: _rightEvent, recordedAt: _rightTime, ...rightLogical } = right;
  return sameJson(leftLogical, rightLogical);
}
