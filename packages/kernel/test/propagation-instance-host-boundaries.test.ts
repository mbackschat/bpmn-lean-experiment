/**
 * A raising Activity's own boundaries (docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md): they are searched first
 * unless the Activity is itself an instance of its Multi-Instance loop, whose boundaries belong to the body. An Activity
 * that merely runs inside an instance of an enclosing Multi-Instance Sub-Process, or inside a called instance of a
 * Multi-Instance Call, is no such instance, and its boundaries catch as anywhere else (BPMN 2.0.2 §10.5.4, §10.2.8;
 * #116).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { State } from "@bpmn-lean/kernel";

import {
  activity, append, base, boundary, callWork, definitionRef, elementId, end, errorTrigger, flow, loop, scope, serviceWork, start,
  task, userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const cib = { unhandledError: "endsThrowingPath", errorPathOutputs: "mapped", undeclaredWrite: "atInstanceRoot" };

const stimulus = (json: Json) => {
  const decoded = stimulusFromJson({ commandId: "c", ...json });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

/** Start with two `items`, then fail `element` with the code `CAUGHT` in each of `instances`; the open items, sorted. */
function failEach(json: Json, element: string, instances: readonly string[]): string[] {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const items = { name: "items", value: { kind: "stringList", value: ["a", "b"] } };
  const started = step(decoded.value, null, stimulus({ kind: "start", instanceId: "I", variables: [items] }));
  assert.ok(started.ok, JSON.stringify(started));
  let state: State = started.value;
  for (const processInstanceId of instances) {
    const outcome = step(decoded.value, state, stimulus({
      kind: "effectResult",
      occurrence: { processInstanceId, elementId: element, activation: 1 },
      outcome: { kind: "businessFailure", code: "CAUGHT", message: "caught", outputs: [] },
    }));
    assert.ok(outcome.ok, JSON.stringify(outcome));
    state = outcome.value;
  }
  return state.openItems.map((item) => item.element).sort();
}

const looping = loop({ mode: "parallel", outputDataItem: null });

test("a Service Task in a called instance of a Multi-Instance Call catches by its own boundary", () => {
  const called = append(task(activity("T", callWork(), { multiInstance: looping }))(base()),
    start("CS", null), activity("CT", serviceWork(), { boundaries: [boundary("CB", errorTrigger({ code: "CAUGHT" }))] }), end("CE"),
    activity("CH", userWork()));
  const program = withFlows({ ...called, processes: [{ definition: definitionRef("Called"), children: ["CS", "CT", "CE", "CH"], variables: [], executable: true }] },
    flow("cf1", "CS", "CT"), flow("cf2", "CT", "CE"), flow("cfb", "CB", "CH"), flow("cfh", "CH", "CE"));
  assert.deepEqual(failEach(withOptions(program, cib), "CT", ["call:1:I:1:T:1", "call:1:I:1:T:2"]), ["CH", "CH"]);
});

test("a Service Task in an instance of a Multi-Instance Sub-Process catches by its own boundary", () => {
  const program = base();
  const nested = {
    ...program,
    elements: [
      ...(program.elements as Json[]).filter((element) => elementId(element) !== "T"),
      scope("T", "embedded", {}, { multiInstance: looping }), start("TS", null, [], "T"),
      activity("TC", serviceWork(), { boundaries: [boundary("TB", errorTrigger({ code: "CAUGHT" }))] }, "T"), end("TE", "none", "T"),
      activity("TH", userWork(), {}, "T"),
    ],
    flows: [...(program.flows as Json[]), flow("tf1", "TS", "TC"), flow("tf2", "TC", "TE"), flow("tfb", "TB", "TH"), flow("tfh", "TH", "TE")],
  };
  assert.deepEqual(failEach(withOptions(nested, cib), "TC", ["I"]), ["TC", "TH"]);
});

// The boundary of a Multi-Instance Activity belongs to its body: an instance that raises is caught there, which ends
// the whole body, never one instance.
test("a Multi-Instance Service Task's instance is caught by the body's boundary", () => {
  const program = withFlows(task(activity("T", serviceWork(), {
    multiInstance: looping, boundaries: [boundary("B", errorTrigger({ code: "CAUGHT" }))],
  }))(base()), flow("fb", "B", "H"));
  assert.deepEqual(failEach(append(withOptions(program, cib), activity("H", userWork(), { outgoing: [] })), "T", ["I"]), ["H"]);
});
