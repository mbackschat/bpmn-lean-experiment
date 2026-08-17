#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  readPlatformPostgresqlMigrationConfig,
} from "./config.js";
import {
  runPlatformPostgresqlMigrations,
} from "./migration-composition.js";

export async function runPlatformPostgresqlMigrationCommand(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const result = await runPlatformPostgresqlMigrations(
    readPlatformPostgresqlMigrationConfig(environment),
  );
  process.stdout.write(
    `${result.appliedNames.length} PostgreSQL migrations are applied.\n`,
  );
}

function isEntryPoint(moduleUrl: string, argvEntry: string | undefined): boolean {
  return argvEntry !== undefined && pathToFileURL(resolve(argvEntry)).href === moduleUrl;
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  void runPlatformPostgresqlMigrationCommand().catch(() => {
    process.stderr.write("PostgreSQL migration failed.\n");
    process.exitCode = 1;
  });
}
