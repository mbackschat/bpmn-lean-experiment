import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
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
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";
import {
  LeaseMutationResult,
  PostgresqlRecoveryLeaseStore,
} from "@bpmn-lean/platform-recovery-runtime";
import type {
  RecoveryLease,
} from "@bpmn-lean/platform-recovery-runtime";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL recovery leases require the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const firstRuntime = createTestRuntime(baseUrl, "recovery-first");
  const secondRuntime = createTestRuntime(baseUrl, "recovery-second");
  let migrationPrefixDirectory: string | undefined;

  before(async () => {
    migrationPrefixDirectory = await createMigrationPrefixThrough0005();
    await runPostgresqlMigrations({
      connectionString: baseUrl,
      migrationDirectories: [migrationPrefixDirectory],
    });
  });

  test("migration 0006 advances only the exact singleton epoch-1 prefix", async () => {
    assert.equal(await schemaEpoch(firstRuntime), 1);

    await firstRuntime.query({
      text: "DELETE FROM bpmn_platform_meta.schema_epoch WHERE singleton = true",
    });
    await assert.rejects(
      executeRecoveryMigrationSql(firstRuntime),
      /unexpected schema epoch/u,
    );
    await firstRuntime.query({
      text: `
        INSERT INTO bpmn_platform_meta.schema_epoch (singleton, epoch)
        VALUES (true, 1)
      `,
    });

    await firstRuntime.query({
      text: `
        ALTER TABLE bpmn_platform_meta.schema_epoch
        DROP CONSTRAINT schema_epoch_epoch_check
      `,
    });
    await firstRuntime.query({
      text: `
        ALTER TABLE bpmn_platform_meta.schema_epoch
        ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch IN (1, 2))
      `,
    });
    await firstRuntime.query({
      text: "UPDATE bpmn_platform_meta.schema_epoch SET epoch = 2 WHERE singleton = true",
    });
    await assert.rejects(
      executeRecoveryMigrationSql(firstRuntime),
      /unexpected schema epoch/u,
    );
    await firstRuntime.query({
      text: "UPDATE bpmn_platform_meta.schema_epoch SET epoch = 1 WHERE singleton = true",
    });
    await firstRuntime.query({
      text: `
        ALTER TABLE bpmn_platform_meta.schema_epoch
        DROP CONSTRAINT schema_epoch_epoch_check
      `,
    });
    await assert.rejects(
      executeRecoveryMigrationSql(firstRuntime),
      /schema_epoch_epoch_check/u,
    );
    await firstRuntime.query({
      text: `
        ALTER TABLE bpmn_platform_meta.schema_epoch
        ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 1)
      `,
    });

    assert.ok(migrationPrefixDirectory !== undefined);
    await applyRecoveryMigration(baseUrl, migrationPrefixDirectory);
    assert.equal(await schemaEpoch(firstRuntime), 6);
    await firstRuntime.query({
      text: `
        CREATE TABLE IF NOT EXISTS bpmn_platform.recovery_test_witness (
          witness_id text PRIMARY KEY
        )
      `,
    });
  });

  after(async () => {
    await Promise.all([firstRuntime.close(), secondRuntime.close()]);
    if (migrationPrefixDirectory !== undefined) {
      await rm(migrationPrefixDirectory, { recursive: true, force: true });
    }
  });

  test("two independent runtimes deterministically grant one current lease", async () => {
    await reset(firstRuntime);
    const seedStore = new PostgresqlRecoveryLeaseStore(firstRuntime);
    const key = Uint8Array.of(0, 1, 0, 255);
    const [seed] = await seedStore.claimCandidates(claim("shared", [key], "seed"));
    assert.ok(seed);
    await seedStore.retry(seed, { retryDelayMs: 0 });

    const barrier = new QueryBarrier(2);
    const first = new PostgresqlRecoveryLeaseStore(withClaimBarrier(firstRuntime, barrier));
    const second = new PostgresqlRecoveryLeaseStore(withClaimBarrier(secondRuntime, barrier));
    const [firstClaims, secondClaims] = await Promise.all([
      first.claimCandidates(claim("shared", [key], "worker-a")),
      second.claimCandidates(claim("shared", [key], "worker-b")),
    ]);

    assert.equal(firstClaims.length + secondClaims.length, 1);
    const winner = firstClaims[0] ?? secondClaims[0];
    assert.ok(winner);
    assert.equal(winner.attempt, 2);
    await seedStore.complete(winner, async () => undefined);
  });

  test("database-clock expiry permits reclaim and rejects stale completion atomically", async () => {
    await reset(firstRuntime);
    const first = new PostgresqlRecoveryLeaseStore(firstRuntime);
    const second = new PostgresqlRecoveryLeaseStore(secondRuntime);
    const key = Uint8Array.of(2, 0, 2);
    const [workerA] = await first.claimCandidates({
      ...claim("expiry", [key], "worker-a"),
      leaseDurationMs: 100,
    });
    assert.ok(workerA);
    assert.deepEqual(
      await second.claimCandidates(claim("expiry", [key], "worker-b")),
      [],
    );

    await firstRuntime.query({ text: "SELECT pg_sleep(0.12)" });
    const [workerB] = await second.claimCandidates(claim("expiry", [key], "worker-b"));
    assert.ok(workerB);
    assert.equal(workerB.attempt, 2);

    let staleApplyCalls = 0;
    assert.equal(
      await first.complete(workerA, async (session) => {
        staleApplyCalls += 1;
        await insertWitness(session, "stale");
      }),
      LeaseMutationResult.LeaseLost,
    );
    assert.equal(staleApplyCalls, 0);
    assert.equal(await witnessCount(firstRuntime), 0);

    await assert.rejects(
      second.complete(workerB, async (session) => {
        await insertWitness(session, "rolled-back");
        throw new Error("rollback outcome");
      }),
      /rollback outcome/u,
    );
    assert.equal(await witnessCount(firstRuntime), 0);
    assert.equal(
      await second.complete(workerB, async (session) => {
        await insertWitness(session, "current");
      }),
      LeaseMutationResult.Applied,
    );
    assert.equal(await witnessCount(firstRuntime), 1);
  });

  test("preserves supplied order, byte identity, retry delay, attempts, and permanent exclusion", async () => {
    await reset(firstRuntime);
    const store = new PostgresqlRecoveryLeaseStore(firstRuntime);
    const firstKey = Uint8Array.of(3, 0, 255);
    const secondKey = Uint8Array.of(1, 0, 254);
    const thirdKey = Uint8Array.of(2, 0, 253);
    const workerId = Uint8Array.of(9, 0, 8);
    const claimPromise = store.claimCandidates({
      ...claim("ordered", [firstKey, secondKey, thirdKey], "unused"),
      batchSize: 2,
      workerId,
    });
    firstKey.fill(99);
    workerId.fill(99);
    const leases = await claimPromise;
    assert.deepEqual(
      leases.map((lease) => [...lease.itemKey]),
      [[3, 0, 255], [1, 0, 254]],
    );
    assert.deepEqual([...leases[0]!.workerId], [9, 0, 8]);

    const retried = detachedLease(leases[0]!);
    leases[0]!.itemKey.fill(77);
    leases[0]!.workerId.fill(77);
    assert.equal(
      await store.retry(retried, { retryDelayMs: 100 }),
      LeaseMutationResult.Applied,
    );
    assert.deepEqual(
      await store.claimCandidates(claim("ordered", [retried.itemKey], "retry-worker")),
      [],
    );
    await firstRuntime.query({ text: "SELECT pg_sleep(0.12)" });
    const [secondAttempt] = await store.claimCandidates(
      claim("ordered", [retried.itemKey], "retry-worker"),
    );
    assert.ok(secondAttempt);
    assert.equal(secondAttempt.attempt, 2);
    assert.equal(
      await store.fail(secondAttempt, {
        failureCode: "permanent",
        failureEvidence: Uint8Array.of(0, 255, 0),
      }),
      LeaseMutationResult.Applied,
    );
    const failedRow = await firstRuntime.query<
      PostgresqlRow & Readonly<{
        state: string;
        failure_code: string;
        failure_evidence: Uint8Array;
      }>
    >({
      text: `
        SELECT state, failure_code, failure_evidence
        FROM bpmn_platform.recovery_leases
        WHERE family = $1 AND item_key = $2
      `,
      values: ["ordered", Buffer.from(retried.itemKey)],
    });
    assert.equal(failedRow.rows[0]?.state, "failed");
    assert.equal(failedRow.rows[0]?.failure_code, "permanent");
    assert.deepEqual(
      [...(failedRow.rows[0]?.failure_evidence ?? [])],
      [0, 255, 0],
    );

    const unrelatedKey = Uint8Array.of(4, 0, 252);
    const [unrelated] = await store.claimCandidates(
      claim("ordered", [retried.itemKey, unrelatedKey], "other-worker", 1),
    );
    assert.ok(unrelated);
    assert.deepEqual([...unrelated.itemKey], [...unrelatedKey]);
    assert.deepEqual(
      await store.claimCandidates(claim("ordered", [retried.itemKey], "other-worker")),
      [],
    );
    const [otherFamily] = await store.claimCandidates(
      claim("other-family", [Uint8Array.of(0, 7, 0)], "family-worker", 1),
    );
    assert.ok(otherFamily);
    await store.complete(unrelated, async () => undefined);
    await store.complete(leases[1]!, async () => undefined);
    await store.complete(otherFamily, async () => undefined);
  });

  test("a locked first candidate cannot block an unrelated candidate", async () => {
    await reset(firstRuntime);
    const store = new PostgresqlRecoveryLeaseStore(firstRuntime);
    const contender = new PostgresqlRecoveryLeaseStore(secondRuntime);
    const lockedKey = Uint8Array.of(5);
    const freeKey = Uint8Array.of(6);
    const seeded = await store.claimCandidates(
      claim("locks", [lockedKey, freeKey], "seed", 2),
    );
    for (const lease of seeded) {
      await store.retry(lease, { retryDelayMs: 0 });
    }

    let releaseLock: (() => void) | undefined;
    let reportLocked: (() => void) | undefined;
    const locked = new Promise<void>((resolve) => {
      reportLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockTransaction = firstRuntime.transaction(async (session) => {
      await session.query({
        text: `
          SELECT item_key FROM bpmn_platform.recovery_leases
          WHERE family = $1 AND item_key = $2
          FOR UPDATE
        `,
        values: ["locks", Buffer.from(lockedKey)],
      });
      reportLocked?.();
      await release;
    });
    await locked;

    const [claimed] = await contender.claimCandidates(
      claim("locks", [lockedKey, freeKey], "contender", 1),
    );
    assert.ok(claimed);
    assert.deepEqual([...claimed.itemKey], [...freeKey]);
    releaseLock?.();
    await lockTransaction;
    await contender.complete(claimed, async () => undefined);
  });

  test("relational state and safe-attempt constraints reject corrupt rows", async () => {
    await reset(firstRuntime);
    await assert.rejects(
      firstRuntime.query({
        text: `
          INSERT INTO bpmn_platform.recovery_leases (
            family, item_key, state, next_attempt_at, attempt_count
          ) VALUES ($1, $2, 'leased', clock_timestamp(), 0)
        `,
        values: ["corrupt", Buffer.from([1])],
      }),
      /recovery_leases_state_shape/u,
    );
    await assert.rejects(
      firstRuntime.query({
        text: `
          INSERT INTO bpmn_platform.recovery_leases (
            family, item_key, state, next_attempt_at, attempt_count
          ) VALUES ($1, $2, 'ready', clock_timestamp(), 9007199254740992)
        `,
        values: ["corrupt", Buffer.from([2])],
      }),
      /recovery_leases_attempt_bounds/u,
    );
  });
}

function claim(
  family: string,
  candidateKeys: readonly Uint8Array[],
  worker: string,
  batchSize = 10,
) {
  return {
    family,
    candidateKeys,
    batchSize,
    leaseDurationMs: 1_000,
    workerId: new TextEncoder().encode(worker),
    createLeaseToken: randomUUID,
  };
}

function detachedLease(lease: RecoveryLease): RecoveryLease {
  return {
    ...lease,
    itemKey: Uint8Array.from(lease.itemKey),
    workerId: Uint8Array.from(lease.workerId),
  };
}

async function reset(runtime: PostgresqlRuntime): Promise<void> {
  await runtime.query({
    text: `
      TRUNCATE
        bpmn_platform.recovery_test_witness,
        bpmn_platform.recovery_leases
    `,
  });
}

async function insertWitness(
  session: PostgresqlSession,
  witnessId: string,
): Promise<void> {
  await session.query({
    text: "INSERT INTO bpmn_platform.recovery_test_witness (witness_id) VALUES ($1)",
    values: [witnessId],
  });
}

async function witnessCount(runtime: PostgresqlRuntime): Promise<number> {
  const result = await runtime.query<PostgresqlRow & Readonly<{ count: string }>>({
    text: "SELECT count(*)::text AS count FROM bpmn_platform.recovery_test_witness",
  });
  return Number(result.rows[0]?.count);
}

async function schemaEpoch(runtime: PostgresqlRuntime): Promise<number | undefined> {
  const result = await runtime.query<PostgresqlRow & Readonly<{ epoch: number }>>({
    text: "SELECT epoch FROM bpmn_platform_meta.schema_epoch WHERE singleton = true",
  });
  return result.rows[0]?.epoch;
}

async function applyRecoveryMigration(
  connectionString: string,
  migrationPrefixDirectory: string,
): Promise<void> {
  await runPostgresqlMigrations({
    connectionString,
    migrationDirectories: [
      migrationPrefixDirectory,
      fileURLToPath(new URL("../../migrations", import.meta.url)),
    ],
  });
}

async function createMigrationPrefixThrough0005(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "bpmn-recovery-prefix-"));
  const paths = [
    fileURLToPath(new URL(
      "../../../artifact-store/migrations/0001_artifact-store__2c11c29d4b0093575693e0c4986d40eca958e3b42a0860484fe2be82abbd0a28.sql",
      import.meta.url,
    )),
    fileURLToPath(new URL(
      "../../../../modules/definitions/migrations/0002_definitions__42024e51f714ff4b391589bd0457a407ec1549848fe108b08d4d37bf13805302.sql",
      import.meta.url,
    )),
    fileURLToPath(new URL(
      "../../../../modules/operate/migrations/0003_operate__e171ce2e666fa1727a616f2d8dffe3a61bcddf3a46246e267ecdb57dc4aca153.sql",
      import.meta.url,
    )),
    fileURLToPath(new URL(
      "../../../../modules/work/migrations/0004_work__72d8506b3ff9553dba17e54679cc4793432863d1052eb8f4fc213b78e8abee61.sql",
      import.meta.url,
    )),
    fileURLToPath(new URL(
      "../../../audit/migrations/0005_audit__df6b5d0e263678efefd23f2c92215d79d08634ac7fe0188386ff11e43f3878de.sql",
      import.meta.url,
    )),
  ];
  for (const path of paths) {
    await copyFile(path, join(directory, basename(path)));
  }
  return directory;
}

async function executeRecoveryMigrationSql(runtime: PostgresqlRuntime): Promise<void> {
  const migrationPath = fileURLToPath(
    new URL(
      "../../migrations/0006_recovery-leases__f09ab3db8bea84936c0695601288a26b01ba2268b6db00df82c8f9ca8baeceb9.sql",
      import.meta.url,
    ),
  );
  const sql = await readFile(migrationPath, "utf8");
  await runtime.transaction(async (session) => {
    await session.query({ text: sql });
  });
}

function createTestRuntime(
  connectionString: string,
  applicationName: string,
): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName,
    maxConnections: 8,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 5_000,
    statementTimeoutMs: 5_000,
    lockTimeoutMs: 3_000,
    idleInTransactionSessionTimeoutMs: 5_000,
  });
}

class QueryBarrier {
  readonly #required: number;
  #arrivals = 0;
  readonly #released: Promise<void>;
  #release: (() => void) | undefined;

  constructor(required: number) {
    this.#required = required;
    this.#released = new Promise<void>((resolve) => {
      this.#release = resolve;
    });
  }

  async arrive(): Promise<void> {
    this.#arrivals += 1;
    if (this.#arrivals === this.#required) {
      this.#release?.();
    }
    await this.#released;
  }
}

function withClaimBarrier(
  runtime: PostgresqlRuntime,
  barrier: QueryBarrier,
): PostgresqlRuntime {
  return {
    query: async <Row extends PostgresqlRow = PostgresqlRow>(
      query: PostgresqlQuery,
    ): Promise<PostgresqlQueryResult<Row>> => await runtime.query<Row>(query),
    transaction: async <Result>(
      run: (session: PostgresqlSession) => Promise<Result>,
    ): Promise<Result> =>
      await runtime.transaction(async (session) =>
        await run({
          query: async <Row extends PostgresqlRow = PostgresqlRow>(
            query: PostgresqlQuery,
          ): Promise<PostgresqlQueryResult<Row>> => {
            if (query.text.includes("recovery:select-candidates")) {
              await barrier.arrive();
            }
            return await session.query<Row>(query);
          },
        }),
      ),
    withDedicatedSession: async <Result>(
      run: (session: PostgresqlSession) => Promise<Result>,
    ): Promise<Result> => await runtime.withDedicatedSession(run),
    databaseClockEpochMs: async (): Promise<number> => await runtime.databaseClockEpochMs(),
    close: async (): Promise<void> => await runtime.close(),
  };
}
