import { definitionSourceOverlaySqliteColumns, definitionSqliteTables, priorDefinitionSqliteTableSql } from "./definition-sqlite-tables.js";
import { decodePublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";
import type { DatabaseSync } from "node:sqlite";

const legacyDefinitionDatabaseSchemaEpoch = 3;
const currentDefinitionDatabaseSchemaEpoch = 5;
const canonicalEmptyStartCommandSql = "CAST('{\"initialVariables\":[]}' AS BLOB)";

const legacyConfirmedProcessInstancesTableSql = `
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

export const confirmedProcessInstancesTableSql = `
  CREATE TABLE confirmed_process_instances (
    process_instance_id TEXT PRIMARY KEY NOT NULL,
    public_instance_json TEXT NOT NULL CHECK (length(public_instance_json) > 0),
    work_locator TEXT NOT NULL CHECK (length(work_locator) > 0),
    direct_intent_json TEXT,
    direct_start_command BLOB,
    state TEXT NOT NULL CHECK (
      state IN ('reserved', 'starting', 'indeterminate', 'confirmed', 'integrityFailure')
    ),
    operate_pending INTEGER NOT NULL CHECK (operate_pending IN (0, 1)),
    work_pending INTEGER NOT NULL CHECK (work_pending IN (0, 1)),
    CHECK (
      (state = 'confirmed') OR (operate_pending = 0 AND work_pending = 0)
    ),
    CHECK (
      (
        direct_intent_json IS NULL
        AND direct_start_command IS NULL
        AND state = 'confirmed'
      )
      OR (
        direct_intent_json IS NOT NULL
        AND direct_start_command IS NOT NULL
        AND length(direct_start_command) > 0
      )
    )
  ) STRICT
`;

/** Raised before table access when durable Product 2 data predates the current pre-release schema. */
export class DefinitionSchemaResetRequiredError extends Error {
  constructor() {
    super(
      "definition SQLite schema is from an incompatible pre-release; reset the platform database before restarting",
    );
    this.name = "DefinitionSchemaResetRequiredError";
  }
}

/**
 * Establishes the current epoch on an empty database or transactionally advances
 * the one exact supported prior Definitions schema. Every Product 2 repository
 * calls this before creating or reading its own table.
 */
export function requireDefinitionDatabaseSchemaEpoch(
  database: DatabaseSync,
): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database.prepare("PRAGMA user_version").get();
    const epoch = row?.user_version;
    if (epoch === currentDefinitionDatabaseSchemaEpoch) {
      database.exec("COMMIT");
      return;
    }
    if (epoch === legacyDefinitionDatabaseSchemaEpoch || epoch === 4) {
      if (epoch === legacyDefinitionDatabaseSchemaEpoch) migrateLegacyConfirmedProcessInstances(database);
      migrateSourceOverlayIdentity(database);
      database.exec(
        `PRAGMA user_version = ${currentDefinitionDatabaseSchemaEpoch}`,
      );
      database.exec("COMMIT");
      return;
    }
    if (epoch !== 0 || hasUserTables(database)) {
      throw new DefinitionSchemaResetRequiredError();
    }
    database.exec(
      `PRAGMA user_version = ${currentDefinitionDatabaseSchemaEpoch}`,
    );
    database.exec("COMMIT");
  } catch (error: unknown) {
    if (database.isTransaction) {
      database.exec("ROLLBACK");
    }
    throw error;
  }
}

function migrateLegacyConfirmedProcessInstances(database: DatabaseSync): void {
  const table = database.prepare(`
    SELECT sql FROM sqlite_schema
    WHERE type = 'table' AND name = 'confirmed_process_instances'
  `).get();
  if (table === undefined) return;
  if (
    typeof table.sql !== "string" ||
    normalizeSql(table.sql) !== normalizeSql(legacyConfirmedProcessInstancesTableSql) ||
    database.prepare(`
      SELECT 1 FROM sqlite_schema
      WHERE type = 'table' AND name = 'confirmed_process_instances_epoch_3'
    `).get() !== undefined
  ) {
    throw new DefinitionSchemaResetRequiredError();
  }
  database.exec(`
    ALTER TABLE confirmed_process_instances
      RENAME TO confirmed_process_instances_epoch_3;
    ${confirmedProcessInstancesTableSql};
    INSERT INTO confirmed_process_instances (
      process_instance_id,
      public_instance_json,
      work_locator,
      direct_intent_json,
      direct_start_command,
      state,
      operate_pending,
      work_pending
    )
    SELECT
      process_instance_id,
      public_instance_json,
      work_locator,
      direct_intent_json,
      CASE
        WHEN direct_intent_json IS NULL THEN NULL
        ELSE ${canonicalEmptyStartCommandSql}
      END,
      state,
      operate_pending,
      work_pending
    FROM confirmed_process_instances_epoch_3;
    DROP TABLE confirmed_process_instances_epoch_3;
  `);
}

function hasUserTables(database: DatabaseSync): boolean {
  return database.prepare(`
    SELECT 1
    FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    LIMIT 1
  `).get() !== undefined;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}

/** Old public admission allowed no overlay; only its exact snapshots may acquire null. */
function migrateSourceOverlayIdentity(database: DatabaseSync): void {
  const retainedTables = definitionSqliteTables.filter(({ name, sql }) => {
    const retained = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name);
    if (retained === undefined) return false;
    if (typeof retained.sql !== "string" || normalizeTableSql(retained.sql) !== normalizeTableSql(priorDefinitionSqliteTableSql(sql))) {
      throw new DefinitionSchemaResetRequiredError();
    }
    return true;
  });
  const confirmed = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'confirmed_process_instances'").get();
  if (confirmed !== undefined && (typeof confirmed.sql !== "string" || normalizeTableSql(confirmed.sql) !== normalizeTableSql(confirmedProcessInstancesTableSql))) {
    throw new DefinitionSchemaResetRequiredError();
  }
  for (const table of retainedTables) {
    for (const column of definitionSourceOverlaySqliteColumns) database.exec(`ALTER TABLE ${table.name} ADD COLUMN ${column}`);
  }
  if (database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'confirmed_process_instances'").get() === undefined) return;
  const rows = database.prepare("SELECT process_instance_id, public_instance_json, json_type(public_instance_json, '$.definition.sourceOverlay') AS overlay_type, json_set(public_instance_json, '$.definition.sourceOverlay', json('null')) AS migrated FROM confirmed_process_instances").all();
  for (const row of rows) {
    if (row.overlay_type !== null || typeof row.migrated !== "string" || typeof row.process_instance_id !== "string") throw new DefinitionSchemaResetRequiredError();
    const instance = decodePublicProcessInstanceIdentity(JSON.parse(row.migrated));
    database.prepare("UPDATE confirmed_process_instances SET public_instance_json = ? WHERE process_instance_id = ?").run(JSON.stringify(instance), row.process_instance_id);
  }
}

function normalizeTableSql(sql: string): string {
  return normalizeSql(sql).replace(/CREATE TABLE IF NOT EXISTS /iu, "CREATE TABLE ").replace(/\s*([(),])\s*/gu, "$1");
}
