/**
 * `SMI-ITERATE-01` and `SMI-COMPLETE-01`: what one inner completion changes, and what the last one does.
 *
 * The oracle is the capsule's sequential-generation rule together with `AOO-TURNOVER-03`. A non-final
 * completion closes that task occurrence, stores its output, and creates exactly the next one, while
 * the outer Activity occurrence keeps its identity, its owner, its operation, and its one lifetime
 * deadline. The last completion publishes the exact ordered collection once and removes all three.
 *
 * The deadline assertions carry most of the weight, and their reach is exact. An implementation that
 * re-armed the handler, minting a fresh Timer occurrence, fails them. An implementation that recomputed
 * the same deadline from the same logical time does not, and cannot be caught here: no logical time
 * elapses across an iteration boundary, so a recomputed deadline is byte-identical to the preserved
 * one. The host's remaining-time check is what separates those two, which makes it evidence the
 * adapter owns rather than evidence this file can supply.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  SemanticOperationKind,
  VariableValueKind,
  applyInternalOperation,
  completeSequentialMultiInstanceIteration,
  runtimeStateDefects,
  sequentialMultiInstanceControllerFor,
  type RuntimeState,
  type VariableBinding,
} from "@bpmn-lean/semantic-core";

import {
  completeIteration,
  innerTaskId,
  instanceId,
  items,
  outerActivityId,
  outerTimerId,
  reviewData,
  reviewProgram,
  start,
  startedState,
} from "./sequential-multi-instance-fixture.ts";

function operationOfKind(kind: SemanticOperationKind) {
  const operation = reviewProgram.operations.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(operation !== undefined, `the fixture must carry one ${kind}`);
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

function complete(state: RuntimeState, counter: number, result: string): RuntimeState {
  const next = completeSequentialMultiInstanceIteration(
    reviewProgram,
    state,
    completeIteration(counter, result),
  );
  assert.ok(next !== null, `iteration ${counter} must commit`);
  return next;
}

function outputBinding(state: RuntimeState): VariableBinding | undefined {
  return state.variables.process.bindings.find(({ name }) =>
    name === reviewData.output.dataObjectId
  );
}

test("a non-final completion replaces the body and preserves the outer deadline", () => {
  const before = entered();
  const [deadline] = before.timerWaits;
  assert.ok(deadline !== undefined);

  const after = complete(before, 0, "reviewed alpha");

  assert.deepEqual(
    after.userTaskWaits.map(({ id }) => id),
    [innerTaskId(1)],
    "the completed task is closed and exactly the next one is generated",
  );
  assert.deepEqual(
    after.timerWaits,
    [deadline],
    "one lifetime deadline, byte-identical across the iteration boundary",
  );

  const [record] = after.activityOccurrences;
  assert.ok(record !== undefined);
  assert.deepEqual(record.id, outerActivityId, "the outer identity is not re-armed");
  assert.deepEqual(record.attachedTimers, [outerTimerId]);
  assert.deepEqual(record.body, {
    kind: ActivityBodyKind.UserTask,
    task: innerTaskId(1),
  });

  const controller = sequentialMultiInstanceControllerFor(
    after.sequentialMultiInstanceControllers ?? [],
    outerActivityId,
  );
  assert.deepEqual(controller?.outputSlots, ["reviewed alpha"]);
  assert.deepEqual(controller?.snapshot, [...items], "the snapshot never changes");

  assert.equal(outputBinding(after), undefined, "no Process output before natural completion");
  assert.deepEqual(runtimeStateDefects(reviewProgram, instanceId, after), []);
});

test("the body's activation diverges from its handler's after one iteration", () => {
  const after = complete(entered(), 0, "reviewed alpha");
  const [record] = after.activityOccurrences;
  assert.ok(record !== undefined);
  assert.equal(record.body.kind, ActivityBodyKind.UserTask);
  const bodyActivation = record.body.kind === ActivityBodyKind.UserTask
    ? record.body.task.activation
    : -1;
  const [attached] = record.attachedTimers;

  assert.equal(bodyActivation, 2, "the inner task advanced");
  assert.equal(attached?.activation, 1, "its handler did not");
  assert.equal(
    record.id.activation,
    1,
    "and neither did the outer Activity, which is what makes the ordinal join wrong",
  );
});

test("the final completion publishes the ordered collection once and closes the outer Activity", () => {
  let state = entered();
  state = complete(state, 0, "reviewed alpha");
  state = complete(state, 1, "reviewed beta");
  state = complete(state, 2, "reviewed gamma");

  assert.deepEqual(state.userTaskWaits, [], "no inner instance remains");
  assert.deepEqual(state.timerWaits, [], "the lifetime deadline is withdrawn");
  assert.deepEqual(state.activityOccurrences, [], "the outer record is removed");
  assert.deepEqual(state.sequentialMultiInstanceControllers, []);

  assert.deepEqual(
    outputBinding(state)?.value,
    {
      kind: VariableValueKind.StringList,
      value: ["reviewed alpha", "reviewed beta", "reviewed gamma"],
    },
    "index order, not completion order",
  );
  assert.deepEqual(runtimeStateDefects(reviewProgram, instanceId, state), []);
});

test("each iteration's result occupies its own slot", () => {
  // Not an index-versus-completion-order discriminator, and saying so matters. This profile keeps one
  // active instance, so completion order *is* index order in every admitted schedule and no state can
  // separate the two rules. What this does separate is a slot defect: an implementation that appended
  // to the wrong position, overwrote a filled slot, or dropped one fails on the values.
  let state = entered();
  state = complete(state, 0, "first");
  state = complete(state, 1, "second");
  state = complete(state, 2, "third");
  assert.deepEqual(
    outputBinding(state)?.value,
    { kind: VariableValueKind.StringList, value: ["first", "second", "third"] },
  );
});

test("a wrong output binding name and a stale task are both refused", () => {
  const before = entered();

  const wrongBinding = completeSequentialMultiInstanceIteration(
    reviewProgram,
    before,
    {
      ...completeIteration(0, "reviewed alpha"),
      submittedValues: [
        {
          name: reviewData.input.taskDataInputId,
          value: { kind: VariableValueKind.String, value: "reviewed alpha" },
        },
      ],
    },
  );
  assert.equal(wrongBinding, null, "a result for the right task under the wrong name is refused");

  const after = complete(before, 0, "reviewed alpha");
  assert.equal(
    completeSequentialMultiInstanceIteration(
      reviewProgram,
      after,
      completeIteration(0, "again"),
    ),
    null,
    "the withdrawn iteration cannot be completed a second time",
  );
});
