/**
 * A handler's Error that an interrupting catcher takes under `propagatesFromTrigger`
 * (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I11, D8): the catcher drops the run with the scope it
 * interrupts, so the run begins no further handler, whichever catcher form takes the Error. `B`'s handler `HB`, an
 * effect, runs first (`A -> B` orders it before `A`'s `HA`, I1) and reports the Error `UNDO`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { activity, boundary, end, errorTrigger, eventSubProcess, flow, scope, serviceWork, start } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, compensateAll, complete, drive, handlerTask, instance, parts, userTask, waiting } from "./compensation-support.ts";

const options: Json = { compensationHandlerFailure: "propagatesFromTrigger" };
const undo = errorTrigger({ code: "UNDO" });

/** The unconnected Service Task handler `id` in `parent`. */
const effectHandler = (id: string, parent: string | null = null): Json =>
  activity(id, serviceWork(), { incoming: [], outgoing: [], forCompensation: true }, parent);

/** An Intermediate throw `id` in `parent` compensating every record it sees. */
const compensating = (id: string, parent: string): Json => ({
  event: {
    header: { id, origin: { definition: null, sourceId: id }, sourceType: "intermediateThrowEvent", parent },
    payload: { role: { throw: { record: compensateAll } }, placement: "intermediate", incoming: [], outgoing: [], alternativeThrows: [] },
  },
});

/** `A -> B` in `parent`, compensable by `HA` and the effect `HB`. */
const subjects = (parent: string | null = null): Json[] =>
  [userTask("A", "HA", parent), userTask("B", "HB", parent), handlerTask("HA", parent), effectHandler("HB", parent)];

const failed: Json = {
  kind: "effectResult", occurrence: { processInstanceId: instance, elementId: "HB", activation: 1 },
  outcome: { kind: "businessFailure", code: "UNDO", outputs: [] },
};

const cases: ReadonlyArray<readonly [string, Json]> = [
  ["the root's interrupting Error Event Sub-Process", chain([userTask("A", "HA"), userTask("B", "HB")], compensateAll, parts({
    elements: [
      handlerTask("HA"), effectHandler("HB"),
      scope("R", eventSubProcess(undo, true), {}, {}), start("RS", undo, [], "R"), userTask("Caught", null, "R"), end("RE", "none", "R"),
    ],
    flows: [flow("r0", "RS", "Caught"), flow("r1", "Caught", "RE")],
  }), options)],
  ["an Error boundary on the enclosing Sub-Process", chain([scope("P", "embedded", {}, { boundaries: [boundary("BE", undo)] })], "none", parts({
    elements: [
      start("PS", null, [], "P"), ...subjects("P"), compensating("PC", "P"), end("PE", "none", "P"), userTask("Caught"), end("EC"),
    ],
    flows: [flow("p0", "PS", "A"), flow("p1", "A", "B"), flow("p2", "B", "PC"), flow("p3", "PC", "PE"), flow("c0", "BE", "Caught"), flow("c1", "Caught", "EC")],
  }), options)],
  ["the Transaction's Error boundary during a Cancel run", chain([
    scope("T", { transaction: { payload: { method: "compensate" } } }, {}, { boundaries: [boundary("BC", "cancel"), boundary("BE", undo)] }),
  ], "none", parts({
    elements: [start("TS", null, [], "T"), ...subjects("T"), end("TC", "cancel", "T"), userTask("Cancelled"), userTask("Caught"), end("EC")],
    flows: [
      flow("t0", "TS", "A"), flow("t1", "A", "B"), flow("t2", "B", "TC"), flow("b0", "BC", "Cancelled"), flow("c0", "BE", "Caught"),
      flow("c1", "Caught", "EC"),
    ],
  }), options)],
];

for (const [form, program] of cases) {
  test(`a handler's Error caught by ${form} drops the run, which begins no further handler`, () => {
    const ran = [complete("A"), complete("B")];
    assert.deepEqual(waiting(drive(program, ...ran)), ["HB"]);
    assert.deepEqual(waiting(drive(program, ...ran, failed)), ["Caught"]);
    const finished = drive(program, ...ran, failed, complete("Caught"));
    assert.ok(finished.ok && finished.value.status === "completed", JSON.stringify(finished));
    assert.deepEqual(finished.value.slots.compensation.runs, []);
  });
}
