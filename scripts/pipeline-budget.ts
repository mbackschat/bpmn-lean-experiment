/**
 * The differential pipeline's one bound and the deadlines derived from it.
 *
 * The pipeline runs every discovered scenario through Lean `kernelRun` and the TypeScript kernel and compares each
 * retained CIB result (`packages/differential/test/kernel-behavior-oracle.integration-test.ts`); its size is the number
 * of scenario files under the discovery roots, counted from the directories (guard 14 of the kernel rewrite proposal),
 * never written down. Every deadline below is that count times {@link budgetPerScenarioMs}, the only bound, which
 * changes only by owner decision ("pipeline-budget keeps one bound", proposal guard disposition).
 *
 * This module imports nothing from a package, so `test:infrastructure` reads it before any build.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/** The directories the differential discovers `*scenario.json` files under. */
export const differentialDiscoveryRoots: ReadonlyArray<string> = ["scenarios", "packages/differential/test/fixtures"];

/** Each outer process gets one margin to report the inner budget failure before it is terminated. */
const timeoutMarginMs = 5_000;

/**
 * Pathology ceiling per discovered scenario: the old four-target pipeline's portable rate, which carried about a
 * quarter more than the slowest hosted measurement of a case that also ran Temporal and CIB Seven (1,038 ms per case,
 * 2026-10). A kernel-only scenario costs one native `kernelRun` process and one TypeScript run, so the rate is a hang
 * and blow-up detector, not a performance target.
 */
export const budgetPerScenarioMs = 1_300;

function scenarioFilesUnder(relativeDirectory: string): number {
  return readdirSync(path.join(projectRoot, relativeDirectory), { withFileTypes: true }).reduce((count, entry) =>
    count + (entry.isDirectory()
      ? scenarioFilesUnder(path.posix.join(relativeDirectory, entry.name))
      : entry.name.endsWith("scenario.json") ? 1 : 0), 0);
}

/** The number of scenario files the differential discovers. */
export function discoveredScenarioCount(): number {
  return differentialDiscoveryRoots.reduce((count, root) => count + scenarioFilesUnder(root), 0);
}

function requireCount(caseCount: number, what: string): void {
  if (!Number.isSafeInteger(caseCount) || caseCount <= 0) {
    throw new TypeError(`${what} must be a positive safe integer, received ${JSON.stringify(caseCount)}`);
  }
}

/**
 * Deadline for one Lean driver batch. The 10-second floor keeps hang detection useful for a single scenario without
 * racing a process start on a loaded host.
 */
export function leanDriverBatchTimeoutMsFor(caseCount: number): number {
  requireCount(caseCount, "Lean driver batch count");
  return Math.max(10_000, caseCount * budgetPerScenarioMs);
}

/** The pipeline ceiling for `caseCount` scenarios. */
export function pipelineBudgetMsFor(caseCount: number): number {
  requireCount(caseCount, "pipeline scenario count");
  return caseCount * budgetPerScenarioMs;
}

/** Keeps the Node test runner above the pipeline ceiling of the discovered scenarios. */
export function pipelineTestTimeoutMs(caseCount: number = discoveredScenarioCount()): number {
  return pipelineBudgetMsFor(caseCount) + timeoutMarginMs;
}

/** Keeps the parent command runner above the Node test runner. */
export function pipelineCommandTimeoutMs(caseCount: number = discoveredScenarioCount()): number {
  return pipelineTestTimeoutMs(caseCount) + timeoutMarginMs;
}
