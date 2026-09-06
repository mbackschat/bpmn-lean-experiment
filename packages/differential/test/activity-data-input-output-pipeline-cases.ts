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
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type {
  MutableScenarioResult,
  MutableStateObservation,
  ObservationValueDisagreement,
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/activity-data-input-output-user-task";

function stateAt(result: MutableScenarioResult, index: number): MutableStateObservation {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) {
    throw new Error(`Composed Activity-data calibration requires State at trace[${index}]`);
  }
  return state;
}

function writeUnderSubmittedName(result: MutableScenarioResult): void {
  const output = stateAt(result, 4).variables[0];
  if (output?.name !== "Property_ClaimDecision") {
    throw new Error("ADIO-ROUTE-01 calibration requires the associated output Property");
  }
  output.name = "DataOutput_ClaimDecision";
}

function eraseCopiedNull(result: MutableScenarioResult): void {
  const input = stateAt(result, 2).openUserTasks[0]?.inputs?.[0];
  if (input?.name !== "DataInput_ClaimSummary" || input.value.kind !== VariableValueKind.Null) {
    throw new Error("ADIO-READY-01 calibration requires an available explicit-null input");
  }
  input.value = { kind: VariableValueKind.String, value: "" };
}

function activateWithoutInput(result: MutableScenarioResult): void {
  const state = stateAt(result, 2);
  if (state.openUserTasks.length !== 0) {
    throw new Error("ADIO-READY-01 absence calibration requires no Activity activation");
  }
  state.openUserTasks.push({
    id: {
      processInstanceId: "ActivityDataInputOutputAbsent",
      elementId: "UserTask_AssessClaim",
      activation: 1,
    },
    name: "Assess claim",
    state: UserTaskLifecycleState.Active,
  });
}

function writeOmittedOutput(result: MutableScenarioResult): void {
  const state = stateAt(result, 2);
  if (state.variables.length !== 1 || state.variables[0]?.name !== "Property_ClaimSummary") {
    throw new Error("ADIO-REFUSE-01 calibration requires only the preserved Process input");
  }
  state.variables.push({
    name: "Property_ClaimDecision",
    value: { kind: VariableValueKind.String, value: "approve" },
  });
}

function composedDataCase(
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

export const activityDataInputOutputPipelineCases = Object.freeze([
  composedDataCase("activity-data-input-output-present", "present.scenario.json", writeUnderSubmittedName, {
    kind: DisagreementKind.ObservationValue,
    path: "trace[4].variables[0].name",
    expected: "Property_ClaimDecision",
    actual: "DataOutput_ClaimDecision",
  }),
  composedDataCase("activity-data-input-output-null", "null.scenario.json", eraseCopiedNull, {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].openUserTasks[0].inputs[0].value.kind",
    expected: VariableValueKind.Null,
    actual: VariableValueKind.String,
  }),
  composedDataCase("activity-data-input-output-absent", "absent.scenario.json", activateWithoutInput, {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].openUserTasks.length",
    expected: 0,
    actual: 1,
  }),
  composedDataCase("activity-data-input-output-omitted", "omitted.scenario.json", writeOmittedOutput, {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].variables.length",
    expected: 1,
    actual: 2,
  }),
]);
