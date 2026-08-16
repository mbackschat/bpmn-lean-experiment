import type { DatabaseSync } from "node:sqlite";

const currentDefinitionDatabaseSchemaEpoch = 3;

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
 * Establishes the current pre-release epoch only on a database with no user tables.
 * Every Product 2 repository calls this before creating or reading its own table.
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

function hasUserTables(database: DatabaseSync): boolean {
  return database.prepare(`
    SELECT 1
    FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    LIMIT 1
  `).get() !== undefined;
}
