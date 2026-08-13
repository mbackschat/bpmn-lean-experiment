/** Cancellation-specific CIB schedule and canonical terminal invariants. */
import {
  CanonicalObservationKind,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import { isDeepStrictEqual } from "node:util";

import type {
  CibPipelineResult,
} from "./pipeline-types.ts";
import {
  incidentCancellationSchedule,
} from "./service-task-incident-cancellation-pipeline-cases.ts";

export function verifyServiceTaskIncidentCancellationCibExecution(
  result: CibPipelineResult,
): void {
  const [execution] = result.diagnostics.effectExecutions ?? [];
  if (
    result.diagnostics.effectExecutions?.length !== 1 ||
    execution?.schedule !== incidentCancellationSchedule ||
    execution.invocations !== 3 ||
    execution.mutations !== 1 ||
    execution.initialRetries !== 3 ||
    execution.retriesAfterFirstFailure !== 2
  ) {
    throw new Error(
      "CIB cancellation schedule omitted its exact report-before-cancel facts",
    );
  }
  const incidentState = result.trace[4];
  const finalState = result.trace[6];
  if (
    incidentState?.kind !== CanonicalObservationKind.State ||
    !isDeepStrictEqual(
      incidentState.enabledInteractions.map(({ kind }) => kind),
      ["retryIncident", "cancelIncidentProcess"],
    ) ||
    finalState?.kind !== CanonicalObservationKind.State ||
    finalState.status !== ProcessStatus.Cancelled ||
    !isDeepStrictEqual(finalState.variables, [{
      name: "preserved",
      value: { kind: "string", value: "before-cancel" },
    }]) ||
    finalState.activeWaits.length !== 0 ||
    finalState.openUserTasks.length !== 0 ||
    finalState.openMessageSubscriptions.length !== 0 ||
    finalState.openTimers.length !== 0 ||
    finalState.openEffects.length !== 0 ||
    finalState.openIncidents.length !== 0 ||
    finalState.enabledInteractions.length !== 0
  ) {
    throw new Error(
      "CIB cancellation result lost ordered publication or canonical terminal state",
    );
  }
}
