import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { runner } from "node-pg-migrate";
import pg from "pg";
import type { ClientBase, QueryResultRow } from "pg";

const checksumBoundMigrationPattern =
  /^(?<ordinal>[0-9]{4})_(?<description>[a-z0-9]+(?:-[a-z0-9]+)*)__(?<sha256>[0-9a-f]{64})\.sql$/u;
const migrationLockId = 8_388_001;
const migrationSchema = "bpmn_platform_meta";
const migrationsTable = "schema_migrations";
const migrationConnectionTimeoutMs = 10_000;
const migrationStatementTimeoutMs = 300_000;

export type PostgresqlMigrationOptions = Readonly<{
  connectionString: string;
  migrationDirectories: readonly string[];
}>;

export type PostgresqlMigrationResult = Readonly<{
  appliedNames: readonly string[];
}>;

/** Raised before database mutation when a migration's bytes no longer match its bound name. */
export class MigrationChecksumMismatchError extends Error {
  readonly migrationName: string;
  readonly expectedSha256: string;
  readonly actualSha256: string;

  constructor(migrationName: string, expectedSha256: string, actualSha256: string) {
    super(
      `migration ${migrationName} has SHA-256 ${actualSha256}, not its bound ${expectedSha256}`,
    );
    this.name = "MigrationChecksumMismatchError";
    this.migrationName = migrationName;
    this.expectedSha256 = expectedSha256;
    this.actualSha256 = actualSha256;
  }
}

/** Raised under the migration lock when database history is not the configured leading prefix. */
export class MigrationPrefixMismatchError extends Error {
  readonly appliedNames: readonly string[];
  readonly configuredNames: readonly string[];

  constructor(
    appliedNames: readonly string[],
    configuredNames: readonly string[],
  ) {
    super("applied migrations are not an exact configured prefix");
    this.name = "MigrationPrefixMismatchError";
    this.appliedNames = [...appliedNames];
    this.configuredNames = [...configuredNames];
  }
}

/** Raised before connection when migration files are not one closed ordered catalog. */
export class MigrationCatalogError extends Error {
  readonly entry: string;

  constructor(entry: string, reason: string) {
    super(`invalid PostgreSQL migration catalog entry ${entry}: ${reason}`);
    this.name = "MigrationCatalogError";
    this.entry = entry;
  }
}

export type MigrationFileSnapshot = Readonly<{
  path: string;
  name: string;
  ordinal: number;
  expectedSha256: string;
  actualSha256: string;
}>;

export type MigrationSession = Readonly<{
  driverClient?: ClientBase;
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<Readonly<{ rows: readonly Readonly<Record<string, unknown>>[] }>>;
}>;

export type MigrationRunnerDependencies = Readonly<{
  discoverMigrationFiles: (
    directories: readonly string[],
  ) => Promise<readonly MigrationFileSnapshot[]>;
  withLockedSession: <Result>(
    run: (session: MigrationSession) => Promise<Result>,
  ) => Promise<Result>;
  readAppliedNames: (
    session: MigrationSession,
  ) => Promise<readonly string[]>;
  executeMigrations: (
    session: MigrationSession,
    migrations: readonly MigrationFileSnapshot[],
  ) => Promise<readonly string[]>;
}>;

export async function discoverChecksumBoundMigrationFiles(
  directories: readonly string[],
): Promise<readonly MigrationFileSnapshot[]> {
  if (directories.length === 0) {
    throw new MigrationCatalogError("<catalog>", "at least one directory is required");
  }
  const migrations: MigrationFileSnapshot[] = [];
  for (const directory of directories) {
    const absoluteDirectory = resolve(directory);
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(absoluteDirectory, entry.name);
      if (!entry.isFile()) {
        throw new MigrationCatalogError(path, "only regular files are allowed");
      }
      const match = checksumBoundMigrationPattern.exec(entry.name);
      const ordinalText = match?.groups?.ordinal;
      const expectedSha256 = match?.groups?.sha256;
      if (ordinalText === undefined || expectedSha256 === undefined) {
        throw new MigrationCatalogError(
          path,
          "expected NNNN_description__<lowercase-sha256>.sql",
        );
      }
      const bytes = await readFile(path);
      migrations.push({
        path,
        name: entry.name.slice(0, -".sql".length),
        ordinal: Number.parseInt(ordinalText, 10),
        expectedSha256,
        actualSha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }

  // Code-unit order, never `localeCompare`: migration application order must be identical on every
  // host, and a locale-sensitive tiebreak lets two hosts apply the same pair in opposite orders.
  migrations.sort(
    (left, right) =>
      left.ordinal - right.ordinal ||
      (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
  );
  migrations.forEach((migration, index) => {
    const requiredOrdinal = index + 1;
    if (migration.ordinal !== requiredOrdinal) {
      throw new MigrationCatalogError(
        migration.path,
        `expected unique contiguous ordinal ${requiredOrdinal.toString().padStart(4, "0")}`,
      );
    }
  });
  return migrations;
}

export async function runPostgresqlMigrationsWithDependencies(
  options: PostgresqlMigrationOptions,
  dependencies: MigrationRunnerDependencies,
): Promise<PostgresqlMigrationResult> {
  const migrations = await dependencies.discoverMigrationFiles(
    options.migrationDirectories,
  );
  for (const migration of migrations) {
    if (migration.actualSha256 !== migration.expectedSha256) {
      throw new MigrationChecksumMismatchError(
        migration.name,
        migration.expectedSha256,
        migration.actualSha256,
      );
    }
  }
  return await dependencies.withLockedSession(async (session) => {
    const appliedNames = await dependencies.readAppliedNames(session);
    const configuredNames = migrations.map(({ name }) => name);
    if (
      appliedNames.length > configuredNames.length ||
      appliedNames.some((name, index) => name !== configuredNames[index])
    ) {
      throw new MigrationPrefixMismatchError(appliedNames, configuredNames);
    }
    const newlyAppliedNames = await dependencies.executeMigrations(
      session,
      migrations,
    );
    return { appliedNames: [...appliedNames, ...newlyAppliedNames] };
  });
}

/** Applies every pending forward migration under one dedicated-session advisory lock. */
export async function runPostgresqlMigrations(
  options: PostgresqlMigrationOptions,
): Promise<PostgresqlMigrationResult> {
  return await runPostgresqlMigrationsWithDependencies(options, {
    discoverMigrationFiles: discoverChecksumBoundMigrationFiles,
    withLockedSession: async (run) =>
      await withLockedMigrationSession(options.connectionString, run),
    readAppliedNames,
    executeMigrations: async (session, migrations) => {
      if (session.driverClient === undefined) {
        throw new Error("migration execution requires the dedicated driver client");
      }
      const applied = await runner({
        dbClient: session.driverClient,
        dir: migrations.map(({ path }) => path),
        useGlob: true,
        direction: "up",
        migrationsSchema: migrationSchema,
        migrationsTable,
        createMigrationsSchema: true,
        checkOrder: true,
        singleTransaction: false,
        noLock: true,
        logger: silentMigrationLogger,
      });
      return applied.map(({ name }) => name);
    },
  });
}

const silentMigrationLogger = Object.freeze({
  debug: (_message: string): void => undefined,
  info: (_message: string): void => undefined,
  warn: (_message: string): void => undefined,
  error: (_message: string): void => undefined,
});

async function withLockedMigrationSession<Result>(
  connectionString: string,
  run: (session: MigrationSession) => Promise<Result>,
): Promise<Result> {
  const client = new pg.Client({
    connectionString,
    application_name: "bpmn-platform-schema-migration",
    connectionTimeoutMillis: migrationConnectionTimeoutMs,
    statement_timeout: migrationStatementTimeoutMs,
    lock_timeout: migrationStatementTimeoutMs,
    idle_in_transaction_session_timeout: migrationStatementTimeoutMs,
  });
  await client.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);
    locked = true;
    const session: MigrationSession = {
      driverClient: client,
      query: async (text, values) => {
        const result = await client.query<QueryResultRow>(text, [
          ...(values ?? []),
        ]);
        return { rows: result.rows };
      },
    };
    return await run(session);
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]);
    }
    await client.end();
  }
}

async function readAppliedNames(
  session: MigrationSession,
): Promise<readonly string[]> {
  const relation = await session.query(
    "SELECT to_regclass($1)::text AS relation_name",
    [`${migrationSchema}.${migrationsTable}`],
  );
  if (relation.rows[0]?.relation_name === null) {
    return [];
  }
  const result = await session.query(
    `SELECT name FROM "${migrationSchema}"."${migrationsTable}" ORDER BY run_on, id`,
  );
  return result.rows.map(({ name }) => {
    if (typeof name !== "string") {
      throw new Error("migration history contains a non-string name");
    }
    return name;
  });
}
