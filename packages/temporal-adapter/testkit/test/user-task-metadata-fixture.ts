/** Exact source, program, metadata, and command fixtures for Temporal evidence. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  SemanticOperationKind,
  SemanticProfileId,
  StimulusKind,
  applyStimulus,
  initialState,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
  StartProcessStimulus,
  UserTaskMetadata,
} from "@bpmn-lean/semantic-core";

import { loadJson } from "./temporal-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/user-task-assignment-form-metadata/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/user-task-assignment-form-metadata/process.bpmn",
  import.meta.url,
);
const metadataFreeScenarioUrl = new URL(
  "../../../../scenarios/user-task-boolean-completion/scenario.json",
  import.meta.url,
);
const metadataFreeBpmnUrl = new URL(
  "../../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);

export const expectedUserTaskMetadata: UserTaskMetadata = {
  assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
  form: { fields: [{ key: "approved", type: "boolean" }] },
};

export type MetadataFreeControlFixture = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
  start: StartProcessStimulus;
  completion: CompleteUserTaskInstanceStimulus;
  expected: ScenarioResult;
}>;

export type UserTaskMetadataFixture = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
  start: StartProcessStimulus;
  completion: CompleteUserTaskInstanceStimulus;
  expected: ScenarioResult;
  metadataFreeControl: MetadataFreeControlFixture;
}>;

export async function loadUserTaskMetadataFixture(): Promise<
  UserTaskMetadataFixture
> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  assert.equal(
    scenario.profile,
    SemanticProfileId.UserTaskAssignmentFormMetadata,
  );
  const sourceBytes = await readFile(bpmnUrl);
  const semanticProcess = await compileExactProcess(scenario, sourceBytes);
  const start = requireStart(scenario);
  const completion = requireCompletion(scenario);
  assert.equal(
    start.initialVariables.every(({ value }) =>
      value.kind === "string" || value.kind === "null"
    ),
    true,
  );
  assert.deepEqual(completion.submittedValues, [{
    name: "approved",
    value: { kind: "boolean", value: true },
  }]);

  const started = applyStimulus(semanticProcess, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.deepEqual(
    started.state.userTaskWaits[0]?.metadata,
    expectedUserTaskMetadata,
  );
  const metadataFreeControl = await loadMetadataFreeControl();

  return {
    scenario,
    semanticProcess,
    start,
    completion,
    expected: runScenario(scenario, semanticProcess),
    metadataFreeControl,
  };
}

export function withMetadataExecutionIdentity(
  fixture: UserTaskMetadataFixture,
  instanceId: string,
  completionCommandId: string,
): Readonly<{
  start: StartProcessStimulus;
  completion: CompleteUserTaskInstanceStimulus;
}> {
  return {
    start: {
      ...fixture.start,
      commandId: `${fixture.start.commandId}-${instanceId}`,
      instanceId,
    },
    completion: {
      ...fixture.completion,
      commandId: completionCommandId,
      taskId: { ...fixture.completion.taskId, processInstanceId: instanceId },
    },
  };
}

async function compileExactProcess(
  scenario: Scenario,
  sourceBytes: Uint8Array,
): Promise<SemanticProcessProgram> {
  const compilation = await compileScenario(scenario, sourceBytes);
  const userTask = compilation.checkedProcess.nodes.find(
    (node) => node.kind === CheckedNodeKind.UserTask,
  );
  assert.deepEqual(userTask?.metadata, expectedUserTaskMetadata);
  assert.deepEqual(
    compilation.semanticProcess.operations.map(({ kind }) => kind),
    exactOperationKinds,
  );
  const wait = compilation.semanticProcess.operations.find(
    (operation) => operation.kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.deepEqual(wait?.task.metadata, expectedUserTaskMetadata);
  return compilation.semanticProcess;
}

async function loadMetadataFreeControl(): Promise<
  MetadataFreeControlFixture
> {
  const scenario = await loadJson<Scenario>(metadataFreeScenarioUrl);
  assert.equal(
    scenario.profile,
    SemanticProfileId.UserTaskBooleanCompletionData,
  );
  const compilation = await compileScenario(
    scenario,
    await readFile(metadataFreeBpmnUrl),
  );
  assert.equal(
    compilation.checkedProcess.nodes.some((node) =>
      node.kind === CheckedNodeKind.UserTask &&
      Object.hasOwn(node, "metadata")
    ),
    false,
  );
  assert.equal(
    compilation.semanticProcess.operations.some((operation) =>
      operation.kind === SemanticOperationKind.AwaitUserTask &&
      Object.hasOwn(operation.task, "metadata")
    ),
    false,
  );
  const start = requireStart(scenario);
  const completion = requireCompletion(scenario);
  return {
    scenario,
    semanticProcess: compilation.semanticProcess,
    start,
    completion,
    expected: runScenario(scenario, compilation.semanticProcess),
  };
}

async function compileScenario(
  scenario: Scenario,
  sourceBytes: Uint8Array,
) {
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
    throw new TypeError("User Task scenario source was not admitted");
  }
  assert.deepEqual(compilation.checkedProcess.nodes.map(({ kind }) => kind), [
    CheckedNodeKind.NoneEndEvent,
    CheckedNodeKind.NoneStartEvent,
    CheckedNodeKind.UserTask,
  ]);
  assert.deepEqual(
    compilation.semanticProcess.operations.map(({ kind }) => kind),
    exactOperationKinds,
  );
  return compilation;
}

const exactOperationKinds = [
  SemanticOperationKind.ReachNoneEnd,
  SemanticOperationKind.Initiate,
  SemanticOperationKind.AwaitUserTask,
  SemanticOperationKind.CompleteScope,
] as const;

function requireStart(scenario: Scenario): StartProcessStimulus {
  const start = scenario.stimuli[0];
  if (start?.kind !== StimulusKind.StartProcess) {
    throw new TypeError("User Task metadata scenario has no manual start");
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
    throw new TypeError("User Task metadata scenario has no completion");
  }
  return completion;
}
