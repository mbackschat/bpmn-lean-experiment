/** Standards-only exact-PT1S Timer Start case and instance-identity mutation. */
import {
  CanonicalObservationKind,
} from "@bpmn-lean/semantic-core";
import {
  DisagreementKind,
} from "@bpmn-lean/differential";
import {
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "@bpmn-lean/temporal-testkit";

import {
  PipelineReplaySelection,
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import type {
  MutableScenarioResult,
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/timer-start-event";

function mutateSemanticInstanceIdentity(result: MutableScenarioResult): void {
  const observation = result.trace[2];
  if (
    observation?.kind !== CanonicalObservationKind.State ||
    observation.instanceId !== "TimerStartInstance_1"
  ) {
    throw new Error(
      "Timer Start calibration requires the supplied running-instance identity",
    );
  }
  observation.instanceId = "TimerStartInstance_mutated";
}

const timerStartCase = {
  id: "timer-start-event",
  scenarioRelativePath: `${scenarioRoot}/scenario.json`,
  bpmnRelativePath: `${scenarioRoot}/process.bpmn`,
  workflowIdPrefix: "timer-start-event",
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: mutateSemanticInstanceIdentity,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].instanceId",
    expected: "TimerStartInstance_1",
    actual: "TimerStartInstance_mutated",
  },
} as const satisfies PipelineCase;

export const timerStartPipelineCases = Object.freeze([
  timerStartCase,
]);
