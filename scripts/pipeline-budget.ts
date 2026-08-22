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

export const defaultWarmBudgetMs = 40_000;

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
