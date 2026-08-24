/**
 * `SMI-ITERATE-01` and `SMI-COMPLETE-01`: what one inner completion changes, and what the last one does.
 *
 * The oracle is the capsule's sequential-generation rule together with `AOO-TURNOVER-03`. A non-final
 * completion closes that task occurrence, stores its output, and creates exactly the next one, while
 * the outer Activity occurrence keeps its identity, its owner, its operation, and its one lifetime
 * deadline. The last completion publishes the exact ordered collection once and removes all three, in
 * both orders that publication must respect: its items in snapshot-index order, and the Process
 * bindings it lands in through the core's one canonical binding order.
 *
 * The deadline assertions carry most of the weight, and their reach is exact. An implementation that
 * re-armed the handler, minting a fresh Timer occurrence, fails them. An implementation that recomputed
 * the same deadline from the same logical time does not, and cannot be caught here: no logical time
 * elapses across an iteration boundary, so a recomputed deadline is byte-identical to the preserved
 * one. The host's remaining-time check is what separates those two, which makes it evidence the
 * adapter owns rather than evidence this file can supply.
 *
 * This file also owns one rule that is not about iteration, for both closing routes: removing an
 * Activity occurrence record leaves no wait that record named still live. Final completion and timer
 * interruption instantiate one proposition, so their two negatives sit side by side here rather than
 * each being filed under the transition that happens to trigger it; the interruption file holds the
 * routing and staleness cases instead. The profile's byte and cardinality bounds live in the limits
 * file, which measures them at entry and at completion together.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  SemanticOperationKind,
  VariableValueKind,
  applyInternalOperation,
  completeSequentialMultiInstanceIteration,
  interruptSequentialMultiInstance,
  runtimeStateDefects,
  sequentialMultiInstanceControllerFor,
  type RuntimeState,
  type SemanticProcessProgram,
  type VariableBinding,
} from "@bpmn-lean/semantic-core";

import {
  completeIteration,
  fireOuterTimer,
  innerTaskId,
  instanceId,
  items,
  orderSeparatingInputDataObjectReferenceId,
  orderSeparatingProgram,
  outerActivityId,
  outerTimerId,
  outputBinding,
  reviewData,
  reviewProgram,
  start,
  startOrderSeparating,
  startedState,
} from "./sequential-multi-instance-fixture.ts";

function operationOfKind(
  program: SemanticProcessProgram,
  kind: SemanticOperationKind,
) {
  const operation = program.operations.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(operation !== undefined, `the fixture must carry one ${kind}`);
  return operation;
}

function entered(
  program: SemanticProcessProgram = reviewProgram,
  stimulus: { initialVariables: ReadonlyArray<VariableBinding> } = start,
): RuntimeState {
  const initiated = applyInternalOperation(
    program,
    operationOfKind(program, SemanticOperationKind.Initiate),
    startedState(stimulus),
  );
  assert.ok(initiated !== null);
  const state = applyInternalOperation(
    program,
    operationOfKind(
      program,
      SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
    ),
    initiated,
  );
  assert.ok(state !== null);
  return state;
}

function complete(
  state: RuntimeState,
  counter: number,
  result: string,
  program: SemanticProcessProgram = reviewProgram,
): RuntimeState {
  const next = completeSequentialMultiInstanceIteration(
    program,
    state,
    completeIteration(counter, result),
  );
  assert.ok(next !== null, `iteration ${counter} must commit`);
  return next;
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
    "one publication carrying every accepted result in snapshot-index order",
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

/**
 * The same admitted record with a second live Timer attached to it.
 *
 * The appended occurrence shares the element and takes the next activation, so the collections stay in
 * canonical order without a comparator: both are keyed on Process instance, element, then activation.
 */
function withSecondAttachedTimer(state: RuntimeState): RuntimeState {
  const [record] = state.activityOccurrences;
  const [deadline] = state.timerWaits;
  assert.ok(record !== undefined && deadline !== undefined);
  const second = { ...deadline.id, activation: deadline.id.activation + 1 };
  return {
    ...state,
    timerWaits: [...state.timerWaits, { ...deadline, id: second }],
    timerActivations: state.timerActivations.map((counter) =>
      counter.elementId === second.elementId
        ? { ...counter, count: second.activation }
        : counter
    ),
    activityOccurrences: [{
      ...record,
      attachedTimers: [...record.attachedTimers, second],
    }],
  };
}

/**
 * Final completion withdraws every Timer its record lists, not the first one.
 *
 * `attachedTimersUnambiguous` admits a record listing two live Timer occurrences, so a head-only
 * withdrawal leaves a deadline whose Activity occurrence no longer exists, and its owner record is the
 * only thing that identified it. Lean's `finalCompletionState` filters on the whole list, which makes
 * this the state where the two accounts would otherwise disagree while both invariants accept it.
 */
test("final completion withdraws every Timer the outer record lists", () => {
  const before = withSecondAttachedTimer(entered());
  assert.deepEqual(
    runtimeStateDefects(reviewProgram, instanceId, before),
    [],
    "a record listing two live Timers is an admitted shape",
  );

  let state = complete(before, 0, "reviewed alpha");
  state = complete(state, 1, "reviewed beta");
  state = complete(state, 2, "reviewed gamma");

  assert.deepEqual(
    state.timerWaits,
    [],
    "no deadline survives the Activity occurrence it bounded",
  );
});

/**
 * One canonical binding order for a Process publication, locked where the comparators disagree.
 *
 * The two DataObjectReference identities here return opposite signs from a locale collation and from code point.
 * A publication that sorted by locale would therefore order these bindings the other way, would order
 * them differently again on a host with a different ICU locale, and would disagree with every other
 * completion in this core and with Lean's `publishProcessCollection`. The asserted order is code point,
 * which is locale-independent; only the refuted order depends on the host.
 */
test("the published collection uses the core's one canonical binding order", () => {
  let state = entered(orderSeparatingProgram, startOrderSeparating);
  state = complete(state, 0, "reviewed alpha", orderSeparatingProgram);
  state = complete(state, 1, "reviewed beta", orderSeparatingProgram);
  state = complete(state, 2, "reviewed gamma", orderSeparatingProgram);

  assert.deepEqual(
    state.variables.process.bindings.map(({ name }) => name),
    [
      orderSeparatingInputDataObjectReferenceId,
      reviewData.output.dataObjectReferenceId,
    ],
    "code point order, the same order every other Process publication uses",
  );
  assert.deepEqual(
    runtimeStateDefects(orderSeparatingProgram, instanceId, state),
    [],
  );
});

/**
 * Interruption withdraws every Timer its record lists, for the same reason final completion does.
 *
 * One proposition covers both closing routes: removing an Activity occurrence record must leave no wait
 * that record named still live. The fired deadline is one of those waits rather than a separate case,
 * so the filter runs over the whole list and the profile's Timer cardinality never enters it. A
 * conjunct forbidding the second attached Timer would instead put a profile fact inside the
 * profile-independent predicate, which is the objection both languages already accepted for body kind.
 */
test("interruption withdraws every Timer the outer record lists", () => {
  const before = withSecondAttachedTimer(entered());
  assert.deepEqual(
    runtimeStateDefects(reviewProgram, instanceId, before),
    [],
    "a record listing two live Timers is an admitted shape",
  );

  const after = interruptSequentialMultiInstance(
    reviewProgram,
    before,
    fireOuterTimer,
  );
  assert.ok(after !== null, "the fired deadline is the record's own");
  assert.deepEqual(
    after.timerWaits,
    [],
    "no deadline survives the Activity occurrence it bounded",
  );
  assert.deepEqual(after.activityOccurrences, []);
  assert.deepEqual(after.sequentialMultiInstanceControllers, []);
});
