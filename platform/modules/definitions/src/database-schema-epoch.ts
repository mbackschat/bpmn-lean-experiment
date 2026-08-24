import type { DatabaseSync } from "node:sqlite";

const legacyDefinitionDatabaseSchemaEpoch = 3;
const currentDefinitionDatabaseSchemaEpoch = 4;
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
    if (epoch === legacyDefinitionDatabaseSchemaEpoch) {
      migrateLegacyConfirmedProcessInstances(database);
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
