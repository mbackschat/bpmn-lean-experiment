/** Raw CIB incident schedule fidelity kept outside the general comparator. */
import type {
  CibPipelineResult,
} from "./pipeline-types.ts";

const incidentSchedule = "incidentReportRetrySuccess";

export function verifyServiceTaskIncidentCibExecution(
  result: CibPipelineResult,
): void {
  const [execution] = result.diagnostics.effectExecutions ?? [];
  if (
    execution?.schedule !== incidentSchedule ||
    execution.invocations !== 4 ||
    execution.mutations !== 1 ||
    execution.initialRetries !== 1 ||
    execution.retriesAfterFirstFailure !== null
  ) {
    throw new Error(
      "CIB incident schedule omitted its raw retries-zero incident and exact retry facts",
    );
  }
}
