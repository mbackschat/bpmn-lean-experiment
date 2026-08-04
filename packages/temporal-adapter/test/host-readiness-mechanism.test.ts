/**
 * Locks the two mechanisms both host readiness schedulers share, at the level where a copy fails
 * quietly.
 *
 * The Event-race and bounded-Activity schedulers each own a distinct semantic contract, but they
 * arrived at the same host mechanism twice: tag every callback with its Workflow activation and
 * classify one activation's worth at a time, and own the durable timer under a key derived from its
 * committed identity. Copying that shape already cost one defect, so the parts that can be wrong
 * without any witness noticing get one owner and this test.
 *
 * Both functions here are pure, so they are checked directly rather than through a Workflow. The
 * Workflow-coupled halves stay covered by the schedulers' own history and replay witnesses, which
 * observe the outcomes an operator sees.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  durableTimerKey,
  firstActivationBatch,
} from "@bpmn-lean/temporal-adapter";
import type { ActivationTagged } from "@bpmn-lean/temporal-adapter";
import type { OpenTimer } from "@bpmn-lean/semantic-core";

function tagged(activation: number, item: string): ActivationTagged<string> {
  return { activation, item };
}

test("an empty record has no batch to classify", () => {
  assert.equal(firstActivationBatch([]), undefined);
});

test("one activation's callbacks are taken whole, in recorded order", () => {
  assert.deepEqual(
    firstActivationBatch([tagged(4, "message"), tagged(4, "timer")]),
    { batch: ["message", "timer"], remaining: [] },
  );
});

test("a later activation's callbacks are left for their own batch", () => {
  assert.deepEqual(
    firstActivationBatch([tagged(4, "first"), tagged(9, "later")]),
    { batch: ["first"], remaining: [tagged(9, "later")] },
  );
});

/**
 * The discriminating case. A batch is every callback sharing the *first* activation, not a prefix:
 * an intervening activation can be recorded between two callbacks of the same one. Taking a prefix,
 * dropping only the head, or clearing the whole record all pass every test above and fail here — and
 * the last of those is how a copied readiness loop loses a command.
 */
test("callbacks of the first activation are collected across an intervening one", () => {
  assert.deepEqual(
    firstActivationBatch([
      tagged(4, "early"),
      tagged(9, "later"),
      tagged(4, "late"),
    ]),
    { batch: ["early", "late"], remaining: [tagged(9, "later")] },
  );
});

const deadline = {
  id: {
    processInstanceId: "Instance_1",
    elementId: "Deadline",
    activation: 1,
  },
  deadlineMs: 1_000,
} as const satisfies OpenTimer;

test("the durable key is stable for one committed timer identity", () => {
  assert.equal(durableTimerKey(deadline), durableTimerKey({ ...deadline }));
});

test("every part of the committed identity changes the durable key", () => {
  const changed: ReadonlyArray<OpenTimer> = [
    { ...deadline, id: { ...deadline.id, processInstanceId: "Instance_2" } },
    { ...deadline, id: { ...deadline.id, elementId: "OtherTimer" } },
    { ...deadline, id: { ...deadline.id, activation: 2 } },
    { ...deadline, deadlineMs: 2_000 },
  ];

  const keys = new Set([
    durableTimerKey(deadline),
    ...changed.map(durableTimerKey),
  ]);
  assert.equal(keys.size, changed.length + 1);
});

/**
 * The encoding this key replaced, kept only to state the collision it admitted. Its separator stays
 * an escape because a literal control character makes the file binary to Git.
 */
function nulJoinedKey(timer: OpenTimer): string {
  return [
    timer.id.processInstanceId,
    timer.id.elementId,
    timer.id.activation,
    timer.deadlineMs,
  ].join("\u0000");
}

/**
 * U+0000 is a Unicode scalar value, so the shared wire domain admits it inside an instance or element
 * identifier. Joining the parts on that separator therefore did not prevent forgery as its comment
 * claimed: moving the separator into an identifier produced a byte-identical key for two different
 * committed timers, which would have let a replaced deadline pass as the one still armed. A delimited
 * encoding refuses the collision structurally rather than by assuming the separator is unusable.
 */
test("the durable key distinguishes two identities the joined key conflated", () => {
  const split = {
    ...deadline,
    id: { ...deadline.id, processInstanceId: "a\u0000b", elementId: "c" },
  } as const satisfies OpenTimer;
  const shifted = {
    ...deadline,
    id: { ...deadline.id, processInstanceId: "a", elementId: "b\u0000c" },
  } as const satisfies OpenTimer;

  assert.equal(nulJoinedKey(split), nulJoinedKey(shifted));
  assert.notEqual(durableTimerKey(split), durableTimerKey(shifted));
});
