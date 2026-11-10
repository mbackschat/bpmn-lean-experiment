/**
 * The Multi-Instance level of the expression semantics (docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md, "Multi-Instance
 * level"): cardinality-driven generation and the count rules, the collection rules and where their failures land, and
 * the completion condition evaluated in the completing instance's scope occurrence before it is left, with the item, the
 * instance's result locals and, under `cibLocals`, CIB's counters. The oracle is each command's outcome and code and the
 * activations of `T` left open; the CIB answers are the pinned source lines the spec cites, pending the witnesses'
 * evidence run.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { runScenario } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;

const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });

/** The CIB options this level reads; each test overrides what it separates. */
const cib: Json = {
  evaluator: "juel", multiInstanceBinding: "loopReferences", effectResultValues: "activityLocals",
  multiInstanceCounters: "cibLocals", multiInstanceInputFailure: "rollback", multiInstanceCount: "javaInt",
};

type Shape = Readonly<{ options?: Json; loop?: Json; user?: boolean }>;

/** `Start → T → End`, `T` a Service Task (or a User Task) looping over `items` with the item local `item`. */
function program(shape: Shape = {}): Json {
  const loop = {
    mode: "parallel", count: { collection: { items: { variable: { name: "items" } } } }, elementVariable: null,
    completionCondition: null, inputDataItem: "DataInput_Item", outputDataItem: shape.user === true ? "DataOutput_Result" : null,
    outputCollection: null, mutableCollection: "entrySnapshot", asyncBefore: false, asyncAfter: false,
    loopDataInputRef: null, inputDataItemName: "item", ...shape.loop,
  };
  const work = shape.user === true
    ? { user: { payload: { name: null, assignee: null, candidateUsers: [], candidateGroups: [], formKey: null, formFields: [],
      dueDate: null, followUpDate: null, priority: null } } }
    : { service: { payload: { protocol: "urn:p", operation: "urn:o", handlerKey: null } } };
  return {
    ...slice,
    options: { ...(slice["options"] as Json), ...cib, ...shape.options },
    elements: [
      { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["To_T"] } } },
      { activity: { header: header("T", shape.user === true ? "userTask" : "serviceTask"), payload: { work, envelope: {
        incoming: ["To_T"], outgoing: ["To_End"], inputs: [], outputs: [], boundaries: [], multiInstance: loop,
        compensationHandler: null, defaultFlow: null, asyncBefore: false, asyncAfter: false } } } },
      { event: { header: header("End", "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish",
        incoming: ["To_End"], outgoing: [], alternativeThrows: [] } } },
    ],
    flows: [{ id: "To_T", source: "Start", target: "T", condition: null }, { id: "To_End", source: "T", target: "End", condition: null }],
  };
}

const str = (value: string): Json => ({ kind: "string", value });
const int = (value: number): Json => ({ kind: "integer", value });
const decimal = (coefficient: number, scale: number): Json => ({ kind: "decimal", coefficient: String(coefficient), scale });
const list = (...values: string[]): Json => ({ kind: "list", value: values.map(str) });
const start = (...variables: Array<[string, Json]>): Json => ({
  kind: "start", commandId: "start", instanceId: "I", variables: variables.map(([name, value]) => ({ name, value })),
});
const result = (activation: number, ...outputs: Array<[string, Json]>): Json => ({
  kind: "effectResult", commandId: `result-${String(activation)}`, occurrence: { processInstanceId: "I", elementId: "T", activation },
  outcome: { kind: "success", outputs: outputs.map(([name, value]) => ({ name, value })) },
});
const complete = (activation: number, value: Json): Json => ({
  kind: "command", commandId: `complete-${String(activation)}`, occurrence: { processInstanceId: "I", elementId: "T", activation },
  action: { kind: "completeUserTask", values: [{ name: "DataOutput_Result", value }] },
});

type Trace = ReadonlyArray<Json>;

/** Per command, its outcome, its code if any, and the activations of `T` it leaves open; a refused deployment first. */
function journey(json: Json, stimuli: Json[]): unknown[] {
  const trace = (runScenario(json, { kind: "scenario", id: "mi", profile: "p", stimuli }) as { trace: Trace }).trace;
  const rows: unknown[] = [];
  for (const [index, entry] of trace.entries()) {
    if (entry["kind"] === "deployment" && entry["outcome"] !== "committed") rows.push(["deployment", entry["outcome"], entry["code"]]);
    if (entry["kind"] !== "command") continue;
    const state = trace[index + 1];
    const waits = state?.["kind"] === "state" ? (state["openWaits"] as Json[]) : [];
    const open = waits.map((wait) => wait["id"] as Json).filter((id) => id["elementId"] === "T").map((id) => id["activation"] as number);
    rows.push([entry["commandId"], entry["outcome"], entry["code"] ?? null, open]);
  }
  return rows;
}

const juel = (...nodes: Json[]): Json => ({ juel: { nodes } });
const id = (name: string): Json => ({ identifier: { name } });
const counted = (count: Json): Json => ({ count: { cardinality: { count } }, inputDataItem: null, inputDataItemName: null });

test("a cardinality loop generates one item-less instance per count, and a zero count completes at once", () => {
  const loop = counted({ variable: { name: "count" } });
  assert.deepEqual(journey(program({ loop }), [start(["count", int(3)])]), [["start", "committed", null, [1, 2, 3]]]);
  assert.deepEqual(journey(program({ loop }), [start(["count", int(0)])]), [["start", "committed", null, []]]);
});

test("under javaInt the count rules are CIB's resolveLoopCardinality", () => {
  const loop = counted({ variable: { name: "count" } });
  const cases: Array<[Json, unknown]> = [
    [str("2"), ["committed", null, [1, 2]]],
    [str("+2"), ["committed", null, [1, 2]]],
    [str(" 2"), ["rolledBack", "multiInstance.notANumber", []]],
    [str("2147483648"), ["rolledBack", "multiInstance.notANumber", []]],
    [str("-1"), ["rolledBack", "multiInstance.negativeCount", []]],
    [decimal(2, 0), ["committed", null, [1, 2]]],
    [decimal(25, 1), ["unsupported", "multiInstance.fractionalCount", []]],
    [decimal(-2, 0), ["rolledBack", "multiInstance.negativeCount", []]],
    [int(4294967298), ["unsupported", "multiInstance.countRange", []]],
    [{ kind: "boolean", value: true }, ["rolledBack", "multiInstance.notANumber", []]],
    [{ kind: "null" }, ["rolledBack", "multiInstance.notANumber", []]],
  ];
  for (const [value, expected] of cases) {
    const [[, ...outcome]] = journey(program({ loop }), [start(["count", value])]) as [unknown[]];
    assert.deepEqual(outcome, expected, JSON.stringify(value));
  }
  assert.deepEqual(journey(program({ loop }), [start()]), [["start", "rolledBack", "unknown-variable", []]]);
});

test("a computed count is read before the domain predicate, so a negative one is negativeCount", () => {
  const loop = counted(juel(id("count"), { integer: { digits: "5" } }, { binary: { payload: { op: "sub", left: 0, right: 1 } } }));
  assert.deepEqual(journey(program({ loop }), [start(["count", int(3)])]), [["start", "rolledBack", "multiInstance.negativeCount", []]]);
});

test("under the integer count reading only an Integer counts, as BPMN Table 10.29 requires", () => {
  const loop = counted({ variable: { name: "count" } });
  const options = { multiInstanceCount: "integer" };
  assert.deepEqual(journey(program({ loop, options }), [start(["count", str("2")])]), [["start", "rolledBack", "multiInstance.notANumber", []]]);
  assert.deepEqual(journey(program({ loop, options }), [start(["count", int(2)])]), [["start", "committed", null, [1, 2]]]);
});

test("under rollback a collection that is absent or no list fails the operation; under hold it waits or fails semantically", () => {
  const map = { kind: "map", value: [] };
  assert.deepEqual(journey(program(), [start(["items", map])]), [["start", "rolledBack", "multiInstance.notACollection", []]]);
  assert.deepEqual(journey(program(), [start()]), [["start", "rolledBack", "unknown-variable", []]]);
  const text = { count: { collection: { items: { literal: { value: str("{items}") } } } } };
  assert.deepEqual(journey(program({ loop: text }), [start(["items", list("a")])]), [["start", "rolledBack", "multiInstance.notACollection", []]]);
  const standards = { evaluator: "simpleBoolean", multiInstanceCounters: "none", multiInstanceInputFailure: "hold", multiInstanceCount: "integer" };
  assert.deepEqual(journey(program({ options: standards }), [start()]), [["start", "committed", null, []]]);
  assert.deepEqual(journey(program({ options: standards }), [start(["items", map])]), [["start", "semanticFailure", "multi-instance-collection", []]]);
});

test("the completion condition is evaluated in the completing instance's scope occurrence, so the item is present", () => {
  // BPMN 2.0.2 §13.3.7: the condition "can refer to the MI Activity instance attributes and … inputDataItem".
  const standards = { evaluator: "simpleBoolean", multiInstanceCounters: "none", multiInstanceInputFailure: "hold",
    multiInstanceCount: "integer", multiInstanceBinding: "dataAssociations", effectResultValues: "outputSet" };
  const loop = { completionCondition: { simpleBoolean: { body: { isPresent: { name: "DataInput_Item" } } } } };
  assert.deepEqual(journey(program({ options: standards, loop }), [start(["items", list("a", "b")]), result(1)]),
    [["start", "committed", null, [1, 2]], ["result-1", "committed", null, []]]);
});

test("under cibLocals the counters are in the condition's context with CIB's values", () => {
  // CIB's `Integer.equals(Long)` is false; an Integer receiver lists no method at Core, so the kernel claims nothing.
  const equalsZero = juel(id("loopCounter"), { integer: { digits: "0" } },
    { call: { payload: { receiver: 0, target: "equals", args: [1] } } });
  assert.deepEqual(journey(program({ loop: { completionCondition: equalsZero } }), [start(["items", list("a", "b")]), result(1)])[1],
    ["result-1", "unsupported", "juel.methodReceiver", [1, 2]]);
  const second = juel(id("loopCounter"), { integer: { digits: "1" } }, { binary: { payload: { op: "eq", left: 0, right: 1 } } });
  assert.deepEqual(journey(program({ loop: { completionCondition: second } }), [start(["items", list("a", "b", "c")]), result(2)]),
    [["start", "committed", null, [1, 2, 3]], ["result-2", "committed", null, []]]);
  const active = juel(id("nrOfActiveInstances"), { integer: { digits: "1" } }, { binary: { payload: { op: "eq", left: 0, right: 1 } } });
  assert.deepEqual(journey(program({ loop: { mode: "sequential", completionCondition: active } }), [start(["items", list("a", "b")]), result(1)]),
    [["start", "committed", null, [1]], ["result-1", "committed", null, []]]);
});

test("an instance's effect-result locals are visible to its completion condition in both modes", () => {
  for (const mode of ["parallel", "sequential"]) {
    const loop = { mode, completionCondition: { variable: { name: "delivered" } } };
    const rows = journey(program({ loop }), [start(["items", list("a", "b", "c")]), result(1, ["delivered", { kind: "boolean", value: false }]),
      result(2, ["delivered", { kind: "boolean", value: true }])]);
    assert.deepEqual(rows.slice(1), [["result-1", "committed", null, mode === "parallel" ? [2, 3] : [2]], ["result-2", "committed", null, []]], mode);
  }
});

test("a result named like a counter or the item, and a sequential leftover, have no kernel reading", () => {
  const loop = { completionCondition: { variable: { name: "delivered" } } };
  assert.deepEqual(journey(program({ loop }), [start(["items", list("a", "b")]), result(1, ["loopCounter", int(7)])])[1],
    ["result-1", "unsupported", "multiInstance.resultShadowsInstance", [1, 2]]);
  assert.deepEqual(journey(program({ loop }), [start(["items", list("a", "b")]), result(1, ["item", str("x")])])[1],
    ["result-1", "unsupported", "multiInstance.resultShadowsInstance", [1, 2]]);
  const sequential = { mode: "sequential", completionCondition: { variable: { name: "delivered" } } };
  assert.deepEqual(journey(program({ loop: sequential }), [start(["items", list("a", "b", "c")]),
    result(1, ["delivered", { kind: "boolean", value: false }], ["receipt", str("r1")]), result(2, ["delivered", { kind: "boolean", value: false }])]).slice(1),
  [["result-1", "committed", null, [2]], ["result-2", "unsupported", "multiInstance.sequentialResultLeftover", [2]]]);
});

test("a non-Boolean or failing completion condition fails the operation that reached it", () => {
  const notBoolean = { completionCondition: { variable: { name: "count" } } };
  const failing = { completionCondition: { variable: { name: "missing" } } };
  assert.deepEqual(journey(program({ loop: notBoolean }), [start(["items", list("a", "b")], ["count", int(1)]), result(1)])[1],
    ["result-1", "rolledBack", "multiInstance.completionNotBoolean", [1, 2]]);
  assert.deepEqual(journey(program({ loop: failing }), [start(["items", list("a", "b")]), result(1)])[1],
    ["result-1", "rolledBack", "unknown-variable", [1, 2]]);
  assert.deepEqual(journey(program({ loop: notBoolean, user: true }), [start(["items", list("a", "b")], ["count", int(1)]), complete(1, str("ok"))])[1],
    ["complete-1", "rolledBack", "multiInstance.completionNotBoolean", [1, 2]]);
  // Under CIB-EXT-0026 the effect result's rollback becomes the effect's technical failure: an incident on activation 1.
  const incident = { continuationFailure: "incident", technicalFailure: "incident" };
  assert.deepEqual(journey(program({ loop: notBoolean, options: incident }), [start(["items", list("a", "b")], ["count", int(1)]), result(1)])[1],
    ["result-1", "committed", null, [1, 2]]);
});
