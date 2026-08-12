/** Exact source, program, and command fixtures for Boolean Process-data Temporal evidence. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  SemanticOperationKind,
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  advanceScenario,
  deployProcess,
  initialState,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  CanonicalObservation,
  RuntimeState,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
  StartProcessStimulus,
  VariableBinding,
  VariableValue,
} from "@bpmn-lean/semantic-core";

import { loadJson } from "./temporal-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/user-task-boolean-completion/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);

export type OldProfileBooleanRefusalFixture = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
  start: StartProcessStimulus;
  refusedBooleanCompletion: CompleteUserTaskInstanceStimulus;
  validCompletion: CompleteUserTaskInstanceStimulus;
  waitingState: RuntimeState;
  expected: ScenarioResult;
}>;

export type BooleanProcessDataFixture = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
  start: StartProcessStimulus;
  completion: CompleteUserTaskInstanceStimulus;
  waitingState: RuntimeState;
  expected: ScenarioResult;
  oldProfile: OldProfileBooleanRefusalFixture;
}>;

export async function loadBooleanProcessDataFixture(): Promise<
  BooleanProcessDataFixture
> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  assert.equal(
    scenario.profile,
    SemanticProfileId.UserTaskBooleanCompletionData,
  );
  assert.equal(
    scenario.bpmn.relativePath,
    "scenarios/user-task-discovery-completion/process.bpmn",
  );
  const sourceBytes = await readFile(bpmnUrl);
  const semanticProcess = await compileExactProcess(
    scenario,
    sourceBytes,
  );
  const start = requireStart(scenario);
  const completion = requireCompletion(scenario);
  assert.deepEqual(completion.submittedValues[0], {
    name: "approved",
    value: { kind: "boolean", value: true },
  });
  assertStringNullOnly(start.initialVariables, "new-profile Process Start");
  assertExactPassiveUserTaskProgram(semanticProcess);

  const started = applyStimulus(semanticProcess, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const expected = runScenario(scenario, semanticProcess);
  const oldProfile = await loadOldProfileFixture(
    scenario,
    sourceBytes,
    semanticProcess,
  );

  return {
    scenario,
    semanticProcess,
    start,
    completion,
    waitingState: started.state,
    expected,
    oldProfile,
  };
}

export function withStringifiedBooleanCompletion(
  fixture: BooleanProcessDataFixture,
): Scenario {
  return withExecutionIdentity(
    {
      ...fixture.scenario,
      stimuli: [
        fixture.start,
        withSubmittedValue(fixture.completion, "approved", {
          kind: VariableValueKind.String,
          value: "true",
        }),
      ],
    },
    "BooleanInstance_StringificationMutation",
    "stringify-boolean-before-application",
  );
}

export function withExecutionIdentity(
  scenario: Scenario,
  instanceId: string,
  completionCommandId: string,
): Scenario {
  const start = requireStart(scenario);
  const completion = requireCompletion(scenario);
  return {
    ...scenario,
    id: `${scenario.id}-${instanceId}`,
    stimuli: [
      { ...start, commandId: `${start.commandId}-${instanceId}`, instanceId },
      {
        ...completion,
        commandId: completionCommandId,
        taskId: { ...completion.taskId, processInstanceId: instanceId },
      },
    ],
  };
}

export function withSubmittedValue(
  completion: CompleteUserTaskInstanceStimulus,
  name: string,
  value: VariableValue,
): CompleteUserTaskInstanceStimulus {
  return {
    ...completion,
    submittedValues: completion.submittedValues.map((binding) =>
      binding.name === name ? { name, value } : binding
    ),
  };
}

async function loadOldProfileFixture(
  scenario: Scenario,
  sourceBytes: Uint8Array,
  newProgram: SemanticProcessProgram,
): Promise<OldProfileBooleanRefusalFixture> {
  const oldProfileScenario: Scenario = {
    ...scenario,
    id: "user-task-boolean-old-profile-refusal",
    profile: SemanticProfileId.UserTask,
  };
  const semanticProcess = await compileExactProcess(
    oldProfileScenario,
    sourceBytes,
  );
  assert.deepEqual(
    normalizeProfileIdentity(semanticProcess),
    normalizeProfileIdentity(newProgram),
  );
  const start = {
    ...requireStart(oldProfileScenario),
    commandId: "start-old-profile-refusal",
    instanceId: "BooleanOldProfile_1",
  };
  const baseCompletion = requireCompletion(oldProfileScenario);
  const refusedBooleanCompletion = {
    ...baseCompletion,
    commandId: "reject-boolean-under-old-profile",
    taskId: {
      ...baseCompletion.taskId,
      processInstanceId: start.instanceId,
    },
  };
  const validCompletion = {
    ...withSubmittedValue(refusedBooleanCompletion, "approved", {
      kind: VariableValueKind.String,
      value: "true",
    }),
    commandId: "complete-string-after-boolean-refusal",
  };
  const executableScenario = {
    ...oldProfileScenario,
    stimuli: [start, refusedBooleanCompletion, validCompletion],
  };
  const started = applyStimulus(semanticProcess, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const refused = applyStimulus(
    semanticProcess,
    started.state,
    refusedBooleanCompletion,
  );
  assert.equal(refused.outcome, CommandOutcome.Rejected);
  assert.deepEqual(refused.state, started.state);
  assert.equal(
    applyStimulus(semanticProcess, refused.state, validCompletion).outcome,
    CommandOutcome.Committed,
  );

  return {
    scenario: executableScenario,
    semanticProcess,
    start,
    refusedBooleanCompletion,
    validCompletion,
    waitingState: started.state,
    expected: runRefusalThenCompletion(
      executableScenario,
      semanticProcess,
    ),
  };
}

function runRefusalThenCompletion(
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
): ScenarioResult {
  const start = requireStart(scenario);
  const deployment = deployProcess(start, semanticProcess);
  assert.equal(deployment.outcome, CommandOutcome.Committed);
  const trace: CanonicalObservation[] = [deployment.observation];
  let state = initialState;
  for (const stimulus of scenario.stimuli) {
    const step = advanceScenario(semanticProcess, state, stimulus);
    assert.notEqual(step.kind, ScenarioStepKind.HarnessFailure);
    if (step.kind === ScenarioStepKind.HarnessFailure) {
      throw new TypeError("old-profile live schedule exceeded its guard");
    }
    state = step.state;
    trace.push(...step.observations);
  }
  return {
    outcome: {
      kind: ScenarioOutcomeKind.Semantic,
      outcome: CommandOutcome.Committed,
    },
    trace,
  };
}

async function compileExactProcess(
  scenario: Scenario,
  sourceBytes: Uint8Array,
): Promise<SemanticProcessProgram> {
  assert.equal(scenario.bpmn.sourceOverlay, null);
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
    throw new TypeError("Boolean Process-data source was not admitted");
  }
  assert.deepEqual(compilation.checkedProcess.nodes.map(({ kind }) => kind), [
    CheckedNodeKind.NoneEndEvent,
    CheckedNodeKind.NoneStartEvent,
    CheckedNodeKind.UserTask,
  ]);
  return compilation.semanticProcess;
}

function requireStart(scenario: Scenario): StartProcessStimulus {
  const start = scenario.stimuli[0];
  if (start?.kind !== StimulusKind.StartProcess) {
    throw new TypeError("Boolean Process-data scenario has no manual start");
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
    throw new TypeError("Boolean Process-data scenario has no completion");
  }
  return completion;
}

function assertStringNullOnly(
  bindings: ReadonlyArray<VariableBinding>,
  label: string,
): void {
  assert.equal(
    bindings.every(({ value }) =>
      value.kind === "string" || value.kind === "null"
    ),
    true,
    `${label} contains Boolean`,
  );
}

function assertExactPassiveUserTaskProgram(
  semanticProcess: SemanticProcessProgram,
): void {
  assert.deepEqual(
    semanticProcess.operations.map(({ kind }) => kind),
    [
      SemanticOperationKind.ReachNoneEnd,
      SemanticOperationKind.Initiate,
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.CompleteScope,
    ],
  );
}

function normalizeProfileIdentity(
  program: SemanticProcessProgram,
): SemanticProcessProgram {
  return {
    ...program,
    identity: { ...program.identity, semanticProfile: "normalized-profile" },
  };
}
