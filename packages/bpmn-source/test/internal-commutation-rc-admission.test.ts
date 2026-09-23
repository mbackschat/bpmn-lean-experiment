import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticOperationKind as Kind,
  CommandOutcome,
  StimulusKind,
  applyStimulus,
  compareCanonicalStrings,
  initialState,
  isWellFormedRuntimeState,
  isWellFormedSemanticProcessProgram,
  profileAllowsProgramShape,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  Scenario,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import { admittedInternalPrefix } from "../../semantic-core/test/internal-operation-prefix-fixture.ts";
import { controlPlace, operationBase } from "../../semantic-core/test/semantic-program-parts.ts";

const cases = [
  ["subprocess-boundary-timer/scope-completes", Kind.EnterBoundedScope],
  ["activity-boundary-message/task-wins", Kind.AwaitMessageBoundedUserTask],
  ["sequential-multi-instance/natural", Kind.AwaitSequentialMultiInstanceUserTask],
  ["parallel-multi-instance/all", Kind.AwaitParallelMultiInstanceUserTask],
  ["event-based-gateway-message-timer/message-wins", Kind.AwaitEventRace],
] as const;

for (const [path, kind] of cases) {
  const fixture = compileCase(path, kind);
  test(`${kind} has an isolated retained entry and rejects a reachable fork widening`, async () => {
    const { scenario, program, stimulus, start, arm } = await fixture;
    assert.equal(supportsSemanticProcessExecution(stimulus, program), true);
    const predecessor = admittedInternalPrefix(program, initialState, stimulus, [start.id], [arm.id]);
    assert.equal(isWellFormedRuntimeState(program, stimulus.instanceId, predecessor), true);

    const widened = withIndependentBranch(program, start);
    assert.equal(isWellFormedSemanticProcessProgram(widened), true);
    assert.equal(profileAllowsProgramShape(scenario.profile, widened.operations,
      widened.definitionScopes.length), false);
    assert.equal(supportsSemanticProcessExecution(stimulus, widened), false);

    // The private prefix bypasses profile admission: this is the RC amendment's reopen discriminator.
    const frontier = admittedInternalPrefix(widened, initialState, stimulus,
      [start.id, "operation:RC_Fork"], [arm.id, "operation:RC_SiblingTask"]);
    assert.equal(isWellFormedRuntimeState(widened, stimulus.instanceId, frontier), true);
  });

  test(`${kind} distinguishes singleton arming from a mandatory first operation`, async () => {
    const { scenario, program, stimulus, start, arm } = await fixture;
    const output = continuation(arm);
    const task = program.operations.find((operation) =>
      operation.kind === Kind.AwaitUserTask && operation.input === output);
    assert.ok(task?.kind === Kind.AwaitUserTask);
    const continuationPlace = program.controlPlaces.find(({ id }) => id === task.output);
    assert.ok(continuationPlace !== undefined);
    const rewired: SemanticProcessProgram = { ...program,
      operations: program.operations.map((operation) => {
        if (operation.id === start.id) return { ...start, output: task.input };
        if (operation.id === task.id) return { ...task, output: start.output };
        return operation.id === arm.id ? replaceContinuation(arm, continuationPlace) : operation;
      }),
    };
    assert.equal(isWellFormedSemanticProcessProgram(rewired), true);
    const admitted = kind !== Kind.AwaitMessageBoundedUserTask;
    assert.equal(profileAllowsProgramShape(scenario.profile, rewired.operations,
      rewired.definitionScopes.length), admitted);
    assert.equal(supportsSemanticProcessExecution(stimulus, rewired), admitted);
    if (!admitted) return;
    const started = applyStimulus(rewired, initialState, stimulus);
    assert.equal(started.outcome, CommandOutcome.Committed);
    assert.equal(started.state.userTaskWaits.length, 1);
    const wait = started.state.userTaskWaits[0];
    assert.ok(wait !== undefined);
    assert.equal(wait.id.elementId, task.task.elementId);
    const frontier = admittedInternalPrefix(rewired, started.state, {
      kind: StimulusKind.CompleteUserTaskInstance, commandId: "rc-prefix-complete",
      taskId: wait.id, submittedValues: [],
    }, [], [arm.id]);
    assert.equal(isWellFormedRuntimeState(rewired, stimulus.instanceId, frontier), true);
  });
}

async function compileCase(path: string, kind: typeof cases[number][1]) {
  const scenario = JSON.parse(await readFile(
    new URL(`../../../scenarios/${path}.scenario.json`, import.meta.url), "utf8",
  )) as Scenario;
  const result = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(`../../../${scenario.bpmn.relativePath}`, import.meta.url)),
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    semanticProfile: scenario.profile,
    sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.ok(result.status === BpmnCompilationStatus.Accepted);
  const program = result.semanticProcess;
  const stimulus = scenario.stimuli[0];
  assert.ok(stimulus?.kind === StimulusKind.StartProcess);
  const start = program.operations.find((operation) => operation.kind === Kind.Initiate);
  const arm = program.operations.find((operation) => operation.kind === kind);
  assert.ok(start !== undefined && arm !== undefined);
  return { scenario, program, stimulus, start, arm };
}

function continuation(operation: SemanticOperation): string {
  switch (operation.kind) {
    case Kind.EnterBoundedScope:
    case Kind.AwaitSequentialMultiInstanceUserTask:
    case Kind.AwaitParallelMultiInstanceUserTask:
      return operation.boundaryTimer.output;
    case Kind.AwaitMessageBoundedUserTask:
      return operation.boundaryMessage.output;
    case Kind.AwaitEventRace:
      return operation.message.output;
    default:
      throw new TypeError(`Unexpected composite arm: ${operation.kind}`);
  }
}

function replaceContinuation(operation: SemanticOperation,
  place: SemanticProcessProgram["controlPlaces"][number]): SemanticOperation {
  switch (operation.kind) {
    case Kind.EnterBoundedScope:
      return { ...operation, boundaryTimer: { ...operation.boundaryTimer,
        output: place.id, origin: place.origin } };
    case Kind.AwaitSequentialMultiInstanceUserTask:
    case Kind.AwaitParallelMultiInstanceUserTask:
      return { ...operation, boundaryTimer: { ...operation.boundaryTimer,
        output: place.id, origin: place.origin } };
    case Kind.AwaitMessageBoundedUserTask:
      return { ...operation, boundaryMessage: { ...operation.boundaryMessage,
        output: place.id, origin: place.origin } };
    case Kind.AwaitEventRace:
      return { ...operation, message: { ...operation.message, output: place.id } };
    default:
      throw new TypeError(`Unexpected composite arm: ${operation.kind}`);
  }
}

function withIndependentBranch(
  program: SemanticProcessProgram,
  start: Extract<SemanticOperation, { kind: Kind.Initiate }>,
): SemanticProcessProgram {
  const scopeId = program.operationScopes.find(({ operationId }) => operationId === start.id)?.scopeId;
  assert.ok(scopeId !== undefined);
  const places = ["RC_Start_Fork", "RC_Sibling", "RC_Sibling_End"].map(controlPlace);
  const additions: SemanticOperation[] = [
    {
      ...operationBase("RC_Fork"), kind: Kind.Duplicate,
      input: "place:RC_Start_Fork",
      outputs: [start.output, "place:RC_Sibling"].sort(compareCanonicalStrings),
    },
    {
      ...operationBase("RC_SiblingTask"), kind: Kind.AwaitUserTask,
      input: "place:RC_Sibling", output: "place:RC_Sibling_End",
      task: { elementId: "RC_SiblingTask", name: "Independent review" },
    },
    {
      ...operationBase("RC_SiblingEnd"), kind: Kind.ReachNoneEnd,
      input: "place:RC_Sibling_End",
    },
  ];
  return {
    ...program,
    controlPlaces: [...program.controlPlaces, ...places]
      .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
    controlPlaceScopes: [...program.controlPlaceScopes,
      ...places.map(({ id }) => ({ controlPlaceId: id, scopeId }))]
      .sort((left, right) => compareCanonicalStrings(left.controlPlaceId, right.controlPlaceId)),
    operationScopes: [...program.operationScopes,
      ...additions.map(({ id }) => ({ operationId: id, scopeId }))]
      .sort((left, right) => compareCanonicalStrings(left.operationId, right.operationId)),
    operations: [...program.operations.map((operation) => operation.id === start.id
      ? { ...start, output: "place:RC_Start_Fork" } : operation), ...additions]
      .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
  };
}
