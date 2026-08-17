import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { test } from "node:test";

import {
  LeaseMutationResult,
  PostgresqlRecoveryLeaseStore,
  RecoveryHandlerOutcomeKind,
  RecoveryLoop,
} from "../dist/index.js";
import type {
  ClaimCandidatesInput,
  FailLeaseInput,
  RecoveryLease,
  RecoveryLeaseStore,
  RecoveryLoopOptions,
  RecoveryLoopRun,
  RetryLeaseInput,
} from "../dist/index.js";

test("validates every loop bound before candidate discovery", () => {
  let discoveryCalls = 0;
  const options = loopOptions({
    itemDeadlineMs: 100,
    leaseDurationMs: 100,
    listCandidateKeys: async () => {
      discoveryCalls += 1;
      return [];
    },
  });
  assert.throws(
    () => new RecoveryLoop(new FakeLeaseStore([]), options),
    /itemDeadlineMs must be less than leaseDurationMs/u,
  );
  assert.equal(discoveryCalls, 0);
});

test("rejects duplicate candidate keys before opening a transaction", async () => {
  let transactionCalls = 0;
  const runtime = {
    transaction: async () => {
      transactionCalls += 1;
      throw new Error("must not open");
    },
  };
  const repository = new PostgresqlRecoveryLeaseStore(runtime as never);
  const duplicate = Uint8Array.of(0, 255, 0);
  await assert.rejects(
    repository.claimCandidates({
      family: "test",
      candidateKeys: [duplicate, Uint8Array.from(duplicate)],
      batchSize: 2,
      leaseDurationMs: 1_000,
      workerId: Uint8Array.of(1),
      createLeaseToken: () => "00000000-0000-4000-8000-000000000001",
    }),
    /must not contain duplicates/u,
  );
  assert.equal(transactionCalls, 0);
});

test("rejects unsafe lease values before any PostgreSQL callback", async () => {
  let transactionCalls = 0;
  const repository = new PostgresqlRecoveryLeaseStore({
    transaction: async () => {
      transactionCalls += 1;
      throw new Error("must not open");
    },
  } as never);
  const base = {
    family: "bounds",
    candidateKeys: [Uint8Array.of(1)],
    batchSize: 1,
    leaseDurationMs: 1_000,
    workerId: Uint8Array.of(1),
    createLeaseToken: () => "00000000-0000-4000-8000-000000000001",
  };
  const invalidClaims = [
    { ...base, family: "" },
    { ...base, family: "bad\u0000family" },
    { ...base, candidateKeys: [new Uint8Array()] },
    { ...base, candidateKeys: [new Uint8Array(4_097)] },
    { ...base, workerId: new Uint8Array() },
    { ...base, batchSize: 1_001 },
    { ...base, leaseDurationMs: 86_400_001 },
  ];
  for (const input of invalidClaims) {
    await assert.rejects(repository.claimCandidates(input));
  }
  await assert.rejects(
    repository.fail(lease(1), {
      failureCode: "bad\u0000code",
      failureEvidence: Uint8Array.of(1),
    }),
  );
  await assert.rejects(
    repository.fail(lease(1), {
      failureCode: "bad",
      failureEvidence: new Uint8Array(4_097),
    }),
  );
  assert.equal(transactionCalls, 0);
});

test("runs handlers after claims close and bounds independent work concurrency", async () => {
  const leases = [lease(1), lease(2), lease(3)];
  const store = new FakeLeaseStore(leases);
  let activeHandlers = 0;
  let maximumActiveHandlers = 0;
  const loop = new RecoveryLoop(
    store,
    loopOptions({
      concurrency: 2,
      handle: async (claimed) => {
        assert.equal(store.claimOpen, false);
        activeHandlers += 1;
        maximumActiveHandlers = Math.max(maximumActiveHandlers, activeHandlers);
        await wait(5);
        activeHandlers -= 1;
        switch (claimed.itemKey[0]) {
          case 1:
            return {
              kind: RecoveryHandlerOutcomeKind.Complete,
              apply: async () => undefined,
            };
          case 2:
            return { kind: RecoveryHandlerOutcomeKind.Retry };
          case 3:
            return {
              kind: RecoveryHandlerOutcomeKind.Fail,
              failureCode: "poisoned",
              failureEvidence: Uint8Array.of(0, 255),
            };
          default:
            throw new Error("unexpected lease");
        }
      },
    }),
  );

  assert.deepEqual(await loop.runOnce(), {
    claimed: 3,
    completed: 1,
    retried: 1,
    permanentlyFailed: 1,
    leaseLost: 0,
    errors: 0,
  });
  assert.equal(maximumActiveHandlers, 2);
  assert.equal(store.maximumOutcomeTransactions, 1);
});

test("binds guarded intermediate applies to the current lease without spanning external work", async () => {
  const store = new FakeLeaseStore([lease(1)]);
  const events: string[] = [];
  const loop = new RecoveryLoop(
    store,
    loopOptions({
      handle: async (_claimed, context) => {
        assert.equal(store.outcomeTransactions, 0);
        events.push("handler");
        assert.equal(
          await context.applyWhileOwned(async () => {
            events.push("intermediate-apply");
          }),
          LeaseMutationResult.Applied,
        );
        assert.equal(store.outcomeTransactions, 0);
        events.push("external-work");
        return {
          kind: RecoveryHandlerOutcomeKind.Complete,
          apply: async () => {
            events.push("final-apply");
          },
        };
      },
    }),
  );

  assert.deepEqual(await loop.runOnce(), {
    claimed: 1,
    completed: 1,
    retried: 0,
    permanentlyFailed: 0,
    leaseLost: 0,
    errors: 0,
  });
  assert.deepEqual(events, [
    "handler",
    "intermediate-apply",
    "external-work",
    "final-apply",
  ]);
  assert.deepEqual(store.intermediateLeaseTokens, [lease(1).leaseToken]);
});

test("a timed-out handler retries while unrelated work completes", async () => {
  const store = new FakeLeaseStore([lease(1), lease(2)]);
  const never = new Promise<never>(() => undefined);
  const loop = new RecoveryLoop(
    store,
    loopOptions({
      concurrency: 2,
      itemDeadlineMs: 10,
      leaseDurationMs: 100,
      handle: async (claimed, context) => {
        if (claimed.itemKey[0] === 1) {
          context.signal.addEventListener("abort", () => undefined, { once: true });
          return await never;
        }
        return {
          kind: RecoveryHandlerOutcomeKind.Complete,
          apply: async () => undefined,
        };
      },
    }),
  );

  const result = await loop.runOnce();
  assert.equal(result.completed, 1);
  assert.equal(result.retried, 1);
  assert.equal(result.errors, 0);
});

test("reports every polling result before sleeping or starting another batch", async () => {
  const controller = new AbortController();
  const safetyAbort = setTimeout(() => controller.abort(), 20);
  const observed: RecoveryLoopRun[] = [];
  const loop = new RecoveryLoop(
    new FakeLeaseStore([lease(1)]),
    loopOptions({ pollingDelayMs: 1_000 }),
  );

  try {
    await loop.runUntilAborted(controller.signal, (run) => {
      observed.push(run);
      controller.abort();
    });
  } finally {
    clearTimeout(safetyAbort);
  }

  assert.deepEqual(observed, [{
    claimed: 1,
    completed: 1,
    retried: 0,
    permanentlyFailed: 0,
    leaseLost: 0,
    errors: 0,
  }]);
});

test("propagates an observer failure without starting another batch", async () => {
  let discoveryCalls = 0;
  const controller = new AbortController();
  const safetyAbort = setTimeout(() => controller.abort(), 20);
  const loop = new RecoveryLoop(
    new FakeLeaseStore([lease(1)]),
    loopOptions({
      listCandidateKeys: async () => {
        discoveryCalls += 1;
        return [Uint8Array.of(1)];
      },
    }),
  );

  try {
    await assert.rejects(
      loop.runUntilAborted(controller.signal, () => {
        throw new Error("operator sink unavailable");
      }),
      /operator sink unavailable/u,
    );
    assert.equal(discoveryCalls, 1);
  } finally {
    clearTimeout(safetyAbort);
  }
});

function loopOptions(
  overrides: Partial<RecoveryLoopOptions> = {},
): RecoveryLoopOptions {
  return {
    family: "ordinary-test",
    workerId: Uint8Array.of(9),
    batchSize: 10,
    leaseDurationMs: 1_000,
    itemDeadlineMs: 100,
    retryDelayMs: 50,
    concurrency: 1,
    pollingDelayMs: 10,
    createLeaseToken: () => "00000000-0000-4000-8000-000000000001",
    listCandidateKeys: async () => [Uint8Array.of(1)],
    handle: async () => ({
      kind: RecoveryHandlerOutcomeKind.Complete,
      apply: async () => undefined,
    }),
    ...overrides,
  };
}

function lease(id: number): RecoveryLease {
  return {
    family: "ordinary-test",
    itemKey: Uint8Array.of(id),
    leaseToken: `00000000-0000-4000-8000-${id.toString().padStart(12, "0")}`,
    workerId: Uint8Array.of(9),
    leaseExpiresAtEpochMs: 1,
    attempt: 1,
  };
}

class FakeLeaseStore implements RecoveryLeaseStore {
  readonly #leases: readonly RecoveryLease[];
  claimOpen = false;
  outcomeTransactions = 0;
  maximumOutcomeTransactions = 0;
  readonly intermediateLeaseTokens: string[] = [];

  constructor(leases: readonly RecoveryLease[]) {
    this.#leases = leases;
  }

  async claimCandidates(_input: ClaimCandidatesInput): Promise<readonly RecoveryLease[]> {
    this.claimOpen = true;
    await Promise.resolve();
    this.claimOpen = false;
    return this.#leases;
  }

  async complete(
    _lease: RecoveryLease,
    apply: Parameters<RecoveryLeaseStore["complete"]>[1],
  ): Promise<LeaseMutationResult> {
    return await this.#inOutcomeTransaction(async () => {
      await apply({ query: async () => ({ rows: [], rowCount: 0 }) });
    });
  }

  async applyWhileOwned(
    claimed: RecoveryLease,
    apply: Parameters<RecoveryLeaseStore["applyWhileOwned"]>[1],
  ): Promise<LeaseMutationResult> {
    this.intermediateLeaseTokens.push(claimed.leaseToken);
    return await this.#inOutcomeTransaction(async () => {
      await apply({ query: async () => ({ rows: [], rowCount: 0 }) });
    });
  }

  async retry(
    _lease: RecoveryLease,
    _input: RetryLeaseInput,
  ): Promise<LeaseMutationResult> {
    return await this.#inOutcomeTransaction(async () => undefined);
  }

  async fail(
    _lease: RecoveryLease,
    _input: FailLeaseInput,
  ): Promise<LeaseMutationResult> {
    return await this.#inOutcomeTransaction(async () => undefined);
  }

  async #inOutcomeTransaction(run: () => Promise<void>): Promise<LeaseMutationResult> {
    this.outcomeTransactions += 1;
    this.maximumOutcomeTransactions = Math.max(
      this.maximumOutcomeTransactions,
      this.outcomeTransactions,
    );
    try {
      await run();
      return LeaseMutationResult.Applied;
    } finally {
      this.outcomeTransactions -= 1;
    }
  }
}
