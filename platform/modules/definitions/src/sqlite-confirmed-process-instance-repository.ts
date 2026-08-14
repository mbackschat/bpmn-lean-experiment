import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import {
  ConfirmedProcessInstanceIntegrityError,
  ConfirmedProcessInstanceState,
  ConfirmedProcessInstanceStoredValueError,
} from "./confirmed-process-instance-contracts.js";
import type {
  ConfirmedProcessInstancePublication,
  ConfirmedProcessInstanceRecord,
  ConfirmedProcessInstanceRepository,
  ConfirmedProcessInstanceReservationResult,
  ConfirmedProcessInstanceSubscriber,
  DirectProcessInstanceReservation,
} from "./confirmed-process-instance-contracts.js";
import {
  decodeDirectIntent,
  decodePublicInstance,
  encodeDirectIntent,
  encodePublicInstance,
  requireAllowedTransition,
  requireState,
  sameIntent,
  samePublication,
  snapshotConfirmedPublication,
  snapshotDirectIntent,
} from "./confirmed-process-instance-values.js";
import {
  requireDefinitionDatabaseSchemaEpoch,
} from "./database-schema-epoch.js";

const defaultBusyTimeoutMs = 5_000;
const tableSql = `
  CREATE TABLE confirmed_process_instances (
    process_instance_id TEXT PRIMARY KEY NOT NULL,
    public_instance_json TEXT NOT NULL CHECK (length(public_instance_json) > 0),
    work_locator TEXT NOT NULL CHECK (length(work_locator) > 0),
    direct_intent_json TEXT,
    state TEXT NOT NULL CHECK (
      state IN ('reserved', 'starting', 'indeterminate', 'confirmed', 'integrityFailure')
    ),
    operate_pending INTEGER NOT NULL CHECK (operate_pending IN (0, 1)),
    work_pending INTEGER NOT NULL CHECK (work_pending IN (0, 1)),
    CHECK (
      (state = 'confirmed') OR (operate_pending = 0 AND work_pending = 0)
    )
  ) STRICT
`;

/** Exact durable owner for confirmation, direct-start recovery, and subscriber markers. */
export class SqliteConfirmedProcessInstanceRepository
  implements ConfirmedProcessInstanceRepository {
  readonly #database: DatabaseSync;

  constructor(
    databaseFile: string,
    busyTimeoutMs: number = defaultBusyTimeoutMs,
  ) {
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

  confirm(
    publication: ConfirmedProcessInstancePublication,
  ): ConfirmedProcessInstanceReservationResult {
    return this.#insert(publication, null, ConfirmedProcessInstanceState.Confirmed);
  }

  reserveDirect(
    reservation: DirectProcessInstanceReservation,
  ): ConfirmedProcessInstanceReservationResult {
    return this.#insert(
      reservation,
      encodeDirectIntent(snapshotDirectIntent(reservation.intent)),
      ConfirmedProcessInstanceState.Reserved,
    );
  }

  get(processInstanceId: string): ConfirmedProcessInstanceRecord | null {
    const row = this.#database.prepare(`
      SELECT * FROM confirmed_process_instances WHERE process_instance_id = ?
    `).get(processInstanceId);
    return row === undefined ? null : decodeRow(row);
  }

  listForReconciliation(): ReadonlyArray<ConfirmedProcessInstanceRecord> {
    return this.#database.prepare(`
      SELECT * FROM confirmed_process_instances
      WHERE state IN ('reserved', 'starting', 'indeterminate')
        OR (state = 'confirmed' AND (operate_pending = 1 OR work_pending = 1))
      ORDER BY process_instance_id COLLATE BINARY ASC
    `).all().map(decodeRow);
  }

  listConfirmed(): ReadonlyArray<ConfirmedProcessInstanceRecord> {
    return this.#database.prepare(`
      SELECT * FROM confirmed_process_instances
      WHERE state = 'confirmed'
      ORDER BY process_instance_id COLLATE BINARY ASC
    `).all().map(decodeRow);
  }

  compareAndSetState(
    processInstanceId: string,
    expected: ConfirmedProcessInstanceState,
    next: ConfirmedProcessInstanceState,
  ): ConfirmedProcessInstanceRecord | null {
    requireAllowedTransition(expected, next);
    const result = this.#database.prepare(`
      UPDATE confirmed_process_instances
      SET state = ?,
        operate_pending = CASE WHEN ? = 'confirmed' THEN 1 ELSE 0 END,
        work_pending = CASE WHEN ? = 'confirmed' THEN 1 ELSE 0 END
      WHERE process_instance_id = ? AND state = ?
    `).run(next, next, next, processInstanceId, expected);
    return result.changes === 1 ? this.get(processInstanceId) : null;
  }

  acknowledge(
    processInstanceId: string,
    subscriber: ConfirmedProcessInstanceSubscriber,
  ): ConfirmedProcessInstanceRecord | null {
    const column = subscriber === "operate" ? "operate_pending" : "work_pending";
    this.#database.prepare(`
      UPDATE confirmed_process_instances
      SET ${column} = 0
      WHERE process_instance_id = ? AND state = 'confirmed'
    `).run(processInstanceId);
    return this.get(processInstanceId);
  }

  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }

  #insert(
    publication: ConfirmedProcessInstancePublication,
    intentJson: string | null,
    state: ConfirmedProcessInstanceState,
  ): ConfirmedProcessInstanceReservationResult {
    const exact = snapshotConfirmedPublication(publication);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existingRow = this.#database.prepare(`
        SELECT * FROM confirmed_process_instances WHERE process_instance_id = ?
      `).get(exact.instance.processInstanceId);
      if (existingRow !== undefined) {
        const existing = decodeRow(existingRow);
        if (
          !samePublication(existing, exact) ||
          !sameIntent(existing.intent, decodeDirectIntent(intentJson))
        ) {
          throw new ConfirmedProcessInstanceIntegrityError(
            exact.instance.processInstanceId,
          );
        }
        this.#database.exec("COMMIT");
        return { inserted: false, record: existing };
      }
      this.#database.prepare(`
        INSERT INTO confirmed_process_instances (
          process_instance_id,
          public_instance_json,
          work_locator,
          direct_intent_json,
          state,
          operate_pending,
          work_pending
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        exact.instance.processInstanceId,
        encodePublicInstance(exact.instance),
        exact.locator,
        intentJson,
        state,
        state === ConfirmedProcessInstanceState.Confirmed ? 1 : 0,
        state === ConfirmedProcessInstanceState.Confirmed ? 1 : 0,
      );
      const record = this.get(exact.instance.processInstanceId);
      if (record === null) {
        throw new ConfirmedProcessInstanceIntegrityError(
          exact.instance.processInstanceId,
        );
      }
      this.#database.exec("COMMIT");
      return { inserted: true, record };
    } catch (error: unknown) {
      if (this.#database.isTransaction) {
        this.#database.exec("ROLLBACK");
      }
      throw error;
    }
  }
}

function initializeSchema(database: DatabaseSync): void {
  const table = database.prepare(`
    SELECT sql FROM sqlite_schema
    WHERE type = 'table' AND name = 'confirmed_process_instances'
  `).get();
  if (table === undefined) {
    database.exec(tableSql);
    return;
  }
  if (
    typeof table.sql !== "string" ||
    normalizeSql(table.sql) !== normalizeSql(tableSql)
  ) {
    throw new ConfirmedProcessInstanceStoredValueError(
      new TypeError("confirmed Process-instance schema is not exact"),
    );
  }
}

function decodeRow(
  row: Record<string, SQLOutputValue>,
): ConfirmedProcessInstanceRecord {
  try {
    const processInstanceId = requireStringField(row, "process_instance_id");
    const instance = decodePublicInstance(
      requireStringField(row, "public_instance_json"),
    );
    if (instance.processInstanceId !== processInstanceId) {
      throw new TypeError("stored public identity disagrees with its primary key");
    }
    return {
      instance,
      locator: requireStringField(row, "work_locator"),
      intent: decodeDirectIntent(requireNullableStringField(row, "direct_intent_json")),
      state: requireState(requireStringField(row, "state")),
      operatePending: requireBooleanIntegerField(row, "operate_pending"),
      workPending: requireBooleanIntegerField(row, "work_pending"),
    };
  } catch (error: unknown) {
    throw new ConfirmedProcessInstanceStoredValueError(error);
  }
}

function requireBooleanIntegerField(
  row: Record<string, SQLOutputValue>,
  label: string,
): boolean {
  const value = row[label];
  if (value === 0) return false;
  if (value === 1) return true;
  throw new TypeError(`${label} must be zero or one`);
}

function requireStringField(
  row: Record<string, SQLOutputValue>,
  label: string,
): string {
  const value = row[label];
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
  return value;
}

function requireNullableStringField(
  row: Record<string, SQLOutputValue>,
  label: string,
): string | null {
  const value = row[label];
  if (value === null || typeof value === "string") return value;
  throw new TypeError("direct_intent_json must be text or null");
}

function requirePositiveSafeInteger(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}
