/**
 * Under `MultiInstanceCounters.cibLocals` (CIB-INT-0018) the Multi-Instance counters are CIB's execution locals: the
 * body holds `nrOfInstances`, `nrOfActiveInstances` and `nrOfCompletedInstances`, each instance its zero-based
 * `loopCounter` beside its item (`MultiInstanceActivityBehavior.java:76-88`, `:196-198`;
 * `ParallelMultiInstanceActivityBehavior.java:64-68`, `:84-87`; `SequentialMultiInstanceActivityBehavior.java:38-45`,
 * `:47-61`, `:67-70`). The oracle is the kernel-only `scopes` publication after each step; under `none` no counter is
 * held, the standards reading of Table 10.30's instance attributes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { runScenario } from "./lean-paired.ts";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;
const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });

const cib: Json = {
  evaluator: "juel", multiInstanceBinding: "loopReferences", effectResultValues: "activityLocals",
  multiInstanceCounters: "cibLocals", multiInstanceInputFailure: "rollback", multiInstanceCount: "javaInt",
};

/** `Start → T → End`, `T` a Service Task looping over `items` with the item local `item`. */
function program(mode: string, options: Json = cib): Json {
  return {
    ...slice,
    options: { ...(slice["options"] as Json), ...options },
    elements: [
      { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["To_T"] } } },
      { activity: { header: header("T", "serviceTask"), payload: {
        work: { service: { payload: { protocol: "urn:p", operation: "urn:o", handlerKey: null } } },
        envelope: { incoming: ["To_T"], outgoing: ["To_End"], inputs: [], outputs: [], boundaries: [], multiInstance: {
          mode, count: { collection: { items: { variable: { name: "items" } } } }, elementVariable: null,
          completionCondition: null, inputDataItem: "DataInput_Item", outputDataItem: null, outputCollection: null,
          asyncBefore: false, asyncAfter: false, loopDataInputRef: null,
          inputDataItemName: "item",
        }, compensationHandlers: [], forCompensation: false, defaultFlow: null, asyncBefore: false, asyncAfter: false } } } },
      { event: { header: header("End", "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish",
        incoming: ["To_End"], outgoing: [], alternativeThrows: [] } } },
    ],
    flows: [{ id: "To_T", source: "Start", target: "T", condition: null }, { id: "To_End", source: "T", target: "End", condition: null }],
  };
}

const start: Json = { kind: "start", commandId: "start", instanceId: "I",
  variables: [{ name: "items", value: { kind: "stringList", value: ["a", "b", "c"] } }] };
const result = (activation: number): Json => ({
  kind: "effectResult", commandId: `result-${String(activation)}`, occurrence: { processInstanceId: "I", elementId: "T", activation },
  outcome: { kind: "success", outputs: [] },
});

/** Per state, each published scope as `role:activation` with its variables `name=value`. */
function scopes(json: Json, stimuli: Json[]): string[][] {
  const trace = (runScenario(json, { kind: "scenario", id: "mi", profile: "p", stimuli }) as { trace: Json[] }).trace;
  return trace.filter((entry) => entry["kind"] === "state").map((state) => (state["scopes"] as Json[]).map((entry) => {
    const scope = entry["scope"] as Json;
    const variables = (entry["variables"] as Json[]).map((variable) => `${String(variable["name"])}=${String((variable["value"] as Json)["value"])}`);
    return `${String(scope["role"])}:${String(scope["activation"])} ${variables.join(" ")}`;
  }));
}

test("a parallel body holds the count, the active and the completed instances, and each instance its loopCounter", () => {
  assert.deepEqual(scopes(program("parallel"), [start, result(2)]), [
    [
      "multiInstanceBody:1 nrOfActiveInstances=3 nrOfCompletedInstances=0 nrOfInstances=3",
      "multiInstanceInstance:1 item=a loopCounter=0",
      "multiInstanceInstance:2 item=b loopCounter=1",
      "multiInstanceInstance:3 item=c loopCounter=2",
    ],
    [
      "multiInstanceBody:1 nrOfActiveInstances=2 nrOfCompletedInstances=1 nrOfInstances=3",
      "multiInstanceInstance:1 item=a loopCounter=0",
      "multiInstanceInstance:3 item=c loopCounter=2",
    ],
  ]);
});

test("a sequential body keeps one active instance and the count from entry (CIB-INT-0002)", () => {
  assert.deepEqual(scopes(program("sequential"), [start, result(1)]), [
    ["multiInstanceBody:1 nrOfActiveInstances=1 nrOfCompletedInstances=0 nrOfInstances=3", "multiInstanceInstance:1 item=a loopCounter=0"],
    ["multiInstanceBody:1 nrOfActiveInstances=1 nrOfCompletedInstances=1 nrOfInstances=3", "multiInstanceInstance:2 item=b loopCounter=1"],
  ]);
});

test("under the standards counters no counter is held", () => {
  assert.deepEqual(scopes(program("parallel", { ...cib, evaluator: "simpleBoolean", multiInstanceCounters: "none",
    multiInstanceInputFailure: "hold", multiInstanceCount: "integer" }), [start])[0],
  ["multiInstanceInstance:1 item=a", "multiInstanceInstance:2 item=b", "multiInstanceInstance:3 item=c"]);
});
