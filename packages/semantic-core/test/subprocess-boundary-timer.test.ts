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
  RuntimeStateRegression,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticTransitionKind,
  StimulusKind,
  applyStimulus,
  applyStimulusWithTrace,
  initialState,
  isWellFormedSemanticProcessProgram,
  projectOpenTimers,
  projectOpenUserTasks,
  replayCommittedTransitions,
  runtimeStateRegressions,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";

import {
  boundedScopeProgram,
  childOccurrence,
  childScopeId,
  childTaskId,
  completeChildTask,
  deadlineId,
  fireDeadline,
  instanceId,
  rootOccurrence,
  rootScopeId,
  start,
} from "./bounded-scope-fixture.ts";

function armed() {
  const started = applyStimulus(boundedScopeProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

function armingPair() {
  const traced = applyStimulusWithTrace(boundedScopeProgram, initialState, start);
  const index = traced.committedTransitions.findIndex(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation &&
    transition.operationKind === SemanticOperationKind.EnterBoundedScope
  );
  assert.ok(index > 0, "the start trace must contain bounded-scope arming");
  const before = replayCommittedTransitions(
    boundedScopeProgram,
    initialState,
    traced.committedTransitions.slice(0, index),
  );
  const after = replayCommittedTransitions(
    boundedScopeProgram,
    initialState,
    traced.committedTransitions.slice(0, index + 1),
  );
  assert.ok(before !== null);
  assert.ok(after !== null);
  return { before, after };
}

test("the hand-built fixture is a well-formed program", () => {
  assert.equal(isWellFormedSemanticProcessProgram(boundedScopeProgram), true);
});

/**
 * The scope-entry operation's origin must be the element that owns the child scope it enters.
 *
 * Its sibling `awaitBoundedUserTask` binds origin to host identity positively, while this operation
 * only ever asserted that its origin is *not* the boundary Timer. That leaves an operation free to
 * claim any other element as its host, which would misattribute every runtime occurrence the
 * transition creates to an element that does not enter the scope.
 */
test("a scope-entry operation whose origin does not own its child scope is rejected", () => {
  const misattributed = {
    ...boundedScopeProgram,
    operations: boundedScopeProgram.operations.map((operation) =>
      operation.kind === SemanticOperationKind.EnterBoundedScope
        ? {
          ...operation,
          origin: {
            kind: SemanticOriginKind.BpmnElement,
            elementId: "AfterScope",
          },
        }
        : operation
    ),
  };

  assert.equal(isWellFormedSemanticProcessProgram(misattributed), false);
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
  const pair = armingPair();
  assert.equal(
    runtimeStateRegressions(pair.before, pair.after).includes(
      RuntimeStateRegression.ActivityOccurrenceIssue,
    ),
    false,
    "the bounded-scope evaluator issues above the predecessor Activity mark",
  );
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

/**
 * `SPTIMER-OBSERVE-01` at the boundary it actually claims.
 *
 * The assertions above read `state.userTaskWaits` and `state.timerWaits` directly, which is the right
 * level for the ownership and counter facts they check but is not the contract this rule states. The
 * canonical projection is what every target compares, so the route discriminator is asserted here
 * rather than only in the differential catalog's mutation calibration, which executes solely when the
 * injector runs and is therefore a fragile home for a semantic assertion.
 */
test("both routes are distinguishable at the canonical observation boundary", () => {
  const armedProjection = projectOpenUserTasks(armed());
  assert.deepEqual(armedProjection.map(({ id }) => id.elementId), ["ChildTask"]);
  assert.deepEqual(
    projectOpenTimers(armed()).map(({ id, deadlineMs }) => [
      id.elementId,
      deadlineMs,
    ]),
    [["Deadline", 1000]],
  );

  const quiescence = applyStimulus(
    boundedScopeProgram,
    armed(),
    completeChildTask,
  ).state;
  const interruption = applyStimulus(
    boundedScopeProgram,
    armed(),
    fireDeadline,
  ).state;

  assert.deepEqual(
    projectOpenUserTasks(quiescence).map(({ id }) => id.elementId),
    ["AfterScope"],
  );
  assert.deepEqual(
    projectOpenUserTasks(interruption).map(({ id }) => id.elementId),
    ["EscalationTask"],
  );
  // Both arms retire the deadline, so the timer projection alone cannot separate them; the follow-on
  // task identity is the discriminator, which is why the two assertions above carry that weight.
  assert.deepEqual(projectOpenTimers(quiescence), []);
  assert.deepEqual(projectOpenTimers(interruption), []);
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
