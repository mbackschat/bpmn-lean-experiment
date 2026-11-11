/**
 * PC-MI-02: Multi-Instance Service Task bodies. Each instance opens its own effect, numbered in generation order, and
 * an effect result reaches only the instance it names. Under `MultiInstanceBinding.loopReferences` (CIB-INT-0014 in
 * docs/CIB-BPMN-RELATION-REGISTER.md) the collection is the variable the loop's `loopDataInputRef` names and the item
 * local is the `inputDataItem`'s name; the standards reading takes both from the Data Associations. The loop's own
 * `asyncBefore`/`asyncAfter` mark each instance and the envelope's mark the body (CIB-EXT-0027), which `crossed`
 * (`Kernel.State`) tells apart by the occurrence's role: a closure that fails after a crossing is `unsupported`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeProgram, hooks, runScenario, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { State } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;

const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });

type Shape = Readonly<{
  mode?: "parallel" | "sequential";
  binding?: "dataAssociations" | "loopReferences";
  resultValues?: "outputSet" | "activityLocals";
  loop?: Json;
  envelope?: Json;
  /** A Parallel Gateway forks the start into the loop and an Exclusive Gateway whose two conditions are false. */
  failingSibling?: boolean;
  /** An Exclusive Gateway whose two conditions are false follows the loop. */
  failingAfter?: boolean;
  /** `T` has no loop characteristics. */
  plain?: boolean;
}>;

/**
 * `Start → T → End`, `T` a Service Task looping over `DataInput_Items` the way the reader writes the standard form:
 * the associations name the collection `DataObjectReference_Items` and the item `DataInput_Item`.
 */
function program(shape: Shape = {}): Json {
  const loop = {
    mode: shape.mode ?? "parallel",
    count: { collection: { items: { variable: { name: "DataObjectReference_Items" } } } },
    elementVariable: null, completionCondition: null, inputDataItem: "DataInput_Item", outputDataItem: null,
    outputCollection: null, mutableCollection: "entrySnapshot", asyncBefore: false, asyncAfter: false,
    loopDataInputRef: "DataInput_Items", inputDataItemName: "item", ...shape.loop,
  };
  const into = shape.failingSibling === true ? "To_Fork" : "To_T";
  const outOf = shape.failingAfter === true ? "To_Choice" : "To_End";
  const task = {
    activity: {
      header: header("T", "serviceTask"),
      payload: {
        work: { service: { payload: { protocol: "urn:p", operation: "urn:o", handlerKey: null } } },
        envelope: {
          incoming: ["To_T"], outgoing: [outOf], inputs: [], outputs: [], boundaries: [], multiInstance: shape.plain === true ? null : loop,
          compensationHandlers: [], forCompensation: false, defaultFlow: null, asyncBefore: false, asyncAfter: false, ...shape.envelope,
        },
      },
    },
  };
  const choice = (incoming: string): Json => ({
    gateway: {
      header: header("Choice", "exclusiveGateway"),
      payload: { kind: { exclusive: { candidates: ["Never", "Nor"], default: null } }, incoming: [incoming], outgoing: ["Never", "Nor"] },
    },
  });
  const never = { simpleBoolean: { body: { literal: { value: false } } } };
  const elements: Json[] = [
    { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: [into] } } },
    task,
    { event: { header: header("End", "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish",
      incoming: [...(shape.failingAfter === true ? [] : [outOf]), ...(shape.failingSibling === true || shape.failingAfter === true ? ["Never", "Nor"] : [])],
      outgoing: [], alternativeThrows: [] } } },
  ];
  const flows: Json[] = [{ id: outOf, source: "T", target: shape.failingAfter === true ? "Choice" : "End", condition: null }];
  if (shape.failingSibling === true) {
    elements.push(
      { gateway: { header: header("Fork", "parallelGateway"), payload: { kind: "parallel", incoming: ["To_Fork"], outgoing: ["To_T", "To_Z"] } } },
      choice("To_Z"));
    flows.push({ id: "To_Fork", source: "Start", target: "Fork", condition: null },
      { id: "To_T", source: "Fork", target: "T", condition: null },
      { id: "To_Z", source: "Fork", target: "Choice", condition: null });
  } else {
    flows.push({ id: "To_T", source: "Start", target: "T", condition: null });
  }
  if (shape.failingAfter === true) elements.push(choice("To_Choice"));
  if (shape.failingSibling === true || shape.failingAfter === true) {
    flows.push({ id: "Never", source: "Choice", target: "End", condition: never }, { id: "Nor", source: "Choice", target: "End", condition: never });
  }
  return {
    ...slice,
    options: {
      ...(slice["options"] as Json), multiInstanceBinding: shape.binding ?? "loopReferences",
      effectResultValues: shape.resultValues ?? "outputSet",
    },
    elements,
    flows,
  };
}

const items = (...values: string[]): Json => ({ kind: "stringList", value: values });
const start = (collection: Json): Json => ({
  kind: "start", commandId: "start", instanceId: "I", variables: [{ name: "DataInput_Items", value: collection }],
});
const result = (activation: number, commandId = `result-${String(activation)}`): Json => ({
  kind: "effectResult", commandId, occurrence: { processInstanceId: "I", elementId: "T", activation },
  outcome: { kind: "success", outputs: [] },
});

type Trace = ReadonlyArray<Json>;
const run = (json: Json, stimuli: Json[]): Trace =>
  (runScenario(json, { kind: "scenario", id: "mi", profile: "p", stimuli }) as { trace: Trace }).trace;

/** Per command, its outcome and the activations of `T` it leaves open. */
function journey(trace: Trace): Array<[string, unknown, number[]]> {
  const rows: Array<[string, unknown, number[]]> = [];
  for (const [index, entry] of trace.entries()) {
    if (entry["kind"] !== "command") continue;
    const state = trace[index + 1];
    const waits = state?.["kind"] === "state" ? (state["openWaits"] as Json[]) : [];
    const open = waits.map((wait) => wait["id"] as Json).filter((id) => id["elementId"] === "T").map((id) => id["activation"] as number);
    rows.push([entry["commandId"] as string, entry["outcome"], open]);
  }
  return rows;
}

const statusAfterLast = (trace: Trace): unknown => [...trace].reverse().find((entry) => entry["kind"] === "state")?.["status"];

test("a parallel Service Task body opens one effect per item in generation order and each result ends only its own", () => {
  const trace = run(program(), [start(items("same", "same", "other")), result(3), result(2), result(3, "stale-3"), result(1)]);
  assert.equal(trace[0]?.["outcome"], "committed", JSON.stringify(trace[0]));
  assert.deepEqual(journey(trace), [
    ["start", "committed", [1, 2, 3]],
    ["result-3", "committed", [1, 2]],
    ["result-2", "committed", [1]],
    ["stale-3", "rejected", [1]],
    ["result-1", "committed", []],
  ]);
  assert.equal(statusAfterLast(trace), "completed");
});

test("a sequential Service Task body opens the next effect only after the current one ended", () => {
  const trace = run(program({ mode: "sequential" }), [start(items("same", "same")), result(2, "premature-2"), result(1), result(1, "stale-1"), result(2)]);
  assert.deepEqual(journey(trace), [
    ["start", "committed", [1]],
    ["premature-2", "rejected", [1]],
    ["result-1", "committed", [2]],
    ["stale-1", "rejected", [2]],
    ["result-2", "committed", []],
  ]);
});

const patched = { ...result(1), outcome: { kind: "success", outputs: [{ name: "receipt", value: { kind: "string", value: "r1" } }] } };

test("an effect result carrying a value the empty instance OutputSet does not declare is rejected", () => {
  assert.deepEqual(journey(run(program({ mode: "sequential" }), [start(items("a")), patched])),
    [["start", "committed", [1]], ["result-1", "rejected", [1]]]);
});

test("under activity-local results a Service Task that is no instance still rejects a value no mapping consumes", () => {
  // CIB makes such a task no scope, so its delegate's local reaches the continuing flow execution (CIB-EXT-0015).
  const trace = run(program({ plain: true, resultValues: "activityLocals" }), [start(items("a")), patched]);
  assert.deepEqual(journey(trace), [["start", "committed", [1]], ["result-1", "rejected", [1]]]);
});

test("under activity-local results an effect result value no mapping consumes ends with its instance", () => {
  const trace = run(program({ mode: "sequential", resultValues: "activityLocals" }), [start(items("a")), patched]);
  assert.deepEqual(journey(trace), [["start", "committed", [1]], ["result-1", "committed", []]]);
  const variables = [...trace].reverse().find((entry) => entry["kind"] === "state")?.["variables"] as Json[];
  assert.deepEqual(variables.map((entry) => entry["name"]), ["DataInput_Items"]);
});

function stateAfterStart(json: Json, collection: Json): State {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const input = stimulusFromJson(start(collection));
  assert.ok(input.ok);
  const outcome = step(hooks, decoded.value, null, input.value[1]);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

const locals = (state: State): unknown[] =>
  state.variables.filter((entry) => entry.scope !== 0).map((entry) => entry.entries).filter((entries) => entries.length > 0);

test("the loop-reference binding reads the loop's collection variable and gives each instance its item by name", () => {
  const state = stateAfterStart(program(), items("same", "other"));
  assert.deepEqual(locals(state), [[["item", { tag: "string", value: "same" }]], [["item", { tag: "string", value: "other" }]]]);
});

test("the Data Association binding reads the associated collection, which the start does not set, and holds the token", () => {
  const trace = run(program({ binding: "dataAssociations" }), [start(items("same", "other"))]);
  assert.deepEqual(journey(trace), [["start", "committed", []]]);
  const held = stateAfterStart(program({ binding: "dataAssociations" }), items("same", "other"));
  assert.equal(held.slots.multiInstances.length, 0);
  assert.equal(held.slots.held.length, 1);
});

function startOutcome(json: Json, collection: Json): unknown {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const input = stimulusFromJson(start(collection));
  assert.ok(input.ok);
  const outcome = step(hooks, decoded.value, null, input.value[1]);
  return outcome.ok ? "committed" : outcome.failure;
}

const asyncFailure = { tag: "unsupported", code: "async-boundary-failure" };

test("an instance's begin crosses the loop's asyncBefore mark, not the envelope's asyncAfter mark", () => {
  const rolledBack = { tag: "rolledBack", code: "exclusive-gateway-no-outgoing-flow" };
  assert.deepEqual(startOutcome(program({ failingSibling: true }), items("a")), rolledBack);
  assert.deepEqual(startOutcome(program({ failingSibling: true, loop: { asyncBefore: true } }), items("a")), asyncFailure);
  assert.deepEqual(startOutcome(program({ failingSibling: true, envelope: { asyncAfter: true } }), items("a")), rolledBack);
});

test("the body's begin crosses the envelope's asyncBefore mark, not the loop's", () => {
  const notAList = { kind: "string", value: "a" };
  assert.deepEqual(startOutcome(program({ envelope: { asyncBefore: true } }), notAList), asyncFailure);
  assert.deepEqual(startOutcome(program({ loop: { asyncBefore: true } }), notAList),
    { tag: "semanticFailure", code: "multi-instance-collection" });
});

test("an instance's completion crosses the loop's asyncAfter mark", () => {
  const stimuli = [start(items("a")), result(1)];
  assert.deepEqual(journey(run(program({ failingAfter: true }), stimuli)).at(-1), ["result-1", "rolledBack", [1]]);
  assert.deepEqual(journey(run(program({ failingAfter: true, loop: { asyncAfter: true } }), stimuli)).at(-1), ["result-1", "unsupported", [1]]);
  assert.deepEqual(journey(run(program({ failingAfter: true, envelope: { asyncAfter: true } }), stimuli)).at(-1), ["result-1", "unsupported", [1]]);
});
