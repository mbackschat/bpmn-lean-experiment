import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue, SQLOutputValue } from "node:sqlite";

import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

import {
  ProcessInstanceIdentityIntegrityError,
  ProcessInstanceStoredValueError,
} from "./contracts.js";
import type {
  ProcessInstanceRepository,
  ProcessInstanceRepositoryQuery,
  StoredProcessInstance,
} from "./contracts.js";
import {
  ProcessInstanceSchemaResetRequiredError,
  requireProcessInstanceDatabaseSchemaEpoch,
} from "./database-schema-epoch.js";
import {
  decodeStoredProcessInstanceIdentity,
  encodeProcessInstanceIdentity,
} from "./process-instance-values.js";

const defaultBusyTimeoutMs = 5_000;
const processInstanceTableSql = `
  CREATE TABLE process_instances (
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT CHECK (
      ordinal > 0 AND ordinal <= 9007199254740991
    ),
    process_instance_id TEXT NOT NULL,
    process_id TEXT NOT NULL,
    definition_version INTEGER NOT NULL CHECK (definition_version > 0),
    source_sha256 TEXT NOT NULL CHECK (
      length(source_sha256) = 64
      AND source_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
    public_identity_json TEXT NOT NULL CHECK (length(public_identity_json) > 0)
  ) STRICT
`;
const processInstanceIndexes = [
  {
    name: "process_instances_process_id_ordinal",
    unique: 0,
    columns: ["process_id", "ordinal"],
    sql: `CREATE INDEX process_instances_process_id_ordinal
      ON process_instances (process_id, ordinal DESC)`,
  },
  {
    name: "process_instances_source_sha256_ordinal",
    unique: 0,
    columns: ["source_sha256", "ordinal"],
    sql: `CREATE INDEX process_instances_source_sha256_ordinal
      ON process_instances (source_sha256, ordinal DESC)`,
  },
  {
    name: "process_instances_unique_identity",
    unique: 1,
    columns: ["process_instance_id"],
    sql: `CREATE UNIQUE INDEX process_instances_unique_identity
      ON process_instances (process_instance_id)`,
  },
  {
    name: "process_instances_version_ordinal",
    unique: 0,
    columns: ["definition_version", "ordinal"],
    sql: `CREATE INDEX process_instances_version_ordinal
      ON process_instances (definition_version, ordinal DESC)`,
  },
] as const;

/** Append-only confirmed-start registry backed by its own SQLite database. */
export class SqliteProcessInstanceRepository
  implements ProcessInstanceRepository {
  readonly #database: DatabaseSync;

  constructor(
    databaseFile: string,
    busyTimeoutMs: number = defaultBusyTimeoutMs,
  ) {
    requirePositiveSafeInteger(busyTimeoutMs, "busyTimeoutMs");
    this.#database = new DatabaseSync(databaseFile);
    this.#database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    try {
      requireProcessInstanceDatabaseSchemaEpoch(this.#database);
      initializeSchema(this.#database);
    } catch (error: unknown) {
      this.#database.close();
      throw error;
    }
  }

  get isOpen(): boolean {
    return this.#database.isOpen;
  }

  /** Serializes same-ID writers so equivalent facts converge and conflicts classify. */
  record(instance: PublicProcessInstanceIdentity): number {
    const encoded = encodeProcessInstanceIdentity(instance);
    const decoded = decodeStoredProcessInstanceIdentity(encoded);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.#database.prepare(`
        SELECT
          ordinal,
          process_instance_id,
          process_id,
          definition_version,
          source_sha256,
          public_identity_json
        FROM process_instances
        WHERE process_instance_id = ?
      `).get(decoded.processInstanceId);
      if (existing !== undefined) {
        const stored = decodeRow(existing);
        if (encodeProcessInstanceIdentity(stored.instance) !== encoded) {
          throw new ProcessInstanceIdentityIntegrityError(
            decoded.processInstanceId,
          );
        }
        this.#database.exec("COMMIT");
        return stored.ordinal;
      }

      const result = this.#database.prepare(`
        INSERT INTO process_instances (
          process_instance_id,
          process_id,
          definition_version,
          source_sha256,
          public_identity_json
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        decoded.processInstanceId,
        decoded.definition.processId,
        decoded.definition.version,
        decoded.definition.source.sha256,
        encoded,
      );
      const ordinal = requirePositiveSafeInteger(
        result.lastInsertRowid,
        "inserted Process-instance ordinal",
      );
      this.#database.exec("COMMIT");
      return ordinal;
    } catch (error: unknown) {
      if (this.#database.isTransaction) {
        this.#database.exec("ROLLBACK");
      }
      throw error;
    }
  }

  /** Decodes and cross-checks every selected public snapshot before returning it. */
  search(
    query: ProcessInstanceRepositoryQuery,
  ): ReadonlyArray<StoredProcessInstance> {
    requireRepositoryQuery(query);
    const parameters: SQLInputValue[] = [];
    let where = addFilter(
      "",
      parameters,
      "process_instance_id",
      query.processInstanceId,
    );
    where = addFilter(where, parameters, "process_id", query.processId);
    where = addFilter(
      where,
      parameters,
      "definition_version",
      query.version,
    );
    where = addFilter(
      where,
      parameters,
      "source_sha256",
      query.sourceSha256,
    );
    if (query.beforeOrdinal !== undefined) {
      where = appendSqlPredicate(where, "ordinal < ?");
      parameters.push(query.beforeOrdinal);
    }
    parameters.push(query.limit);
    const rows = this.#database.prepare(`
      SELECT
        ordinal,
        process_instance_id,
        process_id,
        definition_version,
        source_sha256,
        public_identity_json
      FROM process_instances
      ${where}
      ORDER BY ordinal DESC
      LIMIT ?
    `).all(...parameters);
    return rows.map(decodeRow);
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
    const tables = database.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map((row) => row.name);
    if (tables.length === 0) {
      createSchema(database);
      database.exec("COMMIT");
      return;
    }
    if (tables.length !== 1 || tables[0] !== "process_instances") {
      throw new ProcessInstanceSchemaResetRequiredError();
    }
    requireCurrentSchema(database);
    database.exec("COMMIT");
  } catch (error: unknown) {
    if (database.isTransaction) {
      database.exec("ROLLBACK");
    }
    throw error;
  }
}

function createSchema(database: DatabaseSync): void {
  database.exec(processInstanceTableSql);
  for (const { sql } of processInstanceIndexes) {
    database.exec(sql);
  }
}

function requireCurrentSchema(database: DatabaseSync): void {
  const columns = database.prepare(`
    SELECT name, type, "notnull", pk
    FROM pragma_table_info('process_instances')
    ORDER BY cid
  `).all();
  const expectedColumns = [
    ["ordinal", "INTEGER", 0, 1],
    ["process_instance_id", "TEXT", 1, 0],
    ["process_id", "TEXT", 1, 0],
    ["definition_version", "INTEGER", 1, 0],
    ["source_sha256", "TEXT", 1, 0],
    ["public_identity_json", "TEXT", 1, 0],
  ] as const;
  const table = database.prepare(`
    SELECT table_list.strict, sqlite_schema.sql
    FROM pragma_table_list AS table_list
    INNER JOIN sqlite_schema ON sqlite_schema.name = table_list.name
    WHERE table_list.schema = 'main'
      AND table_list.name = 'process_instances'
      AND sqlite_schema.type = 'table'
  `).get();
  if (
    table?.strict !== 1 ||
    typeof table.sql !== "string" ||
    normalizeSql(table.sql) !== normalizeSql(processInstanceTableSql) ||
    columns.length !== expectedColumns.length ||
    columns.some((column, index) => {
      const wanted = expectedColumns[index];
      return wanted === undefined ||
        column.name !== wanted[0] ||
        column.type !== wanted[1] ||
        column.notnull !== wanted[2] ||
        column.pk !== wanted[3];
    }) ||
    !hasExactIndexes(database)
  ) {
    throw new ProcessInstanceSchemaResetRequiredError();
  }
}

function hasExactIndexes(database: DatabaseSync): boolean {
  const actual = database.prepare(`
    SELECT index_list.name, index_list."unique", sqlite_schema.sql
    FROM pragma_index_list('process_instances') AS index_list
    INNER JOIN sqlite_schema ON sqlite_schema.name = index_list.name
    ORDER BY index_list.name
  `).all();
  return actual.length === processInstanceIndexes.length &&
    actual.every((index, position) => {
      const wanted = processInstanceIndexes[position];
      if (
        wanted === undefined ||
        index.name !== wanted.name ||
        index.unique !== wanted.unique ||
        typeof index.sql !== "string" ||
        normalizeSql(index.sql) !== normalizeSql(wanted.sql)
      ) {
        return false;
      }
      const columns = database.prepare(`
        SELECT name FROM pragma_index_info(?) ORDER BY seqno
      `).all(index.name as SQLInputValue).map((row) => row.name);
      return columns.length === wanted.columns.length &&
        columns.every((name, column) => name === wanted.columns[column]);
    });
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}

function decodeRow(row: Record<string, SQLOutputValue>): StoredProcessInstance {
  try {
    const ordinal = requirePositiveSafeIntegerField(row, "ordinal");
    const processInstanceId = requireStringField(row, "process_instance_id");
    const processId = requireStringField(row, "process_id");
    const definitionVersion = requirePositiveSafeIntegerField(
      row,
      "definition_version",
    );
    const sourceSha256 = requireStringField(row, "source_sha256");
    const encoded = requireStringField(row, "public_identity_json");
    const instance = decodeStoredProcessInstanceIdentity(encoded);
    if (
      instance.processInstanceId !== processInstanceId ||
      instance.definition.processId !== processId ||
      instance.definition.version !== definitionVersion ||
      instance.definition.source.sha256 !== sourceSha256
    ) {
      throw new TypeError("stored Process-instance filter columns disagree");
    }
    return { ordinal, instance };
  } catch (error: unknown) {
    throw new ProcessInstanceStoredValueError(error);
  }
}

function addFilter(
  where: string,
  parameters: SQLInputValue[],
  column: string,
  value: string | number | undefined,
): string {
  if (value === undefined) {
    return where;
  }
  parameters.push(value);
  return appendSqlPredicate(where, `${column} = ?`);
}

function appendSqlPredicate(where: string, predicate: string): string {
  return where.length === 0
    ? `WHERE ${predicate}`
    : `${where} AND ${predicate}`;
}

function requireRepositoryQuery(query: ProcessInstanceRepositoryQuery): void {
  requirePositiveSafeInteger(query.limit, "query.limit");
  if (query.beforeOrdinal !== undefined) {
    requirePositiveSafeInteger(query.beforeOrdinal, "query.beforeOrdinal");
  }
}

function requirePositiveSafeIntegerField(
  row: Record<string, SQLOutputValue>,
  field: string,
): number {
  return requirePositiveSafeInteger(row[field], field);
}

function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value === "bigint") {
    const decoded = Number(value);
    if (Number.isSafeInteger(decoded) && decoded > 0) {
      return decoded;
    }
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function requireStringField(
  row: Record<string, SQLOutputValue>,
  field: string,
): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  return value;
}
