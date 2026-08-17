import { fileURLToPath } from "node:url";

import {
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";
import type {
  PostgresqlMigrationResult,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";

import type {
  PlatformPostgresqlMigrationConfig,
} from "./config.js";

const migrationDirectories = Object.freeze([
  migrationDirectory("@bpmn-lean/platform-artifact-store"),
  migrationDirectory("@bpmn-lean/platform-definitions"),
  migrationDirectory("@bpmn-lean/platform-operate"),
  migrationDirectory("@bpmn-lean/platform-work"),
  migrationDirectory("@bpmn-lean/platform-audit"),
  migrationDirectory("@bpmn-lean/platform-recovery-runtime"),
]);

function migrationDirectory(packageName: string): string {
  const packageEntryPoint = import.meta.resolve(packageName);
  return fileURLToPath(new URL("../migrations", packageEntryPoint));
}

/** Returns the fixed owner-ordered catalog paths resolved from this application. */
export function platformPostgresqlMigrationDirectories(): readonly string[] {
  return migrationDirectories;
}

/** Applies the closed Product 2 schema catalog with the shared checksum and prefix guarantees. */
export async function runPlatformPostgresqlMigrations(
  config: PlatformPostgresqlMigrationConfig,
): Promise<PostgresqlMigrationResult> {
  return await runPostgresqlMigrations({
    connectionString: config.connectionString,
    migrationDirectories,
  });
}
