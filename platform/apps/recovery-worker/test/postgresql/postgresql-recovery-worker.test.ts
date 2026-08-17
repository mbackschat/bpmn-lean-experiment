import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type {
  PostgresqlRow,
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";
import {
  LeaseMutationResult,
  PostgresqlRecoveryLeaseStore,
} from "@bpmn-lean/platform-recovery-runtime";

import {
  checkRecoveryWorkerReadiness,
  RECOVERY_WORKER_SCHEMA_EPOCH,
} from "@bpmn-lean/platform-recovery-worker";

const connectionString = process.env.BPMN_TEST_POSTGRES_URL;

if (connectionString === undefined) {
  test("recovery-worker PostgreSQL requires the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const first = createRuntime(connectionString, "recovery-worker-one");
  const second = createRuntime(connectionString, "recovery-worker-two");

  before(async () => {
    await runPostgresqlMigrations({
      connectionString,
      migrationDirectories: migrationDirectories(),
    });
    await first.query({
      text: `
        CREATE TABLE IF NOT EXISTS bpmn_platform.recovery_worker_test_facts (
          fact_id text PRIMARY KEY
        );
        TRUNCATE bpmn_platform.recovery_worker_test_facts,
          bpmn_platform.recovery_leases
      `,
    });
  });

  after(async () => {
    try {
      await first.query({
        text: "DROP TABLE IF EXISTS bpmn_platform.recovery_worker_test_facts",
      });
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });

  test("readiness stays bounded with a large retained population", async (context) => {
    const retainedPopulation = 5_000;
    await insertRetainedProcessPopulation(first, retainedPopulation);
    let engineConnections = 0;
    const startedAt = performance.now();
    await checkRecoveryWorkerReadiness({
      runtime: first,
      engineRuntime: {
        ensureConnected: async () => { engineConnections += 1; },
      },
      workerId: new TextEncoder().encode("worker\u0000one"),
      leaseDurationMs: 30_000,
      createLeaseToken: randomUUID,
      createReadinessItemKey: () => new TextEncoder().encode(randomUUID()),
    });
    assert.equal(engineConnections, 1);
    const epoch = await first.query({
      text: `
        SELECT epoch
        FROM bpmn_platform_meta.schema_epoch
        WHERE singleton = true
      `,
    });
    assert.deepEqual(epoch.rows, [{ epoch: RECOVERY_WORKER_SCHEMA_EPOCH }]);
    const readinessLeases = await first.query({
      text: `
        SELECT count(*)::integer AS count
        FROM bpmn_platform.recovery_leases
        WHERE family = 'recovery-worker.readiness'
      `,
    });
    assert.deepEqual(readinessLeases.rows, [{ count: 0 }]);
    context.diagnostic(JSON.stringify({
      evidence: "horizon-1-recovery-bounded-readiness",
      postgresqlMajor: 18,
      schemaEpoch: RECOVERY_WORKER_SCHEMA_EPOCH,
      retainedPopulation,
      workerReplicas: 1,
      batchSize: 1,
      leaseDurationMs: 30_000,
      wallTimeMs: Math.ceil(performance.now() - startedAt),
    }));
  });

  test("two workers claim disjoint bounded work and reclaim one dead lease without lost facts", async (context) => {
    const startedAt = performance.now();
    await first.query({
      text: `
        TRUNCATE bpmn_platform.recovery_worker_test_facts,
          bpmn_platform.recovery_leases
      `,
    });
    const firstKey = new TextEncoder().encode("candidate\u0000one");
    const secondKey = new TextEncoder().encode("candidate\u0000two");
    const candidateKeys = [firstKey, secondKey];
    const firstStore = new PostgresqlRecoveryLeaseStore(first);
    const secondStore = new PostgresqlRecoveryLeaseStore(second);
    const [firstClaims, secondClaims] = await Promise.all([
      firstStore.claimCandidates(claim(candidateKeys, "worker-one", 100)),
      secondStore.claimCandidates(claim(candidateKeys, "worker-two", 100)),
    ]);
    assert.equal(firstClaims.length, 1);
    assert.equal(secondClaims.length, 1);
    const original = firstClaims[0]!;
    const survivor = secondClaims[0]!;
    assert.notDeepEqual(original.itemKey, survivor.itemKey);
    assert.equal(
      await secondStore.complete(survivor, async (session) => {
        await insertFact(session, "survivor");
      }),
      LeaseMutationResult.Applied,
    );

    await first.query({ text: "SELECT pg_sleep(0.12)" });
    const [reclaimed] = await secondStore.claimCandidates(
      claim([original.itemKey], "reclaimer", 30_000),
    );
    assert.ok(reclaimed);
    assert.equal(reclaimed.attempt, 2);
    assert.deepEqual(reclaimed.itemKey, original.itemKey);

    let staleCallbacks = 0;
    assert.equal(
      await firstStore.complete(original, async (session) => {
        staleCallbacks += 1;
        await insertFact(session, "stale");
      }),
      LeaseMutationResult.LeaseLost,
    );
    assert.equal(staleCallbacks, 0);
    assert.equal(
      await secondStore.complete(reclaimed, async (session) => {
        await insertFact(session, "reclaimed");
      }),
      LeaseMutationResult.Applied,
    );
    const facts = await first.query({
      text: "SELECT fact_id FROM bpmn_platform.recovery_worker_test_facts ORDER BY fact_id",
    });
    assert.deepEqual(facts.rows, [
      { fact_id: "reclaimed" },
      { fact_id: "survivor" },
    ]);
    const database = await databaseFacts(first);
    context.diagnostic(JSON.stringify({
      evidence: "horizon-1-recovery-workers",
      ...database,
      workerReplicas: 2,
      candidateCount: candidateKeys.length,
      batchSize: 1,
      initialLeaseDurationMs: 100,
      reclaimLeaseDurationMs: 30_000,
      wallTimeMs: Math.ceil(performance.now() - startedAt),
    }));
  });
}

function createRuntime(url: string, applicationName: string): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString: url,
    applicationName,
    maxConnections: 4,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 4_000,
    statementTimeoutMs: 4_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 4_000,
  });
}

function claim(
  candidateKeys: readonly Uint8Array[],
  workerId: string,
  leaseDurationMs: number,
) {
  return {
    family: "recovery-worker.real-candidate",
    candidateKeys,
    batchSize: 1,
    leaseDurationMs,
    workerId: new TextEncoder().encode(workerId),
    createLeaseToken: randomUUID,
  };
}

async function databaseFacts(runtime: PostgresqlRuntime): Promise<Readonly<{
  postgresqlMajor: number;
  schemaEpoch: number;
}>> {
  const result = await runtime.query<PostgresqlRow & Readonly<{
    postgresql_major: number;
    schema_epoch: number;
  }>>({
    text: `
      SELECT
        current_setting('server_version_num')::integer / 10000 AS postgresql_major,
        epoch::integer AS schema_epoch
      FROM bpmn_platform_meta.schema_epoch
      WHERE singleton = true
    `,
  });
  assert.deepEqual(result.rows, [{
    postgresql_major: 18,
    schema_epoch: RECOVERY_WORKER_SCHEMA_EPOCH,
  }]);
  return {
    postgresqlMajor: result.rows[0]!.postgresql_major,
    schemaEpoch: result.rows[0]!.schema_epoch,
  };
}

async function insertRetainedProcessPopulation(
  runtime: PostgresqlRuntime,
  count: number,
): Promise<void> {
  await runtime.query({
    text: `
      WITH retained_head AS (
        SELECT population_head
        FROM bpmn_platform.operate_incident_snapshot_control
        WHERE singleton = true
        FOR UPDATE
      ), inserted AS (
        INSERT INTO bpmn_platform.operate_process_instances (
          process_instance_id, process_id, definition_version, source_sha256,
          public_identity_json, process_locator, observation, population_ordinal
        )
        SELECT
          convert_to('worker-readiness-' || item::text, 'UTF8'),
          convert_to('large-retained-definition', 'UTF8'),
          1,
          repeat('0', 64),
          '{}',
          convert_to('worker-readiness-locator-' || item::text, 'UTF8'),
          'closed',
          retained_head.population_head + item
        FROM generate_series(1, $1::integer) AS item
        CROSS JOIN retained_head
        RETURNING population_ordinal
      )
      UPDATE bpmn_platform.operate_incident_snapshot_control
      SET population_head = population_head + (SELECT count(*) FROM inserted)
      WHERE singleton = true
    `,
    values: [count],
  });
}

async function insertFact(session: PostgresqlSession, factId: string): Promise<void> {
  await session.query({
    text: `
      INSERT INTO bpmn_platform.recovery_worker_test_facts (fact_id)
      VALUES ($1)
    `,
    values: [factId],
  });
}

function migrationDirectories(): readonly string[] {
  return [
    "../../../../foundation/artifact-store/migrations",
    "../../../../modules/definitions/migrations",
    "../../../../modules/operate/migrations",
    "../../../../modules/work/migrations",
    "../../../../foundation/audit/migrations",
    "../../../../foundation/recovery-runtime/migrations",
  ].map((path) => fileURLToPath(new URL(path, import.meta.url)));
}
