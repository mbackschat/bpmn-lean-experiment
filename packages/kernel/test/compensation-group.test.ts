/**
 * A completed Sub-Process without a handler under `ImplicitCompensation.everySubProcess`
 * (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I5): its records are retained as one group, ordered as one
 * subject among its siblings, whose compensation runs them as a nested run before the outer run goes on.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { end, eventSubProcess, flow, refusalOf, scope, start } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, compensateAll, complete, drive, handlerTask, parts, throwing, userTask, waiting } from "./compensation-support.ts";

/**
 * `S -> O -> E`, where `E` compensates `O` and `O` runs `OS -> A -> B -> OE`, the Sub-Process `A` runs
 * `AS -> T1 -> T2 -> AE`, and `O`'s Compensation Event Sub-Process `H` compensates everything `O` retains. No throw
 * shares `A`'s parent, so the standards profile admits `A` without a handler too; beside one it refuses `A`'s records
 * (`compensation.implicit`).
 */
function program(implicitCompensation: string): Json {
  return chain([scope("O", "embedded", {}, { compensationHandlers: ["H"] })], compensateAll, parts({
    elements: [
      start("OS", null, [], "O"), scope("A", "embedded", {}, {}, "O"), userTask("B", "HB", "O"), end("OE", "none", "O"),
      start("AS", null, [], "A"), userTask("T1", "H1", "A"), userTask("T2", "H2", "A"), end("AE", "none", "A"),
      scope("H", eventSubProcess("compensation", true), {}, { incoming: [], outgoing: [], forCompensation: true }, "O"),
      start("HS", "compensation", [], "H"), throwing("HC", compensateAll, "H"), end("HE", "none", "H"),
      handlerTask("H1"), handlerTask("H2"), handlerTask("HB"),
    ],
    flows: [
      flow("o0", "OS", "A"), flow("o1", "A", "B"), flow("o2", "B", "OE"), flow("a0", "AS", "T1"), flow("a1", "T1", "T2"),
      flow("a2", "T2", "AE"), flow("h0", "HS", "HC"), flow("h1", "HC", "HE"),
    ],
  }), { implicitCompensation, abnormalScopeEnd: "completesNormally" });
}

const done = [complete("T1"), complete("T2"), complete("B")];

test("a group runs its records after the handler of the subject that followed it, latest dependency first", () => {
  const grouped = program("everySubProcess");
  assert.equal(refusalOf(grouped, true), null);
  assert.deepEqual(waiting(drive(grouped, ...done)), ["HB"]);
  assert.deepEqual(waiting(drive(grouped, ...done, complete("HB"))), ["H2"]);
  assert.deepEqual(waiting(drive(grouped, ...done, complete("HB"), complete("H2"))), ["H1"]);
  const finished = drive(grouped, ...done, complete("HB"), complete("H2"), complete("H1"));
  assert.ok(finished.ok && finished.value.status === "completed", JSON.stringify(finished));
});

test("without implicit compensation the records join the parent's, unordered against the later sibling", () => {
  const joined = program("refused");
  assert.equal(refusalOf(joined, true), null);
  assert.deepEqual(waiting(drive(joined, ...done)), ["H2", "HB"]);
});
