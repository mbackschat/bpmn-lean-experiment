import { setTimeout as wait } from "node:timers/promises";

import {
  LeaseMutationResult,
  RecoveryHandlerOutcomeKind,
  recoveryBounds,
} from "./recovery-contracts.js";
import type {
  RecoveryHandlerOutcome,
  RecoveryLease,
  RecoveryLeaseStore,
  RecoveryLoopOptions,
  RecoveryLoopRun,
} from "./recovery-contracts.js";
import {
  snapshotClaimCandidates,
  snapshotFailure,
  validateBoundedInteger,
  validateNonnegativeBoundedInteger,
} from "./recovery-values.js";

type MutableRun = {
  claimed: number;
  completed: number;
  retried: number;
  permanentlyFailed: number;
  leaseLost: number;
  errors: number;
};

/**
 * Runs one recovery family with bounded claims, handler concurrency, deadlines, and polling.
 * Handlers execute outside lease transactions; the caller owns loop and runtime shutdown.
 */
export class RecoveryLoop {
  readonly #store: RecoveryLeaseStore;
  readonly #options: RecoveryLoopOptions;

  constructor(store: RecoveryLeaseStore, options: RecoveryLoopOptions) {
    const validatedClaim = snapshotClaimCandidates({
      family: options.family,
      candidateKeys: [],
      batchSize: options.batchSize,
      leaseDurationMs: options.leaseDurationMs,
      workerId: options.workerId,
      createLeaseToken: options.createLeaseToken,
    });
    validateLoopOptions(options);
    this.#store = store;
    this.#options = {
      ...options,
      family: validatedClaim.family,
      workerId: validatedClaim.workerId,
    };
  }

  /** Claims and settles at most one configured batch. */
  async runOnce(): Promise<RecoveryLoopRun> {
    const candidateKeys = await this.#options.listCandidateKeys();
    const leases = await this.#store.claimCandidates({
      family: this.#options.family,
      candidateKeys,
      batchSize: this.#options.batchSize,
      leaseDurationMs: this.#options.leaseDurationMs,
      workerId: this.#options.workerId,
      createLeaseToken: this.#options.createLeaseToken,
    });
    const run: MutableRun = {
      claimed: leases.length,
      completed: 0,
      retried: 0,
      permanentlyFailed: 0,
      leaseLost: 0,
      errors: 0,
    };
    await runBounded(
      leases,
      this.#options.concurrency,
      async (lease) => await this.#handleLease(lease, run),
    );
    return { ...run };
  }

  /** Polls after each bounded batch until the caller aborts between iterations. */
  async runUntilAborted(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.runOnce();
      if (!signal.aborted) {
        try {
          await wait(this.#options.pollingDelayMs, undefined, { signal });
        } catch (error: unknown) {
          if (!signal.aborted) {
            throw error;
          }
        }
      }
    }
  }

  async #handleLease(lease: RecoveryLease, run: MutableRun): Promise<void> {
    let outcome: RecoveryHandlerOutcome;
    try {
      outcome = await withDeadline(
        this.#options.itemDeadlineMs,
        async (signal, deadlineEpochMs) =>
          await this.#options.handle(lease, { signal, deadlineEpochMs }),
      );
    } catch {
      await this.#applyRetry(lease, this.#options.retryDelayMs, run);
      return;
    }

    try {
      switch (outcome.kind) {
        case RecoveryHandlerOutcomeKind.Complete:
          recordMutation(await this.#store.complete(lease, outcome.apply), run, "completed");
          return;
        case RecoveryHandlerOutcomeKind.Retry:
          await this.#applyRetry(
            lease,
            outcome.retryDelayMs ?? this.#options.retryDelayMs,
            run,
          );
          return;
        case RecoveryHandlerOutcomeKind.Fail: {
          const failure = snapshotFailure(outcome);
          recordMutation(await this.#store.fail(lease, failure), run, "permanentlyFailed");
          return;
        }
        default:
          throw new TypeError("recovery handler returned an unknown outcome kind");
      }
    } catch {
      run.errors += 1;
    }
  }

  async #applyRetry(
    lease: RecoveryLease,
    retryDelayMs: number,
    run: MutableRun,
  ): Promise<void> {
    try {
      validateNonnegativeBoundedInteger(
        retryDelayMs,
        "retryDelayMs",
        recoveryBounds.durationMs,
      );
      recordMutation(
        await this.#store.retry(lease, { retryDelayMs }),
        run,
        "retried",
      );
    } catch {
      run.errors += 1;
    }
  }
}

function validateLoopOptions(options: RecoveryLoopOptions): void {
  validateBoundedInteger(
    options.itemDeadlineMs,
    "itemDeadlineMs",
    recoveryBounds.durationMs,
  );
  if (options.itemDeadlineMs >= options.leaseDurationMs) {
    throw new RangeError("recovery itemDeadlineMs must be less than leaseDurationMs");
  }
  validateNonnegativeBoundedInteger(
    options.retryDelayMs,
    "retryDelayMs",
    recoveryBounds.durationMs,
  );
  validateBoundedInteger(
    options.concurrency,
    "concurrency",
    recoveryBounds.concurrency,
  );
  validateBoundedInteger(
    options.pollingDelayMs,
    "pollingDelayMs",
    recoveryBounds.durationMs,
  );
  if (typeof options.listCandidateKeys !== "function") {
    throw new TypeError("recovery listCandidateKeys must be a function");
  }
  if (typeof options.handle !== "function") {
    throw new TypeError("recovery handle must be a function");
  }
}

async function withDeadline<Result>(
  deadlineMs: number,
  run: (signal: AbortSignal, deadlineEpochMs: number) => Promise<Result>,
): Promise<Result> {
  const controller = new AbortController();
  const deadlineEpochMs = Date.now() + deadlineMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("recovery handler deadline exceeded"));
    }, deadlineMs);
  });
  try {
    return await Promise.race([run(controller.signal, deadlineEpochMs), expired]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function runBounded<Item>(
  items: readonly Item[],
  concurrency: number,
  run: (item: Item) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) {
        await run(item);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => await worker()),
  );
}

function recordMutation(
  result: LeaseMutationResult,
  run: MutableRun,
  appliedField: "completed" | "retried" | "permanentlyFailed",
): void {
  switch (result) {
    case LeaseMutationResult.Applied:
      run[appliedField] += 1;
      return;
    case LeaseMutationResult.LeaseLost:
      run.leaseLost += 1;
      return;
  }
}
