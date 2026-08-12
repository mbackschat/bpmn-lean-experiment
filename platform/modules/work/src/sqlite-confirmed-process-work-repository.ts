import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import {
  decodePublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import type {
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

const currentSchemaEpoch = 1;
const defaultBusyTimeoutMs = 5_000;
const tableSql = `
  CREATE TABLE confirmed_process_work (
    process_instance_id TEXT PRIMARY KEY NOT NULL,
    public_instance_json TEXT NOT NULL CHECK (length(public_instance_json) > 0),
    work_locator TEXT NOT NULL CHECK (length(work_locator) > 0)
  ) STRICT
`;

export type ConfirmedProcessWorkPublication = Readonly<{
  instance: PublicProcessInstanceIdentity;
  locator: string;
}>;

export class ConfirmedProcessWorkIntegrityError extends Error {
  constructor(processInstanceId: string) {
    super(`confirmed Work registration ${processInstanceId} conflicts`);
    this.name = "ConfirmedProcessWorkIntegrityError";
  }
}

export class ConfirmedProcessWorkStoredValueError extends Error {
  constructor(cause: unknown) {
    super("stored confirmed Work registration is invalid", { cause });
    this.name = "ConfirmedProcessWorkStoredValueError";
  }
}

/** Exact checkpoint-1 registration owner. It intentionally contains no task state. */
export class SqliteConfirmedProcessWorkRepository {
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

  async recordConfirmedProcessInstance(
    publication: ConfirmedProcessWorkPublication,
  ): Promise<void> {
    const exact = snapshotPublication(publication);
    const encoded = JSON.stringify(exact.instance);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.#database.prepare(`
        SELECT public_instance_json, work_locator
        FROM confirmed_process_work
        WHERE process_instance_id = ?
      `).get(exact.instance.processInstanceId);
      if (row !== undefined) {
        const existing = decodeRow(
          exact.instance.processInstanceId,
          row,
        );
        if (
          JSON.stringify(existing.instance) !== encoded ||
          existing.locator !== exact.locator
        ) {
          throw new ConfirmedProcessWorkIntegrityError(
            exact.instance.processInstanceId,
          );
        }
        this.#database.exec("COMMIT");
        return;
      }
      this.#database.prepare(`
        INSERT INTO confirmed_process_work (
          process_instance_id,
          public_instance_json,
          work_locator
        ) VALUES (?, ?, ?)
      `).run(exact.instance.processInstanceId, encoded, exact.locator);
      this.#database.exec("COMMIT");
    } catch (error: unknown) {
      if (this.#database.isTransaction) {
        this.#database.exec("ROLLBACK");
      }
      throw error;
    }
  }

  listConfirmedProcessInstances(): ReadonlyArray<ConfirmedProcessWorkPublication> {
    return this.#database.prepare(`
      SELECT process_instance_id, public_instance_json, work_locator
      FROM confirmed_process_work
      ORDER BY process_instance_id COLLATE BINARY ASC
    `).all().map((row) => decodeRow(
      requireString(row.process_instance_id, "process_instance_id"),
      row,
    ));
  }

  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }
}

function initializeSchema(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const version = requireDatabaseInteger(
      database.prepare("PRAGMA user_version").get()?.user_version,
      "user_version",
    );
    const tables = database.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map((row) => row.name);
    if (version === 0 && tables.length === 0) {
      database.exec(`PRAGMA user_version = ${currentSchemaEpoch}`);
      database.exec(tableSql);
      database.exec("COMMIT");
      return;
    }
    if (
      version !== currentSchemaEpoch ||
      tables.length !== 1 ||
      tables[0] !== "confirmed_process_work"
    ) {
      throw new ConfirmedProcessWorkStoredValueError(
        new TypeError("Work SQLite schema epoch is incompatible"),
      );
    }
    const table = database.prepare(`
      SELECT sql FROM sqlite_schema
      WHERE type = 'table' AND name = 'confirmed_process_work'
    `).get();
    if (
      typeof table?.sql !== "string" ||
      normalizeSql(table.sql) !== normalizeSql(tableSql)
    ) {
      throw new ConfirmedProcessWorkStoredValueError(
        new TypeError("confirmed Work table schema is not exact"),
      );
    }
    database.exec("COMMIT");
  } catch (error: unknown) {
    if (database.isTransaction) {
      database.exec("ROLLBACK");
    }
    throw error;
  }
}

function decodeRow(
  processInstanceId: string,
  row: Record<string, SQLOutputValue>,
): ConfirmedProcessWorkPublication {
  try {
    const instance = decodePublicProcessInstanceIdentity(
      JSON.parse(requireString(row.public_instance_json, "public_instance_json")),
    );
    if (instance.processInstanceId !== processInstanceId) {
      throw new TypeError("stored public identity disagrees with its primary key");
    }
    return {
      instance,
      locator: requireString(row.work_locator, "work_locator"),
    };
  } catch (error: unknown) {
    if (error instanceof ConfirmedProcessWorkStoredValueError) {
      throw error;
    }
    throw new ConfirmedProcessWorkStoredValueError(error);
  }
}

function snapshotPublication(
  publication: ConfirmedProcessWorkPublication,
): ConfirmedProcessWorkPublication {
  return {
    instance: decodePublicProcessInstanceIdentity(publication.instance),
    locator: requireString(publication.locator, "locator"),
  };
}

function requireString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !value.isWellFormed()
  ) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
  return value;
}

function requirePositiveSafeInteger(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function requireDatabaseInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ConfirmedProcessWorkStoredValueError(
      new TypeError(`${label} must be a nonnegative safe integer`),
    );
  }
  return value;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}
