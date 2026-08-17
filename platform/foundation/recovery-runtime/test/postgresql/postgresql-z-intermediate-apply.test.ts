import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
  LeaseMutationResult,
  PostgresqlRecoveryLeaseStore,
} from "@bpmn-lean/platform-recovery-runtime";
import type {
  RecoveryLease,
} from "@bpmn-lean/platform-recovery-runtime";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL intermediate lease applies require the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const firstRuntime = createTestRuntime(baseUrl, "recovery-intermediate-first");
  const secondRuntime = createTestRuntime(baseUrl, "recovery-intermediate-second");

  before(async () => {
    await firstRuntime.query({
      text: `
        CREATE TABLE IF NOT EXISTS bpmn_platform.recovery_intermediate_witness (
          witness_id text PRIMARY KEY
        )
      `,
    });
  });

  after(async () => {
    await Promise.all([firstRuntime.close(), secondRuntime.close()]);
  });

  test("a stale worker cannot apply or complete after another worker reclaims", async () => {
    await reset(firstRuntime);
    const first = new PostgresqlRecoveryLeaseStore(firstRuntime);
    const second = new PostgresqlRecoveryLeaseStore(secondRuntime);
    const key = Uint8Array.of(0, 255, 0, 1);
    const [workerA] = await first.claimCandidates({
      ...claim("dispatch", key, "worker-a"),
      leaseDurationMs: 100,
    });
    assert.ok(workerA);
    assert.equal(
      await first.applyWhileOwned(workerA, async (session) => {
        await insertWitness(session, "worker-a-dispatched");
      }),
      LeaseMutationResult.Applied,
    );

    await firstRuntime.query({ text: "SELECT pg_sleep(0.12)" });
    const [workerB] = await second.claimCandidates(claim("dispatch", key, "worker-b"));
    assert.ok(workerB);
    let staleIntermediateCalls = 0;
    assert.equal(
      await first.applyWhileOwned(workerA, async () => {
        staleIntermediateCalls += 1;
      }),
      LeaseMutationResult.LeaseLost,
    );
    assert.equal(staleIntermediateCalls, 0);

    assert.equal(
      await second.complete(workerB, async (session) => {
        await insertWitness(session, "worker-b-final");
      }),
      LeaseMutationResult.Applied,
    );
    let staleFinalCalls = 0;
    assert.equal(
      await first.complete(workerA, async (session) => {
        staleFinalCalls += 1;
        await insertWitness(session, "worker-a-final");
      }),
      LeaseMutationResult.LeaseLost,
    );
    assert.equal(staleFinalCalls, 0);
    assert.deepEqual(await witnessIds(firstRuntime), [
      "worker-a-dispatched",
      "worker-b-final",
    ]);
  });

  test("intermediate callback rollback preserves the exact lease for repeated applies and one final delete", async () => {
    await reset(firstRuntime);
    const store = new PostgresqlRecoveryLeaseStore(firstRuntime);
    const key = Uint8Array.of(2, 0, 255, 0);
    const [current] = await store.claimCandidates(claim("rollback", key, "worker-current"));
    assert.ok(current);
    const beforeFailure = await storedLease(firstRuntime, current);

    await assert.rejects(
      store.applyWhileOwned(current, async (session) => {
        await insertWitness(session, "must-roll-back");
        throw new Error("intermediate failure");
      }),
      /intermediate failure/u,
    );
    assert.deepEqual(await witnessIds(firstRuntime), []);
    assert.deepEqual(await storedLease(firstRuntime, current), beforeFailure);

    assert.equal(
      await store.applyWhileOwned(current, async (session) => {
        await insertWitness(session, "first-apply");
      }),
      LeaseMutationResult.Applied,
    );
    assert.deepEqual(await storedLease(firstRuntime, current), beforeFailure);
    assert.equal(
      await store.applyWhileOwned(current, async (session) => {
        await insertWitness(session, "second-apply");
      }),
      LeaseMutationResult.Applied,
    );
    assert.deepEqual(await storedLease(firstRuntime, current), beforeFailure);
    assert.equal(
      await store.complete(current, async (session) => {
        await insertWitness(session, "final-apply");
      }),
      LeaseMutationResult.Applied,
    );
    let duplicateFinalCalls = 0;
    assert.equal(
      await store.complete(current, async () => {
        duplicateFinalCalls += 1;
      }),
      LeaseMutationResult.LeaseLost,
    );
    assert.equal(duplicateFinalCalls, 0);
    assert.deepEqual(await witnessIds(firstRuntime), [
      "final-apply",
      "first-apply",
      "second-apply",
    ]);
    assert.equal(await storedLease(firstRuntime, current), undefined);
  });
}

function claim(family: string, itemKey: Uint8Array, worker: string) {
  return {
    family,
    candidateKeys: [itemKey],
    batchSize: 1,
    leaseDurationMs: 1_000,
    workerId: new TextEncoder().encode(worker),
    createLeaseToken: randomUUID,
  };
}

async function reset(runtime: PostgresqlRuntime): Promise<void> {
  await runtime.query({
    text: `
      TRUNCATE
        bpmn_platform.recovery_intermediate_witness,
        bpmn_platform.recovery_leases
    `,
  });
}

async function insertWitness(
  session: PostgresqlSession,
  witnessId: string,
): Promise<void> {
  await session.query({
    text: `
      INSERT INTO bpmn_platform.recovery_intermediate_witness (witness_id)
      VALUES ($1)
    `,
    values: [witnessId],
  });
}

async function witnessIds(runtime: PostgresqlRuntime): Promise<readonly string[]> {
  const result = await runtime.query<PostgresqlRow & Readonly<{ witness_id: string }>>({
    text: `
      SELECT witness_id
      FROM bpmn_platform.recovery_intermediate_witness
      ORDER BY witness_id
    `,
  });
  return result.rows.map((row) => row.witness_id);
}

async function storedLease(
  runtime: PostgresqlRuntime,
  lease: RecoveryLease,
): Promise<
  | Readonly<{
      state: string;
      leaseToken: string | null;
      workerId: readonly number[] | null;
      leaseExpiresAtEpochMs: string | null;
      attempt: string;
    }>
  | undefined
> {
  const result = await runtime.query<
    PostgresqlRow & Readonly<{
      state: string;
      lease_token: string | null;
      worker_id: Uint8Array | null;
      lease_expires_at_epoch_ms: string | null;
      attempt_count: string;
    }>
  >({
    text: `
      SELECT
        state,
        lease_token,
        worker_id,
        floor(extract(epoch FROM lease_expires_at) * 1000)::bigint::text
          AS lease_expires_at_epoch_ms,
        attempt_count::text
      FROM bpmn_platform.recovery_leases
      WHERE family = $1 AND item_key = $2
    `,
    values: [lease.family, Buffer.from(lease.itemKey)],
  });
  const row = result.rows[0];
  return row === undefined
    ? undefined
    : {
        state: row.state,
        leaseToken: row.lease_token,
        workerId: row.worker_id === null ? null : [...row.worker_id],
        leaseExpiresAtEpochMs: row.lease_expires_at_epoch_ms,
        attempt: row.attempt_count,
      };
}

function createTestRuntime(
  connectionString: string,
  applicationName: string,
): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName,
    maxConnections: 4,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 5_000,
    statementTimeoutMs: 5_000,
    lockTimeoutMs: 3_000,
    idleInTransactionSessionTimeoutMs: 5_000,
  });
}
