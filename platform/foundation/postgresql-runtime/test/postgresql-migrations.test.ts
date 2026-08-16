import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  discoverChecksumBoundMigrationFiles,
  MigrationChecksumMismatchError,
  runPostgresqlMigrationsWithDependencies,
} from "../dist/postgresql-migrations.js";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

test("discovers checksum-bound SQL migrations in contiguous ordinal order", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-pg-migrations-"));
  const secondDirectory = join(root, "second");
  const firstDirectory = join(root, "first");
  await mkdir(secondDirectory);
  await mkdir(firstDirectory);
  const firstSql = "CREATE TABLE example_one (id bigint PRIMARY KEY);\n";
  const secondSql = "CREATE TABLE example_two (id bigint PRIMARY KEY);\n";
  const firstName = `0001_initial-schema__${sha256(firstSql)}`;
  const secondName = `0002_second-schema__${sha256(secondSql)}`;
  await writeFile(join(secondDirectory, `${secondName}.sql`), secondSql);
  await writeFile(join(firstDirectory, `${firstName}.sql`), firstSql);

  try {
    const migrations = await discoverChecksumBoundMigrationFiles([
      secondDirectory,
      firstDirectory,
    ]);
    assert.deepEqual(
      migrations.map(({ name, ordinal }) => ({ name, ordinal })),
      [
        { name: firstName, ordinal: 1 },
        { name: secondName, ordinal: 2 },
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects altered historical migration bytes before database execution", async () => {
  const expectedSha256 = "0".repeat(64);
  const actualSha256 = "1".repeat(64);
  const migrationName = `0001_initial__${expectedSha256}`;
  let executionCount = 0;

  await assert.rejects(
    runPostgresqlMigrationsWithDependencies(
      {
        connectionString: "postgresql://unused",
        migrationDirectories: ["/unused/migrations"],
      },
      {
        discoverMigrationFiles: async () => [
          {
            path: `/unused/${migrationName}.sql`,
            name: migrationName,
            ordinal: 1,
            expectedSha256,
            actualSha256,
          },
        ],
        withLockedSession: async (run) =>
          await run({ query: async () => ({ rows: [] }) }),
        readAppliedNames: async () => [migrationName],
        executeMigrations: async () => {
          executionCount += 1;
          return [];
        },
      },
    ),
    (error: unknown) =>
      error instanceof MigrationChecksumMismatchError &&
      error.migrationName === migrationName &&
      error.expectedSha256 === expectedSha256 &&
      error.actualSha256 === actualSha256,
  );
  assert.equal(executionCount, 0);
});

test("rejects an applied migration list that is not the exact configured prefix", async () => {
  const sha256 = "2".repeat(64);
  const migrationName = `0001_initial__${sha256}`;
  let executionCount = 0;

  await assert.rejects(
    runPostgresqlMigrationsWithDependencies(
      {
        connectionString: "postgresql://unused",
        migrationDirectories: ["/unused/migrations"],
      },
      {
        discoverMigrationFiles: async () => [
          {
            path: `/unused/${migrationName}.sql`,
            name: migrationName,
            ordinal: 1,
            expectedSha256: sha256,
            actualSha256: sha256,
          },
        ],
        withLockedSession: async (run) =>
          await run({ query: async () => ({ rows: [] }) }),
        readAppliedNames: async () => [`0001_unknown__${sha256}`],
        executeMigrations: async () => {
          executionCount += 1;
          return [];
        },
      },
    ),
    /applied migrations are not an exact configured prefix/u,
  );
  assert.equal(executionCount, 0);
});
