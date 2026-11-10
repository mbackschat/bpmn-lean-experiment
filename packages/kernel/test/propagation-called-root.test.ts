/**
 * A raise that reaches a called root under `RaisedCallOutputs.atCalledRoot` (CIB-EXT-0034): the Call's outputs pass
 * there before the catch, except when the thrower runs directly at that root while another path stands there, that
 * level catches and the Call maps outputs. CIB's walk then starts at the thrower's concurrent execution and stops at the
 * catch before its propagator sees the root (`tree/ActivityExecutionHierarchyWalker.java:53-55`, `:76-95`), so the
 * kernel refuses the run (`raise-caught-at-busy-called-root`; scopes semantics PC-SCOPE-06 item 4). `T` calls `Called`
 * and has an interrupting Escalation boundary `B` on `X` leading to the User Task `W`; the called process forks into
 * the Intermediate throw `CX` and, when busy, the User Task `CW`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";

import {
  activity, append, base, boundary, callWork, definitionRef, end, escalationTrigger, flow, gateway, literalValue, mapping, start,
  task, userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const cib = { raisedCallOutputs: "atCalledRoot", undeclaredWrite: "atInstanceRoot" };
const slot = [mapping("slot", literalValue({ kind: "string", value: "x" }))];

/** An Intermediate throw Event `id` raising the Escalation `X`. */
const throwing = (id: string): Json => ({
  event: {
    header: { id, origin: { definition: null, sourceId: id }, sourceType: "intermediateThrowEvent", parent: null },
    payload: { role: { throw: { record: { escalation: { payload: { code: "X" } } } } }, placement: "intermediate", incoming: [],
      outgoing: [], alternativeThrows: [] },
  },
});

function calling(outputs: Json[], busy: boolean): Json {
  const caller = append(task(activity("T", callWork({ outputs }), { boundaries: [boundary("B", escalationTrigger({ code: "X" }))] }))(base()),
    activity("W", userWork()));
  const children = busy ? ["CS", "CG", "CX", "CE", "CW", "CE2"] : ["CS", "CX", "CE"];
  const called = append(caller, start("CS"), throwing("CX"), end("CE"),
    ...(busy ? [gateway("CG", "parallel"), activity("CW", userWork()), end("CE2")] : []));
  const flows = busy
    ? [flow("cf1", "CS", "CG"), flow("cf2", "CG", "CX"), flow("cf3", "CG", "CW"), flow("cf4", "CX", "CE"), flow("cf5", "CW", "CE2")]
    : [flow("cf1", "CS", "CX"), flow("cf2", "CX", "CE")];
  const program = withFlows({ ...called, processes: [{ definition: definitionRef("Called"), children, variables: [], executable: true }] },
    flow("fb", "B", "W"), flow("fw", "W", "E"), ...flows);
  return withOptions(program, cib);
}

function started(json: Json) {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const stimulus = stimulusFromJson({ commandId: "c", kind: "start", instanceId: "I", variables: [] });
  assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
  return step(hooks, decoded.value, null, stimulus.value[1]);
}

test("a raise caught at a busy called root whose Call maps outputs is refused", () => {
  assert.deepEqual(started(calling(slot, true)), { ok: false, failure: { tag: "unsupported", code: "raise-caught-at-busy-called-root" } });
});

test("a raise caught at an idle called root passes the Call's outputs before the catch", () => {
  const outcome = started(calling(slot, false));
  assert.ok(outcome.ok, JSON.stringify(outcome));
  assert.deepEqual(outcome.value.openItems.map((item) => item.element), ["W"]);
  assert.deepEqual(outcome.value.variables.flatMap((entry) => entry.entries), [["slot", { tag: "string", value: "x" }]]);
});

test("a raise caught at a busy called root whose Call maps nothing commits", () => {
  const outcome = started(calling([], true));
  assert.ok(outcome.ok, JSON.stringify(outcome));
  assert.deepEqual(outcome.value.openItems.map((item) => item.element), ["W"]);
});
