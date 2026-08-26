/** Parallel Multi-Instance differential cases and separating public-observation mutations. */
import {
  CanonicalObservationKind,
  ProcessStatus,
  UserTaskLifecycleState,
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
    throw new Error("Parallel Multi-Instance calibration requires completion");
  }
  return state;
}

function reorderPublishedResults(result: MutableScenarioResult): void {
  const output = completedState(result).variables.find(
    ({ name }) => name === "DataObjectReference_OutputResults",
  );
  if (
    output?.value.kind !== VariableValueKind.StringList ||
    output.value.value.length !== 3
  ) {
    throw new Error(
      "Parallel Multi-Instance all-complete calibration requires three results",
    );
  }
  [output.value.value[0], output.value.value[1]] = [
    output.value.value[1]!,
    output.value.value[0]!,
  ];
}

function retainFirstCompletionSibling(result: MutableScenarioResult): void {
  const state = completedState(result);
  if (state.openUserTasks.length !== 0) {
    throw new Error(
      "Parallel Multi-Instance first-complete calibration requires no open task",
    );
  }
  state.openUserTasks.push({
    id: {
      processInstanceId: state.instanceId,
      elementId: "UserTask_Review",
      activation: 1,
    },
    name: "Review item",
    state: UserTaskLifecycleState.Active,
  });
}

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
      "Parallel Multi-Instance interruption calibration requires escalation work",
    );
  }
  state.openUserTasks.push({
    id: {
      processInstanceId: state.instanceId,
      elementId: "UserTask_Review",
      activation: 1,
    },
    name: "Review item",
    state: UserTaskLifecycleState.Active,
  });
}

const allCase = {
  id: "parallel-multi-instance-all",
  scenarioRelativePath: "scenarios/parallel-multi-instance/all.scenario.json",
  bpmnRelativePath: "scenarios/parallel-multi-instance/process.bpmn",
  workflowIdPrefix: "parallel-multi-instance-all",
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
    expected: "security-high",
    actual: "privacy-low",
  },
} as const satisfies PipelineCase;

const firstCase = {
  id: "parallel-multi-instance-first",
  scenarioRelativePath: "scenarios/parallel-multi-instance/first.scenario.json",
  bpmnRelativePath: "scenarios/parallel-multi-instance/process.bpmn",
  workflowIdPrefix: "parallel-multi-instance-first",
  cib: null,
  expectedWaitTraceLength: 1,
  completionDelivery: TemporalCompletionDelivery.OrderedWithClosedReceipt,
  temporalRelation: TemporalCaseRelation.ExactSemanticWithClosedReceipt,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: retainFirstCompletionSibling,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[4].openUserTasks.length",
    expected: 0,
    actual: 1,
  },
} as const satisfies PipelineCase;

const interruptedCase = {
  id: "parallel-multi-instance-interrupted",
  scenarioRelativePath:
    "scenarios/parallel-multi-instance/interrupted.scenario.json",
  bpmnRelativePath: "scenarios/parallel-multi-instance/process.bpmn",
  workflowIdPrefix: "parallel-multi-instance-interrupted",
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

export const parallelMultiInstancePipelineCases = Object.freeze([
  allCase,
  firstCase,
  interruptedCase,
]);
