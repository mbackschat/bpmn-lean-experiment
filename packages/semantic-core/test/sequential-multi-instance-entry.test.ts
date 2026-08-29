/**
 * `SMI-ENTER-01`: what outer entry commits, and what a zero-item collection commits instead.
 *
 * The oracle is the capsule's entry rule: evaluate and snapshot the input collection once, create one
 * outer identity and one lifetime Timer, and either complete an empty collection atomically or
 * generate only loop counter zero. The two arms are asserted separately because they are different
 * transitions rather than one transition with a degenerate input, and asserting only the three-item
 * arm would leave the empty arm to be discovered by a scenario later.
 *
 * Nothing here asserts a counter. The controller stores the snapshot and the dense output slots, so
 * planned, generated, completed, pending, and the active loop counter are derivations; a test that
 * restated them as stored fields would be testing the projection twice.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  RuntimeStateDefect,
  RuntimeStateRegression,
  SemanticOperationKind,
  VariableValueKind,
  applyInternalOperation,
  runtimeStateDefects,
  runtimeStateRegressions,
  sequentialMultiInstanceControllerFor,
  type RuntimeState,
  type VariableBinding,
} from "@bpmn-lean/semantic-core";

import {
  innerTaskId,
  instanceId,
  items,
  outerActivityId,
  outerTimerId,
  owner,
  reviewData,
  reviewProgram,
  start,
  startEmpty,
  startedState,
} from "./sequential-multi-instance-fixture.ts";

/**
 * The state after the initiation and entry transition. This focused fixture drives the internal
 * dispatcher directly; registration tests independently cover the complete `applyStimulus` path.
 */
function entered(stimulus: { initialVariables: ReadonlyArray<VariableBinding> }): RuntimeState {
  const before = initiated(stimulus);
  const state = applyInternalOperation(
    reviewProgram,
    operationOfKind(SemanticOperationKind.AwaitSequentialMultiInstanceUserTask),
    before,
  );
  assert.ok(state !== null, "outer entry must apply");
  return state;
}

function initiated(stimulus: { initialVariables: ReadonlyArray<VariableBinding> }): RuntimeState {
  const state = applyInternalOperation(
    reviewProgram,
    operationOfKind(SemanticOperationKind.Initiate),
    startedState(stimulus),
  );
  assert.ok(state !== null, "the initiation must apply");
  return state;
}

function operationOfKind(kind: SemanticOperationKind) {
  const operation = reviewProgram.operations.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(operation !== undefined, `the fixture must carry one ${kind}`);
  return operation;
}

test("entry snapshots the collection once and generates only loop counter zero", () => {
  const before = initiated(start);
  const state = applyInternalOperation(
    reviewProgram,
    operationOfKind(SemanticOperationKind.AwaitSequentialMultiInstanceUserTask),
    before,
  );
  assert.ok(state !== null, "outer entry must apply");

  assert.deepEqual(
    state.userTaskWaits.map(({ id }) => id),
    [innerTaskId(0)],
    "exactly the first inner task is open",
  );
  assert.deepEqual(
    state.timerWaits.map(({ id, deadlineMs }) => ({ id, deadlineMs })),
    [{ id: outerTimerId, deadlineMs: 5000 }],
    "one lifetime deadline, armed from outer entry",
  );

  const [record] = state.activityOccurrences;
  assert.ok(record !== undefined, "entry creates the outer Activity occurrence record");
  assert.deepEqual(record.id, outerActivityId);
  assert.deepEqual(record.owner, owner);
  assert.deepEqual(record.body, {
    kind: ActivityBodyKind.UserTask,
    task: innerTaskId(0),
  });
  assert.deepEqual(record.attachedTimers, [outerTimerId]);

  const controller = sequentialMultiInstanceControllerFor(
    state.sequentialMultiInstanceControllers ?? [],
    outerActivityId,
  );
  assert.ok(controller !== undefined, "entry creates one controller for that record");
  assert.deepEqual(controller.snapshot, [...items], "declared order, copied once");
  assert.deepEqual(controller.outputSlots, [], "no result is accepted yet");

  assert.deepEqual(
    state.variables.process.bindings.map(({ name }) => name),
    [reviewData.input.dataObjectReferenceId],
    "the output collection is not published before natural completion",
  );
  assert.deepEqual(runtimeStateDefects(reviewProgram, instanceId, state), []);
  assert.equal(
    runtimeStateDefects(reviewProgram, instanceId, state).includes(
      RuntimeStateDefect.DuplicateActivityBodyClaim,
    ),
    false,
    "sequential entry inserts one disjoint Activity body claim",
  );
  assert.equal(
    runtimeStateRegressions(before, state).includes(
      RuntimeStateRegression.ActivityOccurrenceIssue,
    ),
    false,
    "the sequential Multi-Instance evaluator issues above the predecessor Activity mark",
  );
});

test("a zero-item collection completes atomically, creating no task, timer, or controller", () => {
  const state = entered(startEmpty);

  assert.deepEqual(state.userTaskWaits, [], "no inner instance is generated");
  assert.deepEqual(state.timerWaits, [], "the lifetime deadline never becomes a stable wait");
  assert.deepEqual(state.activityOccurrences, [], "no outer record survives the transition");
  assert.deepEqual(
    state.sequentialMultiInstanceControllers ?? [],
    [],
    "no controller is created for a collection with nothing to generate",
  );

  const published = state.variables.process.bindings.find(({ name }) =>
    name === reviewData.output.dataObjectReferenceId
  );
  assert.deepEqual(
    published?.value,
    { kind: VariableValueKind.StringList, value: [] },
    "the empty output collection is published exactly once",
  );
  assert.deepEqual(runtimeStateDefects(reviewProgram, instanceId, state), []);
});
