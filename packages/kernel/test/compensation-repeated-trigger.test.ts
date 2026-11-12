/**
 * A second Compensation trigger while a run is in progress (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md,
 * "Trigger and order"; BPMN 2.0.2 §13.5.5, #103): the records a run claims are Compensating from its trigger, so the
 * second run takes only what is still retained, and each thrower waits for its own run's handlers only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { base, end, flow, gateway, start, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { compensateAll, complete, drive, handlerTask, throwing, userTask, waiting } from "./compensation-support.ts";

/**
 * A Parallel Gateway starting two branches in the root scope: `A -> TA -> WA` and `B -> TB -> WB`, where `TA` and `TB`
 * are untargeted throws that wait for their handlers; `A` is compensable by `HA`, and `B` by `HB` when `compensable`.
 */
function twoThrows(compensable: boolean): Json {
  return wired({
    ...base(),
    elements: [
      start("S"), gateway("P", "parallel"), userTask("A", "HA"), throwing("TA", compensateAll), userTask("WA"), end("EA"),
      userTask("B", compensable ? "HB" : null), throwing("TB", compensateAll), userTask("WB"), end("EB"), handlerTask("HA"),
      ...(compensable ? [handlerTask("HB")] : []),
    ],
    flows: [
      flow("s0", "S", "P"), flow("a0", "P", "A"), flow("a1", "A", "TA"), flow("a2", "TA", "WA"), flow("a3", "WA", "EA"),
      flow("b0", "P", "B"), flow("b1", "B", "TB"), flow("b2", "TB", "WB"), flow("b3", "WB", "EB"),
    ],
  });
}

test("a second throw while a handler of the first waits finds no record left and continues at once", () => {
  const program = twoThrows(false);
  assert.deepEqual(waiting(drive(program, complete("A"))), ["B", "HA"]);
  assert.deepEqual(waiting(drive(program, complete("A"), complete("B"))), ["HA", "WB"], "A's record is claimed by the first run");
  assert.deepEqual(waiting(drive(program, complete("A"), complete("B"), complete("HA"))), ["WA", "WB"]);
});

test("a second throw compensates a record completed after the first trigger and joins its own handler only", () => {
  const program = twoThrows(true);
  const both = [complete("A"), complete("B")];
  assert.deepEqual(waiting(drive(program, ...both)), ["HA", "HB"]);
  assert.deepEqual(waiting(drive(program, ...both, complete("HB"))), ["HA", "WB"], "HB's completion ends the second run alone");
  assert.deepEqual(waiting(drive(program, ...both, complete("HA"))), ["HB", "WA"], "HA's completion ends the first run alone");
  assert.deepEqual(waiting(drive(program, ...both, complete("HA"), complete("HB"))), ["WA", "WB"]);
});
