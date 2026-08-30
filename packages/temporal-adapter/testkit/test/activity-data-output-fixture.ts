/**
 * Exact source, program, and command fixtures for Activity data-output Temporal evidence.
 *
 * The three registered scenarios share one BPMN source and one compiled program, because the
 * account's whole claim is about what an accepted completion does rather than about what a start
 * carries: all three starts are empty, and only the submission differs.
 *
 * The `DataOutput` id and the target `Property` id are asserted distinct here. Every routed
 * expectation in the witness would also hold under a name-merged host if they agreed, so this
 * inequality is what makes the evidence discriminating.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  initialState,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import { loadJson } from "./temporal-test-support.ts";

const bpmnRelativePath = "scenarios/activity-data-output-user-task/process.bpmn";
const bpmnUrl = new URL(`../../../../${bpmnRelativePath}`, import.meta.url);
const scenarioUrl = (name: string) =>
  new URL(
    `../../../../scenarios/activity-data-output-user-task/${name}.scenario.json`,
    import.meta.url,
  );

/** The declared output the completion names, and the Process Property its association writes. */
export const decisionDataOutputId = "DataOutput_Decision";
export const underwritingOutcomePropertyId = "Property_UnderwritingOutcome";
export const decideTaskElementId = "UserTask_Decide";

/** One registered scenario with the start it issues and the result the pure account expects. */
export type DataOutputScenarioFixture = Readonly<{
  scenario: Scenario;
  start: StartProcessStimulus;
  completion: CompleteUserTaskInstanceStimulus;
  expected: ScenarioResult;
  startedState: RuntimeState;
}>;

export type ActivityDataOutputFixture = Readonly<{
  semanticProcess: SemanticProcessProgram;
  supplied: DataOutputScenarioFixture;
  explicitNull: DataOutputScenarioFixture;
  omitted: DataOutputScenarioFixture;
}>;

export async function loadActivityDataOutputFixture(): Promise<
  ActivityDataOutputFixture
> {
  assert.notEqual(decisionDataOutputId, underwritingOutcomePropertyId);

  const sourceBytes = await readFile(bpmnUrl);
  const supplied = await loadScenario("supplied");
  const explicitNull = await loadScenario("null");
  const omitted = await loadScenario("omitted");

  // One compiled program serves all three, which is only sound because each scenario names the same
  // exact source bytes. Asserting that here keeps a later source edit from silently splitting them.
  const semanticProcess = await compileExactProcess(
    supplied.scenario,
    sourceBytes,
  );
  for (const fixture of [explicitNull, omitted]) {
    assert.equal(fixture.scenario.bpmn.sha256, supplied.scenario.bpmn.sha256);
    assert.deepEqual(fixture.start.initialVariables, []);
  }
  assert.deepEqual(supplied.start.initialVariables, []);

  assert.deepEqual(supplied.completion.submittedValues, [
    {
      name: decisionDataOutputId,
      value: { kind: VariableValueKind.String, value: "approved" },
    },
  ]);
  assert.deepEqual(explicitNull.completion.submittedValues, [
    { name: decisionDataOutputId, value: { kind: VariableValueKind.Null } },
  ]);
  assert.deepEqual(omitted.completion.submittedValues, []);

  return {
    semanticProcess,
    supplied: withStartedState(supplied, semanticProcess),
    explicitNull: withStartedState(explicitNull, semanticProcess),
    omitted: withStartedState(omitted, semanticProcess),
  };
}

async function loadScenario(
  name: string,
): Promise<
  Omit<DataOutputScenarioFixture, "startedState" | "expected"> & {
    expectedFor: (program: SemanticProcessProgram) => ScenarioResult;
  }
> {
  const scenario = await loadJson<Scenario>(scenarioUrl(name));
  assert.equal(scenario.profile, SemanticProfileId.ActivityDataOutputUserTask);
  assert.equal(scenario.bpmn.relativePath, bpmnRelativePath);
  assert.equal(scenario.bpmn.sourceOverlay, null);
  return {
    scenario,
    start: requireStart(scenario),
    completion: requireCompletion(scenario),
    expectedFor: (program) => runScenario(scenario, program),
  };
}

function withStartedState(
  loaded: Awaited<ReturnType<typeof loadScenario>>,
  semanticProcess: SemanticProcessProgram,
): DataOutputScenarioFixture {
  const started = applyStimulus(semanticProcess, initialState, loaded.start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return {
    scenario: loaded.scenario,
    start: loaded.start,
    completion: loaded.completion,
    expected: loaded.expectedFor(semanticProcess),
    startedState: started.state,
  };
}

async function compileExactProcess(
  scenario: Scenario,
  sourceBytes: Uint8Array,
): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: sourceBytes,
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    sourceOverlay: null,
    semanticProfile: scenario.profile,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(
    compilation.status,
    BpmnCompilationStatus.Accepted,
    compilation.status === BpmnCompilationStatus.Rejected
      ? JSON.stringify(compilation.diagnostics)
      : undefined,
  );
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("Activity data-output source was not admitted");
  }
  return compilation.semanticProcess;
}

function requireStart(scenario: Scenario): StartProcessStimulus {
  const start = scenario.stimuli[0];
  if (start?.kind !== StimulusKind.StartProcess) {
    throw new TypeError("Activity data-output scenario has no manual start");
  }
  return start;
}

function requireCompletion(
  scenario: Scenario,
): CompleteUserTaskInstanceStimulus {
  const completion = scenario.stimuli.find(
    (stimulus) => stimulus.kind === StimulusKind.CompleteUserTaskInstance,
  );
  if (completion?.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError("Activity data-output scenario has no completion");
  }
  return completion;
}
