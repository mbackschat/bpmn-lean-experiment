import type {
  RecoveryLoopRun,
} from "@bpmn-lean/platform-recovery-runtime";

import type {
  RecoveryWorkerFamily,
  SupervisedRecoveryLoop,
} from "./family-loops.js";
import { recoveryWorkerFamilies } from "./family-loops.js";

export type RecoveryRunReport = Readonly<{
  family: RecoveryWorkerFamily;
  run: RecoveryLoopRun;
}>;

export type RecoveryRunReporter = (
  report: RecoveryRunReport,
) => void | Promise<void>;

export type CloseableOwner = Readonly<{ close(): void | Promise<void> }>;

export class RecoveryWorkerInfrastructureError extends Error {
  readonly family: RecoveryWorkerFamily;

  constructor(family: RecoveryWorkerFamily) {
    super(`recovery-worker family ${family} reported an infrastructure failure`);
    this.name = "RecoveryWorkerInfrastructureError";
    this.family = family;
  }
}

/** Supervises one closed loop set and owns deterministic, idempotent shutdown ordering. */
export class RecoveryWorkerRuntime {
  readonly #loops: readonly SupervisedRecoveryLoop[];
  readonly #engineOwner: CloseableOwner;
  readonly #postgresqlOwner: CloseableOwner;
  readonly #report: RecoveryRunReporter;
  readonly #controller = new AbortController();
  #runPromise: Promise<void> | null = null;
  #closePromise: Promise<void> | null = null;

  constructor(
    loops: readonly SupervisedRecoveryLoop[],
    engineOwner: CloseableOwner,
    postgresqlOwner: CloseableOwner,
    report: RecoveryRunReporter = reportRecoveryRun,
  ) {
    this.#loops = snapshotLoops(loops);
    this.#engineOwner = engineOwner;
    this.#postgresqlOwner = postgresqlOwner;
    this.#report = report;
  }

  run(): Promise<void> {
    if (this.#closePromise !== null) {
      return Promise.reject(new Error("recovery-worker runtime is closed"));
    }
    this.#runPromise ??= this.#runAll();
    return this.#runPromise;
  }

  close(): Promise<void> {
    this.#closePromise ??= this.#closeAll();
    return this.#closePromise;
  }

  async #runAll(): Promise<void> {
    let firstFailure: unknown;
    const running = this.#loops.map(async (loop) => {
      try {
        await loop.runUntilAborted(this.#controller.signal, async (run) => {
          await this.#report({ family: loop.family, run: { ...run } });
          if (run.errors > 0) {
            throw new RecoveryWorkerInfrastructureError(loop.family);
          }
        });
        if (!this.#controller.signal.aborted) {
          throw new RecoveryWorkerInfrastructureError(loop.family);
        }
      } catch (error: unknown) {
        firstFailure ??= error;
        this.#controller.abort();
      }
    });
    await Promise.all(running);
    if (firstFailure !== undefined) throw firstFailure;
  }

  async #closeAll(): Promise<void> {
    this.#controller.abort();
    let firstFailure: unknown;
    if (this.#runPromise !== null) {
      try {
        await this.#runPromise;
      } catch (error: unknown) {
        firstFailure ??= error;
      }
    }
    for (const owner of [this.#engineOwner, this.#postgresqlOwner]) {
      try {
        await owner.close();
      } catch (error: unknown) {
        firstFailure ??= error;
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
  }
}

/** Emits bounded domain counters only, never exception text or credentials. */
export function reportRecoveryRun(report: RecoveryRunReport): void {
  if (
    report.run.claimed === 0 &&
    report.run.completed === 0 &&
    report.run.retried === 0 &&
    report.run.permanentlyFailed === 0 &&
    report.run.leaseLost === 0 &&
    report.run.errors === 0
  ) {
    return;
  }
  process.stdout.write(`${JSON.stringify({ family: report.family, ...report.run })}\n`);
}

function snapshotLoops(
  loops: readonly SupervisedRecoveryLoop[],
): readonly SupervisedRecoveryLoop[] {
  if (loops.length !== recoveryWorkerFamilies.length) {
    throw new TypeError("recovery-worker runtime requires exactly eleven loops");
  }
  const byFamily = new Map(loops.map((loop) => [loop.family, loop]));
  if (byFamily.size !== recoveryWorkerFamilies.length ||
      recoveryWorkerFamilies.some((family) => !byFamily.has(family))) {
    throw new TypeError("recovery-worker runtime requires the closed loop family set");
  }
  return recoveryWorkerFamilies.map((family) => byFamily.get(family)!);
}
