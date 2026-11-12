/**
 * A completed Sub-Process without a handler under `ImplicitCompensation.everySubProcess`
 * (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I5): its records are retained as one group, ordered as one
 * subject among its siblings, whose compensation runs them as a nested run before the outer run goes on.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { end, flow, scope, start } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, compensateAll, complete, drive, handlerTask, parts, userTask, waiting } from "./compensation-support.ts";

/** `S -> A -> B -> E`, where the Sub-Process `A` runs `AS -> T1 -> T2 -> AE` and `E` compensates everything. */
function program(implicitCompensation: string): Json {
  return chain([scope("A", "embedded"), userTask("B", "HB")], compensateAll, parts({
    elements: [
      start("AS", null, [], "A"), userTask("T1", "H1", "A"), userTask("T2", "H2", "A"), end("AE", "none", "A"),
      handlerTask("H1"), handlerTask("H2"), handlerTask("HB"),
    ],
    flows: [flow("a0", "AS", "T1"), flow("a1", "T1", "T2"), flow("a2", "T2", "AE")],
  }), { implicitCompensation });
}

const done = [complete("T1"), complete("T2"), complete("B")];

test("a group runs its records after the handler of the subject that followed it, latest dependency first", () => {
  const grouped = program("everySubProcess");
  assert.deepEqual(waiting(drive(grouped, ...done)), ["HB"]);
  assert.deepEqual(waiting(drive(grouped, ...done, complete("HB"))), ["H2"]);
  assert.deepEqual(waiting(drive(grouped, ...done, complete("HB"), complete("H2"))), ["H1"]);
  const finished = drive(grouped, ...done, complete("HB"), complete("H2"), complete("H1"));
  assert.ok(finished.ok && finished.value.status === "completed", JSON.stringify(finished));
});

test("without implicit compensation the records join the parent's, unordered against the later sibling", () => {
  assert.deepEqual(waiting(drive(program("refused"), ...done)), ["H2", "HB"]);
});
