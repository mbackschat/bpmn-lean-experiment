import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import type {
  DefinitionMetadata,
  DefinitionReference,
} from "./contracts.js";
import {
  decodeDefinitionStartCapabilities,
  encodeDefinitionStartCapabilities,
} from "./definition-capabilities.js";
import {
  DefinitionScheduleIntegrityError,
  DefinitionScheduleState,
} from "./definition-schedule-contracts.js";
import {
  deriveScheduleDueAt,
  requireWholeSecondActivation,
} from "./definition-schedule-values.js";
import { requireDefinitionDatabaseSchemaEpoch } from "./database-schema-epoch.js";
import type {
  DefinitionScheduleCancellationOrigin,
  DefinitionScheduleRecord,
  DefinitionScheduleReference,
  DefinitionScheduleRepository,
  DefinitionScheduleReservation,
  DefinitionScheduleTransition,
  NewDefinitionScheduleRecord,
} from "./definition-schedule-contracts.js";

const defaultBusyTimeoutMs = 5_000;

/** Durable immutable schedule intents and compare-and-set lifecycle transitions. */
export class SqliteDefinitionScheduleRepository
implements DefinitionScheduleRepository {
  readonly #database: DatabaseSync;

  constructor(databaseFile: string, busyTimeoutMs: number = defaultBusyTimeoutMs) {
    requirePositiveSafeInteger(busyTimeoutMs, "busyTimeoutMs");
    this.#database = new DatabaseSync(databaseFile);
    this.#database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    try {
      requireDefinitionDatabaseSchemaEpoch(this.#database);
      initializeSchema(this.#database);
    } catch (error: unknown) {
      this.#database.close();
      throw error;
    }
  }

  get isOpen(): boolean {
    return this.#database.isOpen;
  }

  reserve(record: NewDefinitionScheduleRecord): DefinitionScheduleReservation {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.#get(record.reference);
      if (existing !== null) {
        this.#database.exec("COMMIT");
        return { inserted: false, record: existing };
      }
      this.#insert(record);
      const inserted = this.#require(record.reference);
      this.#database.exec("COMMIT");
      return { inserted: true, record: inserted };
    } catch (error: unknown) {
      if (this.#database.isTransaction) {
        this.#database.exec("ROLLBACK");
      }
      if (isSqliteConstraint(error)) {
        throw new DefinitionScheduleIntegrityError(
          "schedule private identity collides with another durable schedule",
        );
      }
      throw error;
    }
  }

  get(reference: DefinitionScheduleReference): DefinitionScheduleRecord | null {
    return this.#get(reference);
  }

  listForDefinition(reference: DefinitionReference): ReadonlyArray<DefinitionScheduleRecord> {
    return this.#database.prepare(`
      ${selectColumns}
      WHERE process_id = ? AND version = ?
      ORDER BY schedule_id COLLATE BINARY ASC
    `).all(reference.processId, reference.version).map(decodeRecord);
  }

  listForReconciliation(): ReadonlyArray<DefinitionScheduleRecord> {
    return this.#database.prepare(`
      ${selectColumns}
      WHERE state IN ('creating', 'creatingHost', 'scheduled', 'cancelling')
         OR cleanup_complete = 0
      ORDER BY process_id COLLATE BINARY ASC, version ASC,
        schedule_id COLLATE BINARY ASC
    `).all().map(decodeRecord);
  }

  compareAndSet(
    reference: DefinitionScheduleReference,
    expected: DefinitionScheduleRecord["state"],
    transition: DefinitionScheduleTransition,
  ): DefinitionScheduleRecord | null {
    const current = this.#get(reference);
    if (current === null || current.state !== expected) {
      return null;
    }
    const next = applyTransition(current, transition);
    requireLegalTransition(current, next);
    const result = this.#database.prepare(`
      UPDATE definition_schedules
      SET state = ?, cleanup_complete = ?, cancellation_origin = ?,
        execution_workflow_id = ?, first_run_id = ?
      WHERE process_id = ? AND version = ? AND schedule_id = ? AND state = ?
    `).run(
      next.state,
      next.cleanupComplete ? 1 : 0,
      next.cancellationOrigin,
      next.executionWorkflowId,
      next.firstRunId,
      reference.processId,
      reference.version,
      reference.scheduleId,
      expected,
    );
    return result.changes === 1 ? this.#require(reference) : null;
  }

  requestCancellation(
    reference: DefinitionScheduleReference,
  ): DefinitionScheduleRecord | null {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.#get(reference);
      if (current === null) {
        this.#database.exec("COMMIT");
        return null;
      }
      let transition: DefinitionScheduleTransition | null = null;
      switch (current.state) {
        case DefinitionScheduleState.Creating:
          transition = {
            state: DefinitionScheduleState.Cancelled,
            cleanupComplete: true,
          };
          break;
        case DefinitionScheduleState.CreatingHost:
        case DefinitionScheduleState.Scheduled:
          transition = {
            state: DefinitionScheduleState.Cancelling,
            cancellationOrigin: current.state,
          };
          break;
        case DefinitionScheduleState.Cancelling:
        case DefinitionScheduleState.Started:
        case DefinitionScheduleState.Missed:
        case DefinitionScheduleState.Cancelled:
          break;
        default:
          assertNever(current.state);
      }
      if (transition !== null) {
        const next = applyTransition(current, transition);
        requireLegalTransition(current, next);
        this.#database.prepare(`
          UPDATE definition_schedules
          SET state = ?, cleanup_complete = ?, cancellation_origin = ?
          WHERE process_id = ? AND version = ? AND schedule_id = ?
            AND state = ?
        `).run(
          next.state,
          next.cleanupComplete ? 1 : 0,
          next.cancellationOrigin,
          reference.processId,
          reference.version,
          reference.scheduleId,
          current.state,
        );
      }
      const result = this.#require(reference);
      this.#database.exec("COMMIT");
      return result;
    } catch (error: unknown) {
      if (this.#database.isTransaction) {
        this.#database.exec("ROLLBACK");
      }
      throw error;
    }
  }

  markCleanupComplete(
    reference: DefinitionScheduleReference,
    expected: DefinitionScheduleRecord["state"],
  ): DefinitionScheduleRecord | null {
    const current = this.#get(reference);
    if (current === null || current.state !== expected) {
      return null;
    }
    if (current.cleanupComplete) {
      return current;
    }
    return this.compareAndSet(reference, expected, {
      state: expected,
      cleanupComplete: true,
    });
  }

  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }

  #get(reference: DefinitionScheduleReference): DefinitionScheduleRecord | null {
    const row = this.#database.prepare(`
      ${selectColumns}
      WHERE process_id = ? AND version = ? AND schedule_id = ?
    `).get(reference.processId, reference.version, reference.scheduleId);
    return row === undefined ? null : decodeRecord(row);
  }

  #require(reference: DefinitionScheduleReference): DefinitionScheduleRecord {
    const record = this.#get(reference);
    if (record === null) {
      throw new DefinitionScheduleIntegrityError(
        "schedule row disappeared inside its database transaction",
      );
    }
    return record;
  }

  #insert(record: NewDefinitionScheduleRecord): void {
    this.#database.prepare(`
      INSERT INTO definition_schedules (
        process_id, version, schedule_id, source_kind, source_id, source_sha256,
        source_byte_length, source_declared_encoding, source_decoded_as,
        semantic_profile, start_capabilities_json, timer_start_event_id,
        timer_duration_ms, activation_at, due_at, process_instance_id,
        host_schedule_id, configured_workflow_id_base, state, cleanup_complete,
        cancellation_origin, execution_workflow_id, first_run_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL)
    `).run(
      record.reference.processId,
      record.reference.version,
      record.reference.scheduleId,
      record.definition.source.kind,
      record.definition.source.id,
      record.definition.source.sha256,
      record.definition.source.byteLength,
      record.definition.source.declaredEncoding,
      record.definition.source.decodedAs,
      record.definition.semanticProfile,
      encodeDefinitionStartCapabilities(record.definition.startCapabilities),
      record.timerStart.startEventId,
      record.timerStart.durationMs,
      record.activationAt,
      record.dueAt,
      record.identity.processInstanceId,
      record.identity.hostScheduleId,
      record.identity.configuredWorkflowIdBase,
      DefinitionScheduleState.Creating,
    );
  }
}

const selectColumns = `SELECT
  process_id, version, schedule_id, source_kind, source_id, source_sha256,
  source_byte_length, source_declared_encoding, source_decoded_as,
  semantic_profile, start_capabilities_json, timer_start_event_id,
  timer_duration_ms, activation_at, due_at, process_instance_id,
  host_schedule_id, configured_workflow_id_base, state, cleanup_complete,
  cancellation_origin, execution_workflow_id, first_run_id
FROM definition_schedules`;

function initializeSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS definition_schedules (
      process_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      schedule_id TEXT NOT NULL,
      source_kind TEXT NOT NULL CHECK (source_kind = 'bpmnSource'),
      source_id TEXT NOT NULL,
      source_sha256 TEXT NOT NULL CHECK (
        length(source_sha256) = 64
        AND source_sha256 NOT GLOB '*[^0-9a-f]*'
      ),
      source_byte_length INTEGER NOT NULL CHECK (source_byte_length >= 0),
      source_declared_encoding TEXT,
      source_decoded_as TEXT CHECK (
        source_decoded_as IS NULL OR source_decoded_as = 'UTF-8'
      ),
      semantic_profile TEXT NOT NULL,
      start_capabilities_json TEXT NOT NULL,
      timer_start_event_id TEXT NOT NULL,
      timer_duration_ms INTEGER NOT NULL CHECK (timer_duration_ms > 0),
      activation_at TEXT NOT NULL,
      due_at TEXT NOT NULL,
      process_instance_id TEXT NOT NULL UNIQUE,
      host_schedule_id TEXT NOT NULL UNIQUE,
      configured_workflow_id_base TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK (state IN (
        'creating', 'creatingHost', 'scheduled', 'cancelling',
        'started', 'missed', 'cancelled'
      )),
      cleanup_complete INTEGER NOT NULL CHECK (cleanup_complete IN (0, 1)),
      cancellation_origin TEXT CHECK (
        cancellation_origin IS NULL
        OR cancellation_origin IN ('creatingHost', 'scheduled')
      ),
      execution_workflow_id TEXT,
      first_run_id TEXT,
      PRIMARY KEY (process_id, version, schedule_id),
      CHECK (
        (state = 'cancelling' AND cancellation_origin IS NOT NULL)
        OR (state <> 'cancelling' AND cancellation_origin IS NULL)
      ),
      CHECK (
        (state = 'started' AND execution_workflow_id IS NOT NULL AND first_run_id IS NOT NULL)
        OR (state <> 'started' AND execution_workflow_id IS NULL AND first_run_id IS NULL)
      ),
      CHECK (
        state IN ('started', 'missed', 'cancelled') OR cleanup_complete = 0
      )
    ) STRICT
  `);
}

function decodeRecord(row: Record<string, SQLOutputValue>): DefinitionScheduleRecord {
  const sourceKind = requireString(row, "source_kind");
  const decodedAs = requireNullableString(row, "source_decoded_as");
  if (sourceKind !== "bpmnSource" || (decodedAs !== null && decodedAs !== "UTF-8")) {
    throw new TypeError("SQLite schedule row has invalid source identity");
  }
  const state = decodeState(requireString(row, "state"));
  const cancellationOrigin = decodeCancellationOrigin(
    requireNullableString(row, "cancellation_origin"),
  );
  const executionWorkflowId = requireNullableString(row, "execution_workflow_id");
  const firstRunId = requireNullableString(row, "first_run_id");
  requireStateFields(state, cancellationOrigin, executionWorkflowId, firstRunId);
  const definition = decodeDefinition(row, sourceKind, decodedAs);
  const timerStart = {
    startEventId: requireNonemptyString(row, "timer_start_event_id"),
    durationMs: requirePositiveSafeInteger(row, "timer_duration_ms"),
  };
  if (
    definition.startCapabilities.timerStarts.length !== 1 ||
    definition.startCapabilities.timerStarts[0]?.startEventId !==
      timerStart.startEventId ||
    definition.startCapabilities.timerStarts[0]?.durationMs !== timerStart.durationMs
  ) {
    throw new TypeError("SQLite schedule row has divergent Timer Start capability");
  }
  const activationAt = requireWholeSecondActivation(
    requireNonemptyString(row, "activation_at"),
  );
  const dueAt = requireWholeSecondActivation(requireNonemptyString(row, "due_at"));
  if (deriveScheduleDueAt(activationAt, timerStart.durationMs) !== dueAt) {
    throw new TypeError("SQLite schedule row has invalid derived due instant");
  }
  const cleanupComplete = requireBoolean(row, "cleanup_complete");
  if (!isTerminal(state) && cleanupComplete) {
    throw new TypeError("SQLite schedule row cleaned a nonterminal Schedule");
  }
  return {
    reference: {
      processId: requireNonemptyString(row, "process_id"),
      version: requirePositiveSafeInteger(row, "version"),
      scheduleId: requireNonemptyString(row, "schedule_id"),
    },
    definition,
    timerStart,
    activationAt,
    dueAt,
    identity: {
      processInstanceId: requireNonemptyString(row, "process_instance_id"),
      hostScheduleId: requireNonemptyString(row, "host_schedule_id"),
      configuredWorkflowIdBase: requireNonemptyString(
        row,
        "configured_workflow_id_base",
      ),
    },
    state,
    cleanupComplete,
    cancellationOrigin,
    executionWorkflowId,
    firstRunId,
  };
}

function decodeDefinition(
  row: Record<string, SQLOutputValue>,
  sourceKind: "bpmnSource",
  decodedAs: "UTF-8" | null,
): DefinitionMetadata {
  return {
    processId: requireNonemptyString(row, "process_id"),
    version: requirePositiveSafeInteger(row, "version"),
    source: {
      kind: sourceKind,
      id: requireNonemptyString(row, "source_id"),
      sha256: requireString(row, "source_sha256"),
      byteLength: requireNonnegativeSafeInteger(row, "source_byte_length"),
      declaredEncoding: requireNullableString(row, "source_declared_encoding"),
      decodedAs,
    },
    semanticProfile: requireNonemptyString(row, "semantic_profile"),
    startCapabilities: decodeDefinitionStartCapabilities(
      requireString(row, "start_capabilities_json"),
    ),
  };
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
      ? (transition.state === DefinitionScheduleState.Cancelling
          ? current.cancellationOrigin
          : null)
      : transition.cancellationOrigin,
    executionWorkflowId: transition.executionWorkflowId === undefined
      ? current.executionWorkflowId
      : transition.executionWorkflowId,
    firstRunId: transition.firstRunId === undefined
      ? current.firstRunId
      : transition.firstRunId,
  };
}

function requireLegalTransition(
  current: DefinitionScheduleRecord,
  next: DefinitionScheduleRecord,
): void {
  const legal = current.state === next.state
    ? isTerminal(current.state) && !current.cleanupComplete && next.cleanupComplete
    : legalNextStates(current.state).includes(next.state);
  if (!legal) {
    throw new DefinitionScheduleIntegrityError(
      `illegal schedule transition ${current.state} -> ${next.state}`,
    );
  }
  requireStateFields(
    next.state,
    next.cancellationOrigin,
    next.executionWorkflowId,
    next.firstRunId,
  );
}

function legalNextStates(state: DefinitionScheduleRecord["state"]): readonly DefinitionScheduleRecord["state"][] {
  switch (state) {
    case DefinitionScheduleState.Creating:
      return [DefinitionScheduleState.CreatingHost, DefinitionScheduleState.Cancelled];
    case DefinitionScheduleState.CreatingHost:
      return [
        DefinitionScheduleState.Scheduled,
        DefinitionScheduleState.Cancelling,
        DefinitionScheduleState.Started,
        DefinitionScheduleState.Missed,
      ];
    case DefinitionScheduleState.Scheduled:
      return [
        DefinitionScheduleState.Cancelling,
        DefinitionScheduleState.Started,
        DefinitionScheduleState.Missed,
      ];
    case DefinitionScheduleState.Cancelling:
      return [
        DefinitionScheduleState.Cancelled,
        DefinitionScheduleState.Started,
        DefinitionScheduleState.Missed,
      ];
    case DefinitionScheduleState.Started:
    case DefinitionScheduleState.Missed:
    case DefinitionScheduleState.Cancelled:
      return [];
    default:
      return assertNever(state);
  }
}

function requireStateFields(
  state: DefinitionScheduleRecord["state"],
  origin: DefinitionScheduleCancellationOrigin | null,
  workflowId: string | null,
  runId: string | null,
): void {
  if ((state === DefinitionScheduleState.Cancelling) !== (origin !== null)) {
    throw new TypeError("SQLite schedule row has invalid cancellation origin");
  }
  if (
    (state === DefinitionScheduleState.Started) !==
      (workflowId !== null && runId !== null)
  ) {
    throw new TypeError("SQLite schedule row has invalid execution identity");
  }
  if (
    (workflowId !== null && (workflowId.length === 0 || !workflowId.isWellFormed())) ||
    (runId !== null && (runId.length === 0 || !runId.isWellFormed()))
  ) {
    throw new TypeError("SQLite schedule row has malformed execution identity");
  }
}

function decodeState(value: string): DefinitionScheduleRecord["state"] {
  if (Object.values(DefinitionScheduleState).some((state) => state === value)) {
    return value as DefinitionScheduleRecord["state"];
  }
  throw new TypeError("SQLite schedule row has invalid state");
}

function decodeCancellationOrigin(
  value: string | null,
): DefinitionScheduleCancellationOrigin | null {
  if (
    value === null ||
    value === DefinitionScheduleState.CreatingHost ||
    value === DefinitionScheduleState.Scheduled
  ) {
    return value;
  }
  throw new TypeError("SQLite schedule row has invalid cancellation_origin");
}

function isTerminal(state: DefinitionScheduleRecord["state"]): boolean {
  return state === DefinitionScheduleState.Started ||
    state === DefinitionScheduleState.Missed ||
    state === DefinitionScheduleState.Cancelled;
}

function requireString(row: Record<string, SQLOutputValue>, field: string): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new TypeError(`SQLite schedule row has invalid ${field}`);
  }
  return value;
}

function requireNonemptyString(
  row: Record<string, SQLOutputValue>,
  field: string,
): string {
  const value = requireString(row, field);
  if (value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`SQLite schedule row has invalid ${field}`);
  }
  return value;
}

function requireNullableString(
  row: Record<string, SQLOutputValue>,
  field: string,
): string | null {
  const value = row[field];
  if (value !== null && typeof value !== "string") {
    throw new TypeError(`SQLite schedule row has invalid ${field}`);
  }
  return value;
}

function requirePositiveSafeInteger(
  rowOrValue: Record<string, SQLOutputValue> | number,
  field: string,
): number {
  const value = typeof rowOrValue === "number" ? rowOrValue : rowOrValue[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`SQLite schedule row has invalid ${field}`);
  }
  return value;
}

function requireNonnegativeSafeInteger(
  row: Record<string, SQLOutputValue>,
  field: string,
): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`SQLite schedule row has invalid ${field}`);
  }
  return value;
}

function requireBoolean(row: Record<string, SQLOutputValue>, field: string): boolean {
  const value = row[field];
  if (value !== 0 && value !== 1) {
    throw new TypeError(`SQLite schedule row has invalid ${field}`);
  }
  return value === 1;
}

function isSqliteConstraint(error: unknown): boolean {
  return error instanceof Error &&
    (
      ("code" in error && typeof error.code === "string" &&
        error.code.startsWith("SQLITE_CONSTRAINT")) ||
      error.message.startsWith("UNIQUE constraint failed:")
    );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition schedule state: ${String(value)}`);
}
