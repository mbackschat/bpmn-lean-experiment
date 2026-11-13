import { CommandTimeoutError } from "./run-command.ts";

/**
 * Two tiers for every CIB Seven Maven invocation, for the same reason the warm pipeline has them.
 *
 * A deadline that kills a process cannot fail soft, so the tiers are asymmetric: the ceiling is the
 * kill deadline and is deliberately generous, while the soft target is the workstation expectation
 * and is reported after a successful invocation. Unrelated host CPU load therefore cannot fail a
 * correctness gate, and a genuine slowdown still appears in gate output.
 *
 * The ceiling is shared by every CIB Maven call site. A second hardcoded deadline inside one lane
 * was how a contended host produced an unoverridable failure.
 */
export const cibSevenMavenSoftTargetMs = 30_000;

/**
 * The most retained evidence files one Maven call replays (#70). The replay grows with the evidence at about 0.05 s a
 * file (53 s for 1,000 files on 2026-11-10, 80 s for about 1,600 on 2026-11-13), so one call over the whole corpus
 * reaches any fixed deadline; a batch keeps the deadline a bound on one call.
 */
export const retainedEvidenceBatchFiles = 500;

/** How many Maven calls replay `count` retained evidence files, each with at most `retainedEvidenceBatchFiles`. */
export function retainedEvidenceBatches(count: number): number {
  return Math.max(1, Math.ceil(count / retainedEvidenceBatchFiles));
}
export const defaultCibSevenMavenTimeoutMs = 120_000;

export function resolveCibSevenMavenTimeoutMs(
  environment: NodeJS.ProcessEnv,
): number {
  const declared = environment.BPMN_CIB_MAVEN_TIMEOUT_MS;
  if (declared === undefined) {
    return defaultCibSevenMavenTimeoutMs;
  }
  const timeoutMs = /^[0-9]+$/u.test(declared) ? Number(declared) : Number.NaN;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(
      `BPMN_CIB_MAVEN_TIMEOUT_MS must be a positive safe integer of milliseconds, received ${JSON.stringify(declared)}`,
    );
  }
  return timeoutMs;
}

/** Reports a successful invocation that ran past the workstation soft target. */
export function reportCibSevenMavenElapsed(
  release: string,
  elapsedMs: number,
  log: (line: string) => void = (line) => console.log(line),
): void {
  if (elapsedMs < cibSevenMavenSoftTargetMs) {
    return;
  }
  log(
    `CIB_MAVEN_SOFT_TARGET exceeded release=${release} elapsedMs=${elapsedMs.toFixed(0)} softTargetMs=${cibSevenMavenSoftTargetMs}. Compare with the last uncontended measurement before treating it as a regression.`,
  );
}

export function wrapCibSevenMavenFailure(
  release: string,
  error: unknown,
): unknown {
  if (!(error instanceof CommandTimeoutError)) {
    return error;
  }
  return new Error(
    `CIB_MAVEN_BUDGET_EXCEEDED release=${release} budgetMs=${error.timeoutMs} command=${JSON.stringify(error.command)}. Set BPMN_CIB_MAVEN_TIMEOUT_MS to a larger positive integer for a cold or contended host; the ${defaultCibSevenMavenTimeoutMs}ms workstation default remains unchanged.`,
    { cause: error },
  );
}
