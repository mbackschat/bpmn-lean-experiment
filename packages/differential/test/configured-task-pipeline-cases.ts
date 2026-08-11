/** Configured Task exact-semantic case and pass-through mutation. */
import {
  CanonicalObservationKind,
  StimulusKind,
  UserTaskLifecycleState,
  WaitKind,
} from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import {
  EffectExecutionSchedule,
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

const scenarioRoot = "scenarios/configured-task";

function exposeUserTaskBeforeEffectCompletion(
  result: MutableScenarioResult,
): void {
  const state = result.trace[2];
  const effect = state?.kind === CanonicalObservationKind.State
    ? state.openEffects[0]
    : undefined;
  if (
    state?.kind !== CanonicalObservationKind.State ||
    effect?.id.elementId !== "ConfiguredTask_Probe" ||
    state.openUserTasks.length !== 0
  ) {
    throw new Error(
      "Configured Task calibration requires only its initial effect wait",
    );
  }
  const taskId = { ...effect.id, elementId: "UserTask_Review" };
  state.activeWaits = [{
    elementId: taskId.elementId,
    kind: WaitKind.UserTask,
    multiplicity: 1,
  }];
  state.openEffects = [];
  state.openUserTasks = [{
    id: taskId,
    name: "Review",
    state: UserTaskLifecycleState.Active,
  }];
  state.enabledInteractions = [{
    kind: StimulusKind.CompleteUserTaskInstance,
    taskId,
  }];
}

const configuredTaskCase = {
  id: "configured-task",
  scenarioRelativePath: `${scenarioRoot}/scenario.json`,
  bpmnRelativePath: `${scenarioRoot}/process.bpmn`,
  workflowIdPrefix: "configured-task",
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: {
    primary: EffectExecutionSchedule.PlainSuccess,
    isolation: EffectExecutionSchedule.PlainSuccess,
  },
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: exposeUserTaskBeforeEffectCompletion,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].activeWaits[0].elementId",
    expected: "ConfiguredTask_Probe",
    actual: "UserTask_Review",
  },
} as const satisfies PipelineCase;

export const configuredTaskPipelineCases = Object.freeze([
  configuredTaskCase,
]);
