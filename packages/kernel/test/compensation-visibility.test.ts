/**
 * The records a Compensation throw sees (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I2, D15, I3;
 * BPMN 2.0.2 Tables 10.88 and 10.89): from an Event Sub-Process, those of the Sub-Process holding it too; from a
 * Compensation Event Sub-Process, those of the Sub-Process it compensates, which its handler context holds.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { end, errorTrigger, eventSubProcess, flow, scope, start } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, compensateAll, compensateOne, complete, drive, handlerTask, parts, raiseError, userTask, waiting } from "./compensation-support.ts";

/** An Intermediate throw Event `id` in `parent` throwing `record`. */
const throwing = (id: string, record: Json, parent: string | null = null): Json => ({
  event: {
    header: { id, origin: { definition: null, sourceId: id }, sourceType: "intermediateThrowEvent", parent },
    payload: { role: { throw: { record } }, placement: "intermediate", incoming: [], outgoing: [], alternativeThrows: [] },
  },
});

/**
 * The Event Sub-Process `id` in `parent`, started by `trigger`, running `<id>S -> <id>C -> <id>E`, where `<id>C` throws
 * `record`.
 */
function compensating(id: string, trigger: Json | string, parent: string, env: Json = {}, record: Json = compensateAll): Json[] {
  return [
    scope(id, eventSubProcess(trigger, true), {}, env, parent), start(`${id}S`, trigger, [], id),
    throwing(`${id}C`, record, id), end(`${id}E`, "none", id),
  ];
}

const sequence = (id: string): Json[] => [flow(`${id}0`, `${id}S`, `${id}C`), flow(`${id}1`, `${id}C`, `${id}E`)];

/** `P` runs `PS -> T -> PE`, whose Error the interrupting Event Sub-Process `R` catches and throws `record` in. */
function recovering(record: Json): Json {
  return chain([scope("P", "embedded"), userTask("X")], "none", parts({
    elements: [
      start("PS", null, [], "P"), userTask("T", "HT", "P"), end("PE", raiseError("E"), "P"),
      ...compensating("R", errorTrigger({ code: "E" }), "P", {}, record), handlerTask("HT"),
    ],
    flows: [flow("p0", "PS", "T"), flow("p1", "T", "PE"), ...sequence("R")],
  }), { abnormalScopeEnd: "completesNormally" });
}

for (const [form, record] of [["an untargeted", compensateAll], ["a targeted", compensateOne("T")]] as const) {
  test(`${form} throw in an Event Sub-Process compensates the Activities of the Sub-Process holding it`, () => {
    const program = recovering(record);
    assert.deepEqual(waiting(drive(program, complete("T"))), ["HT"]);
    assert.deepEqual(waiting(drive(program, complete("T"), complete("HT"))), ["X"]);
  });
}

test("an untargeted throw in a Compensation Event Sub-Process compensates the Sub-Process's own Activities", () => {
  // `P` runs `PS -> T -> PE`; its Compensation Event Sub-Process `H` compensates again, and `E` compensates `P`.
  const program = chain([scope("P", "embedded", {}, { compensationHandlers: ["H"] })], compensateAll, parts({
    elements: [
      start("PS", null, [], "P"), userTask("T", "HT", "P"), end("PE", "none", "P"),
      ...compensating("H", "compensation", "P", { incoming: [], outgoing: [], forCompensation: true }), handlerTask("HT"),
    ],
    flows: [flow("p0", "PS", "T"), flow("p1", "T", "PE"), ...sequence("H")],
  }));
  assert.deepEqual(waiting(drive(program, complete("T"))), ["HT"]);
  const finished = drive(program, complete("T"), complete("HT"));
  assert.ok(finished.ok && finished.value.status === "completed", JSON.stringify(finished));
});
