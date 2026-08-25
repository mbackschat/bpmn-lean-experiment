import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyStimulus,
  CommandOutcome,
  initialState,
  projectCurrentControlPositions,
  RuntimeStateDefect,
  runtimeStateDefects,
  runtimeStateRegressions,
  RuntimeStateRegression,
  type RuntimeState,
} from "@bpmn-lean/semantic-core";

import {
  eventRaceProgram,
  eventRaceStart,
  timerFiring,
} from "./event-based-gateway-fixture.ts";
import {
  boundedProgram,
  completeBoundedTask,
  instanceId as boundedInstanceId,
  start as boundedStart,
} from "./bounded-task-fixture.ts";
import {
  configuredTaskProgram,
  startFor,
} from "./flow-node-occurrence-lifecycle-fixture.ts";

/**
 * Well-formedness of committed runtime state, and the malformed states the account refuses.
 *
 * The oracle is the reviewed conjunct list, not the Lean predicate: this validator is written over
 * the core's own sorted-multiplicity representation and reports the failing class by name, so
 * agreement with Lean is a transcription check carried by the publication-parity channel rather
 * than something asserted here.
 *
 * Every malformed state below is unreachable by construction. A class an admitted transition could
 * actually produce would be a semantic defect rather than a witness.
 */

const armed: RuntimeState = applyStimulus(
  eventRaceProgram,
  initialState,
  eventRaceStart,
).state;

function instanceId(): string {
  assert.notEqual(armed.control.kind, "notStarted");
  return "event-race-instance";
}

test("a state reached by admitted execution is well-formed", () => {
  assert.deepEqual(runtimeStateDefects(eventRaceProgram, instanceId(), armed), []);
  assert.deepEqual(runtimeStateDefects(eventRaceProgram, instanceId(), initialState), []);
});

test("W1: a wait naming an occurrence that does not exist is refused", () => {
  // The owner is stranded by pointing the wait at an activation no occurrence carries, not by
  // emptying `scopeOccurrences`. Emptying it would destroy the hosting root, which the existing
  // position predicate already rejects, and a witness an existing predicate catches measures
  // nothing new. Here the root stays valid and only the wait's owner is dead.
  const [timerWait] = armed.timerWaits;
  assert.ok(timerWait !== undefined, "the armed race must hold one Timer wait");
  const stranded: RuntimeState = {
    ...armed,
    timerWaits: [{ ...timerWait, owner: { ...timerWait.owner, activation: 2 } }],
  };

  assert.deepEqual(
    runtimeStateDefects(eventRaceProgram, instanceId(), stranded)
      .filter((defect) => defect === RuntimeStateDefect.DanglingWaitOwner),
    [RuntimeStateDefect.DanglingWaitOwner],
  );
  assert.notEqual(
    projectCurrentControlPositions(eventRaceProgram, stranded),
    null,
    "the existing position projection must still accept it, or this witness measures nothing",
  );
});

test("W2: two Timer waits sharing one occurrence key are refused", () => {
  const [timerWait] = armed.timerWaits;
  assert.ok(timerWait !== undefined, "the armed race must hold one Timer wait");
  const duplicated: RuntimeState = {
    ...armed,
    // A different deadline under the same key: uniqueness is about the key, not the whole record,
    // and a duplicate that differed in nothing would also be caught by ordinary equality.
    timerWaits: [timerWait, { ...timerWait, deadlineMs: timerWait.deadlineMs + 1 }],
  };

  assert.deepEqual(
    runtimeStateDefects(eventRaceProgram, instanceId(), duplicated)
      .filter((defect) => defect === RuntimeStateDefect.DuplicateWaitIdentity),
    [RuntimeStateDefect.DuplicateWaitIdentity],
  );
});

test("W3: a Message wait no operation declares is refused", () => {
  const [messageWait] = armed.messageWaits;
  assert.ok(messageWait !== undefined, "the armed race must hold one Message wait");
  const undeclared: RuntimeState = {
    ...armed,
    messageWaits: [{
      ...messageWait,
      id: { ...messageWait.id, elementId: "MessageCatch_Injected" },
    }],
  };

  assert.deepEqual(
    runtimeStateDefects(eventRaceProgram, instanceId(), undeclared)
      .filter((defect) => defect === RuntimeStateDefect.UndeclaredWaitIdentity),
    [RuntimeStateDefect.UndeclaredWaitIdentity],
  );
});

test("W4: a successor that rewinds an activation counter is refused", () => {
  const rewound: RuntimeState = {
    ...armed,
    timerWaits: [],
    timerActivations: armed.timerActivations.map((activation) => ({
      ...activation,
      count: activation.count - 1,
    })),
  };

  // W4 satisfies every state conjunct and violates only the two-state relation, which is why
  // monotonicity is not a conjunct of well-formedness.
  assert.deepEqual(runtimeStateDefects(eventRaceProgram, instanceId(), rewound), []);
  assert.deepEqual(
    runtimeStateRegressions(armed, rewound),
    [RuntimeStateRegression.ActivationCounter],
  );
});

test("withdrawing a wait without touching its counter is not a regression", () => {
  const withdrawn: RuntimeState = { ...armed, timerWaits: [], messageWaits: [], eventRaces: [] };

  assert.deepEqual(runtimeStateRegressions(armed, withdrawn), []);
});

test("an exact Activity identity cannot be reissued after a committed withdrawal", () => {
  const firstIssue = applyStimulus(boundedProgram, initialState, boundedStart);
  assert.equal(firstIssue.outcome, CommandOutcome.Committed);
  const [firstRecord] = firstIssue.state.activityOccurrences;
  const [firstTask] = firstIssue.state.userTaskWaits;
  const [firstTimer] = firstIssue.state.timerWaits;
  assert.ok(firstRecord !== undefined);
  assert.ok(firstTask !== undefined);
  assert.ok(firstTimer !== undefined);

  const withdrawal = applyStimulus(
    boundedProgram,
    firstIssue.state,
    completeBoundedTask,
  );
  assert.equal(withdrawal.outcome, CommandOutcome.Committed);
  assert.deepEqual(withdrawal.state.activityOccurrences, []);
  assert.deepEqual(withdrawal.state.activityActivations, [
    { elementId: firstRecord.id.activityElementId, count: 1 },
  ]);

  const exactReissue: RuntimeState = {
    ...withdrawal.state,
    activityOccurrences: [firstRecord],
    userTaskWaits: [firstTask, ...withdrawal.state.userTaskWaits],
    timerWaits: [firstTimer],
  };

  assert.deepEqual(runtimeStateDefects(boundedProgram, boundedInstanceId, exactReissue), []);
  assert.deepEqual(runtimeStateRegressions(firstIssue.state, withdrawal.state), []);
  assert.deepEqual(
    runtimeStateRegressions(withdrawal.state, exactReissue),
    [RuntimeStateRegression.ActivityOccurrenceIssue],
  );
});

test("a not-started state holding runtime work is refused", () => {
  const pending: RuntimeState = { ...initialState, initiationPending: true };

  assert.deepEqual(
    runtimeStateDefects(eventRaceProgram, instanceId(), pending),
    [RuntimeStateDefect.NotStartedWithWork],
  );
});

test("a malformed state is refused instead of transitioned from", () => {
  const [strandedTimer] = armed.timerWaits;
  assert.ok(strandedTimer !== undefined);
  const orphaned: RuntimeState = {
    ...armed,
    timerWaits: [{ ...strandedTimer, owner: { ...strandedTimer.owner, activation: 2 } }],
  };

  // The discriminating part is that this firing *commits* on the well-formed state. A stimulus the
  // account already refuses for another reason would pass this test without the gate existing.
  const committed = applyStimulus(eventRaceProgram, armed, timerFiring());
  assert.notEqual(committed.outcome, CommandOutcome.Rejected);

  // The gate can only reach states no transition produces: preservation is what makes an
  // unreachable state the sole thing it rejects, so no admitted model loses a command here.
  const refused = applyStimulus(eventRaceProgram, orphaned, timerFiring());
  assert.equal(refused.outcome, CommandOutcome.Rejected);
  assert.deepEqual(refused.state, orphaned);
});

test("the empty state still accepts the start it accepted before", () => {
  const accepted = applyStimulus(eventRaceProgram, initialState, eventRaceStart);

  assert.notEqual(accepted.outcome, CommandOutcome.Rejected);
});

test("every commutation-affected collection requires canonical storage order", () => {
  const effectInstanceId = "effect-order-instance";
  const effectArmed = applyStimulus(
    configuredTaskProgram,
    initialState,
    startFor(configuredTaskProgram, effectInstanceId),
  ).state;
  const [messageWait] = armed.messageWaits;
  const [timerWait] = armed.timerWaits;
  const [effectWait] = effectArmed.effectWaits;
  const [effectScope] = effectArmed.variables.activities;
  assert.ok(messageWait !== undefined);
  assert.ok(timerWait !== undefined);
  assert.ok(effectWait !== undefined);
  assert.ok(effectScope !== undefined);

  const nextMessage = { ...messageWait, id: { ...messageWait.id, activation: 2 } };
  const nextTimer = { ...timerWait, id: { ...timerWait.id, activation: 2 } };
  const nextEffect = { ...effectWait, id: { ...effectWait.id, activation: 2 } };
  const nextEffectScope = {
    ...effectScope,
    owner: { ...effectScope.owner, activation: 2 },
  };
  const counterInversion = [
    { elementId: "z-counter", count: 1 },
    { elementId: "a-counter", count: 1 },
  ];
  const cases = [
    ["Message waits", eventRaceProgram, instanceId(), {
      ...armed,
      messageWaits: [nextMessage, messageWait],
      messageActivations: [{ elementId: messageWait.id.elementId, count: 2 }],
    }],
    ["Timer waits", eventRaceProgram, instanceId(), {
      ...armed,
      timerWaits: [nextTimer, timerWait],
      timerActivations: [{ elementId: timerWait.id.elementId, count: 2 }],
    }],
    ["effect waits", configuredTaskProgram, effectInstanceId, {
      ...effectArmed,
      effectWaits: [nextEffect, effectWait],
      effectActivations: [{ elementId: effectWait.id.elementId, count: 2 }],
      variables: {
        ...effectArmed.variables,
        activities: [effectScope, nextEffectScope],
      },
    }],
    ["Message counters", eventRaceProgram, instanceId(), {
      ...armed,
      messageActivations: counterInversion,
    }],
    ["Timer counters", eventRaceProgram, instanceId(), {
      ...armed,
      timerActivations: counterInversion,
    }],
    ["effect counters", configuredTaskProgram, effectInstanceId, {
      ...effectArmed,
      effectActivations: counterInversion,
    }],
    ["Activity-variable scopes", configuredTaskProgram, effectInstanceId, {
      ...effectArmed,
      effectWaits: [effectWait, nextEffect],
      effectActivations: [{ elementId: effectWait.id.elementId, count: 2 }],
      variables: {
        ...effectArmed.variables,
        activities: [nextEffectScope, effectScope],
      },
    }],
  ] as const;

  for (const [name, program, expectedInstanceId, state] of cases) {
    assert.ok(
      runtimeStateDefects(program, expectedInstanceId, state)
        .includes(RuntimeStateDefect.UnorderedCollection),
      `${name} must be rejected when storage order is noncanonical`,
    );
  }
});
