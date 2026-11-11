/**
 * Under `MultiInstanceCounters.cibLocals` (CIB-INT-0018) the counters and the item are variables at every site inside a
 * Multi-Instance instance, not only in its completion condition: CIB holds `loopCounter` and the item on the instance's
 * execution and the three body counters on the body's (`MultiInstanceActivityBehavior.java:76-88`, `:196-198`), and an
 * element nested in a Sub-Process instance resolves them through its execution's parents. The innermost loop's
 * counters hide an enclosing loop's, while an enclosing loop's item stays visible. A sequential `nrOfInstances` is the
 * count from entry (CIB-INT-0002). The oracle is the published `activity` scope of the nested User Task `C`, whose
 * input mappings read the names, per state.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { runScenario } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;
const header = (id: string, sourceType: string, parent: string | null): Json =>
  ({ id, origin: { definition: null, sourceId: id }, sourceType, parent });
const envelope = (incoming: string[], outgoing: string[], over: Json = {}): Json => ({
  incoming, outgoing, inputs: [], outputs: [], boundaries: [], multiInstance: null, compensationHandlers: [], forCompensation: false,
  defaultFlow: null, asyncBefore: false, asyncAfter: false, ...over,
});
const loop = (mode: string, collection: string, item: string): Json => ({
  mode, count: { collection: { items: { variable: { name: collection } } } }, elementVariable: null,
  completionCondition: null, inputDataItem: "DataInput_Item", outputDataItem: null, outputCollection: null,
  mutableCollection: "entrySnapshot", asyncBefore: false, asyncAfter: false, loopDataInputRef: null, inputDataItemName: item,
});
const read = (target: string, name: string): Json =>
  ({ target, source: { juel: { nodes: [{ identifier: { name } }] } }, dialect: "ioParameter" });
const user = { user: { payload: { name: null, assignee: null, candidateUsers: [], candidateGroups: [], formKey: null,
  formFields: [], dueDate: null, followUpDate: null, priority: null } } };

/** `<id>Start → inner → <id>End` inside the Scope `id`, which loops over `collection` with the item `item`. */
function subProcess(id: string, parent: string | null, mode: string, collection: string, item: string, inner: Json[],
  innerId: string, flowIn: string, flowOut: string): { elements: Json[]; flows: Json[] } {
  return {
    elements: [
      { scope: { header: header(id, "subProcess", parent), payload: { kind: "embedded", children: [`${id}Start`, innerId, `${id}End`],
        localVariables: [], items: [],
        envelope: envelope([flowIn], [flowOut], { multiInstance: loop(mode, collection, item) }) } } },
      { start: { header: header(`${id}Start`, "startEvent", id), payload: { subscription: null, outgoing: [`${id}_in`] } } },
      ...inner,
      { event: { header: header(`${id}End`, "endEvent", id), payload: { role: { throw: { record: "none" } }, placement: "finish",
        incoming: [`${id}_out`], outgoing: [], alternativeThrows: [] } } },
    ],
    flows: [
      { id: `${id}_in`, source: `${id}Start`, target: innerId, condition: null },
      { id: `${id}_out`, source: innerId, target: `${id}End`, condition: null },
    ],
  };
}

/** `C`, a User Task in `parent` reading `i = loopCounter`, `n = nrOfInstances` and `c = item`. */
const reviewer = (parent: string): Json => ({ activity: { header: header("C", "userTask", parent), payload: { work: user,
  envelope: envelope([`${parent}_in`], [`${parent}_out`], { inputs: [read("i", "loopCounter"), read("n", "nrOfInstances"), read("c", "item")] }) } } });

/** `Start → S → End`, `S` looping over `items`; `nested` puts a second Sub-Process `R` looping over `lines` around `C`. */
function program(mode: string, nested = false): Json {
  const inner = nested
    ? subProcess("R", "S", "parallel", "lines", "line", [reviewer("R")], "C", "S_in", "S_out")
    : { elements: [reviewer("S")], flows: [] };
  const outer = subProcess("S", null, mode, "items", "item", inner.elements, nested ? "R" : "C", "To_S", "To_End");
  return {
    ...slice,
    options: { ...(slice["options"] as Json), evaluator: "juel", multiInstanceBinding: "loopReferences",
      multiInstanceCounters: "cibLocals", multiInstanceInputFailure: "rollback", multiInstanceCount: "javaInt" },
    elements: [
      { start: { header: header("Start", "startEvent", null), payload: { subscription: null, outgoing: ["To_S"] } } },
      ...outer.elements,
      { event: { header: header("End", "endEvent", null), payload: { role: { throw: { record: "none" } }, placement: "finish",
        incoming: ["To_End"], outgoing: [], alternativeThrows: [] } } },
    ],
    flows: [
      { id: "To_S", source: "Start", target: "S", condition: null },
      { id: "To_End", source: "S", target: "End", condition: null },
      ...outer.flows, ...inner.flows,
    ],
  };
}

const start: Json = { kind: "start", commandId: "start", instanceId: "I", variables: [
  { name: "items", value: { kind: "stringList", value: ["a", "b"] } },
  { name: "lines", value: { kind: "stringList", value: ["x", "y", "z"] } },
] };
const complete = (activation: number): Json => ({
  kind: "command", commandId: `complete-${String(activation)}`, occurrence: { processInstanceId: "I", elementId: "C", activation },
  action: { kind: "completeUserTask", values: [] },
});

/** Per state, or the refusal: each `C` activity scope as `activation: i n c`. */
function reads(json: Json, stimuli: Json[]): unknown[] {
  const trace = (runScenario(json, { kind: "scenario", id: "mi", profile: "p", stimuli }) as { trace: Json[] }).trace;
  return trace.flatMap((entry): unknown[] => {
    if (entry["kind"] === "deployment") return entry["outcome"] === "committed" ? [] : [String(entry["code"])];
    if (entry["kind"] !== "state") return [];
    return [(entry["scopes"] as Json[]).flatMap((published) => {
      const scope = published["scope"] as Json;
      if (scope["role"] !== "activity" || scope["elementId"] !== "C") return [];
      const value = (name: string): string =>
        String(((published["variables"] as Json[]).find((variable) => variable["name"] === name)?.["value"] as Json | undefined)?.["value"]);
      return [`${String(scope["activation"])}: ${value("i")} ${value("n")} ${value("c")}`];
    })];
  });
}

test("a task nested in a parallel Sub-Process instance reads its loopCounter, the count and its item", () => {
  assert.deepEqual(reads(program("parallel"), [start]), [["1: 0 2 a", "2: 1 2 b"]]);
});

test("a task nested in a sequential Sub-Process instance reads the count from entry (CIB-INT-0002)", () => {
  assert.deepEqual(reads(program("sequential"), [start, complete(1)]), [["1: 0 2 a"], ["2: 1 2 b"]]);
});

test("an inner loop's counters hide the enclosing loop's, whose item stays visible", () => {
  assert.deepEqual(reads(program("parallel", true), [start]), [[
    "1: 0 3 a", "2: 1 3 a", "3: 2 3 a", "4: 0 3 b", "5: 1 3 b", "6: 2 3 b",
  ]]);
});
