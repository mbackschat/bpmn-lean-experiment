/** Sequential Multi-Instance differential cases and public-observation mutations. */
import {
  CanonicalObservationKind,
  ProcessStatus,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
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
  MutableStateObservation,
  PipelineCase,
} from "./pipeline-types.ts";

function completedState(result: MutableScenarioResult): MutableStateObservation {
  const state = [...result.trace].reverse().find(
    (observation): observation is MutableStateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  if (state === undefined) {
    throw new Error("Sequential Multi-Instance calibration requires completion");
  }
  return state;
}

/** Swaps two completed slots while preserving their count and value domain. */
function reorderPublishedResults(result: MutableScenarioResult): void {
  const output = completedState(result).variables.find(
    ({ name }) => name === "DataObjectReference_OutputResults",
  );
  if (
    output?.value.kind !== VariableValueKind.StringList ||
    output.value.value.length !== 3
  ) {
    throw new Error(
      "Sequential Multi-Instance calibration requires three published results",
    );
  }
  [output.value.value[0], output.value.value[1]] = [
    output.value.value[1]!,
    output.value.value[0]!,
  ];
}

/** Restores the task the interrupting Timer must withdraw. */
function retainInterruptedInnerTask(result: MutableScenarioResult): void {
  const state = result.trace.find(
    (observation): observation is MutableStateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.openUserTasks.length === 1 &&
      observation.openUserTasks[0]?.id.elementId === "UserTask_Escalation" &&
      observation.openTimers.length === 0 &&
      observation.openMultiInstances?.length === 0,
  );
  if (state === undefined) {
    throw new Error(
      "Sequential Multi-Instance calibration requires the interrupted state",
    );
  }
  const escalation = state.openUserTasks[0];
  if (
    state.openUserTasks.length !== 1 ||
    escalation?.id.elementId !== "UserTask_Escalation" ||
    state.openTimers.length !== 0 ||
    state.openMultiInstances?.length !== 0
  ) {
    throw new Error(
      "Sequential Multi-Instance interruption requires only escalation work",
    );
  }
  state.openUserTasks.push({
    ...escalation,
    id: {
      ...escalation.id,
      elementId: "UserTask_Review",
      activation: 2,
    },
    name: "Review item",
  });
}

const naturalCase = {
  id: "sequential-multi-instance-natural",
  scenarioRelativePath:
    "scenarios/sequential-multi-instance/natural.scenario.json",
  bpmnRelativePath: "scenarios/sequential-multi-instance/process.bpmn",
  workflowIdPrefix: "sequential-multi-instance-natural",
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.OrderedWithClosedReceipt,
  temporalRelation: TemporalCaseRelation.ExactSemanticWithClosedReceipt,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: reorderPublishedResults,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[8].variables[1].value.value[0]",
    expected: "accepted",
    actual: "flagged",
  },
} as const satisfies PipelineCase;

const interruptedCase = {
  id: "sequential-multi-instance-interrupted",
  scenarioRelativePath:
    "scenarios/sequential-multi-instance/interrupted.scenario.json",
  bpmnRelativePath: "scenarios/sequential-multi-instance/process.bpmn",
  workflowIdPrefix: "sequential-multi-instance-interrupted",
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.StimulusOrder,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: retainInterruptedInnerTask,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[6].openUserTasks.length",
    expected: 1,
    actual: 2,
  },
} as const satisfies PipelineCase;

export const sequentialMultiInstancePipelineCases = Object.freeze([
  naturalCase,
  interruptedCase,
]);
