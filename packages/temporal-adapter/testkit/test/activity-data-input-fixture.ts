/**
 * Exact source, program, and command fixtures for Activity data-input Temporal evidence.
 *
 * The three registered scenarios share one BPMN source and one compiled program on purpose: the
 * account's whole claim is that the same definition and the same start command reach different
 * stable states according to whether the source Property is bound, so a witness that compiled a
 * different program per scenario would be testing three models rather than one discriminator.
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

const bpmnRelativePath = "scenarios/activity-data-input-user-task/process.bpmn";
const bpmnUrl = new URL(`../../../../${bpmnRelativePath}`, import.meta.url);
const scenarioUrl = (name: string) =>
  new URL(
    `../../../../scenarios/activity-data-input-user-task/${name}.scenario.json`,
    import.meta.url,
  );

/** The source Property this profile reads, and the DataInput it copies into. */
const reviewContextPropertyId = "Property_ReviewContext";
export const reviewContextDataInputId = "DataInput_ReviewContext";
export const reviewTaskElementId = "UserTask_Review";

/** One registered scenario with the start it issues and the result the pure account expects. */
export type DataInputScenarioFixture = Readonly<{
  scenario: Scenario;
  start: StartProcessStimulus;
  expected: ScenarioResult;
  startedState: RuntimeState;
}>;

export type ActivityDataInputFixture = Readonly<{
  semanticProcess: SemanticProcessProgram;
  present: DataInputScenarioFixture;
  presentCompletion: CompleteUserTaskInstanceStimulus;
  explicitNull: DataInputScenarioFixture;
  explicitNullCompletion: CompleteUserTaskInstanceStimulus;
  absent: DataInputScenarioFixture;
}>;

export async function loadActivityDataInputFixture(): Promise<
  ActivityDataInputFixture
> {
  const sourceBytes = await readFile(bpmnUrl);
  const present = await loadScenario("present");
  const explicitNull = await loadScenario("null");
  const absent = await loadScenario("absent");

  // One compiled program serves all three, which is only sound because each scenario names the same
  // exact source bytes. Asserting that here keeps a later source edit from silently splitting them.
  const semanticProcess = await compileExactProcess(present.scenario, sourceBytes);
  for (const fixture of [explicitNull, absent]) {
    assert.equal(fixture.scenario.bpmn.sha256, present.scenario.bpmn.sha256);
  }

  const presentCompletion = requireCompletion(present.scenario);
  const explicitNullCompletion = requireCompletion(explicitNull.scenario);
  assert.deepEqual(presentCompletion.submittedValues, []);
  assert.deepEqual(explicitNullCompletion.submittedValues, []);
  assertSourceBinding(present.start, {
    kind: VariableValueKind.String,
    value: "invoice-4711",
  });
  assertSourceBinding(explicitNull.start, { kind: VariableValueKind.Null });
  assert.deepEqual(absent.start.initialVariables, []);

  return {
    semanticProcess,
    present: withStartedState(present, semanticProcess),
    presentCompletion,
    explicitNull: withStartedState(explicitNull, semanticProcess),
    explicitNullCompletion,
    absent: withStartedState(absent, semanticProcess),
  };
}

async function loadScenario(
  name: string,
): Promise<Omit<DataInputScenarioFixture, "startedState" | "expected"> & {
  expectedFor: (program: SemanticProcessProgram) => ScenarioResult;
}> {
  const scenario = await loadJson<Scenario>(scenarioUrl(name));
  assert.equal(scenario.profile, SemanticProfileId.ActivityDataInputUserTask);
  assert.equal(scenario.bpmn.relativePath, bpmnRelativePath);
  assert.equal(scenario.bpmn.sourceOverlay, null);
  return {
    scenario,
    start: requireStart(scenario),
    expectedFor: (program) => runScenario(scenario, program),
  };
}

function withStartedState(
  loaded: Awaited<ReturnType<typeof loadScenario>>,
  semanticProcess: SemanticProcessProgram,
): DataInputScenarioFixture {
  const started = applyStimulus(semanticProcess, initialState, loaded.start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return {
    scenario: loaded.scenario,
    start: loaded.start,
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
    throw new TypeError("Activity data-input source was not admitted");
  }
  return compilation.semanticProcess;
}

function requireStart(scenario: Scenario): StartProcessStimulus {
  const start = scenario.stimuli[0];
  if (start?.kind !== StimulusKind.StartProcess) {
    throw new TypeError("Activity data-input scenario has no manual start");
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
    throw new TypeError("Activity data-input scenario has no completion");
  }
  return completion;
}

function assertSourceBinding(
  start: StartProcessStimulus,
  value: Readonly<{ kind: string; value?: string }>,
): void {
  assert.deepEqual(start.initialVariables, [
    { name: reviewContextPropertyId, value },
  ]);
}
