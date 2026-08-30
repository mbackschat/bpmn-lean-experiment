/** Direct Activity data-output cases and their routed-write public-observation mutations. */
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
  ObservationValueDisagreement,
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/activity-data-output-user-task";

function lastState(result: MutableScenarioResult): MutableStateObservation {
  const observation = [...result.trace].reverse().find(
    (candidate): candidate is MutableStateObservation =>
      candidate.kind === CanonicalObservationKind.State,
  );
  if (observation === undefined) {
    throw new Error("Activity data-output calibration requires a final state");
  }
  return observation;
}

function writtenProperty(
  result: MutableScenarioResult,
): MutableStateObservation["variables"][number] {
  const state = lastState(result);
  const binding = state.variables[0];
  if (state.status !== ProcessStatus.Completed || binding === undefined) {
    throw new Error(
      "Activity data-output calibration requires one written Property on a completed Process",
    );
  }
  return binding;
}

/** Publishes the local DataOutput identity where the associated Property identity belongs. */
function namePropertyAfterItsSource(result: MutableScenarioResult): void {
  writtenProperty(result).name = "DataOutput_Decision";
}

/** Erases the explicit-null discriminator by writing an empty string instead. */
function writeNullAsEmptyString(result: MutableScenarioResult): void {
  writtenProperty(result).value = {
    kind: VariableValueKind.String,
    value: "",
  };
}

/** Commits the write the refused completion must not have performed. */
function writeTheRefusedOutput(result: MutableScenarioResult): void {
  const state = lastState(result);
  if (state.status !== ProcessStatus.Running || state.variables.length !== 0) {
    throw new Error(
      "Activity data-output refusal calibration requires an unchanged Running Process",
    );
  }
  state.variables.push({
    name: "Property_UnderwritingOutcome",
    value: { kind: VariableValueKind.String, value: "approved" },
  });
}

function activityDataOutputCase(
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

export const activityDataOutputPipelineCases = Object.freeze([
  activityDataOutputCase(
    "activity-data-output-supplied",
    "supplied.scenario.json",
    namePropertyAfterItsSource,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].variables[0].name",
      expected: "Property_UnderwritingOutcome",
      actual: "DataOutput_Decision",
    },
  ),
  activityDataOutputCase(
    "activity-data-output-null",
    "null.scenario.json",
    writeNullAsEmptyString,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].variables[0].value.kind",
      expected: VariableValueKind.Null,
      actual: VariableValueKind.String,
    },
  ),
  activityDataOutputCase(
    "activity-data-output-omitted",
    "omitted.scenario.json",
    writeTheRefusedOutput,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].variables.length",
      expected: 0,
      actual: 1,
    },
  ),
]);
