import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import pg from "pg";

import { runPostgresqlMigrations } from "@bpmn-lean/platform-postgresql-runtime/migrations";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

for (const [statement, expectedCode] of [
  ["SELECT 1 / 0;", "22012"],
  ["SELECT * FROM missing_migration_relation;", "42P01"],
] as const) {
  test(`failed migration preserves SQLSTATE ${expectedCode} and closes its locked session`, {
    skip: baseUrl === undefined ? "BPMN_TEST_POSTGRES_URL is not set" : false,
  }, async (context) => {
    assert.ok(baseUrl !== undefined);
    const databaseName = `bpmn_failure_${randomUUID().replaceAll("-", "")}`;
    const databaseUrl = new URL(baseUrl);
    databaseUrl.pathname = `/${databaseName}`;
    const admin = new pg.Client({ connectionString: baseUrl });
    const directory = await mkdtemp(join(tmpdir(), "bpmn-migration-failure-"));
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    try {
      const sql = `CREATE TABLE rolled_back_probe (id integer);\n${statement}\n`;
      const checksum = createHash("sha256").update(sql).digest("hex");
      await writeFile(join(directory, `0001_failure__${checksum}.sql`), sql);
      let failure: unknown;
      try {
        await runPostgresqlMigrations({
          connectionString: databaseUrl.toString(),
          migrationDirectories: [directory],
        });
      } catch (error) {
        failure = error;
      }
      const sessions = await admin.query(
        "SELECT pid FROM pg_stat_activity WHERE datname = $1 AND application_name = $2",
        [databaseName, "bpmn-platform-schema-migration"],
      );
      const outcome = {
        code: failure instanceof pg.DatabaseError ? failure.code : undefined,
        retainedSessions: sessions.rows.length,
      };
      context.diagnostic(JSON.stringify({ expectedCode, ...outcome }));
      assert.deepEqual(outcome, { code: expectedCode, retainedSessions: 0 });

      const probe = new pg.Client({ connectionString: databaseUrl.toString() });
      await probe.connect();
      try {
        assert.equal((await probe.query("SELECT to_regclass('rolled_back_probe') AS relation")).rows[0]?.relation, null);
        assert.equal((await probe.query("SELECT pg_try_advisory_lock(8388001) AS acquired")).rows[0]?.acquired, true);
      } finally {
        await probe.end();
      }
    } finally {
      // Terminate only this test's database sessions so a cleanup regression cannot hang the test runner.
      await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", [databaseName]);
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      await admin.end();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
