// Each outer process gets one margin to report the inner budget failure before it is terminated.
const warmPipelineTimeoutMarginMs = 5_000;

/**
 * Feedback target per registered pipeline case.
 *
 * The target was a fixed 15,000 ms set against a roughly thirty-case catalog, so it measured the
 * catalog's size as much as the pipeline's speed: once the catalog reached fifty-two cases every
 * run breached it, and a warning that always fires is one a real regression can hide behind. The
 * rate is that original total divided by the catalog it was written for, so the intent is preserved
 * exactly while the total now tracks the catalog.
 *
 * This is deliberately not the hard ceiling. `defaultWarmBudgetMs` still bounds pathological runs at
 * a fixed total and is not breached today; deriving it too would also have to move the hosted CI
 * budget that `verification-entrypoint.test.ts` holds above it.
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
 * The portable ceiling for the current catalog.
 *
 * Stated as a total because the process deadlines below and the hosted-budget guard both read it
 * before any case list exists. [The budget guard](pipeline-budget.test.ts) ties it back to
 * `warmBudgetPerCaseMs` and the registered case count, so catalog growth fails there rather than
 * silently outrunning this number.
 */
export const defaultWarmBudgetMs = 68_000;

/** Resolves the selected pathology ceiling and rejects ambiguous duration syntax. */
export function warmBudgetMs(environment: NodeJS.ProcessEnv): number {
  const declared = environment.BPMN_PIPELINE_WARM_BUDGET_MS;
  if (declared === undefined) {
    return defaultWarmBudgetMs;
  }
  const budget = Number(declared);
  if (!Number.isSafeInteger(budget) || budget <= 0) {
    throw new TypeError(
      `BPMN_PIPELINE_WARM_BUDGET_MS must be a positive safe integer of milliseconds, received ${JSON.stringify(declared)}`,
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
