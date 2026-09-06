/** Exact registered source and independent pure-account expectations for ADIO host evidence. */
import assert from "node:assert/strict";

import {
  CanonicalObservationKind,
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";

import { compileExecutionInput, loadJson } from "./temporal-test-support.ts";

const bpmnRelativePath = "scenarios/activity-data-input-output-user-task/process.bpmn";
const bpmnUrl = new URL(`../../../../${bpmnRelativePath}`, import.meta.url);

export const claimTaskElementId = "UserTask_AssessClaim";
export const claimSummaryPropertyId = "Property_ClaimSummary";
export const claimSummaryDataInputId = "DataInput_ClaimSummary";
export const claimDecisionDataOutputId = "DataOutput_ClaimDecision";
export const claimDecisionPropertyId = "Property_ClaimDecision";

export type DataInputOutputScenarioFixture = DeepReadonly<{
  scenario: Scenario;
  start: StartProcessStimulus;
  expected: ScenarioResult;
  startedObservation: StateObservation;
}>;

export type ActivityDataInputOutputFixture = DeepReadonly<{
  semanticProcess: SemanticProcessProgram;
  present: DataInputOutputScenarioFixture;
  explicitNull: DataInputOutputScenarioFixture;
  absent: DataInputOutputScenarioFixture;
  omitted: DataInputOutputScenarioFixture;
}>;

export async function loadActivityDataInputOutputFixture(): Promise<ActivityDataInputOutputFixture> {
  const scenarios = await Promise.all(
    ["present", "null", "absent", "omitted"].map(loadScenario),
  );
  const [present, explicitNull, absent, omitted] = scenarios;
  assert.ok(present !== undefined && explicitNull !== undefined &&
    absent !== undefined && omitted !== undefined);
  const { semanticProcess } = await compileExecutionInput(present, bpmnUrl);
  for (const scenario of scenarios) {
    assert.deepEqual(scenario.bpmn, present.bpmn);
  }
  assert.equal(semanticProcess.processId, "Process_ClaimAssessment");
  assert.notEqual(claimDecisionDataOutputId, claimDecisionPropertyId);

  const loaded = {
    semanticProcess,
    present: scenarioFixture(present, semanticProcess),
    explicitNull: scenarioFixture(explicitNull, semanticProcess),
    absent: scenarioFixture(absent, semanticProcess),
    omitted: scenarioFixture(omitted, semanticProcess),
  };
  const summary = {
    name: claimSummaryPropertyId,
    value: { kind: VariableValueKind.String, value: "claim-4711" },
  } as const;
  assert.deepEqual(loaded.present.start.initialVariables, [summary]);
  assert.deepEqual(loaded.omitted.start.initialVariables, [summary]);
  assert.deepEqual(loaded.explicitNull.start.initialVariables, [{
    name: claimSummaryPropertyId,
    value: { kind: VariableValueKind.Null },
  }]);
  assert.deepEqual(loaded.absent.start.initialVariables, []);
  assert.equal(absent.stimuli.length, 1);
  assert.deepEqual(requireClaimCompletion(present).submittedValues, [{
    name: claimDecisionDataOutputId,
    value: { kind: VariableValueKind.String, value: "approve" },
  }]);
  assert.deepEqual(requireClaimCompletion(explicitNull).submittedValues, [{
    name: claimDecisionDataOutputId,
    value: { kind: VariableValueKind.Null },
  }]);
  assert.deepEqual(requireClaimCompletion(omitted).submittedValues, []);
  return loaded;
}

export function requireClaimCompletion(scenario: Scenario): CompleteUserTaskInstanceStimulus {
  const completion = scenario.stimuli[1];
  assert.ok(completion?.kind === StimulusKind.CompleteUserTaskInstance);
  assert.equal(scenario.stimuli.length, 2);
  assert.equal(completion.taskId.elementId, claimTaskElementId);
  return completion;
}

export function finalClaimObservation(result: ScenarioResult): StateObservation {
  const observation = result.trace.at(-1);
  assert.ok(observation?.kind === CanonicalObservationKind.State);
  return observation;
}

async function loadScenario(name: string): Promise<Scenario> {
  const scenario = await loadJson<Scenario>(new URL(
    `../../../../scenarios/activity-data-input-output-user-task/${name}.scenario.json`,
    import.meta.url,
  ));
  assert.equal(scenario.profile, SemanticProfileId.ActivityDataInputOutputUserTask);
  assert.equal(scenario.id, `activity-data-input-output-${name}`);
  assert.equal(scenario.bpmn.relativePath, bpmnRelativePath);
  assert.equal(scenario.bpmn.sourceOverlay, null);
  return scenario;
}

function scenarioFixture(
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
): DataInputOutputScenarioFixture {
  const start = scenario.stimuli[0];
  assert.ok(start?.kind === StimulusKind.StartProcess);
  return {
    scenario,
    start,
    expected: runScenario(scenario, semanticProcess),
    startedObservation: finalClaimObservation(runScenario(
      { ...scenario, stimuli: [start] },
      semanticProcess,
    )),
  };
}
