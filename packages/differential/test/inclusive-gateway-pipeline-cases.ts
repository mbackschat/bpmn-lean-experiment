/** Standards-only Inclusive Gateway cases and public-observation mutations. */
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
  MutableStateObservation,
  ObservationValueDisagreement,
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/inclusive-gateway-selected-branches";

function observationValueDisagreement(
  path: string,
  expected: unknown,
  actual: unknown,
): ObservationValueDisagreement {
  return {
    kind: DisagreementKind.ObservationValue,
    path,
    expected,
    actual,
  };
}

function stateAt(
  result: MutableScenarioResult,
  index: number,
): MutableStateObservation {
  const observation = result.trace[index];
  if (observation?.kind !== CanonicalObservationKind.State) {
    throw new Error(`Inclusive calibration requires state trace[${index}]`);
  }
  return observation;
}

function replaceInitialTask(
  expectedElementId: string,
  replacementElementId: string,
): PipelineCase["injectMutation"] {
  return (result) => {
    const state = stateAt(result, 2);
    const task = state.openUserTasks[0];
    if (
      state.openUserTasks.length !== 1 ||
      task?.id.elementId !== expectedElementId
    ) {
      throw new Error(
        `Inclusive calibration requires only ${expectedElementId}`,
      );
    }
    state.openUserTasks[0] = {
      ...task,
      id: { ...task.id, elementId: replacementElementId },
    };
  };
}

function omitSecondInitialTask(result: MutableScenarioResult): void {
  const state = stateAt(result, 2);
  if (
    state.openUserTasks.length !== 2 ||
    state.openUserTasks[0]?.id.elementId !== "Task_A" ||
    state.openUserTasks[1]?.id.elementId !== "Task_B"
  ) {
    throw new Error("Inclusive both-true calibration requires Task_A and Task_B");
  }
  state.openUserTasks = state.openUserTasks.slice(0, 1);
}

function omitRemainingTaskAfterFirstCompletion(
  result: MutableScenarioResult,
): void {
  const state = stateAt(result, 4);
  if (
    state.openUserTasks.length !== 1 ||
    state.openUserTasks[0]?.id.elementId !== "Task_A"
  ) {
    throw new Error(
      "Inclusive B-then-A calibration requires Task_A after the first completion",
    );
  }
  state.openUserTasks = [];
}

function inclusiveGatewayCase(
  id: string,
  scenarioFile: string,
  injectMutation: PipelineCase["injectMutation"],
  expectedInjectedDisagreement: ObservationValueDisagreement,
): PipelineCase {
  return Object.freeze({
    id,
    scenarioRelativePath: `${scenarioRoot}/${scenarioFile}`,
    bpmnRelativePath: `${scenarioRoot}/process.bpmn`,
    workflowIdPrefix: id,
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation,
    expectedInjectedDisagreement,
  });
}

export const inclusiveGatewayPipelineCases = Object.freeze([
  inclusiveGatewayCase(
    "inclusive-gateway-one-true",
    "one-true.scenario.json",
    replaceInitialTask("Task_A", "Task_Default"),
    observationValueDisagreement(
      "trace[2].openUserTasks[0].id.elementId",
      "Task_A",
      "Task_Default",
    ),
  ),
  inclusiveGatewayCase(
    "inclusive-gateway-both-true-a-then-b",
    "both-true-a-then-b.scenario.json",
    omitSecondInitialTask,
    observationValueDisagreement(
      "trace[2].openUserTasks.length",
      2,
      1,
    ),
  ),
  inclusiveGatewayCase(
    "inclusive-gateway-both-true-b-then-a",
    "both-true-b-then-a.scenario.json",
    omitRemainingTaskAfterFirstCompletion,
    observationValueDisagreement(
      "trace[4].openUserTasks.length",
      1,
      0,
    ),
  ),
  inclusiveGatewayCase(
    "inclusive-gateway-default",
    "default.scenario.json",
    replaceInitialTask("Task_Default", "Task_A"),
    observationValueDisagreement(
      "trace[2].openUserTasks[0].id.elementId",
      "Task_Default",
      "Task_A",
    ),
  ),
]);
