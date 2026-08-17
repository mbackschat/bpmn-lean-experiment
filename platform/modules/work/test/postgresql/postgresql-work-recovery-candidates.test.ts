import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type {
  PostgresqlQuery,
  PostgresqlQueryResult,
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";
import {
  PostgresqlWorkRecoveryCandidateSource,
  WorkPostgresqlRecoveryFamily,
} from "@bpmn-lean/platform-work";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL Work recovery candidates require the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createPostgresqlRuntime({
    connectionString: baseUrl,
    applicationName: "work-recovery-candidates",
    maxConnections: 4,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 4_000,
    statementTimeoutMs: 4_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 4_000,
  });

  before(async () => {
    await runPostgresqlMigrations({
      connectionString: baseUrl,
      migrationDirectories: [
        fileURLToPath(new URL("../../../../foundation/artifact-store/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../definitions/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../operate/migrations", import.meta.url)),
        fileURLToPath(new URL("../../migrations", import.meta.url)),
      ],
    });
  });

  after(async () => {
    await runtime.close();
  });

  test("discovers bounded nonclosed Work projection candidates in exact byte order", async () => {
    await resetDatabase(runtime);
    await insertProcess(runtime, "é😀\u0000z", "active");
    await insertProcess(runtime, "a\u0000z", "indeterminate");
    await insertProcess(runtime, "a", "active");
    await insertProcess(runtime, "closed", "closed");

    const source = new PostgresqlWorkRecoveryCandidateSource(runtime);
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(WorkPostgresqlRecoveryFamily.WorkSnapshot, 2)),
      ["a", "a\u0000z"],
    );
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(WorkPostgresqlRecoveryFamily.WorkSnapshot, 10)),
      ["a", "a\u0000z", "é😀\u0000z"],
    );
  });

  test("leases one fixed Work-audit stream key instead of individual ordinals", async () => {
    await resetDatabase(runtime);
    await insertAudit(runtime, 1, "event-1", "action-1");
    await insertAudit(runtime, 2, "event-2", "action-2");

    const source = new PostgresqlWorkRecoveryCandidateSource(runtime);
    const first = await source.listCandidateKeys(WorkPostgresqlRecoveryFamily.WorkAudit, 99);
    assert.deepEqual(textKeys(first), ["stream"]);
    assert.equal(Buffer.isBuffer(first[0]), false);
    first[0]![0] = 0;
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(WorkPostgresqlRecoveryFamily.WorkAudit, 1)),
      ["stream"],
    );

    await runtime.query({
      text: "UPDATE bpmn_platform.work_audit_outbox SET delivered = true",
    });
    assert.deepEqual(
      await source.listCandidateKeys(WorkPostgresqlRecoveryFamily.WorkAudit, 1),
      [],
    );
  });

  test("rejects unsafe bounds and unknown families before issuing SQL", async () => {
    let queryCount = 0;
    const source = new PostgresqlWorkRecoveryCandidateSource({
      query: async <Row extends PostgresqlRow = PostgresqlRow>(
        query: PostgresqlQuery,
      ): Promise<PostgresqlQueryResult<Row>> => {
        queryCount += 1;
        return await runtime.query<Row>(query);
      },
      transaction: async (run) => await runtime.transaction(run),
      withDedicatedSession: async (run) => await runtime.withDedicatedSession(run),
      databaseClockEpochMs: async () => await runtime.databaseClockEpochMs(),
      close: async () => await runtime.close(),
    });
    await assert.rejects(
      source.listCandidateKeys(
        WorkPostgresqlRecoveryFamily.WorkAudit,
        1_001,
      ),
      /at most 1000/u,
    );
    await assert.rejects(
      source.listCandidateKeys("future-family" as WorkPostgresqlRecoveryFamily, 1),
      /unknown Work PostgreSQL recovery family/u,
    );
    assert.equal(queryCount, 0);
    await source.listCandidateKeys(WorkPostgresqlRecoveryFamily.WorkAudit, 1);
    assert.equal(queryCount, 1);
  });
}

async function resetDatabase(runtime: PostgresqlRuntime): Promise<void> {
  await runtime.query({
    text: `
      TRUNCATE
        bpmn_platform.work_audit_outbox,
        bpmn_platform.work_completions,
        bpmn_platform.work_actions,
        bpmn_platform.work_claims,
        bpmn_platform.work_processes
    `,
  });
  await runtime.query({
    text: `
      UPDATE bpmn_platform.work_audit_source_head
      SET head = 0 WHERE singleton = true
    `,
  });
}

async function insertProcess(
  runtime: PostgresqlRuntime,
  processInstanceId: string,
  observation: "active" | "closed" | "indeterminate",
): Promise<void> {
  await runtime.query({
    text: `
      INSERT INTO bpmn_platform.work_processes (
        process_instance_id, public_instance_json, work_locator, observation
      ) VALUES ($1, '{}', $2, $3)
    `,
    values: [
      Buffer.from(processInstanceId, "utf8"),
      Buffer.from(`locator-${processInstanceId}`, "utf8"),
      observation,
    ],
  });
}

async function insertAudit(
  runtime: PostgresqlRuntime,
  ordinal: number,
  eventId: string,
  actionId: string,
): Promise<void> {
  await runtime.query({
    text: `
      INSERT INTO bpmn_platform.work_audit_outbox (
        ordinal, event_id, action_id, action_outcome, event_json, delivered
      ) VALUES ($1, $2, $3, 'claimed', '{}', false)
    `,
    values: [ordinal, Buffer.from(eventId, "utf8"), Buffer.from(actionId, "utf8")],
  });
}

function textKeys(keys: readonly Uint8Array[]): readonly string[] {
  return keys.map((key) => Buffer.from(key).toString("utf8"));
}
