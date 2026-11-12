/**
 * How a compensation handler begins (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I10): its run begins it
 * without a token, in its context, so it may wait for a Message, and an unavailable Data Input holds it as it holds any
 * Activity (BPMN 2.0.2 §10.4.2, #104), with its run in progress until its scope occurrence is cleared. An Activity a
 * Scope's implicit start begins is held the same way, a Multi-Instance one by its entry read.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { activity, boundary, duration, flow, loop, mapping, receiveWork, scope, start, userWork, variable } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import {
  chain, compensateAll, committedState, complete, drive, instance, parts, throwing, userTask, waiting,
} from "./compensation-support.ts";

/** `S -> A -> E`, where `E` compensates `A`, whose unconnected handler is `handler`. */
const compensating = (handler: Json): Json =>
  chain([userTask("A", "HA")], compensateAll, parts({ elements: [handler], flows: [] }));

const unconnected = { incoming: [], outgoing: [], forCompensation: true };

test("a Receive Task handler waits for its Message", () => {
  const program = compensating(activity("HA", receiveWork({ messageRef: "M" }), unconnected));
  assert.deepEqual(waiting(drive(program, complete("A"))), ["HA"]);
});

const unavailable = [mapping("v", variable("missing"), "dataAssociation")];

test("a handler whose Data Input is unavailable is held, and its throw keeps waiting", () => {
  const program = compensating(activity("HA", userWork(), { ...unconnected, inputs: unavailable }));
  const state = committedState(drive(program, complete("A")));
  assert.deepEqual(waiting(drive(program, complete("A"))), []);
  assert.equal(state.status, "running");
  assert.equal(state.slots.held.length, 1);
  assert.equal(state.slots.compensation.runs.length, 1, "the run waits for the held handler");
});

test("an interrupting Timer on the throw's Sub-Process clears a held handler and its run", () => {
  // `P` runs `PS -> A -> PT`, where `PT` compensates `A` and waits; `P`'s Timer boundary `D` leads to `Late`.
  const program = chain([scope("P", "embedded", {}, { boundaries: [boundary("D", duration("PT30S"))] }), userTask("After")], "none",
    parts({
      elements: [
        start("PS", null, [], "P"), userTask("A", "HA", "P"), throwing("PT", compensateAll, "P"),
        activity("HA", userWork(), { ...unconnected, inputs: unavailable }, "P"), userTask("Late"),
      ],
      flows: [flow("p0", "PS", "A"), flow("p1", "A", "PT"), flow("d0", "D", "Late")],
    }));
  const fire = { kind: "timerFire", logicalTimeMs: 30_000, occurrence: { processInstanceId: instance, elementId: "D", activation: 1 } };
  assert.deepEqual(waiting(drive(program, complete("A"))), ["D"]);
  const cleared = committedState(drive(program, complete("A"), fire));
  assert.deepEqual(cleared.openItems.map((item) => item.element), ["Late"]);
  assert.deepEqual([cleared.slots.held.length, cleared.slots.compensation.runs.length], [0, 0]);
});

test("an Activity a Scope's implicit start begins with its Data Input unavailable is held", () => {
  // `P` has no Start Event, so its implicit start begins `T`, which no token reaches.
  const program = chain([scope("P", "embedded")], "none", parts({
    elements: [activity("T", userWork(), { inputs: unavailable }, "P")],
    flows: [],
  }));
  const state = committedState(drive(program));
  assert.deepEqual(state.openItems, []);
  assert.equal(state.slots.held.length, 1);
});

test("a Multi-Instance Activity a Scope's implicit start begins with its collection unavailable is held", () => {
  // `P` has no Start Event, so its implicit start begins `T`, whose entry reads the unset `items`.
  const looping = loop({ mode: "parallel", count: { collection: { items: variable("items") } }, outputDataItem: null });
  const program = chain([scope("P", "embedded")], "none", parts({
    elements: [activity("T", userWork(), { incoming: [], outgoing: [], multiInstance: looping }, "P")],
    flows: [],
  }));
  const state = committedState(drive(program));
  assert.deepEqual(state.openItems, []);
  assert.equal(state.slots.held.length, 1);
});
