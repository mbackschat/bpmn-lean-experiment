import { CommandTimeoutError } from "./run-command.ts";

export const defaultCibSevenMavenTimeoutMs = 60_000;

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
