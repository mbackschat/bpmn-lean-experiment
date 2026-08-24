/**
 * `SMI-OBSERVE-01`: what a consumer sees of a running repetition, and what stays private.
 *
 * The oracle is the capsule's public contract read together with Table 10.30's identity. Every count is
 * asserted against the state that produced it rather than against another count, because the whole
 * point of deriving them is that they cannot disagree; what a test can still catch is a wrong
 * derivation, an off-by-one in the loop counter, or a private fact reaching the projection.
 *
 * The negative that matters most is the absence of the key for every program without a Multi-Instance
 * Activity: that is what keeps existing profiles' canonical observation bytes unchanged, and it is a
 * property of the program rather than of the profile registry.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  SemanticOperationKind,
  VariableValueKind,
  applyInternalOperation,
  applyStimulus,
  CommandOutcome,
  completeSequentialMultiInstanceIteration,
  initialState,
  interruptSequentialMultiInstance,
  projectOpenMultiInstances,
  runtimeStateDefects,
  type RuntimeState,
} from "@bpmn-lean/semantic-core";

import {
  completeIteration,
  fireOuterTimer,
  innerTaskId,
  instanceId,
  items,
  outerActivityId,
  owner,
  reviewData,
  reviewProgram,
  start,
  startedState,
} from "./sequential-multi-instance-fixture.ts";
import {
  monitoredProgram,
  start as startMonitored,
} from "./monitored-task-fixture.ts";

function operationOfKind(kind: SemanticOperationKind) {
  const operation = reviewProgram.operations.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(operation !== undefined);
  return operation;
}

function entered(): RuntimeState {
  const initiated = applyInternalOperation(
    reviewProgram,
    operationOfKind(SemanticOperationKind.Initiate),
    startedState(start),
  );
  assert.ok(initiated !== null);
  const state = applyInternalOperation(
    reviewProgram,
    operationOfKind(SemanticOperationKind.AwaitSequentialMultiInstanceUserTask),
    initiated,
  );
  assert.ok(state !== null);
  return state;
}

function progress(state: RuntimeState) {
  const projected = projectOpenMultiInstances(reviewProgram, state);
  assert.ok(projected !== undefined, "this program declares a Multi-Instance Activity");
  return projected;
}

test("entry projects one controller whose counts satisfy both normative identities", () => {
  const [open] = progress(entered());
  assert.ok(open !== undefined);

  assert.deepEqual(open.id, outerActivityId);
  assert.equal(open.mode, "sequential");
  assert.equal(open.plannedInstanceCount, items.length);
  assert.equal(open.numberOfInstances, 1, "only loop counter zero is generated");
  assert.equal(open.numberOfActiveInstances, 1);
  assert.equal(open.numberOfCompletedInstances, 0);
  assert.equal(open.numberOfTerminatedInstances, 0);
  assert.equal(open.pendingItemCount, items.length - 1);

  assert.equal(
    open.numberOfInstances,
    open.numberOfActiveInstances + open.numberOfCompletedInstances +
      open.numberOfTerminatedInstances,
    "Table 10.30's identity",
  );
  assert.equal(
    open.plannedInstanceCount,
    open.pendingItemCount + open.numberOfInstances,
    "the project-owned planned identity",
  );
});

test("the active iteration carries its own snapshot item and the exact binding names", () => {
  const [open] = progress(entered());
  assert.deepEqual(open?.activeIterations, [
    {
      loopCounter: 0,
      taskId: innerTaskId(0),
      taskInput: {
        name: reviewData.input.taskDataInputId,
        value: { kind: VariableValueKind.String, value: items[0] },
      },
      completionBindingName: reviewData.output.taskDataOutputId,
    },
  ]);
});

test("the loop counter and the projected item advance together across an iteration", () => {
  const after = completeSequentialMultiInstanceIteration(
    reviewProgram,
    entered(),
    completeIteration(0, "reviewed alpha"),
  );
  assert.ok(after !== null);
  const [open] = progress(after);

  assert.equal(open?.numberOfCompletedInstances, 1);
  assert.equal(open?.numberOfInstances, 2);
  assert.equal(open?.pendingItemCount, 1);
  assert.deepEqual(open?.activeIterations[0]?.loopCounter, 1);
  assert.deepEqual(
    open?.activeIterations[0]?.taskInput.value,
    { kind: VariableValueKind.String, value: items[1] },
    "the second iteration carries the second item, not the first",
  );
  assert.deepEqual(open?.activeIterations[0]?.taskId, innerTaskId(1));
});

test("no output slot, snapshot, or result reaches the projection", () => {
  const after = completeSequentialMultiInstanceIteration(
    reviewProgram,
    entered(),
    completeIteration(0, "a private result"),
  );
  assert.ok(after !== null);
  assert.equal(
    JSON.stringify(progress(after)).includes("a private result"),
    false,
    "an accepted result is private until natural completion publishes the collection",
  );
  assert.equal(
    JSON.stringify(progress(after)).includes(items[2] ?? ""),
    false,
    "an ungenerated snapshot item is not projected either",
  );
});

test("interruption leaves an empty array, not an absent key", () => {
  const before = completeSequentialMultiInstanceIteration(
    reviewProgram,
    entered(),
    completeIteration(0, "reviewed alpha"),
  );
  assert.ok(before !== null);
  const after = interruptSequentialMultiInstance(reviewProgram, before, fireOuterTimer);
  assert.ok(after !== null);
  assert.deepEqual(
    progress(after),
    [],
    "the program still declares the Activity, so the key stays present and empty",
  );
});

test("a program with no Multi-Instance Activity omits the key entirely", () => {
  const started = applyStimulus(monitoredProgram, initialState, startMonitored);
  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.equal(
    projectOpenMultiInstances(monitoredProgram, started.state),
    undefined,
    "existing profiles' canonical observation bytes must not move",
  );
});

/** The same state with the outer record's body replaced by a live child scope. */
function withChildScopeBody(state: RuntimeState): RuntimeState {
  const [record] = state.activityOccurrences;
  assert.ok(record !== undefined);
  return {
    ...state,
    activityOccurrences: [{
      ...record,
      body: { kind: ActivityBodyKind.ChildScope, scope: owner },
    }],
  };
}

test("a malformed child-scope-bodied controller is refused before public projection", () => {
  const completed = completeSequentialMultiInstanceIteration(
    reviewProgram,
    entered(),
    completeIteration(0, "reviewed alpha"),
  );
  assert.ok(completed !== null);
  const state = withChildScopeBody(completed);
  assert.deepEqual(
    runtimeStateDefects(reviewProgram, instanceId, state),
    ["sequentialMultiInstanceControllerBindingMismatch"],
    "semantic admission must reject the malformed program-to-controller binding",
  );
  assert.throws(
    () => projectOpenMultiInstances(reviewProgram, state),
    /Cannot publish a malformed sequential Multi-Instance controller binding/u,
  );
});
