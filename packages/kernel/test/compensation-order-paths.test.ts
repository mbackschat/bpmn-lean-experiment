/**
 * A Sequence Flow dependency through Gateways and intermediate Events (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md
 * I1; BPMN 2.0.2 §13.5.5 "A Sequence Flow between Activities A and B"; issue #96): when the path from `A` to `B` passes
 * only nodes that are no Activity, `B`'s handler completes before `A`'s starts; an Activity on the path ends it, and a
 * Link pair continues it like a flow.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { flow, gateway, link, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, compensateAll, complete, drive, handlerTask, parts, userTask, waiting } from "./compensation-support.ts";

/** An intermediate none throw `id`, which passes its token on. */
const passing = (id: string): Json => ({
  event: {
    header: { id, origin: { definition: null, sourceId: id }, sourceType: "intermediateThrowEvent", parent: null },
    payload: { role: { throw: { record: "none" } }, placement: "intermediate", incoming: [], outgoing: [], alternativeThrows: [] },
  },
});

/** `S -> A -> between... -> B -> E` (flows `f0`, `f1`, …), `E` compensating every record; `A` and `B` have handlers. */
const path = (...between: Json[]): Json =>
  chain([userTask("A", "HA"), ...between, userTask("B", "HB")], compensateAll, parts({ elements: [handlerTask("HA"), handlerTask("HB")], flows: [] }));

const ran = [complete("A"), complete("B")];

for (const [through, between] of [
  ["an Exclusive Gateway", [gateway("G", { exclusive: { candidates: [], default: "f2" } })]],
  ["a Parallel Gateway", [gateway("G", "parallel")]],
  ["an intermediate Event and a Gateway", [passing("I"), gateway("G", "parallel")]],
] as const) {
  test(`a Sequence Flow path through ${through} orders the later subject's handler first`, () => {
    const program = path(...between);
    assert.deepEqual(waiting(drive(program, ...ran)), ["HB"]);
    assert.deepEqual(waiting(drive(program, ...ran, complete("HB"))), ["HA"]);
  });
}

test("an Activity on the path ends the dependency, so the handlers run concurrently", () => {
  const program = path(gateway("G", "parallel"), userTask("X"));
  assert.deepEqual(waiting(drive(program, complete("A"), complete("X"), complete("B"))), ["HA", "HB"]);
});

test("a Link pair continues the path like a flow", () => {
  // `S -> A -> LT`, Link `go`, `LC -> B -> E`: no Sequence Flow leads from `A` to `B`.
  const chained = chain([userTask("A", "HA"), link("LT", "linkThrow", "go")], compensateAll,
    parts({ elements: [link("LC", "linkCatch", "go"), userTask("B", "HB"), handlerTask("HA"), handlerTask("HB")], flows: [] }));
  const program = wired({ ...chained, flows: [...(chained.flows as Json[]).filter((entry) => entry.target !== "E"), flow("lb", "LC", "B"), flow("be", "B", "E")] });
  assert.deepEqual(waiting(drive(program, ...ran)), ["HB"]);
  assert.deepEqual(waiting(drive(program, ...ran, complete("HB"))), ["HA"]);
});
