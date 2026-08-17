import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type {
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
} from "../../dist/readiness.js";

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

  test("readiness proves PostgreSQL 18, exact epoch 9, disposable DML, and one engine connection", async () => {
    let engineConnections = 0;
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
  });

  test("two runtimes contend, reclaim a dead lease, and reject stale completion without duplicate facts", async () => {
    await first.query({
      text: `
        TRUNCATE bpmn_platform.recovery_worker_test_facts,
          bpmn_platform.recovery_leases
      `,
    });
    const key = new TextEncoder().encode("candidate\u0000identity");
    const firstStore = new PostgresqlRecoveryLeaseStore(first);
    const secondStore = new PostgresqlRecoveryLeaseStore(second);
    const [firstClaims, secondClaims] = await Promise.all([
      firstStore.claimCandidates(claim(key, "worker-one", 100)),
      secondStore.claimCandidates(claim(key, "worker-two", 100)),
    ]);
    assert.equal(firstClaims.length + secondClaims.length, 1);
    const originalStore = firstClaims.length === 1 ? firstStore : secondStore;
    const reclaimStore = firstClaims.length === 1 ? secondStore : firstStore;
    const original = firstClaims[0] ?? secondClaims[0]!;

    await first.query({ text: "SELECT pg_sleep(0.12)" });
    const [reclaimed] = await reclaimStore.claimCandidates(
      claim(key, "reclaimer", 30_000),
    );
    assert.ok(reclaimed);
    assert.equal(reclaimed.attempt, 2);
    assert.deepEqual(reclaimed.itemKey, key);

    let staleCallbacks = 0;
    assert.equal(
      await originalStore.complete(original, async (session) => {
        staleCallbacks += 1;
        await insertFact(session, "stale");
      }),
      LeaseMutationResult.LeaseLost,
    );
    assert.equal(staleCallbacks, 0);
    assert.equal(
      await reclaimStore.complete(reclaimed, async (session) => {
        await insertFact(session, "current");
      }),
      LeaseMutationResult.Applied,
    );
    const facts = await first.query({
      text: "SELECT fact_id FROM bpmn_platform.recovery_worker_test_facts ORDER BY fact_id",
    });
    assert.deepEqual(facts.rows, [{ fact_id: "current" }]);
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

function claim(key: Uint8Array, workerId: string, leaseDurationMs: number) {
  return {
    family: "recovery-worker.real-candidate",
    candidateKeys: [key],
    batchSize: 1,
    leaseDurationMs,
    workerId: new TextEncoder().encode(workerId),
    createLeaseToken: randomUUID,
  };
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
