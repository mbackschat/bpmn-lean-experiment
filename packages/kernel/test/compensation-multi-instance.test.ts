/**
 * Records of a Multi-Instance subject (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I9, D6; BPMN 2.0.2 §10.7.2,
 * §13.5.5): each completed instance of a Multi-Instance Sub-Process is compensated by its handler, the latest
 * completion first, while a Multi-Instance Task's handler runs once for all its instances.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { activity, end, flow, loop, scope, start, userWork, variable } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, compensateAll, complete, driveFrom, handlerTask, parts, userTask, waiting } from "./compensation-support.ts";

const looping = (mode: string, outputDataItem: string | null = null): Json =>
  loop({ mode, count: { collection: { items: variable("items") } }, outputDataItem });

/** `items` bound to `count` Strings. */
const items = (count: number): Json[] =>
  [{ name: "items", value: { kind: "list", value: Array.from({ length: count }, (_, index) => ({ kind: "string", value: `i${index}` })) } }];

/** `S -> A -> X -> E`, where `A` is a Multi-Instance Sub-Process running `AS -> T -> AE`, compensable by `HA`. */
function subProcess(mode: string): Json {
  return chain([scope("A", "embedded", {}, { compensationHandlers: ["HA"], multiInstance: looping(mode) }), userTask("X")], compensateAll,
    parts({
      elements: [start("AS", null, [], "A"), userTask("T", null, "A"), end("AE", "none", "A"), handlerTask("HA")],
      flows: [flow("a0", "AS", "T"), flow("a1", "T", "AE")],
    }), {});
}

/** `S -> A -> X -> E`, where `A` is a Multi-Instance User Task compensable by `HA`. */
function task(mode: string): Json {
  return chain([activity("A", userWork(), { compensationHandlers: ["HA"], multiInstance: looping(mode, "result") }), userTask("X")], compensateAll,
    parts({ elements: [handlerTask("HA")], flows: [] }), {});
}

for (const mode of ["parallel", "sequential"]) {
  test(`each ${mode} Multi-Instance Sub-Process instance is compensated in turn, the latest completion first`, () => {
    const ran = [complete("T", 1), complete("T", 2), complete("X")];
    const program = subProcess(mode);
    assert.deepEqual(waiting(driveFrom(program, items(2), ...ran)), ["HA"]);
    assert.deepEqual(waiting(driveFrom(program, items(2), ...ran, complete("HA", 1))), ["HA"]);
    const finished = driveFrom(program, items(2), ...ran, complete("HA", 1), complete("HA", 2));
    assert.ok(finished.ok && finished.value.status === "completed", JSON.stringify(finished));
  });

  test(`a ${mode} Multi-Instance Task's handler runs once for all its instances`, () => {
    const submit = (activation: number): Json => complete("A", activation, [["result", { kind: "string", value: "r" }]]);
    const ran = [submit(1), submit(2), complete("X")];
    const program = task(mode);
    assert.deepEqual(waiting(driveFrom(program, items(2), ...ran)), ["HA"]);
    const finished = driveFrom(program, items(2), ...ran, complete("HA"));
    assert.ok(finished.ok && finished.value.status === "completed", JSON.stringify(finished));
  });
}

test("a Multi-Instance Task's handler runs once after zero instances", () => {
  const program = task("parallel");
  assert.deepEqual(waiting(driveFrom(program, items(0), complete("X"))), ["HA"]);
});

test("a Multi-Instance Sub-Process with zero instances retains nothing", () => {
  const finished = driveFrom(subProcess("parallel"), items(0), complete("X"));
  assert.ok(finished.ok && finished.value.status === "completed", JSON.stringify(finished));
});
