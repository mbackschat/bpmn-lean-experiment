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
  decodeStartCommandBytes,
  decodePublicInstance,
  encodeDirectIntent,
  encodePublicInstance,
  requireAllowedTransition,
  requireDirectEvidencePair,
  requireState,
  sameIntent,
  samePublication,
  sameStartCommandBytes,
  snapshotConfirmedPublication,
  snapshotDirectIntent,
  snapshotStartCommandBytes,
} from "./confirmed-process-instance-values.js";
import {
  confirmedProcessInstancesTableSql,
  requireDefinitionDatabaseSchemaEpoch,
} from "./database-schema-epoch.js";

const defaultBusyTimeoutMs = 5_000;
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

  async confirm(
    publication: ConfirmedProcessInstancePublication,
  ): Promise<ConfirmedProcessInstanceReservationResult> {
    return this.#insert(
      publication,
      null,
      null,
      ConfirmedProcessInstanceState.Confirmed,
    );
  }

  async reserveDirect(
    reservation: DirectProcessInstanceReservation,
  ): Promise<ConfirmedProcessInstanceReservationResult> {
    return this.#insert(
      reservation,
      encodeDirectIntent(snapshotDirectIntent(reservation.intent)),
      snapshotStartCommandBytes(reservation.startCommandBytes),
      ConfirmedProcessInstanceState.Reserved,
    );
  }

  async get(
    processInstanceId: string,
  ): Promise<ConfirmedProcessInstanceRecord | null> {
    return this.#get(processInstanceId);
  }

  #get(processInstanceId: string): ConfirmedProcessInstanceRecord | null {
    const row = this.#database.prepare(`
      SELECT * FROM confirmed_process_instances WHERE process_instance_id = ?
    `).get(processInstanceId);
    return row === undefined ? null : decodeRow(row);
  }

  async listForReconciliation(): Promise<ReadonlyArray<ConfirmedProcessInstanceRecord>> {
    return this.#database.prepare(`
      SELECT * FROM confirmed_process_instances
      WHERE state IN ('reserved', 'starting', 'indeterminate')
        OR (state = 'confirmed' AND (operate_pending = 1 OR work_pending = 1))
      ORDER BY process_instance_id COLLATE BINARY ASC
    `).all().map(decodeRow);
  }

  async listConfirmed(): Promise<ReadonlyArray<ConfirmedProcessInstanceRecord>> {
    return this.#database.prepare(`
      SELECT * FROM confirmed_process_instances
      WHERE state = 'confirmed'
      ORDER BY process_instance_id COLLATE BINARY ASC
    `).all().map(decodeRow);
  }

  async compareAndSetState(
    processInstanceId: string,
    expected: ConfirmedProcessInstanceState,
    next: ConfirmedProcessInstanceState,
  ): Promise<ConfirmedProcessInstanceRecord | null> {
    requireAllowedTransition(expected, next);
    const row = this.#database.prepare(`
      UPDATE confirmed_process_instances
      SET state = ?,
        operate_pending = CASE WHEN ? = 'confirmed' THEN 1 ELSE 0 END,
        work_pending = CASE WHEN ? = 'confirmed' THEN 1 ELSE 0 END
      WHERE process_instance_id = ? AND state = ?
      RETURNING *
    `).get(next, next, next, processInstanceId, expected);
    return row === undefined ? null : decodeRow(row);
  }

  async acknowledge(
    processInstanceId: string,
    subscriber: ConfirmedProcessInstanceSubscriber,
  ): Promise<ConfirmedProcessInstanceRecord | null> {
    const column = subscriber === "operate" ? "operate_pending" : "work_pending";
    this.#database.prepare(`
      UPDATE confirmed_process_instances
      SET ${column} = 0
      WHERE process_instance_id = ? AND state = 'confirmed'
    `).run(processInstanceId);
    return await this.get(processInstanceId);
  }

  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }

  #insert(
    publication: ConfirmedProcessInstancePublication,
    intentJson: string | null,
    startCommandBytes: Uint8Array | null,
    state: ConfirmedProcessInstanceState,
  ): ConfirmedProcessInstanceReservationResult {
    const exact = snapshotConfirmedPublication(publication);
    requireDirectEvidencePair(decodeDirectIntent(intentJson), startCommandBytes, state);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existingRow = this.#database.prepare(`
        SELECT * FROM confirmed_process_instances WHERE process_instance_id = ?
      `).get(exact.instance.processInstanceId);
      if (existingRow !== undefined) {
        const existing = decodeRow(existingRow);
        if (
          !samePublication(existing, exact) ||
          !sameIntent(existing.intent, decodeDirectIntent(intentJson)) ||
          !sameStartCommandBytes(existing.startCommandBytes, startCommandBytes)
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
          direct_start_command,
          state,
          operate_pending,
          work_pending
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        exact.instance.processInstanceId,
        encodePublicInstance(exact.instance),
        exact.locator,
        intentJson,
        startCommandBytes,
        state,
        state === ConfirmedProcessInstanceState.Confirmed ? 1 : 0,
        state === ConfirmedProcessInstanceState.Confirmed ? 1 : 0,
      );
      const record = this.#get(exact.instance.processInstanceId);
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
    database.exec(confirmedProcessInstancesTableSql);
    return;
  }
  if (
    typeof table.sql !== "string" ||
    normalizeSql(table.sql) !== normalizeSql(confirmedProcessInstancesTableSql)
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
    const intent = decodeDirectIntent(
      requireNullableStringField(row, "direct_intent_json"),
    );
    const startCommandBytes = decodeStartCommandBytes(
      requireNullableBlobField(row, "direct_start_command"),
    );
    const state = requireState(requireStringField(row, "state"));
    requireDirectEvidencePair(intent, startCommandBytes, state);
    return {
      instance,
      locator: requireStringField(row, "work_locator"),
      intent,
      startCommandBytes,
      state,
      operatePending: requireBooleanIntegerField(row, "operate_pending"),
      workPending: requireBooleanIntegerField(row, "work_pending"),
    };
  } catch (error: unknown) {
    throw new ConfirmedProcessInstanceStoredValueError(error);
  }
}

function requireNullableBlobField(
  row: Record<string, SQLOutputValue>,
  label: string,
): Uint8Array | null {
  const value = row[label];
  if (value === null) return null;
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  throw new TypeError(`${label} must be a blob or null`);
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
