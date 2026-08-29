/** Direct Activity data-input cases and their selected-input public-observation mutations. */
import {
  CanonicalObservationKind,
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
  ObservationValueDisagreement,
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/activity-data-input-user-task";

function waitState(result: MutableScenarioResult): MutableStateObservation {
  const observation = result.trace[2];
  if (observation?.kind !== CanonicalObservationKind.State) {
    throw new Error("Activity data-input calibration requires a state at trace[2]");
  }
  return observation;
}

function selectedInput(
  result: MutableScenarioResult,
): NonNullable<MutableStateObservation["openUserTasks"][number]["inputs"]>[number] {
  const input = waitState(result).openUserTasks[0]?.inputs?.[0];
  if (input === undefined) {
    throw new Error(
      "Activity data-input calibration requires one published selected input",
    );
  }
  return input;
}

/** Publishes the source Property identity where the target DataInput identity belongs. */
function nameInputAfterItsSource(result: MutableScenarioResult): void {
  selectedInput(result).name = "Property_ReviewContext";
}

/** Erases the explicit-null discriminator by publishing an empty string instead. */
function publishNullAsEmptyString(result: MutableScenarioResult): void {
  selectedInput(result).value = { kind: VariableValueKind.String, value: "" };
}

/** Activates the task before its required source is available. */
function activateWithoutAnAvailableSource(result: MutableScenarioResult): void {
  const state = waitState(result);
  if (state.openUserTasks.length !== 0) {
    throw new Error(
      "Activity data-input absence calibration requires no published task",
    );
  }
  state.openUserTasks.push({
    id: {
      processInstanceId: "ActivityDataInputAbsent",
      elementId: "UserTask_Review",
      activation: 1,
    },
    name: "Review invoice",
    state: UserTaskLifecycleState.Active,
  });
}

function activityDataInputCase(
  id: PipelineCase["id"],
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

export const activityDataInputPipelineCases = Object.freeze([
  activityDataInputCase(
    "activity-data-input-absent",
    "absent.scenario.json",
    activateWithoutAnAvailableSource,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[2].openUserTasks.length",
      expected: 0,
      actual: 1,
    },
  ),
  activityDataInputCase(
    "activity-data-input-present",
    "present.scenario.json",
    nameInputAfterItsSource,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[2].openUserTasks[0].inputs[0].name",
      expected: "DataInput_ReviewContext",
      actual: "Property_ReviewContext",
    },
  ),
  activityDataInputCase(
    "activity-data-input-null",
    "null.scenario.json",
    publishNullAsEmptyString,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[2].openUserTasks[0].inputs[0].value.kind",
      expected: VariableValueKind.Null,
      actual: VariableValueKind.String,
    },
  ),
]);
