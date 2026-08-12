import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";

import {
  WorkRepositoryIntegrityError,
  WorkSchemaResetRequiredError,
} from "./work-contracts.js";
import type {
  ConfirmedProcessWorkPublication,
  WorkAuditOutboxItem,
  WorkClaimSnapshot,
  WorkClaimTransitionInput,
  WorkClaimTransitionResult,
  StoredWorkCompletionAction,
  WorkCompletionBinding,
  WorkCompletionOutcomeInput,
  WorkCompletionOutcomeResult,
  WorkCompletionReservationInput,
  WorkCompletionReservationResult,
  WorkCompletionSubmissionResult,
  WorkProcessObservation,
  WorkProcessRegistration,
  WorkReleaseTransitionInput,
  WorkReleaseTransitionResult,
  WorkTaskReference,
} from "./work-contracts.js";
import {
  decodeStoredPublicInstance,
  completionResult,
  decodeStoredCompletionAction,
  requireAuditMatches,
  requireNonnegativeSafeInteger,
  requireObservation,
  requirePositiveSafeInteger,
  requireString,
  sameJson,
  snapshotAuditEvent,
  snapshotCompletionBinding,
  snapshotPublication,
  snapshotTaskReference,
} from "./work-repository-values.js";

const schemaEpoch = 2;
const defaultBusyTimeoutMs = 5_000;

/** Owns the M3 platform state and audit outbox, never semantic task truth. */
export class SqliteWorkRepository {
  readonly #database: DatabaseSync;

  constructor(databaseFile: string, busyTimeoutMs = defaultBusyTimeoutMs) {
    requirePositiveSafeInteger(busyTimeoutMs, "busyTimeoutMs");
    this.#database = new DatabaseSync(databaseFile);
    this.#database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    try {
      initializeSchema(this.#database);
    } catch (error: unknown) {
      this.#database.close();
      throw error;
    }
  }

  get isOpen(): boolean {
    return this.#database.isOpen;
  }

  async recordConfirmedProcessInstance(publication: ConfirmedProcessWorkPublication): Promise<void> {
    const exact = snapshotPublication(publication);
    this.#transaction(() => {
      const existing = this.#database.prepare(`
        SELECT public_instance_json, work_locator FROM work_processes
        WHERE process_instance_id = ?
      `).get(exact.instance.processInstanceId);
      if (existing !== undefined) {
        const decoded = decodeRegistrationRow(exact.instance.processInstanceId, existing);
        if (!sameJson(decoded.instance, exact.instance) || decoded.locator !== exact.locator) {
          throw new WorkRepositoryIntegrityError(`confirmed Work registration ${exact.instance.processInstanceId} conflicts`);
        }
        return;
      }
      this.#database.prepare(`
        INSERT INTO work_processes (
          process_instance_id, public_instance_json, work_locator, observation
        ) VALUES (?, ?, ?, 'indeterminate')
      `).run(exact.instance.processInstanceId, JSON.stringify(exact.instance), exact.locator);
    });
  }

  listProcessRegistrations(): ReadonlyArray<WorkProcessRegistration> {
    return this.#database.prepare(`
      SELECT process_instance_id, public_instance_json, work_locator, observation
      FROM work_processes ORDER BY process_instance_id COLLATE BINARY ASC
    `).all().map((row) => decodeRegistrationRow(
      requireString(row.process_instance_id, "process_instance_id"),
      row,
    ));
  }

  recordObservation(processInstanceId: string, observation: WorkProcessObservation): void {
    const exactId = requireString(processInstanceId, "processInstanceId");
    const exactObservation = requireObservation(observation);
    const changed = this.#database.prepare(`
      UPDATE work_processes SET observation = ? WHERE process_instance_id = ?
    `).run(exactObservation, exactId).changes;
    if (changed !== 1) throw new WorkRepositoryIntegrityError(`unknown Work registration ${exactId}`);
  }

  getClaim(task: WorkTaskReference): WorkClaimSnapshot {
    const exact = snapshotTaskReference(task);
    const row = this.#claimRow(exact);
    if (row === undefined) return { claimGeneration: 0, claim: null };
    return decodeClaimRow(row);
  }

  claimTask(input: WorkClaimTransitionInput): WorkClaimTransitionResult {
    const task = snapshotTaskReference(input.task);
    validateClaimInput(input, task);
    return this.#transaction(() => {
      const retained = this.#readAction(input.actionId);
      if (retained !== undefined) {
        if (!sameAction(retained, "claim", input.actorId, task, input.expectedGeneration)) {
          this.#outbox(input.audit.conflict);
          return { kind: "conflict" };
        }
        const claim = this.getClaim(task);
        if (claim.claim?.actorId !== input.actorId) return { kind: "conflict" };
        this.#outbox(input.audit.idempotent);
        return { kind: "idempotent", result: { taskId: task.taskId, claim: claim.claim } };
      }
      const current = this.getClaim(task);
      if (current.claim !== null || current.claimGeneration !== input.expectedGeneration) {
        this.#outbox(input.audit.conflict);
        return { kind: "conflict" };
      }
      const generation = current.claimGeneration + 1;
      this.#upsertClaim(task, generation, input.actorId);
      this.#insertAction(input.actionId, "claim", input.actorId, task, input.expectedGeneration);
      this.#outbox(input.audit.claimed);
      return {
        kind: "claimed",
        result: { taskId: task.taskId, claim: { actorId: input.actorId, generation } },
      };
    });
  }

  releaseTask(input: WorkReleaseTransitionInput): WorkReleaseTransitionResult {
    const task = snapshotTaskReference(input.task);
    validateReleaseInput(input, task);
    return this.#transaction(() => {
      const retained = this.#readAction(input.actionId);
      if (retained !== undefined) {
        if (!sameAction(retained, "release", input.actorId, task, input.generation)) {
          this.#outbox(input.audit.conflict);
          return { kind: "conflict" };
        }
        const retainedResult = JSON.parse(requireString(retained.result_json, "action result_json"));
        this.#outbox(input.audit.idempotent);
        return { kind: "idempotent", result: retainedResult };
      }
      const current = this.getClaim(task);
      if (current.claim === null) return { kind: "notFound" };
      if (current.claim.actorId !== input.actorId || current.claim.generation !== input.generation) {
        this.#outbox(input.audit.conflict);
        return { kind: "conflict" };
      }
      const claimGeneration = current.claimGeneration + 1;
      const result = { taskId: task.taskId, claimGeneration, released: true as const };
      this.#upsertClaim(task, claimGeneration, null);
      this.#insertAction(input.actionId, "release", input.actorId, task, input.generation, result);
      this.#outbox(input.audit.released);
      return { kind: "released", result };
    });
  }

  getCompletionAction(actionId: string): StoredWorkCompletionAction | null {
    const row = this.#readCompletionAction(requireString(actionId, "actionId"));
    return row === undefined ? null : decodeCompletionRow(row);
  }

  reserveCompletion(input: WorkCompletionReservationInput): WorkCompletionReservationResult {
    const binding = snapshotCompletionBinding(input.binding);
    requireCompletionAudit(input.audit, binding, "reserved");
    return this.#transaction(() => {
      const retained = this.#readCompletionAction(binding.actionId);
      if (retained !== undefined) {
        const action = decodeCompletionRow(retained);
        return sameJson(action.binding, binding)
          ? { kind: "retained", action }
          : { kind: "conflict" };
      }
      const claim = this.getClaim(binding.task);
      if (
        claim.claim?.actorId !== binding.actorId ||
        claim.claim.generation !== binding.claimGeneration
      ) {
        return { kind: "notFound" };
      }
      try {
        this.#database.prepare(`
          INSERT INTO work_completions (
            action_id, actor_id, hosting_process_instance_id,
            task_process_instance_id, element_id, activation,
            claim_generation, binding_json, state, result_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved', NULL)
        `).run(
          binding.actionId,
          binding.actorId,
          ...taskKey(binding.task),
          binding.claimGeneration,
          JSON.stringify(binding),
        );
      } catch (error: unknown) {
        if (isUniqueConstraint(error)) return { kind: "conflict" };
        throw error;
      }
      this.#outbox(input.audit);
      return {
        kind: "reserved",
        action: { binding, state: "reserved", result: null },
      };
    });
  }

  beginCompletionSubmission(
    actionId: string,
    expectedBinding: WorkCompletionBinding,
  ): WorkCompletionSubmissionResult {
    const binding = snapshotCompletionBinding(expectedBinding);
    if (binding.actionId !== actionId) return { kind: "conflict" };
    return this.#transaction(() => {
      const row = this.#readCompletionAction(actionId);
      if (row === undefined) return { kind: "conflict" };
      const action = decodeCompletionRow(row);
      if (!sameJson(action.binding, binding)) return { kind: "conflict" };
      switch (action.state) {
        case "reserved":
        case "indeterminate":
          this.#database.prepare(`
            UPDATE work_completions SET state = 'submitting'
            WHERE action_id = ? AND state = ?
          `).run(actionId, action.state);
          return { kind: "acquired", action: { ...action, state: "submitting" } };
        case "submitting":
        case "committed":
        case "rejected":
          return { kind: "retained", action };
      }
    });
  }

  recordCompletionOutcome(
    input: WorkCompletionOutcomeInput,
  ): WorkCompletionOutcomeResult {
    const binding = snapshotCompletionBinding(input.binding);
    const result = completionResult(binding, input.outcome);
    requireCompletionAudit(input.audit, binding, result.state);
    return this.#transaction(() => {
      const row = this.#readCompletionAction(binding.actionId);
      if (row === undefined) return { kind: "conflict" };
      const current = decodeCompletionRow(row);
      if (!sameJson(current.binding, binding)) return { kind: "conflict" };
      if (current.state === "committed" || current.state === "rejected") {
        return sameJson(current.result, result)
          ? { kind: "retained", action: current }
          : { kind: "conflict" };
      }
      if (current.state === "indeterminate" && result.state === "indeterminate") {
        this.#outbox(input.audit);
        return { kind: "retained", action: current };
      }
      if (current.state !== "submitting") return { kind: "conflict" };
      const state = result.state;
      this.#database.prepare(`
        UPDATE work_completions SET state = ?, result_json = ? WHERE action_id = ?
      `).run(state, JSON.stringify(result), binding.actionId);
      if (state === "committed" ||
          (state === "rejected" && result.engineResult.kind === "processClosed")) {
        const claim = this.getClaim(binding.task);
        if (claim.claim !== null) {
          this.#upsertClaim(binding.task, claim.claimGeneration + 1, null);
        }
      }
      if (state === "rejected" && result.engineResult.kind === "processClosed") {
        this.recordObservation(binding.task.hostingProcessInstanceId, "closed");
      }
      this.#outbox(input.audit);
      return {
        kind: "recorded",
        action: { binding, state, result },
      };
    });
  }

  listUndeliveredAuditEvents(): ReadonlyArray<WorkAuditOutboxItem> {
    return this.#database.prepare(`
      SELECT ordinal, event_json FROM work_audit_outbox
      WHERE delivered = 0 ORDER BY ordinal ASC
    `).all().map((row) => ({
      ordinal: requirePositiveSafeInteger(row.ordinal, "outbox ordinal"),
      event: snapshotAuditEvent(JSON.parse(requireString(row.event_json, "event_json"))),
    }));
  }

  acknowledgeAuditEvent(eventId: string): void {
    const changed = this.#database.prepare(`
      UPDATE work_audit_outbox SET delivered = 1 WHERE event_id = ?
    `).run(requireString(eventId, "eventId")).changes;
    if (changed > 1) throw new WorkRepositoryIntegrityError("audit acknowledgement changed multiple rows");
  }

  close(): void {
    if (this.#database.isOpen) this.#database.close();
  }

  #transaction<T>(run: () => T): T {
    const nested = this.#database.isTransaction;
    if (!nested) this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      if (!nested) this.#database.exec("COMMIT");
      return result;
    } catch (error: unknown) {
      if (!nested && this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #claimRow(task: WorkTaskReference): Record<string, SQLOutputValue> | undefined {
    return this.#database.prepare(`
      SELECT claim_generation, actor_id FROM work_claims
      WHERE hosting_process_instance_id = ? AND task_process_instance_id = ?
        AND element_id = ? AND activation = ?
    `).get(...taskKey(task));
  }

  #upsertClaim(task: WorkTaskReference, generation: number, actorId: string | null): void {
    this.#database.prepare(`
      INSERT INTO work_claims (
        hosting_process_instance_id, task_process_instance_id, element_id,
        activation, claim_generation, actor_id
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (hosting_process_instance_id, task_process_instance_id, element_id, activation)
      DO UPDATE SET claim_generation = excluded.claim_generation, actor_id = excluded.actor_id
    `).run(...taskKey(task), generation, actorId);
  }

  #readAction(actionId: string): Record<string, SQLOutputValue> | undefined {
    return this.#database.prepare(`SELECT * FROM work_actions WHERE action_id = ?`).get(actionId);
  }

  #readCompletionAction(actionId: string): Record<string, SQLOutputValue> | undefined {
    return this.#database.prepare(`
      SELECT binding_json, state, result_json FROM work_completions WHERE action_id = ?
    `).get(actionId);
  }

  #insertAction(actionId: string, kind: string, actorId: string, task: WorkTaskReference, generation: number, result: unknown = null): void {
    this.#database.prepare(`
      INSERT INTO work_actions (
        action_id, action_kind, actor_id, hosting_process_instance_id,
        task_process_instance_id, element_id, activation, input_generation, result_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(actionId, kind, actorId, ...taskKey(task), generation, result === null ? null : JSON.stringify(result));
  }

  #outbox(event: WorkAuditEvent): void {
    const exact = snapshotAuditEvent(event);
    const encoded = JSON.stringify(exact);
    const existing = this.#database.prepare(`
      SELECT event_json FROM work_audit_outbox WHERE event_id = ?
    `).get(exact.eventId);
    if (existing !== undefined) {
      if (requireString(existing.event_json, "stored event_json") !== encoded) {
        throw new WorkRepositoryIntegrityError(`audit event ${exact.eventId} conflicts`);
      }
      return;
    }
    this.#database.prepare(`
      INSERT INTO work_audit_outbox (event_id, event_json, delivered)
      VALUES (?, ?, 0)
    `).run(exact.eventId, encoded);
  }
}

function initializeSchema(database: DatabaseSync): void {
  const version = database.prepare("PRAGMA user_version").get()?.user_version;
  const tables = database.prepare(`
    SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all();
  if (version === 0 && tables.length === 0) {
    database.exec(`
      CREATE TABLE work_processes (
        process_instance_id TEXT PRIMARY KEY NOT NULL,
        public_instance_json TEXT NOT NULL,
        work_locator TEXT NOT NULL,
        observation TEXT NOT NULL CHECK (observation IN ('active','closed','indeterminate'))
      ) STRICT;
      CREATE TABLE work_claims (
        hosting_process_instance_id TEXT NOT NULL,
        task_process_instance_id TEXT NOT NULL,
        element_id TEXT NOT NULL,
        activation INTEGER NOT NULL CHECK (activation > 0),
        claim_generation INTEGER NOT NULL CHECK (claim_generation >= 0),
        actor_id TEXT,
        PRIMARY KEY (hosting_process_instance_id, task_process_instance_id, element_id, activation)
      ) STRICT;
      CREATE TABLE work_actions (
        action_id TEXT PRIMARY KEY NOT NULL,
        action_kind TEXT NOT NULL CHECK (action_kind IN ('claim','release')),
        actor_id TEXT NOT NULL,
        hosting_process_instance_id TEXT NOT NULL,
        task_process_instance_id TEXT NOT NULL,
        element_id TEXT NOT NULL,
        activation INTEGER NOT NULL CHECK (activation > 0),
        input_generation INTEGER NOT NULL CHECK (input_generation >= 0),
        result_json TEXT
      ) STRICT;
      CREATE TABLE work_completions (
        action_id TEXT PRIMARY KEY NOT NULL,
        actor_id TEXT NOT NULL,
        hosting_process_instance_id TEXT NOT NULL,
        task_process_instance_id TEXT NOT NULL,
        element_id TEXT NOT NULL,
        activation INTEGER NOT NULL CHECK (activation > 0),
        claim_generation INTEGER NOT NULL CHECK (claim_generation > 0),
        binding_json TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('reserved','submitting','committed','rejected','indeterminate')),
        result_json TEXT
      ) STRICT;
      CREATE UNIQUE INDEX work_completion_active_slot ON work_completions (
        hosting_process_instance_id, task_process_instance_id, element_id,
        activation, claim_generation
      ) WHERE state IN ('reserved','submitting','indeterminate');
      CREATE TABLE work_audit_outbox (
        ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_json TEXT NOT NULL,
        delivered INTEGER NOT NULL CHECK (delivered IN (0,1))
      ) STRICT;
      PRAGMA user_version = ${schemaEpoch};
    `);
    return;
  }
  const names = tables.map((row) => row.name).sort();
  const expected = ["work_actions", "work_audit_outbox", "work_claims", "work_completions", "work_processes"];
  if (version !== schemaEpoch || !sameJson(names, expected)) throw new WorkSchemaResetRequiredError();
}

function decodeCompletionRow(row: Record<string, SQLOutputValue>): StoredWorkCompletionAction {
  return decodeStoredCompletionAction(
    row.binding_json,
    row.state,
    row.result_json,
  );
}

function decodeRegistrationRow(processInstanceId: string, row: Record<string, SQLOutputValue>): WorkProcessRegistration {
  const instance = decodeStoredPublicInstance(row.public_instance_json);
  if (instance.processInstanceId !== processInstanceId) throw new WorkRepositoryIntegrityError("stored Process identity disagrees with key");
  return {
    instance,
    locator: requireString(row.work_locator, "work_locator"),
    observation: requireObservation(row.observation),
  };
}

function decodeClaimRow(row: Record<string, SQLOutputValue>): WorkClaimSnapshot {
  const generation = requireNonnegativeSafeInteger(row.claim_generation, "claim_generation");
  const actorId = row.actor_id;
  return {
    claimGeneration: generation,
    claim: actorId === null ? null : { actorId: requireString(actorId, "actor_id"), generation },
  };
}

function taskKey(task: WorkTaskReference): [string, string, string, number] {
  return [task.hostingProcessInstanceId, task.taskId.processInstanceId, task.taskId.elementId, task.taskId.activation];
}

function sameAction(row: Record<string, SQLOutputValue>, kind: string, actorId: string, task: WorkTaskReference, generation: number): boolean {
  return row.action_kind === kind && row.actor_id === actorId &&
    row.hosting_process_instance_id === task.hostingProcessInstanceId &&
    row.task_process_instance_id === task.taskId.processInstanceId &&
    row.element_id === task.taskId.elementId && row.activation === task.taskId.activation &&
    row.input_generation === generation;
}

function validateClaimInput(input: WorkClaimTransitionInput, task: WorkTaskReference): void {
  requireString(input.actionId, "actionId");
  requireString(input.actorId, "actorId");
  requireNonnegativeSafeInteger(input.expectedGeneration, "expectedGeneration");
  requireAuditMatches(input.audit.claimed, { actorId: input.actorId, task, actionId: input.actionId, kind: "claim", outcome: "claimed" });
  requireAuditMatches(input.audit.idempotent, { actorId: input.actorId, task, actionId: input.actionId, kind: "claim", outcome: "idempotent" });
  requireAuditMatches(input.audit.conflict, { actorId: input.actorId, task, actionId: input.actionId, kind: "claim", outcome: "conflict" });
}

function validateReleaseInput(input: WorkReleaseTransitionInput, task: WorkTaskReference): void {
  requireString(input.actionId, "actionId");
  requireString(input.actorId, "actorId");
  requirePositiveSafeInteger(input.generation, "generation");
  requireAuditMatches(input.audit.released, { actorId: input.actorId, task, actionId: input.actionId, kind: "release", outcome: "released" });
  requireAuditMatches(input.audit.idempotent, { actorId: input.actorId, task, actionId: input.actionId, kind: "release", outcome: "idempotent" });
  requireAuditMatches(input.audit.conflict, { actorId: input.actorId, task, actionId: input.actionId, kind: "release", outcome: "conflict" });
}

function requireCompletionAudit(
  event: WorkAuditEvent,
  binding: WorkCompletionBinding,
  outcome: "reserved" | "committed" | "rejected" | "indeterminate",
): void {
  requireAuditMatches(event, {
    actorId: binding.actorId,
    task: binding.task,
    actionId: binding.actionId,
    kind: "completion",
    outcome,
  });
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/u.test(error.message);
}
