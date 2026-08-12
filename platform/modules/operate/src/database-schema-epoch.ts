import type { DatabaseSync } from "node:sqlite";

const currentProcessInstanceDatabaseSchemaEpoch = 1;

/** Raised before row access when the Operate database needs a pre-release reset. */
export class ProcessInstanceSchemaResetRequiredError extends Error {
  constructor() {
    super(
      "Process-instance SQLite schema is from an incompatible pre-release; reset the Operate database before restarting",
    );
    this.name = "ProcessInstanceSchemaResetRequiredError";
  }
}

/** Establishes the independent Process-instance schema epoch only on an empty database. */
export function requireProcessInstanceDatabaseSchemaEpoch(
  database: DatabaseSync,
): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const epoch = database.prepare("PRAGMA user_version").get()?.user_version;
    if (epoch === currentProcessInstanceDatabaseSchemaEpoch) {
      database.exec("COMMIT");
      return;
    }
    if (epoch !== 0 || hasUserTables(database)) {
      throw new ProcessInstanceSchemaResetRequiredError();
    }
    database.exec(
      `PRAGMA user_version = ${currentProcessInstanceDatabaseSchemaEpoch}`,
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
