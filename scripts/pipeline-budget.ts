// Each outer process gets one margin to report the inner budget failure before it is terminated.
const warmPipelineTimeoutMarginMs = 5_000;

export const warmSoftTargetMs = 15_000;
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
