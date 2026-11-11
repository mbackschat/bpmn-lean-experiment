import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type {
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;
const executablePath = fileURLToPath(new URL("../../dist/main.js", import.meta.url));
const expectedMigrationNames = [
  "0001_artifact-store__2c11c29d4b0093575693e0c4986d40eca958e3b42a0860484fe2be82abbd0a28",
  "0002_definitions__42024e51f714ff4b391589bd0457a407ec1549848fe108b08d4d37bf13805302",
  "0003_operate__6ca859cfc09c957bfa8a864724f53ca5cb95fa5eccdad2d3fbbb58fb2cee02ed",
  "0004_work__72d8506b3ff9553dba17e54679cc4793432863d1052eb8f4fc213b78e8abee61",
  "0005_audit__df6b5d0e263678efefd23f2c92215d79d08634ac7fe0188386ff11e43f3878de",
  "0006_recovery-leases__f09ab3db8bea84936c0695601288a26b01ba2268b6db00df82c8f9ca8baeceb9",
  "0007_work-snapshot-projections__7ce3355fe4f46448e40657fe33eec4571eb4ebe881f1bec52b23cd3a699c8238",
  "0008_incident-snapshot-projections__a3c73e69925839b8194d987d96786190ee9829fb981c9c66bb7ded72999a6e43",
  "0009_projection-freshness__4be40408ea54a7eff181520e52acfa0d4685b76ce141d5b6f9b39b844e849ea9",
  "0010_definitions-process-locator__ee9f0d01f34e89b0fcc0e28a38eb1446badb9d025e6d780f2e2f1971131db611",
  "0011_definitions-start-command__681798219edab00a928b6289190b823aff6836027d40012d55707cb1ef332b8d",
  "0012_failed-process-publication__b0668bf6f541e5dd02f76021c9ffa63861e937ed430cb216e5f9fb7865c35a9a",
  "0013_definitions-source-overlay__ff4e6100a8c2623babacdad43ca474a49e29598b1ef37687ea2d6b23239d943b",
  "0014_definitions-engine-registration__06aabace6867ec7acab06c22aefb07cb6416bf1119c9a09d63839e6600611fa5",
  "0015_definitions-schedule-occurrence__d29893488bac6eb463ae1dad0d29b80d69e01409019f8214976f7e60b100273b",
] as const;
const requiredRelations = [
  "bpmn_platform.exact_artifacts",
  "bpmn_platform.definition_versions",
  "bpmn_platform.operate_process_instances",
  "bpmn_platform.operate_incident_snapshot_control",
  "bpmn_platform.work_processes",
  "bpmn_platform.work_snapshot_control",
  "bpmn_platform.audit_work_events",
  "bpmn_platform.audit_incident_events",
  "bpmn_platform.recovery_leases",
] as const;

function runtime(connectionString: string, applicationName: string): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName,
    maxConnections: 2,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 5_000,
    statementTimeoutMs: 5_000,
    lockTimeoutMs: 5_000,
    idleInTransactionSessionTimeoutMs: 5_000,
  });
}

async function runMigrationApplication(connectionString: string): Promise<{
  readonly stdout: string;
  readonly stderr: string;
}> {
  return await new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [executablePath],
      {
        cwd: tmpdir(),
        encoding: "utf8",
        env: {
          ...process.env,
          PLATFORM_POSTGRESQL_MIGRATION_URL: connectionString,
        },
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`migration application failed with output ${stdout}${stderr}`));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

test(
  "the explicit application applies the closed PostgreSQL 18 catalog idempotently",
  { skip: baseUrl === undefined ? "BPMN_TEST_POSTGRES_URL is not set" : false },
  async () => {
    assert.ok(baseUrl !== undefined);
    const databaseName = `bpmn_platform_migrate_${process.pid}_${randomUUID().replaceAll("-", "")}`;
    const databaseUrl = new URL(baseUrl);
    databaseUrl.pathname = `/${databaseName}`;
    const admin = runtime(baseUrl, "bpmn-platform-migration-test-admin");
    await admin.query({ text: `CREATE DATABASE "${databaseName}"` });

    try {
      const first = await runMigrationApplication(databaseUrl.toString());
      assert.deepEqual(first, {
        stdout: `${expectedMigrationNames.length} PostgreSQL migrations are applied.\n`,
        stderr: "",
      });

      const database = runtime(
        databaseUrl.toString(),
        "bpmn-platform-migration-test-verifier",
      );
      try {
        const version = await database.query<
          Readonly<Record<string, unknown>> & Readonly<{ server_version_num: string }>
        >({ text: "SHOW server_version_num" });
        assert.match(version.rows[0]?.server_version_num ?? "", /^18[0-9]{4}$/u);

        const applied = await database.query<
          Readonly<Record<string, unknown>> & Readonly<{ name: string }>
        >({
          text: 'SELECT name FROM "bpmn_platform_meta"."schema_migrations" ORDER BY run_on, id',
        });
        assert.deepEqual(applied.rows.map(({ name }) => name), expectedMigrationNames);

        const schemaEpoch = await database.query<
          Readonly<Record<string, unknown>> & Readonly<{ epoch: number }>
        >({
          text: `
            SELECT epoch
            FROM "bpmn_platform_meta"."schema_epoch"
            WHERE singleton = true
          `,
        });
        assert.deepEqual(schemaEpoch.rows, [{ epoch: 15 }]);

        const scheduleLocatorColumns = await database.query<
          Readonly<Record<string, unknown>> & Readonly<{ column_name: string }>
        >({
          text: `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'bpmn_platform'
              AND table_name = 'definition_schedules'
              AND column_name IN (
                'execution_workflow_id',
                'first_run_id',
                'process_locator'
              )
            ORDER BY column_name
          `,
        });
        assert.deepEqual(
          scheduleLocatorColumns.rows.map(({ column_name }) => column_name),
          ["process_locator"],
        );

        const scheduleOccurrenceColumns = await database.query<
          Readonly<Record<string, unknown>> & Readonly<{
            column_name: string;
            is_nullable: string;
          }>
        >({
          text: `
            SELECT column_name, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'bpmn_platform'
              AND table_name = 'definition_schedules'
              AND column_name IN (
                'activation_at',
                'configured_workflow_id_base',
                'refusal_code',
                'timer_duration_ms'
              )
            ORDER BY column_name
          `,
        });
        assert.deepEqual(
          scheduleOccurrenceColumns.rows.map(({ column_name, is_nullable }) => ({
            column_name,
            is_nullable,
          })),
          [
            { column_name: "refusal_code", is_nullable: "YES" },
            { column_name: "timer_duration_ms", is_nullable: "YES" },
          ],
        );

        const relations = await database.query<
          Readonly<Record<string, unknown>> & Readonly<{
            relation_name: string;
            resolved_name: string | null;
          }>
        >({
          text: `
            SELECT relation_name, to_regclass(relation_name)::text AS resolved_name
            FROM unnest($1::text[]) AS relation_name
            ORDER BY relation_name
          `,
          values: [[...requiredRelations]],
        });
        assert.deepEqual(
          relations.rows.map(({ relation_name, resolved_name }) => ({
            relation_name,
            resolved_name,
          })),
          [...requiredRelations]
            .sort()
            .map((relationName) => ({
              relation_name: relationName,
              resolved_name: relationName,
            })),
        );
      } finally {
        await database.close();
      }

      const second = await runMigrationApplication(databaseUrl.toString());
      assert.deepEqual(second, first);
    } finally {
      await admin.query({ text: `DROP DATABASE "${databaseName}" WITH (FORCE)` });
      await admin.close();
    }
  },
);
