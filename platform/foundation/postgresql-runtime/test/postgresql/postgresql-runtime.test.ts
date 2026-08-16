import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import pg from "pg";

import {
  createPostgresqlRuntime,
} from "../../dist/index.js";
import {
  MigrationChecksumMismatchError,
  runPostgresqlMigrations,
} from "../../dist/postgresql-migrations.js";

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
