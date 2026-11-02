import { pipelineCaseIdRegistry } from "../packages/differential/test/pipeline-case-id-registry.ts";

// Each outer process gets one margin to report the inner budget failure before it is terminated.
const warmPipelineTimeoutMarginMs = 5_000;
const maximumTimerDelayMs = 2 ** 31 - 1;

/**
 * Feedback target per registered pipeline case.
 *
 * The target was a fixed 15,000 ms set against a roughly thirty-case catalog, so it measured the
 * catalog's size as much as the pipeline's speed: once the catalog reached fifty-two cases every
 * run breached it, and a warning that always fires is one a real regression can hide behind. The
 * rate is that original total divided by the catalog it was written for, so the intent is preserved
 * exactly while the total now tracks the catalog.
 *
 * The hard ceiling follows the separate `warmBudgetPerCaseMs` rate below, and its aggregate derives
 * from the registered catalog the same way.
 */
export const warmSoftTargetPerCaseMs = 500;

/** The feedback target for a catalog of `caseCount` registered cases. */
export function warmSoftTargetMsFor(caseCount: number): number {
  if (!Number.isSafeInteger(caseCount) || caseCount <= 0) {
    throw new TypeError(
      `pipeline case count must be a positive safe integer, received ${JSON.stringify(caseCount)}`,
    );
  }
  return caseCount * warmSoftTargetPerCaseMs;
}

/**
 * Pathology ceiling per registered pipeline case.
 *
 * A single absolute total cannot be portable, because the same catalog costs about 515 ms per case
 * on an eight-core development machine and 1,038 ms per case on a four-core hosted runner. The
 * previous fixed 40,000 ms was chosen against the faster machine, so a healthy 52-case run on a
 * runner took 53,975 ms and exceeded it by 35%; only the workflow's declared override kept that
 * invisible, and a contributor on modest hardware would have seen a hard failure on a correct run.
 *
 * The rate carries about a quarter more than the slowest measurement, which is wide enough for
 * slower hardware and still narrow enough to catch a hang or a quadratic blow-up. It is not a
 * performance target: [the feedback target](#warmSoftTargetPerCaseMs) owns that, and it is the one
 * to tighten if per-case cost needs attention.
 */
export const warmBudgetPerCaseMs = 1_300;

/**
 * Deadline for one Lean driver batch.
 *
 * The driver receives the whole selected scenario batch in one process, so its deadline must
 * scale with the same portable per-case rate as the enclosing warm pipeline. The 10-second floor
 * preserves useful hang detection for focused parity batches without making a growing catalog race
 * a fixed deadline.
 */
export function leanDriverBatchTimeoutMsFor(caseCount: number): number {
  if (!Number.isSafeInteger(caseCount) || caseCount <= 0) {
    throw new TypeError(
      `Lean driver batch count must be a positive safe integer, received ${JSON.stringify(caseCount)}`,
    );
  }
  return Math.max(10_000, caseCount * warmBudgetPerCaseMs);
}

/**
 * The portable ceiling for the current catalog: every registered case at `warmBudgetPerCaseMs`.
 *
 * It was a hand-written total, which every family registering cases had to raise to the one value
 * the case count already fixed (Finding 32). The identifier registry imports no runtime code, so the
 * process deadlines below and the hosted-budget guard still read this before any case list exists.
 * The per-case rate, the hosted factor and the hosted job allowance stay the owner-set bounds.
 */
export const defaultWarmBudgetMs = pipelineCaseIdRegistry.length * warmBudgetPerCaseMs;

/**
 * Smallest factor a hosted environment may declare over the portable ceiling.
 *
 * Hosted runners measure well above the development machine's per-case cost (`warmBudgetPerCaseMs`
 * records the measurements), so a hosted ceiling needs real headroom above the portable one; the
 * [verification policy](../docs/VERIFICATION-INFRASTRUCTURE-POLICY.md#feedback-budgets) sets it at 50%.
 */
export const minimumHostedWarmBudgetFactor = 1.5;

/**
 * Allowance for everything the hosted integration-pipeline job runs besides the warm catalog phase:
 * runner setup, cache restores and the Lean-core integration suites before the catalog. Run
 * 41473082509 (measured 2026-11-02, 160 cases) spent 178 s of the job's 355 s, counted from job
 * start as `timeout-minutes` counts, outside its 177 s warm phase; the allowance carries about a
 * fifth more. The pipeline budget guard keeps the job's `timeout-minutes` above this allowance plus
 * the hosted command deadline, so the job timeout never becomes the pipeline's real ceiling. Those
 * suites grow with families and this constant does not see them: the per-push job-duration reading
 * owns that growth, and a measured overhead above the allowance splits the job.
 */
export const hostedPipelineJobOverheadMs = 210_000;

/**
 * Load per core above which a timing figure is not a comparable measurement.
 *
 * The soft-target warning already told the reader that a figure above roughly one is contended. The
 * hard ceilings did not consult it, so a busy host produced a red gate whose message named a duration
 * and explained nothing, and the only recorded response to such a red was to re-run it. One is the
 * threshold the report's own text names, kept in one place so the warning and the ceilings cannot
 * disagree about what contended means.
 */
export const contendedLoadPerCore = 1;

/**
 * Pathology ceiling per registered pipeline case for the cold phase.
 *
 * The cold phase builds before it measures, so it is the phase contention lands on hardest, and it
 * carried a bare inline `45_000` in the pipeline test: not derived from the catalog, not portable
 * across core counts, and not in this owner. That is the same defect this module's warm docstrings
 * describe, left standing for the other phase. A 52-case catalog measured 54,397 ms warm-equivalent
 * cold on a quiet eight-core host, so the rate carries a comparable margin to the warm ceiling.
 */
export const coldBudgetPerCaseMs = 1_600;

/** The cold ceiling for a catalog of `caseCount` registered cases. */
export function coldBudgetMsFor(caseCount: number): number {
  if (!Number.isSafeInteger(caseCount) || caseCount <= 0) {
    throw new TypeError(
      `pipeline case count must be a positive safe integer, received ${JSON.stringify(caseCount)}`,
    );
  }
  return caseCount * coldBudgetPerCaseMs;
}

/**
 * Whether a measured phase may be asserted against its ceiling on this host.
 *
 * Returns `false` when the recorded load makes the figure non-comparable, which is a refusal to draw a
 * conclusion rather than a weaker conclusion: a breach on a contended host is reported and left
 * uncounted, exactly as every contended figure in the plan is. A quiet host still fails.
 */
export function timingIsComparable(loadPerCore: number): boolean {
  return Number.isFinite(loadPerCore) && loadPerCore <= contendedLoadPerCore;
}

/**
 * Resolves the selected pathology ceiling: the portable one, or the factor over it that a slower
 * environment declares in `BPMN_PIPELINE_WARM_BUDGET_FACTOR`, rejecting ambiguous factor syntax.
 */
export function warmBudgetMs(environment: NodeJS.ProcessEnv): number {
  const declared = environment.BPMN_PIPELINE_WARM_BUDGET_FACTOR;
  if (declared === undefined) {
    return defaultWarmBudgetMs;
  }
  const factor = Number(declared);
  if (!/^\d+(\.\d+)?$/u.test(declared) || !(factor > 0)) {
    throw new TypeError(
      `BPMN_PIPELINE_WARM_BUDGET_FACTOR must be a positive decimal factor, received ${JSON.stringify(declared)}`,
    );
  }
  const budget = Math.ceil(defaultWarmBudgetMs * factor);
  // Node clamps a timer delay above 2^31 - 1 ms to 1 ms, which would turn the deadlines below into an
  // immediate timeout (https://nodejs.org/api/timers.html#settimeoutcallback-delay-args).
  if (budget + 2 * warmPipelineTimeoutMarginMs > maximumTimerDelayMs) {
    throw new TypeError(
      `BPMN_PIPELINE_WARM_BUDGET_FACTOR ${declared} puts the pipeline deadlines beyond Node's timer range`,
    );
  }
  return budget;
}

/** Keeps the Node test runner above the selected pipeline ceiling. */
export function warmPipelineTestTimeoutMs(
  environment: NodeJS.ProcessEnv,
): number {
  return warmBudgetMs(environment) + warmPipelineTimeoutMarginMs;
}

/** Keeps the parent command runner above the Node test runner. */
export function warmPipelineCommandTimeoutMs(
  environment: NodeJS.ProcessEnv,
): number {
  return warmPipelineTestTimeoutMs(environment) +
    warmPipelineTimeoutMarginMs;
}
