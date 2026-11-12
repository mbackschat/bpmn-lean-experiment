/**
 * How a compensation handler begins (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I10): its run begins it
 * without a token, in its context, so it may wait for a Message, and an unavailable Data Input has no flow to hold it on.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { activity, mapping, receiveWork, userWork, variable } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, compensateAll, complete, drive, parts, userTask, waiting } from "./compensation-support.ts";

/** `S -> A -> E`, where `E` compensates `A`, whose unconnected handler is `handler`. */
const compensating = (handler: Json): Json =>
  chain([userTask("A", "HA")], compensateAll, parts({ elements: [handler], flows: [] }));

const unconnected = { incoming: [], outgoing: [], forCompensation: true };

test("a Receive Task handler waits for its Message", () => {
  const program = compensating(activity("HA", receiveWork({ messageRef: "M" }), unconnected));
  assert.deepEqual(waiting(drive(program, complete("A"))), ["HA"]);
});

test("a handler whose Data Input is unavailable is refused as the handler's", () => {
  const inputs = [mapping("v", variable("missing"), "dataAssociation")];
  const program = compensating(activity("HA", userWork(), { ...unconnected, inputs }));
  const outcome = drive(program, complete("A"));
  assert.deepEqual(outcome, { ok: false, failure: { tag: "unsupported", code: "compensation.handlerInputUnavailable" } });
});
