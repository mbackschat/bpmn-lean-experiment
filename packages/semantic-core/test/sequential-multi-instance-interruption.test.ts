/**
 * `SMI-CANCEL-01`: what the outer lifetime deadline discards, and what it refuses.
 *
 * The oracle is the capsule's interruption rule read against Clause 13.5.3 as this profile applies it:
 * the exact outer Timer cancels the active inner task, generates no pending item, discards the partial
 * output, removes the controller, and enables only the boundary path. The load-bearing negative is the
 * absence of a Process-scope output binding, because publishing a partial collection is the one
 * resolution this profile explicitly rejected.
 *
 * Interruption is asserted after one accepted result rather than at entry, since a partial collection
 * only exists once a slot is filled: interrupting an untouched controller would discard nothing and
 * would pass an implementation that published whatever it had.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SemanticOperationKind,
  applyInternalOperation,
  completeSequentialMultiInstanceIteration,
  interruptSequentialMultiInstance,
  runtimeStateDefects,
  type RuntimeState,
} from "@bpmn-lean/semantic-core";

import {
  completeIteration,
  fireOuterTimer,
  innerTaskId,
  instanceId,
  reviewData,
  reviewProgram,
  start,
  startedState,
} from "./sequential-multi-instance-fixture.ts";

function operationOfKind(kind: SemanticOperationKind) {
  const operation = reviewProgram.operations.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(operation !== undefined);
  return operation;
}

/** Entered, then one accepted result, so there is a partial collection to discard. */
function partiallyReviewed(): RuntimeState {
  const initiated = applyInternalOperation(
    reviewProgram,
    operationOfKind(SemanticOperationKind.Initiate),
    startedState(start),
  );
  assert.ok(initiated !== null);
  const entered = applyInternalOperation(
    reviewProgram,
    operationOfKind(SemanticOperationKind.AwaitSequentialMultiInstanceUserTask),
    initiated,
  );
  assert.ok(entered !== null);
  const after = completeSequentialMultiInstanceIteration(
    reviewProgram,
    entered,
    completeIteration(0, "reviewed alpha"),
  );
  assert.ok(after !== null);
  return after;
}

test("the outer deadline cancels the active task and discards the partial output", () => {
  const before = partiallyReviewed();
  const controller = (before.sequentialMultiInstanceControllers ?? [])[0];
  assert.deepEqual(
    controller?.outputSlots,
    ["reviewed alpha"],
    "there must be a partial collection, or nothing is discarded",
  );
  assert.deepEqual(
    before.userTaskWaits.map(({ id }) => id),
    [innerTaskId(1)],
    "the second iteration must be the active one",
  );

  const after = interruptSequentialMultiInstance(
    reviewProgram,
    before,
    fireOuterTimer,
  );
  assert.ok(after !== null, "the exact deadline must fire");

  assert.deepEqual(after.userTaskWaits, [], "the active inner task is withdrawn");
  assert.deepEqual(after.timerWaits, [], "the deadline is consumed");
  assert.deepEqual(after.activityOccurrences, [], "the outer record is removed");
  assert.deepEqual(after.sequentialMultiInstanceControllers, []);
  assert.equal(
    after.variables.process.bindings.some(({ name }) =>
      name === reviewData.output.dataObjectId
    ),
    false,
    "interruption publishes no Process-scope output, not even the partial one",
  );
  assert.equal(after.logicalTimeMs, 1000, "the firing instant is the deadline");
  assert.deepEqual(
    after.controlTokens.map(({ placeId }) => placeId),
    ["place:Flow_Boundary"],
    "only the boundary path is enabled",
  );
  assert.deepEqual(runtimeStateDefects(reviewProgram, instanceId, after), []);
});

test("a stale iteration cannot complete after interruption", () => {
  const after = interruptSequentialMultiInstance(
    reviewProgram,
    partiallyReviewed(),
    fireOuterTimer,
  );
  assert.ok(after !== null);
  assert.equal(
    completeSequentialMultiInstanceIteration(
      reviewProgram,
      after,
      completeIteration(1, "too late"),
    ),
    null,
    "the withdrawn task's completion commits nothing",
  );
});

test("an off-deadline firing instant is refused", () => {
  // The host derives the firing instant from committed state, so a stimulus naming another time is
  // describing a transition this account does not have rather than an early or late arrival.
  assert.equal(
    interruptSequentialMultiInstance(
      reviewProgram,
      partiallyReviewed(),
      { ...fireOuterTimer, logicalTimeMs: 999 },
    ),
    null,
  );
});
