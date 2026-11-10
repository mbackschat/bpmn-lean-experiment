/**
 * The item local of a loop given by `camunda:collection` and `camunda:elementVariable` under
 * `MultiInstanceBinding.loopReferences` (CIB-INT-0014): CIB sets the collection element variable from
 * `camunda:elementVariable`, which an `inputDataItem`'s `name` replaces (`BpmnParse.java:1863-1873`), and sets it on
 * each instance (`MultiInstanceActivityBehavior:85-93`). The oracle is which instance a completion condition reading the
 * item ends the Activity on: an unbound item is an unknown variable and rolls the result back.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { runScenario } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;

const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });

const cib: Json = {
  evaluator: "juel", multiInstanceBinding: "loopReferences", effectResultValues: "activityLocals",
  multiInstanceCounters: "cibLocals", multiInstanceInputFailure: "rollback", multiInstanceCount: "javaInt",
};

/** `Start → T → End`, `T` a parallel Service Task looping over `flags` whose completion condition is the item `flag`. */
function program(loop: Json): Json {
  return {
    ...slice,
    options: { ...(slice["options"] as Json), ...cib },
    elements: [
      { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["To_T"] } } },
      { activity: { header: header("T", "serviceTask"), payload: {
        work: { service: { payload: { protocol: "urn:p", operation: "urn:o", handlerKey: null } } },
        envelope: { incoming: ["To_T"], outgoing: ["To_End"], inputs: [], outputs: [], boundaries: [], multiInstance: {
          mode: "parallel", count: { collection: { items: { variable: { name: "flags" } } } }, elementVariable: "flag",
          completionCondition: { variable: { name: "flag" } }, inputDataItem: null, outputDataItem: null,
          outputCollection: null, mutableCollection: "entrySnapshot", asyncBefore: false, asyncAfter: false,
          loopDataInputRef: null, inputDataItemName: null, ...loop,
        }, compensationHandler: null, defaultFlow: null, asyncBefore: false, asyncAfter: false } } } },
      { event: { header: header("End", "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish",
        incoming: ["To_End"], outgoing: [], alternativeThrows: [] } } },
    ],
    flows: [{ id: "To_T", source: "Start", target: "T", condition: null }, { id: "To_End", source: "T", target: "End", condition: null }],
  };
}

const flags = { kind: "list", value: [false, true, false].map((value) => ({ kind: "boolean", value })) };
const stimuli: Json[] = [
  { kind: "start", commandId: "start", instanceId: "I", variables: [{ name: "flags", value: flags }] },
  { kind: "effectResult", commandId: "result-2", occurrence: { processInstanceId: "I", elementId: "T", activation: 2 },
    outcome: { kind: "success", outputs: [] } },
];

/** The outcome and code of each step, the deployment included. */
function outcomes(json: Json): unknown[] {
  const trace = (runScenario(json, { kind: "scenario", id: "mi", profile: "p", stimuli }) as { trace: Json[] }).trace;
  return trace.filter((entry) => entry["kind"] !== "state").map((entry) => [entry["outcome"], entry["code"] ?? null]);
}

test("camunda:elementVariable names each instance's item local, so the second instance's true item ends the Activity", () => {
  assert.deepEqual(outcomes(program({})), [["committed", null], ["committed", null], ["committed", null]]);
});

test("an inputDataItem beside camunda:elementVariable is refused, and the standards binding reads no element variable", () => {
  assert.deepEqual(outcomes(program({ inputDataItem: "DataInput_Flag", inputDataItemName: "flag" }))[0],
    ["unsupported", "multiInstance.elementVariable"]);
  const standards = { ...program({}), options: { ...(program({})["options"] as Json), multiInstanceBinding: "dataAssociations" } };
  assert.deepEqual(outcomes(standards)[0], ["unsupported", "multiInstance.elementVariable"]);
});
