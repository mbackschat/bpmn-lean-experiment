/**
 * A Cancel inside a Multi-Instance Transaction (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I15, D12; BPMN
 * 2.0.2 §10.3.5, §13.5.5): the cancelling body compensates its own records while the other bodies go on; when its run
 * completes, the Cancel boundary cancels the Activity, every other body and run with it, and the records that completed
 * bodies retained are dropped, never compensated.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { boundary, end, flow, gateway, loop, scope, start, variable } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, complete, driveFrom, handlerTask, parts, userTask, waiting } from "./compensation-support.ts";

/** `items` bound to `count` Strings `i0`, `i1`, …. */
const items = (count: number): Json[] =>
  [{ name: "items", value: { kind: "list", value: Array.from({ length: count }, (_, index) => ({ kind: "string", value: `i${index}` })) } }];

const itemIs = (value: string): Json => ({ simpleBoolean: { body: { stringEquals: { name: "item", value } } } });
const always: Json = { simpleBoolean: { body: { literal: { value: true } } } };

/**
 * `S -> L -> Done -> E`, where the Transaction `L` loops over `items` running `LS -> W -> K -> G`, `W` compensable by
 * `HW`, and `G` reaches the Cancel End `LC` when `cancels` holds, else the none End `LK`; `L`'s Cancel boundary `B`
 * leads to `Cancelled`.
 */
function lots(mode: string, cancels: Json): Json {
  const transaction = { transaction: { payload: { method: "compensate" } } };
  const looping = loop({ mode, count: { collection: { items: variable("items") } }, outputDataItem: null });
  return chain([scope("L", transaction, {}, { multiInstance: looping, boundaries: [boundary("B", "cancel")] }), userTask("Done")], "none",
    parts({
      elements: [
        start("LS", null, [], "L"), userTask("W", "HW", "L"), userTask("K", null, "L"),
        gateway("G", { exclusive: { candidates: ["g0"], default: "g1" } }, {}, "L"), end("LC", "cancel", "L"), end("LK", "none", "L"),
        handlerTask("HW", "L"), userTask("Cancelled"), end("EC"),
      ],
      flows: [
        flow("l0", "LS", "W"), flow("l1", "W", "K"), flow("l2", "K", "G"), flow("g0", "G", "LC", cancels), flow("g1", "G", "LK"),
        flow("b0", "B", "Cancelled"), flow("b1", "Cancelled", "EC"),
      ],
    }));
}

const processed = [complete("W", 1), complete("W", 2), complete("W", 3)];

test("a parallel body's Cancel compensates that body only while the others go on, then drops a completed body's records", () => {
  const program = lots("parallel", itemIs("i1"));
  // Body 1 completes; body 2 cancels while body 3 still waits at K.
  const cancelled = [...processed, complete("K", 1), complete("K", 2)];
  assert.deepEqual(waiting(driveFrom(program, items(3), ...cancelled)), ["HW", "K"]);
  assert.deepEqual(waiting(driveFrom(program, items(3), ...cancelled, complete("HW"))), ["Cancelled"]);
  const finished = driveFrom(program, items(3), ...cancelled, complete("HW"), complete("Cancelled"));
  assert.ok(finished.ok && finished.value.status === "completed", JSON.stringify(finished));
  assert.deepEqual(finished.value.slots.compensation.retained, []);
});

for (const [order, first, second] of [["first", 1, 2], ["second", 2, 1]] as const) {
  test(`of two concurrent Cancel runs, the ${order} to complete takes the boundary and cancels the other`, () => {
    const program = lots("parallel", always);
    const both = [complete("W", 1), complete("W", 2), complete("K", 1), complete("K", 2)];
    assert.deepEqual(waiting(driveFrom(program, items(2), ...both)), ["HW", "HW"]);
    assert.deepEqual(waiting(driveFrom(program, items(2), ...both, complete("HW", first))), ["Cancelled"]);
    const late = driveFrom(program, items(2), ...both, complete("HW", first), complete("HW", second));
    assert.ok(!late.ok, JSON.stringify(late));
    assert.deepEqual([late.failure.tag, late.failure.code], ["rejected", "unknown-user-task"]);
  });
}

test("a sequential body's Cancel compensates that body and no later body begins", () => {
  const program = lots("sequential", itemIs("i1"));
  const cancelled = [complete("W", 1), complete("K", 1), complete("W", 2), complete("K", 2)];
  assert.deepEqual(waiting(driveFrom(program, items(3), ...cancelled)), ["HW"]);
  assert.deepEqual(waiting(driveFrom(program, items(3), ...cancelled, complete("HW"))), ["Cancelled"]);
});
