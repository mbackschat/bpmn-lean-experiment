/**
 * Two scope occurrences may publish one identity: a compensated Multi-Instance Sub-Process restores its body's context
 * and its instance's context, and both publish as the Sub-Process's `compensationContext` at activation 0. The
 * kernel-only `scopes` publication is in canonical order, so such a tie is broken by the scope tree, the enclosing scope
 * occurrence first, and between two that enclose neither by their order positions (DC25); never by the order the state
 * stores them in. The opposite-key-order build (`packages/differential/test/opposite-key-order.test.ts`) runs the same
 * program with every scope-led key order reversed, which is where a storage-order reading shows.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { end, flow, loop, scope, start, variable } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, compensateAll, handlerTask, parts, userTask } from "./compensation-support.ts";
import { runScenario } from "./lean-paired.ts";

const counters: Json = {
  evaluator: "juel", multiInstanceBinding: "loopReferences", effectResultValues: "activityLocals",
  multiInstanceCounters: "cibLocals", implicitCompensation: "everySubProcess", branchSchedule: "declarationDepthFirst", multiInstanceInputFailure: "rollback", multiInstanceCount: "javaInt",
};

/**
 * `S -> P -> U -> E`, `P` a sequential Multi-Instance Sub-Process over `items` running `PS -> PT -> PE`, `PT` compensable
 * by `HT` inside `P`; `E` compensates, so `HT` runs in `P`'s restored body context and its instance's context below it.
 */
const program = chain([
  scope("P", "embedded", {}, { multiInstance: loop({ mode: "sequential", outputDataItem: null, inputDataItem: "DataInput_Item", inputDataItemName: "item" }) }),
  userTask("U"),
], compensateAll, parts({
  elements: [start("PS", null, [], "P"), userTask("PT", "HT", "P"), end("PE", "none", "P"), handlerTask("HT", "P")],
  flows: [flow("p0", "PS", "PT"), flow("p1", "PT", "PE")],
}), counters);

const command = (commandId: string, element: string): Json => ({
  kind: "command", commandId, occurrence: { processInstanceId: "I", elementId: element, activation: 1 },
  action: { kind: "completeUserTask", values: [] },
});

const stimuli: Json[] = [
  { kind: "start", commandId: "start", instanceId: "I", variables: [{ name: "items", value: { kind: "stringList", value: ["s1"] } }] },
  command("pt", "PT"),
  command("u", "U"),
];

test("two restored contexts that publish one identity are published the enclosing one first", () => {
  const trace = (runScenario(program, { kind: "scenario", id: "ties", profile: "p", stimuli }) as { trace: Json[] }).trace;
  const last = trace.filter((entry) => entry["kind"] === "state").at(-1) as Json;
  const published = (last["scopes"] as Json[]).map((entry) => {
    const scoped = entry["scope"] as Json;
    return `${String(scoped["role"])}:${String(scoped["elementId"])}:${String(scoped["activation"])} ` +
      (entry["variables"] as Json[]).map((binding) => String(binding["name"])).join(",");
  });
  assert.deepEqual(published.filter((line) => line.startsWith("compensationContext:P:0 ")), [
    "compensationContext:P:0 nrOfActiveInstances,nrOfCompletedInstances,nrOfInstances",
    "compensationContext:P:0 item,loopCounter",
  ]);
});
