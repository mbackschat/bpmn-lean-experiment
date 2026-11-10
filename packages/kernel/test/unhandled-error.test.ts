/**
 * What an Error that finds no catcher does, the profile's `UnhandledError` (docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md):
 * the standards reading fails the instance and names the thrower (BPMN 2.0.2 Table 10.88, "a common one being
 * termination of the Process instance"); CIB's ends only the throwing path (CIB-INT-0013), except where that path's end
 * would run the thrower's output mappings as its instance ends, which CIB rolls back and the kernel refuses
 * (CIB-LIM-0006). The thrower is the Service Task `T` of `Start -> T -> End`, whose only boundary catches another code.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { State } from "@bpmn-lean/kernel";

import {
  activity, append, base, boundary, callWork, definitionRef, end, errorTrigger, flow, gateway, loop, mapping, serviceWork, start,
  task, userWork, variable, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const cib = { unhandledError: "endsThrowingPath", errorPathOutputs: "mapped", undeclaredWrite: "atInstanceRoot" };

/** `T` is a Service Task with a `CAUGHT` boundary `B` leading to `End`, and `outputs` as its output mappings. */
const thrower = (outputs: Json[]) => (program: Json): Json =>
  withFlows(task(activity("T", serviceWork(), { outputs, boundaries: [boundary("B", errorTrigger({ code: "CAUGHT" }))] }))(program),
    flow("fb", "B", "E"));

/** A Parallel fork before `T` also opens the User Task `W`. */
const withSibling = (program: Json): Json => {
  const forked = withFlows(append(program, gateway("G", "parallel"), activity("W", userWork())),
    flow("fg", "S", "G"), flow("fgt", "G", "T"), flow("fgw", "G", "W"), flow("fw", "W", "E"));
  return { ...forked, flows: (forked.flows as Json[]).filter((entry) => entry.id !== "f1") };
};

const reservation = [mapping("reservation", variable("result"))];
const result = [{ name: "result", value: { kind: "string", value: "none" } }];

const stimulus = (json: Json) => {
  const decoded = stimulusFromJson({ commandId: "c", ...json });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

/** Start, then fail `T` with the code `OTHER`, which no catcher names, and the result patch `outputs`. */
function failUnmatched(json: Json, outputs: Json[] = []) {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const started = step(hooks, decoded.value, null, stimulus({ kind: "start", instanceId: "I", variables: [] }));
  assert.ok(started.ok, JSON.stringify(started));
  return step(hooks, decoded.value, started.value, stimulus({
    kind: "effectResult",
    occurrence: { processInstanceId: "I", elementId: "T", activation: 1 },
    outcome: { kind: "businessFailure", code: "OTHER", message: "no stock", outputs },
  }));
}

const committed = (outcome: ReturnType<typeof failUnmatched>): State => {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
};

test("under the standards reading an uncaught Error fails the instance and names its thrower", () => {
  const state = committed(failUnmatched(thrower([])(base())));
  assert.equal(state.status, "failed");
  assert.deepEqual(state.failure, {
    code: "OTHER", message: "no stock", occurrence: { processInstanceId: "I", element: "T", activation: 1 }, related: [],
  });
});

test("the standards reading also fails an instance whose other paths are still open", () => {
  const state = committed(failUnmatched(withSibling(thrower([])(base()))));
  assert.equal(state.status, "failed");
  assert.deepEqual(state.openItems, []);
});

test("under CIB's reading an uncaught Error ends only its path, and the instance completes when nothing remains", () => {
  assert.equal(committed(failUnmatched(withOptions(thrower([])(base()), cib))).status, "completed");
  const forked = committed(failUnmatched(withOptions(withSibling(thrower(reservation)(base())), cib), result));
  assert.equal(forked.status, "running");
  assert.deepEqual(forked.openItems.map((item) => item.element), ["W"]);
  assert.deepEqual(forked.variables.flatMap((scope) => scope.entries), [["reservation", { tag: "string", value: "none" }]]);
});

test("under CIB's reading the last path of the instance ending with the thrower's outputs is refused", () => {
  assert.deepEqual(failUnmatched(withOptions(thrower(reservation)(base()), cib), result),
    { ok: false, failure: { tag: "unsupported", code: "unhandled-error-ends-instance-with-outputs" } });
});

/** Start with `items`, then fail the effect of `T` in `instance` with the code `OTHER`, which no catcher names. */
function failUnmatchedIn(json: Json, instance: string) {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const items = { name: "items", value: { kind: "stringList", value: ["a", "b"] } };
  const started = step(hooks, decoded.value, null, stimulus({ kind: "start", instanceId: "I", variables: [items] }));
  assert.ok(started.ok, JSON.stringify(started));
  const element = instance === "I" ? "T" : "CT";
  return step(hooks, decoded.value, started.value, stimulus({
    kind: "effectResult",
    occurrence: { processInstanceId: instance, elementId: element, activation: 1 },
    outcome: { kind: "businessFailure", code: "OTHER", message: "no stock", outputs: [] },
  }));
}

// Until PC-ERROR-03 settles what CIB's `execution.end(true)` does to an enclosing Multi-Instance instance or called
// instance, CIB's reading refuses an uncaught Error whose path lies inside one (CIB-INT-0013's boundary).
test("under CIB's reading an uncaught Error inside a Multi-Instance instance is refused", () => {
  for (const mode of ["sequential", "parallel"]) {
    const program = withOptions(task(activity("T", serviceWork(), {
      multiInstance: loop({ mode, outputDataItem: null }),
      boundaries: [boundary("B", errorTrigger({ code: "CAUGHT" }))],
    }))(base()), cib);
    assert.deepEqual(failUnmatchedIn(withFlows(program, flow("fb", "B", "E")), "I"),
      { ok: false, failure: { tag: "unsupported", code: "unhandled-error-leaves-multi-instance-instance" } }, mode);
  }
});

test("under CIB's reading an uncaught Error inside a called instance is refused", () => {
  const called = append(task(activity("T", callWork()))(base()),
    start("CS", null), activity("CT", serviceWork(), { boundaries: [boundary("CB", errorTrigger({ code: "CAUGHT" }))] }), end("CE"));
  const program = withFlows({ ...called, processes: [{ definition: definitionRef("Called"), children: ["CS", "CT", "CE"], variables: [], executable: true }] },
    flow("cf1", "CS", "CT"), flow("cf2", "CT", "CE"), flow("cfb", "CB", "CE"));
  assert.deepEqual(failUnmatchedIn(withOptions(program, cib), "call:1:I:1:T:1"),
    { ok: false, failure: { tag: "unsupported", code: "unhandled-error-leaves-called-instance" } });
});

test("an uncaught Error End fails the instance under the standards reading and ends its path under CIB's", () => {
  const program = (json: Json): Json => task(end("T", { error: { payload: { code: "OTHER", message: null } } }))(json);
  const decoded = decodeProgram(wired(program(base())));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const standards = committed(step(hooks, decoded.value, null, stimulus({ kind: "start", instanceId: "I", variables: [] })));
  assert.equal(standards.status, "failed");
  assert.equal(standards.failure?.occurrence.element, "T");
  const cibDecoded = decodeProgram(wired(withOptions(program(base()), cib)));
  assert.ok(cibDecoded.ok, cibDecoded.ok ? "" : cibDecoded.refusal);
  assert.equal(committed(step(hooks, cibDecoded.value, null, stimulus({ kind: "start", instanceId: "I", variables: [] }))).status,
    "completed");
});
