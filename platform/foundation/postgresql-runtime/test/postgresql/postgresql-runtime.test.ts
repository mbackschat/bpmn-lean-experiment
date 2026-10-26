import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import pg from "pg";

import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  MigrationChecksumMismatchError,
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

test(
  "PostgreSQL 18 serializes migration commands and hosts bounded transactions",
  { skip: baseUrl === undefined ? "BPMN_TEST_POSTGRES_URL is not set" : false },
  async () => {
    assert.ok(baseUrl !== undefined);
    const databaseName = `bpmn_runtime_${process.pid}_${randomUUID().replaceAll("-", "")}`;
    const databaseUrl = new URL(baseUrl);
    databaseUrl.pathname = `/${databaseName}`;
    const admin = new pg.Client({ connectionString: baseUrl });
    const migrationDirectory = await mkdtemp(
      join(tmpdir(), "bpmn-postgresql-runtime-"),
    );
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);

    try {
      const sql =
        "CREATE TABLE migration_probe (id bigint PRIMARY KEY, note text NOT NULL);\n";
      const checksum = createHash("sha256").update(sql).digest("hex");
      const migrationName = `0001_initial-probe__${checksum}`;
      const migrationPath = join(migrationDirectory, `${migrationName}.sql`);
      await writeFile(migrationPath, sql);

      const results = await Promise.all([
        runPostgresqlMigrations({
          connectionString: databaseUrl.toString(),
          migrationDirectories: [migrationDirectory],
        }),
        runPostgresqlMigrations({
          connectionString: databaseUrl.toString(),
          migrationDirectories: [migrationDirectory],
        }),
      ]);
      assert.deepEqual(
        results.map(({ appliedNames }) => appliedNames),
        [[migrationName], [migrationName]],
      );

      const runtime = createPostgresqlRuntime({
        connectionString: databaseUrl.toString(),
        applicationName: "bpmn-postgresql-runtime-test",
        maxConnections: 2,
        connectionTimeoutMs: 2_000,
        idleTimeoutMs: 2_000,
        queryTimeoutMs: 2_000,
        statementTimeoutMs: 2_000,
        lockTimeoutMs: 2_000,
        idleInTransactionSessionTimeoutMs: 2_000,
      });
      try {
        const version = await runtime.query<
          Readonly<Record<string, unknown>> & Readonly<{ server_version_num: string }>
        >({ text: "SHOW server_version_num" });
        assert.match(version.rows[0]?.server_version_num ?? "", /^18[0-9]{4}$/u);
        await runtime.transaction(async (session) => {
          await session.query({
            text: "INSERT INTO migration_probe (id, note) VALUES ($1, $2)",
            values: [1, "committed"],
          });
        });
        assert.ok((await runtime.databaseClockEpochMs()) > 0);
        const rows = await runtime.query<
          Readonly<Record<string, unknown>> & Readonly<{ note: string }>
        >({ text: "SELECT note FROM migration_probe ORDER BY id" });
        assert.deepEqual(rows.rows.map(({ note }) => note), ["committed"]);
      } finally {
        await runtime.close();
      }

      await writeFile(migrationPath, `${sql}SELECT 1;\n`);
      await assert.rejects(
        runPostgresqlMigrations({
          connectionString: databaseUrl.toString(),
          migrationDirectories: [migrationDirectory],
        }),
        (error: unknown) => error instanceof MigrationChecksumMismatchError,
      );
    } finally {
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      await admin.end();
      await rm(migrationDirectory, { recursive: true, force: true });
    }
  },
);

// Locks the overlay-upgrade suite's teardown failure (hosted runs 40107006304 and 40328497613): without a pool
// error listener, the server ending an idle pooled connection escapes as an uncaught exception, which fails this file.
test(
  "absorbs the server ending an idle pooled connection",
  { skip: baseUrl === undefined ? "BPMN_TEST_POSTGRES_URL is not set" : false },
  async () => {
    await withProbeRuntime(async ({ runtime, admin, applicationName, liveBackends }) => {
      await runtime.query({ text: "SELECT 1" });
      const terminated = await admin.query(
        "SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE application_name = $1",
        [applicationName],
      );
      assert.deepEqual(terminated.rows, [{ terminated: true }]);
      await runtime.close();
      assert.equal(await liveBackends(), 0);
    });
  },
);

async function withProbeRuntime(
  run: (probe: Readonly<{
    runtime: ReturnType<typeof createPostgresqlRuntime>;
    admin: pg.Client;
    applicationName: string;
    liveBackends: () => Promise<number>;
  }>) => Promise<void>,
): Promise<void> {
  assert.ok(baseUrl !== undefined);
  const applicationName = `bpmn-runtime-close-${randomUUID()}`;
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  const runtime = createPostgresqlRuntime({
    connectionString: baseUrl,
    applicationName,
    maxConnections: 2,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 10_000,
    queryTimeoutMs: 2_000,
    statementTimeoutMs: 2_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 2_000,
  });
  const liveBackends = async (): Promise<number> => (await admin.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1",
    [applicationName],
  )).rows[0]?.count ?? -1;
  try {
    await run({ runtime, admin, applicationName, liveBackends });
  } finally {
    await runtime.close();
    await admin.end();
  }
}
