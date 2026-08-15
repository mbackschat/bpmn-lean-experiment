/** Exact combined source, metadata, schedule, and command fixtures for Temporal evidence. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  StimulusKind,
  UserTaskLifecycleState,
  applyStimulus,
  initialState,
  projectOpenUserTasks,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
  StartProcessStimulus,
  UserTaskMetadata,
} from "@bpmn-lean/semantic-core";

import { loadJson } from "./temporal-test-support.ts";

const profileId =
  "cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft";
const scenarioRoot = new URL(
  "../../../../scenarios/parallel-user-task-metadata-composition/",
  import.meta.url,
);
const bpmnUrl = new URL("process.bpmn", scenarioRoot);

export const parallelMetadataByElementId = new Map<
  string,
  UserTaskMetadata
>([
  ["UserTask_ContentReview", metadata("contentApproved")],
  ["UserTask_RiskReview", metadata("riskApproved")],
]);

export type ParallelUserTaskMetadataOrderFixture = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
  start: StartProcessStimulus;
  completions: readonly [
    CompleteUserTaskInstanceStimulus,
    CompleteUserTaskInstanceStimulus,
  ];
  expected: ScenarioResult;
  initialTasks: ReadonlyArray<OpenUserTask>;
  intermediateTasks: ReadonlyArray<OpenUserTask>;
}>;

export type ParallelUserTaskMetadataFixture = Readonly<{
  semanticProcess: SemanticProcessProgram;
  orders: readonly [
    ParallelUserTaskMetadataOrderFixture,
    ParallelUserTaskMetadataOrderFixture,
  ];
}>;

export async function loadParallelUserTaskMetadataFixture(): Promise<
  ParallelUserTaskMetadataFixture
> {
  const sourceBytes = await readFile(bpmnUrl);
  const scenarios = await Promise.all([
    loadJson<Scenario>(new URL("content-then-risk.scenario.json", scenarioRoot)),
    loadJson<Scenario>(new URL("risk-then-content.scenario.json", scenarioRoot)),
  ]);
  const programs = await Promise.all(
    scenarios.map((scenario) => compileScenario(scenario, sourceBytes)),
  );
  const semanticProcess = programs[0];
  assert.ok(semanticProcess !== undefined);
  assert.deepEqual(programs[1], semanticProcess);

  const orders = scenarios.map((scenario) =>
    orderFixture(scenario, semanticProcess)
  );
  assert.equal(orders.length, 2);
  const [contentThenRisk, riskThenContent] = orders;
  assert.ok(contentThenRisk !== undefined && riskThenContent !== undefined);
  return {
    semanticProcess,
    orders: [contentThenRisk, riskThenContent],
  };
}

export function withParallelMetadataExecutionIdentity(
  fixture: ParallelUserTaskMetadataOrderFixture,
  instanceId: string,
): ParallelUserTaskMetadataOrderFixture {
  const start = {
    ...fixture.start,
    commandId: `${fixture.start.commandId}-${instanceId}`,
    instanceId,
  };
  const completions = fixture.completions.map((completion) => ({
    ...completion,
    commandId: `${completion.commandId}-${instanceId}`,
    taskId: { ...completion.taskId, processInstanceId: instanceId },
  }));
  const [first, second] = completions;
  assert.ok(first !== undefined && second !== undefined);
  const scenario = { ...fixture.scenario, stimuli: [start, first, second] };
  return orderFixture(scenario, fixture.semanticProcess);
}

function orderFixture(
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
): ParallelUserTaskMetadataOrderFixture {
  assert.equal(scenario.profile, profileId);
  const [startValue, firstValue, secondValue, ...rest] = scenario.stimuli;
  assert.equal(rest.length, 0);
  assert.equal(startValue?.kind, StimulusKind.StartProcess);
  assert.equal(firstValue?.kind, StimulusKind.CompleteUserTaskInstance);
  assert.equal(secondValue?.kind, StimulusKind.CompleteUserTaskInstance);
  if (
    startValue?.kind !== StimulusKind.StartProcess ||
    firstValue?.kind !== StimulusKind.CompleteUserTaskInstance ||
    secondValue?.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError("parallel metadata schedule has the wrong stimuli");
  }
  assert.deepEqual(startValue.initialVariables, []);
  assertSubmittedBoolean(firstValue);
  assertSubmittedBoolean(secondValue);

  const started = applyStimulus(semanticProcess, initialState, startValue);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const initialTasks = projectOpenUserTasks(started.state);
  assert.deepEqual(initialTasks, exactInitialTasks(startValue.instanceId));
  const firstCompleted = applyStimulus(
    semanticProcess,
    started.state,
    firstValue,
  );
  assert.equal(firstCompleted.outcome, CommandOutcome.Committed);
  const intermediateTasks = projectOpenUserTasks(firstCompleted.state);
  assert.deepEqual(
    intermediateTasks,
    initialTasks.filter(({ id }) =>
      id.elementId !== firstValue.taskId.elementId
    ),
  );

  const fixture = {
    scenario,
    semanticProcess,
    start: startValue,
    completions: [firstValue, secondValue],
    expected: runScenario(scenario, semanticProcess),
    initialTasks,
    intermediateTasks,
  } as const;
  return fixture;
}

async function compileScenario(
  scenario: Scenario,
  sourceBytes: Uint8Array,
): Promise<SemanticProcessProgram> {
  assert.equal(scenario.bpmn.relativePath, bpmnUrl.pathname.split("/").slice(-3).join("/"));
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
    throw new TypeError("parallel metadata source was rejected");
  }
  assert.deepEqual(
    new Map(compilation.checkedProcess.nodes.flatMap((node) =>
      node.kind === CheckedNodeKind.UserTask
        ? [[node.id, node.metadata]] as const
        : []
    )),
    parallelMetadataByElementId,
  );
  return compilation.semanticProcess;
}

function exactInitialTasks(instanceId: string): ReadonlyArray<OpenUserTask> {
  return [
    openTask(instanceId, "UserTask_ContentReview", "Review content"),
    openTask(instanceId, "UserTask_RiskReview", "Review risk"),
  ];
}

function openTask(
  instanceId: string,
  elementId: string,
  name: string,
): OpenUserTask {
  const taskMetadata = parallelMetadataByElementId.get(elementId);
  assert.ok(taskMetadata !== undefined);
  return {
    id: { processInstanceId: instanceId, elementId, activation: 1 },
    name,
    state: UserTaskLifecycleState.Active,
    metadata: taskMetadata,
  };
}

function assertSubmittedBoolean(
  completion: CompleteUserTaskInstanceStimulus,
): void {
  assert.equal(completion.submittedValues.length, 1);
  const [binding] = completion.submittedValues;
  assert.ok(binding !== undefined);
  assert.equal(binding.value.kind, "boolean");
  assert.equal(
    binding.name,
    completion.taskId.elementId === "UserTask_ContentReview"
      ? "contentApproved"
      : "riskApproved",
  );
}

function metadata(key: string): UserTaskMetadata {
  return {
    assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
    form: { fields: [{ key, type: "boolean" }] },
  };
}
