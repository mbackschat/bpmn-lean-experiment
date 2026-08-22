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
