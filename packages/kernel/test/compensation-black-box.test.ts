/**
 * A boundary compensation handler on a Sub-Process (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I8, D5; BPMN
 * 2.0.2 §13.5.5: it "can only perform black-box compensation"): under either implicit-compensation reading the handler
 * runs once and the records inside the Sub-Process end with its context, so their own handlers never run (CIB runs them
 * beside a Task handler, or a Sub-Process handler twice: CIB-DEV-0013).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { end, flow, scope, start } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import {
  chain, compensateAll, complete, drive, handlerScope, handlerTask, parts, userTask, waiting,
} from "./compensation-support.ts";

/** `S -> P -> E`, where `P` runs `PS -> T -> PE` with the boundary handler `HP`, given as `handler`, and `T` the handler `HT`. */
const program = (handler: ReturnType<typeof parts>, implicitCompensation: string): Json =>
  chain([scope("P", "embedded", {}, { compensationHandlers: ["HP"] })], compensateAll, parts({
    elements: [start("PS", null, [], "P"), userTask("T", "HT", "P"), end("PE", "none", "P"), handlerTask("HT")],
    flows: [flow("p0", "PS", "T"), flow("p1", "T", "PE")],
  }, handler), { implicitCompensation });

const handlers: [string, ReturnType<typeof parts>, string][] = [
  ["a Task", parts({ elements: [handlerTask("HP")], flows: [] }), "HP"],
  ["a Sub-Process", handlerScope("HP", [userTask("HPT", null, "HP")]), "HPT"],
];

for (const implicitCompensation of ["refused", "everySubProcess"]) {
  for (const [kind, handler, waits] of handlers) {
    test(`${kind} boundary handler of a Sub-Process runs once and consumes its records (${implicitCompensation})`, () => {
      const json = program(handler, implicitCompensation);
      assert.deepEqual(waiting(drive(json, complete("T"))), [waits]);
      const finished = drive(json, complete("T"), complete(waits));
      assert.ok(finished.ok && finished.value.status === "completed", JSON.stringify(finished));
      assert.deepEqual(finished.value.slots.compensation.retained, []);
    });
  }
}
