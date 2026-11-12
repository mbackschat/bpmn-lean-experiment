/**
 * The boundary Events of a Transaction its Cancel rolls back (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md
 * I18; BPMN 2.0.2 §13.3.2 Figure 13.2, §10.3.5): from the Cancel on, the Transaction is Terminating, so none of its
 * event-triggered boundaries, interrupting or not, fires while its handlers run, and the Cancel boundary continues
 * once they complete. A Multi-Instance Transaction keeps its body's boundaries armed while one instance's Cancel runs
 * (D12). The Timer is witnessed against CIB; the Message and the non-interrupting boundary rest on the pinned source
 * (`BpmnParse.java:3439`, `:3455`, `:3503`, `ExecutionEntity.java:1064-1072`).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { boundary, duration, end, flow, loop, message, scope, start, text, variable } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, complete, drive, driveFrom, handlerTask, instance, parts, userTask, waiting } from "./compensation-support.ts";

const transaction = { transaction: { payload: { method: "compensate" } } };

/**
 * `S -> T -> Done -> E`, where the Transaction `T` (looping by `looping` when given) runs `TS -> W -> TC`, `W`
 * compensable by `HW` and `TC` a Cancel End; `T` has the Cancel boundary `B`, the Timer boundary `D`, the Message
 * boundary `M` and the non-interrupting Timer boundary `N`.
 */
function cancelling(looping: Json | null = null): Json {
  const boundaries = [
    boundary("B", "cancel"), boundary("D", duration("PT30S")), boundary("M", message({ messageRef: "M", name: text("M") })),
    boundary("N", duration("PT10S"), { interrupting: false }),
  ];
  return chain([scope("T", transaction, {}, { boundaries, multiInstance: looping }), userTask("Done")], "none", parts({
    elements: [
      start("TS", null, [], "T"), userTask("W", "HW", "T"), end("TC", "cancel", "T"), handlerTask("HW", "T"),
      userTask("Cancelled"), userTask("TimedOut"), userTask("Messaged"), userTask("Noted"),
    ],
    flows: [
      flow("t0", "TS", "W"), flow("t1", "W", "TC"),
      flow("b0", "B", "Cancelled"), flow("d0", "D", "TimedOut"), flow("m0", "M", "Messaged"), flow("n0", "N", "Noted"),
    ],
  }));
}

const fire = (element: string, logicalTimeMs: number): Json =>
  ({ kind: "timerFire", logicalTimeMs, occurrence: { processInstanceId: instance, elementId: element, activation: 1 } });

test("a Transaction its Cancel rolls back takes none of its event-triggered boundaries while its handlers run", () => {
  const program = cancelling();
  assert.deepEqual(waiting(drive(program)), ["D", "M", "N", "W"]);
  assert.deepEqual(waiting(drive(program, complete("W"))), ["HW"]);
});

test("a Timer due while the Cancel compensates is rejected, and the Cancel boundary continues after the handlers", () => {
  const program = cancelling();
  const late = drive(program, complete("W"), fire("D", 30_000));
  assert.ok(!late.ok, JSON.stringify(late));
  assert.equal(late.failure.tag, "rejected");
  assert.deepEqual(waiting(drive(program, complete("W"), complete("HW"))), ["Cancelled"]);
});

test("a Multi-Instance Transaction keeps its body's boundaries armed while one instance's Cancel compensates", () => {
  const program = cancelling(loop({ count: { collection: { items: variable("items") } }, outputDataItem: null }));
  const items = [{ name: "items", value: { kind: "list", value: [{ kind: "string", value: "i0" }, { kind: "string", value: "i1" }] } }];
  assert.deepEqual(waiting(driveFrom(program, items, complete("W", 1))), ["D", "HW", "M", "N", "W"]);
});
