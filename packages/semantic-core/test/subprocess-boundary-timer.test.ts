/**
 * Focused semantic-core behavior for the interrupting Sub-Process boundary Timer family.
 *
 * The oracle is the [approved capsule](../../../docs/capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md).
 *
 * Two facts here cannot be reached by any registered schedule and are the reason this lane exists at
 * this level. The deadline's *owner* is a correctness requirement with no separating witness: a
 * child-owned deadline would leave the child permanently non-quiescent, so only the quiescence arm
 * would break, and it would break by silently never completing rather than by producing a wrong
 * observation. And the Temporal lane derives its firing from its own committed deadline, so no
 * schedule can present an off-deadline firing to any target.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  applyStimulus,
  initialState,
  isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";

const processId = "Process_SubProcessBoundaryTimer";
const rootScopeId = `scope:${processId}`;
const childScopeId = "scope:Scope";
const instanceId = "BoundedScopeInstance_1";

const rootOccurrence = Object.freeze({
  processInstanceId: instanceId,
  definitionScopeId: rootScopeId,
  activation: 1,
});

const childOccurrence = Object.freeze({
  processInstanceId: instanceId,
  definitionScopeId: childScopeId,
  activation: 1,
});

/** Hand-built to the exact shape `@bpmn-lean/bpmn-source` lowers, so this lane depends on no compiler. */
const boundedScopeProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-subprocess-boundary-timer-draft",
    sourceId: "subprocess-boundary-timer",
    sourceSha256:
      "dc2875fb0c24deeab9d8f180fa4adf44652a504778f3dda187ac19839e60016e",
  },
  processId,
  definitionScopes: [
    { id: rootScopeId, parentScopeId: null, originElementId: processId },
    { id: childScopeId, parentScopeId: rootScopeId, originElementId: "Scope" },
  ],
  operationScopes: [
    { operationId: "operation:AfterScope", scopeId: rootScopeId },
    { operationId: "operation:BoundaryEnd", scopeId: rootScopeId },
    { operationId: "operation:ChildEnd", scopeId: childScopeId },
    { operationId: "operation:ChildTask", scopeId: childScopeId },
    { operationId: "operation:EscalationTask", scopeId: rootScopeId },
    { operationId: "operation:NormalEnd", scopeId: rootScopeId },
    { operationId: "operation:Scope", scopeId: rootScopeId },
    { operationId: "operation:Start", scopeId: rootScopeId },
    {
      operationId: `operation:complete-scope:${rootScopeId}`,
      scopeId: rootScopeId,
    },
    {
      operationId: `operation:complete-scope:${childScopeId}`,
      scopeId: childScopeId,
    },
  ],
  controlPlaceScopes: [
    { controlPlaceId: "place:Flow_Boundary", scopeId: rootScopeId },
    { controlPlaceId: "place:Flow_Boundary_End", scopeId: rootScopeId },
    { controlPlaceId: "place:Flow_Child", scopeId: childScopeId },
    { controlPlaceId: "place:Flow_Child_End", scopeId: childScopeId },
    { controlPlaceId: "place:Flow_Normal", scopeId: rootScopeId },
    { controlPlaceId: "place:Flow_Normal_End", scopeId: rootScopeId },
    { controlPlaceId: "place:Flow_Start", scopeId: rootScopeId },
  ],
  controlPlaces: [
    controlPlace("Flow_Boundary"),
    controlPlace("Flow_Boundary_End"),
    controlPlace("Flow_Child"),
    controlPlace("Flow_Child_End"),
    controlPlace("Flow_Normal"),
    controlPlace("Flow_Normal_End"),
    controlPlace("Flow_Start"),
  ],
  operations: [
    {
      ...operationBase("AfterScope"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Normal",
      output: "place:Flow_Normal_End",
      task: { elementId: "AfterScope", name: "Scope completed in time" },
    },
    {
      ...operationBase("BoundaryEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Boundary_End",
    },
    {
      ...operationBase("ChildEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Child_End",
    },
    {
      ...operationBase("ChildTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Child",
      output: "place:Flow_Child_End",
      task: { elementId: "ChildTask", name: "Work inside the scope" },
    },
    {
      ...operationBase("EscalationTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Boundary",
      output: "place:Flow_Boundary_End",
      task: { elementId: "EscalationTask", name: "Deadline reached" },
    },
    {
      ...operationBase("NormalEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Normal_End",
    },
    {
      ...operationBase("Scope"),
      kind: SemanticOperationKind.EnterBoundedScope,
      input: "place:Flow_Start",
      childEntry: "place:Flow_Child",
      childScopeId,
      boundaryTimer: {
        elementId: "Deadline",
        durationMs: 1000,
        output: "place:Flow_Boundary",
        origin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "Flow_Boundary",
        },
      },
    },
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start",
    },
    {
      id: `operation:complete-scope:${rootScopeId}`,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: processId },
      kind: SemanticOperationKind.CompleteScope,
      scopeId: rootScopeId,
      parentOutput: null,
    },
    {
      id: `operation:complete-scope:${childScopeId}`,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Scope" },
      kind: SemanticOperationKind.CompleteScope,
      scopeId: childScopeId,
      parentOutput: "place:Flow_Normal",
    },
  ],
} as const satisfies SemanticProcessProgram;

const childTaskId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "ChildTask",
  activation: 1,
});

const deadlineId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "Deadline",
  activation: 1,
});

const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-bounded-scope",
  processId,
  instanceId,
  initialVariables: [],
});

const completeChildTask = Object.freeze({
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-child-task",
  taskId: childTaskId,
  submittedValues: [],
});

const fireDeadline = Object.freeze({
  kind: StimulusKind.FireTimer,
  commandId: "fire-deadline",
  timerId: deadlineId,
  logicalTimeMs: 1000,
});

function armed() {
  const started = applyStimulus(boundedScopeProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

test("the hand-built fixture is a well-formed program", () => {
  assert.equal(isWellFormedSemanticProcessProgram(boundedScopeProgram), true);
});

test("start arms the child scope, its entry, and the deadline together", () => {
  const state = armed();

  assert.deepEqual(state.control, {
    kind: ControlStateKind.Running,
    instanceId,
  });
  assert.equal(state.logicalTimeMs, 0);
  assert.deepEqual(
    state.scopeOccurrences.map(({ id }) => id),
    [rootOccurrence, childOccurrence],
  );
  assert.deepEqual(state.userTaskWaits.map(({ id, owner }) => ({ id, owner })), [
    { id: childTaskId, owner: childOccurrence },
  ]);
  assert.deepEqual(state.controlTokens, []);
});

/**
 * The capsule's stated correctness requirement, asserted directly because it has no witness.
 *
 * A child-owned deadline keeps `isScopeOccurrenceQuiescent` false forever, so the normal route would
 * deadlock while the deadline route stayed correct. Nothing observable distinguishes the two owners.
 */
test("the deadline is owned by the parent scope occurrence, not the child", () => {
  assert.deepEqual(armed().timerWaits, [
    {
      id: deadlineId,
      owner: rootOccurrence,
      deadlineMs: 1000,
      output: "place:Flow_Boundary",
    },
  ]);
});

test("child quiescence withdraws the deadline and opens the normal route", () => {
  const won = applyStimulus(boundedScopeProgram, armed(), completeChildTask);

  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.deepEqual(won.state.timerWaits, []);
  assert.equal(won.state.logicalTimeMs, 0);
  assert.deepEqual(
    won.state.scopeOccurrences.map(({ id }) => id),
    [rootOccurrence],
  );
  assert.deepEqual(
    won.state.userTaskWaits.map(({ id }) => id.elementId),
    ["AfterScope"],
  );
});

test("the deadline victory terminates the live child region and opens the boundary route", () => {
  const state = armed();
  const won = applyStimulus(boundedScopeProgram, state, fireDeadline);

  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.deepEqual(won.state.timerWaits, []);
  assert.equal(won.state.logicalTimeMs, 1000);
  assert.deepEqual(
    won.state.scopeOccurrences.map(({ id }) => id),
    [rootOccurrence],
  );
  assert.deepEqual(
    won.state.userTaskWaits.map(({ id }) => id.elementId),
    ["EscalationTask"],
  );
  // The cancelled region's counters are historical facts and are never rewound or removed, while the
  // boundary route's own task legitimately adds its counter on top. Comparing the whole arrays would
  // assert the opposite of the claim.
  assert.deepEqual(
    won.state.scopeActivations.find(({ elementId }) => elementId === childScopeId),
    { elementId: childScopeId, count: 1 },
  );
  assert.deepEqual(
    won.state.taskActivations.find(({ elementId }) => elementId === "ChildTask"),
    { elementId: "ChildTask", count: 1 },
  );
  // The child task was still active, so no None End was ever reached inside the cancelled region.
  assert.equal(won.state.endOccurrences, 0);
  assert.equal(state.endOccurrences, 0);
});

test("the normal route is unreachable once the deadline has won", () => {
  const interrupted = applyStimulus(boundedScopeProgram, armed(), fireDeadline);
  assert.equal(interrupted.outcome, CommandOutcome.Committed);

  assert.equal(
    interrupted.state.controlTokens.some(
      ({ placeId }) => placeId === "place:Flow_Normal",
    ),
    false,
  );
  assert.equal(
    interrupted.state.userTaskWaits.some(
      ({ id }) => id.elementId === "AfterScope",
    ),
    false,
  );
});

test("every off-deadline firing rejects with the armed triple preserved exactly", () => {
  const state = armed();
  // 999 is the pre-due witness and 1001 its mirror, because a core comparing with `>=` rather than
  // `=` would accept one and refuse the other.
  for (const logicalTimeMs of [1, 999, 1001, 2000]) {
    const rejected = applyStimulus(boundedScopeProgram, state, {
      ...fireDeadline,
      commandId: `fire-deadline-at-${logicalTimeMs}`,
      logicalTimeMs,
    });

    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, state);
  }
});

test("a refused pre-due firing leaves the exact deadline still able to win", () => {
  const refused = applyStimulus(boundedScopeProgram, armed(), {
    ...fireDeadline,
    commandId: "fire-deadline-at-999",
    logicalTimeMs: 999,
  });
  assert.equal(refused.outcome, CommandOutcome.Rejected);

  const won = applyStimulus(boundedScopeProgram, refused.state, fireDeadline);

  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.equal(won.state.logicalTimeMs, 1000);
  assert.deepEqual(
    won.state.userTaskWaits.map(({ id }) => id.elementId),
    ["EscalationTask"],
  );
});

test("every wrong deadline identity rejects with exact state preservation", () => {
  const state = armed();

  for (
    const mutation of [
      { processInstanceId: "Other_Instance" },
      { elementId: "ChildTask" },
      { elementId: "Other_Timer" },
      { activation: 2 },
    ]
  ) {
    const rejected = applyStimulus(boundedScopeProgram, state, {
      ...fireDeadline,
      commandId: `fire-wrong-${JSON.stringify(mutation)}`,
      timerId: { ...deadlineId, ...mutation },
    });

    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, state);
  }
});

test("each victory makes the sibling arm ineligible without changing state", () => {
  const afterQuiescence = applyStimulus(
    boundedScopeProgram,
    armed(),
    completeChildTask,
  ).state;
  const staleDeadline = applyStimulus(
    boundedScopeProgram,
    afterQuiescence,
    fireDeadline,
  );
  assert.equal(staleDeadline.outcome, CommandOutcome.Rejected);
  assert.deepEqual(staleDeadline.state, afterQuiescence);

  const afterDeadline = applyStimulus(
    boundedScopeProgram,
    armed(),
    fireDeadline,
  ).state;
  const staleCompletion = applyStimulus(
    boundedScopeProgram,
    afterDeadline,
    completeChildTask,
  );
  assert.equal(staleCompletion.outcome, CommandOutcome.Rejected);
  assert.deepEqual(staleCompletion.state, afterDeadline);
});
