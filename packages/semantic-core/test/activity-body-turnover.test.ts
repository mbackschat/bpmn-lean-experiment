/**
 * Body turnover: one Activity occurrence keeps its identity while the body it owns is replaced.
 *
 * The oracle is [the ownership specification](../../../docs/ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md), rules
 * `AOO-TURNOVER-02` through `AOO-TURNOVER-04`.
 *
 * Nothing drives this transition yet: no registered profile admits a construct that replaces a body,
 * so the caller here is the test. That is the shape the proposal approved, and it is why the
 * separating assertion below is about *representation* rather than about a schedule. What turnover
 * makes checkable is the divergence between a body's activation and its attached handler's, which is
 * the pair every join this capsule retired was keyed on.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  CommandOutcome,
  RuntimeStateDefect,
  activityOccurrenceForAttachedTimer,
  attachedTimerOccurrences,
  applyStimulus,
  initialState,
  replaceActivityBodyTask,
  runtimeStateDefects,
  runtimeStateRegressions,
} from "@bpmn-lean/semantic-core";
import type { ActivityOccurrence, RuntimeState } from "@bpmn-lean/semantic-core";

import {
  boundedProgram,
  instanceId,
  start,
  taskId,
} from "./bounded-task-fixture.ts";

function armed(): RuntimeState {
  const started = applyStimulus(boundedProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

function defects(state: RuntimeState): ReadonlyArray<string> {
  return runtimeStateDefects(boundedProgram, instanceId, state);
}

/**
 * The replacement, with its defined-ness asserted at the call site.
 *
 * `replaceActivityBodyTask` is partial on purpose: it refuses a record this state does not hold and a
 * record that names no single live task body. Every case below is defined on it, so an unexpected
 * `null` must surface as this assertion rather than as a downstream shape mismatch.
 */
function replaced(state: RuntimeState, record: ActivityOccurrence): RuntimeState {
  const after = replaceActivityBodyTask(state, record);
  assert.ok(after !== null, "the armed record names a live task body");
  return after;
}

/** The record the fixture arms, with the deadline it is attached to. */
function armedRecord(state: RuntimeState) {
  const [record] = state.activityOccurrences;
  assert.ok(record !== undefined, "arming must create one record");
  assert.equal(record.body.kind, ActivityBodyKind.UserTask);
  assert.equal(record.attachedHandlers.length, 1);
  return record;
}

test("replacement withdraws the outgoing body wait and arms the incoming one", () => {
  const before = armed();
  assert.deepEqual(before.userTaskWaits.map(({ id }) => id), [taskId]);

  const after = replaced(before, armedRecord(before));

  assert.equal(
    defects(after).includes(RuntimeStateDefect.DuplicateActivityBodyClaim),
    false,
    "body replacement preserves unique Activity body claims",
  );

  assert.equal(after.userTaskWaits.length, 1, "exactly one body wait is live at any time");
  const [wait] = after.userTaskWaits;
  assert.ok(wait !== undefined);
  assert.equal(wait.id.elementId, taskId.elementId);
  assert.equal(wait.id.activation, taskId.activation + 1, "the incoming body draws a fresh key");
  assert.deepEqual(wait.owner, before.userTaskWaits[0]?.owner, "the body stays in its own scope");
});

test("replacement preserves the record's identity, owner, operation, and attached list", () => {
  const before = armed();
  const record = armedRecord(before);

  const after = replaced(before, record);
  const afterRecord = armedRecord(after);

  assert.deepEqual(afterRecord.id, record.id, "AOO-TURNOVER-03: the identity is the same occurrence");
  assert.deepEqual(afterRecord.owner, record.owner);
  assert.equal(afterRecord.operationId, record.operationId);
  assert.deepEqual(
    afterRecord.attachedHandlers,
    record.attachedHandlers,
    "AOO-TURNOVER-03: a handler armed before a replacement is the same handler after it",
  );
  assert.deepEqual(
    runtimeStateRegressions(before, after),
    [],
    "preserving the exact outer identity is not a new Activity issue",
  );
});

test("replacement advances the body's counter family and not the Activity's", () => {
  const before = armed();
  const after = replaced(before, armedRecord(before));

  assert.deepEqual(
    after.activityActivations,
    before.activityActivations,
    "AOO-TURNOVER-04: the Activity occurrence is not re-armed",
  );
  assert.notDeepEqual(
    after.taskActivations,
    before.taskActivations,
    "AOO-TURNOVER-04: the body draws its own occurrence identity from its own counter family",
  );
});

/**
 * The separating state, and what makes it separating.
 *
 * Before replacement the body's activation and its deadline's are both `1`, which is the coincidence
 * every retired join read as a pair. After replacement they differ, the record still resolves the
 * pair, and an ordinal join would resolve nothing at all rather than resolve it wrongly.
 */
test("after replacement the body and its handler disagree, and only the record still pairs them", () => {
  const before = armed();
  const deadline = attachedTimerOccurrences(armedRecord(before))[0];
  assert.ok(deadline !== undefined);
  assert.equal(
    before.userTaskWaits[0]?.id.activation,
    deadline.activation,
    "the pre-state is the coincidence the retired joins depended on",
  );

  const after = replaced(before, armedRecord(before));
  const body = after.userTaskWaits[0];
  assert.ok(body !== undefined);
  assert.notEqual(
    body.id.activation,
    deadline.activation,
    "turnover is exactly the state where the two ordinals diverge",
  );

  const record = activityOccurrenceForAttachedTimer(after.activityOccurrences, deadline);
  assert.ok(record !== undefined, "the record still resolves the deadline to its Activity");
  assert.equal(
    record.body.kind === ActivityBodyKind.UserTask ? record.body.task.activation : null,
    body.id.activation,
    "and the record's body is the live one, which ordinal equality would have missed entirely",
  );

  const ordinalJoin = after.userTaskWaits.filter(({ id }) =>
    id.activation === deadline.activation
  );
  assert.deepEqual(ordinalJoin, [], "the retired join returns no pair rather than a wrong one");
});

test("the post-replacement state is well-formed, and the pre-state is the control", () => {
  const before = armed();
  assert.deepEqual(defects(before), [], "the armed state is the control");
  assert.deepEqual(
    defects(replaced(before, armedRecord(before))),
    [],
    "AOO-TURNOVER-02: every committed state of the replacement is well-formed",
  );
});

/**
 * The domain refusal, and why it is a refusal rather than a repair.
 *
 * Two waits sharing the body key is the state `waitIdentitiesUnique` rejects. Taking the first and
 * withdrawing both would arm a replacement against an ambiguity the caller never learns about, so the
 * operation is undefined there. The Lean operation refuses the same shape, which is what keeps the two
 * targets comparable rather than merely agreeing on the cases both happen to accept.
 */
test("a record whose body key matches two live waits is refused, not repaired", () => {
  const before = armed();
  const [wait] = before.userTaskWaits;
  assert.ok(wait !== undefined);

  const ambiguous: RuntimeState = {
    ...before,
    userTaskWaits: [wait, { ...wait, name: "a second wait sharing the body key" }],
  };

  assert.equal(
    replaceActivityBodyTask(ambiguous, armedRecord(before)),
    null,
    "an ambiguous body must leave the operation undefined",
  );
  assert.notEqual(
    replaceActivityBodyTask(before, armedRecord(before)),
    null,
    "the unambiguous control must still be defined, or the refusal is not attributable",
  );
});

/**
 * The other domain refusal, which no shape mismatch downstream would report.
 *
 * The rewrite locates its record by identity, so a record the state does not hold matches nothing:
 * continuing would withdraw the outgoing wait and arm a successor while no record named either, and
 * the resulting state is one the well-formedness predicate does not refuse. The control is the same
 * record against the state that does hold it, so the refusal is attributable to membership alone.
 */
test("a record the state does not hold is refused, not silently half-applied", () => {
  const before = armed();
  const record = armedRecord(before);

  const withoutRecord: RuntimeState = { ...before, activityOccurrences: [] };
  assert.equal(defects(withoutRecord).length, 0, "the stripped state must itself be admitted, or the refusal is redundant");

  assert.equal(
    replaceActivityBodyTask(withoutRecord, record),
    null,
    "a record the state does not hold must leave the operation undefined",
  );
  assert.notEqual(
    replaceActivityBodyTask(before, record),
    null,
    "the held control must still be defined, or the refusal is not attributable to membership",
  );
});
