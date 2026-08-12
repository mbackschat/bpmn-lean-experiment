import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import { WorkSchemaResetRequiredError } from "./work-contracts.js";

const schemaEpoch = 2;

const schemaObjects = new Map<string, string>([
  ["work_processes", `
    CREATE TABLE work_processes (
      process_instance_id TEXT PRIMARY KEY NOT NULL,
      public_instance_json TEXT NOT NULL,
      work_locator TEXT NOT NULL,
      observation TEXT NOT NULL CHECK (observation IN ('active','closed','indeterminate'))
    ) STRICT
  `],
  ["work_claims", `
    CREATE TABLE work_claims (
      hosting_process_instance_id TEXT NOT NULL,
      task_process_instance_id TEXT NOT NULL,
      element_id TEXT NOT NULL,
      activation INTEGER NOT NULL CHECK (activation > 0),
      claim_generation INTEGER NOT NULL CHECK (claim_generation >= 0),
      actor_id TEXT,
      PRIMARY KEY (hosting_process_instance_id, task_process_instance_id, element_id, activation)
    ) STRICT
  `],
  ["work_actions", `
    CREATE TABLE work_actions (
      action_id TEXT PRIMARY KEY NOT NULL,
      action_kind TEXT NOT NULL CHECK (action_kind IN ('claim','release')),
      actor_id TEXT NOT NULL,
      hosting_process_instance_id TEXT NOT NULL,
      task_process_instance_id TEXT NOT NULL,
      element_id TEXT NOT NULL,
      activation INTEGER NOT NULL CHECK (activation > 0),
      input_generation INTEGER NOT NULL CHECK (input_generation >= 0),
      result_json TEXT NOT NULL
    ) STRICT
  `],
  ["work_completions", `
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
    ) STRICT
  `],
  ["work_completion_active_slot", `
    CREATE UNIQUE INDEX work_completion_active_slot ON work_completions (
      hosting_process_instance_id, task_process_instance_id, element_id,
      activation, claim_generation
    ) WHERE state IN ('reserved','submitting','indeterminate')
  `],
  ["work_audit_outbox", `
    CREATE TABLE work_audit_outbox (
      ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      action_id TEXT NOT NULL,
      action_outcome TEXT NOT NULL,
      event_json TEXT NOT NULL,
      delivered INTEGER NOT NULL CHECK (delivered IN (0,1)),
      UNIQUE (action_id, action_outcome)
    ) STRICT
  `],
]);

export function initializeWorkSchema(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const version = readNonnegativeInteger(
      database.prepare("PRAGMA user_version").get()?.user_version,
    );
    const objects = readSchemaObjects(database);
    if (version === 0 && objects.size === 0) {
      for (const sql of schemaObjects.values()) database.exec(sql);
      database.exec(`PRAGMA user_version = ${schemaEpoch}`);
    } else {
      requireExactSchema(version, objects, database);
    }
    database.exec("COMMIT");
  } catch (error: unknown) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

function readSchemaObjects(database: DatabaseSync): ReadonlyMap<string, string> {
  const rows = database.prepare(`
    SELECT name, sql FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();
  return new Map(rows.map((row) => [
    requireText(row.name),
    requireText(row.sql),
  ]));
}

function requireExactSchema(
  version: number,
  objects: ReadonlyMap<string, string>,
  database: DatabaseSync,
): void {
  if (version !== schemaEpoch || objects.size !== schemaObjects.size) {
    throw new WorkSchemaResetRequiredError();
  }
  for (const [name, expectedSql] of schemaObjects) {
    const actualSql = objects.get(name);
    if (actualSql === undefined || normalizeSql(actualSql) !== normalizeSql(expectedSql)) {
      throw new WorkSchemaResetRequiredError();
    }
  }
  const strictTables = database.prepare(`
    SELECT name, strict FROM pragma_table_list
    WHERE schema = 'main' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();
  if (
    strictTables.length !== 5 ||
    strictTables.some((row) => row.strict !== 1)
  ) {
    throw new WorkSchemaResetRequiredError();
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}

function requireText(value: SQLOutputValue | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new WorkSchemaResetRequiredError();
  }
  return value;
}

function readNonnegativeInteger(value: SQLOutputValue | undefined): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) {
    throw new WorkSchemaResetRequiredError();
  }
  return number;
}
