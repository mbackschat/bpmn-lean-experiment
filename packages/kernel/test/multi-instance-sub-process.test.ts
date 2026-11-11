/**
 * An embedded Sub-Process with Multi-Instance loop characteristics
 * runs one Sub-Process instance per item, each an ordinary occurrence of the Scope in a scope occurrence of its own
 * holding the item (BPMN 2.0.2 §10.3.8, §13.3.7; CIB makes the Sub-Process a scope under the body,
 * `BpmnParse.java:3887`, `:1808-1811`); the body completes once every instance's Sub-Process is quiescent. A
 * Transaction or Event Sub-Process loop stays `scope.multiInstance`, and a Sub-Process loop naming an output data item,
 * which no instance fills, is `multiInstance.instanceResult` (PC-MI-10). The oracle is the open inner tasks per step.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { runScenario } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;
const header = (id: string, sourceType: string, parent: string | null = null): Json =>
  ({ id, origin: { definition: null, sourceId: id }, sourceType, parent });
const envelope = (incoming: string[], outgoing: string[], over: Json = {}): Json => ({
  incoming, outgoing, inputs: [], outputs: [], boundaries: [], multiInstance: null, compensationHandlers: [], forCompensation: false,
  defaultFlow: null, asyncBefore: false, asyncAfter: false, ...over,
});
const user = { user: { payload: { name: null, assignee: null, candidateUsers: [], candidateGroups: [], formKey: null,
  formFields: [], dueDate: null, followUpDate: null, priority: null } } };

/** `Start → S → End`; `S` loops over `items` and runs `Inner → Review → InnerEnd`. */
function program(mode: string, kind: Json | string = "embedded", loop: Json = {}): Json {
  return {
    ...slice,
    options: { ...(slice["options"] as Json), evaluator: "juel", multiInstanceBinding: "loopReferences",
      multiInstanceCounters: "cibLocals", multiInstanceInputFailure: "rollback", multiInstanceCount: "javaInt" },
    elements: [
      { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["To_S"] } } },
      { scope: { header: header("S", "subProcess"), payload: { kind, children: ["Inner", "Review", "InnerEnd"],
        localVariables: [], items: [], envelope: envelope(["To_S"], ["To_End"], { multiInstance: {
          mode, count: { collection: { items: { variable: { name: "items" } } } }, elementVariable: "item",
          completionCondition: null, inputDataItem: null, outputDataItem: null, outputCollection: null,
          mutableCollection: "entrySnapshot", asyncBefore: false, asyncAfter: false, loopDataInputRef: null,
          inputDataItemName: null, ...loop,
        } }) } } },
      { start: { header: header("Inner", "startEvent", "S"), payload: { subscription: null, outgoing: ["To_Review"] } } },
      { activity: { header: header("Review", "userTask", "S"), payload: { work: user, envelope: envelope(["To_Review"], ["To_InnerEnd"]) } } },
      { event: { header: header("InnerEnd", "endEvent", "S"), payload: { role: { throw: { record: "none" } }, placement: "finish",
        incoming: ["To_InnerEnd"], outgoing: [], alternativeThrows: [] } } },
      { event: { header: header("End", "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish",
        incoming: ["To_End"], outgoing: [], alternativeThrows: [] } } },
    ],
    flows: [
      { id: "To_S", source: "Start", target: "S", condition: null },
      { id: "To_Review", source: "Inner", target: "Review", condition: null },
      { id: "To_InnerEnd", source: "Review", target: "InnerEnd", condition: null },
      { id: "To_End", source: "S", target: "End", condition: null },
    ],
  };
}

const complete = (activation: number): Json => ({
  kind: "command", commandId: `complete-${String(activation)}`, occurrence: { processInstanceId: "I", elementId: "Review", activation },
  action: { kind: "completeUserTask", values: [] },
});
const start: Json = { kind: "start", commandId: "start", instanceId: "I",
  variables: [{ name: "items", value: { kind: "stringList", value: ["a", "b"] } }] };

/** Per step: its outcome or the refusal code, the open `Review` activations and the instance status. */
function journey(json: Json, stimuli: Json[]): unknown[] {
  const trace = (runScenario(json, { kind: "scenario", id: "mi", profile: "p", stimuli }) as { trace: Json[] }).trace;
  return trace.flatMap((entry, index) => {
    if (entry["kind"] === "deployment") return entry["outcome"] === "committed" ? [] : [[entry["outcome"], entry["code"]]];
    if (entry["kind"] !== "command") return [];
    const state = trace[index + 1];
    const waits = state?.["kind"] === "state" ? state["openWaits"] as Json[] : [];
    return [[entry["commandId"], entry["outcome"], waits.map((wait) => (wait["id"] as Json)["activation"]), state?.["status"]]];
  });
}

test("a parallel Multi-Instance Sub-Process opens every instance's inner task and completes after the last in any order", () => {
  assert.deepEqual(journey(program("parallel"), [start, complete(2), complete(1)]), [
    ["start", "committed", [1, 2], "running"], ["complete-2", "committed", [1], "running"], ["complete-1", "committed", [], "completed"],
  ]);
});

test("a sequential Multi-Instance Sub-Process opens the next instance only after the previous one is quiescent", () => {
  assert.deepEqual(journey(program("sequential"), [start, complete(2), complete(1), complete(2)]), [
    ["start", "committed", [1], "running"], ["complete-2", "rejected", [1], "running"],
    ["complete-1", "committed", [2], "running"], ["complete-2", "committed", [], "completed"],
  ]);
});

test("a Transaction loop stays refused, and a Sub-Process loop naming an output data item no instance fills is refused", () => {
  assert.deepEqual(journey(program("parallel", { transaction: { payload: { method: "compensate" } } }), [start]), [["unsupported", "scope.multiInstance"]]);
  assert.deepEqual(journey(program("parallel", "embedded", { outputDataItem: "result" }), [start]),
    [["unsupported", "multiInstance.instanceResult"]]);
});
