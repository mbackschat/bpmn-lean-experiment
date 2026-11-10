/**
 * A raise that reaches a called root under `RaisedCallOutputs.atCalledRoot` (CIB-EXT-0034): the Call's outputs pass
 * there before the catch, except when the thrower runs directly at that root while another path stands there, the
 * root's own Event Sub-Process catches and the Call maps outputs. CIB's walk then visits the root first with the
 * thrower's concurrent execution and stops at that catch before its propagator sees the instance execution
 * (`tree/ActivityExecutionHierarchyWalker.java:52-54`), so the kernel refuses the run
 * (`raise-caught-at-busy-called-root`; scopes semantics PC-SCOPE-06 item 4). A catcher further out, the Call's own
 * boundary included, lets the walk reach the instance execution, where the outputs pass. `T` calls `Called` and has an
 * interrupting Escalation boundary `B` on `X` leading to the User Task `W`, or the called root holds the interrupting
 * Escalation Event Sub-Process `CH` instead; the called process forks into the Intermediate throw `CX` and, when busy,
 * the User Task `CW`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";

import {
  activity, append, base, boundary, callWork, definitionRef, end, errorTrigger, escalationTrigger, eventSubProcess, flow, gateway, literalValue,
  mapping, scope, start, task, userWork, withFlows, withOptions, wired,
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

function calling(outputs: Json[], busy: boolean, catcher: "callBoundary" | "rootEventSubProcess" = "callBoundary"): Json {
  const boundaries = catcher === "callBoundary" ? [boundary("B", escalationTrigger({ code: "X" }))] : [];
  const callerTask = task(activity("T", callWork({ outputs }), { boundaries }))(base());
  const caller = catcher === "callBoundary" ? append(callerTask, activity("W", userWork())) : callerTask;
  const handler = catcher === "rootEventSubProcess"
    ? [scope("CH", eventSubProcess(escalationTrigger({ code: "X" }), true)), start("CHS", escalationTrigger({ code: "X" }), [], "CH"),
      end("CHE", "none", "CH")]
    : [];
  const children = [...(busy ? ["CS", "CG", "CX", "CE", "CW", "CE2"] : ["CS", "CX", "CE"]), ...(handler.length > 0 ? ["CH"] : [])];
  const called = append(caller, start("CS"), throwing("CX"), end("CE"),
    ...(busy ? [gateway("CG", "parallel"), activity("CW", userWork()), end("CE2")] : []), ...handler);
  const flows = busy
    ? [flow("cf1", "CS", "CG"), flow("cf2", "CG", "CX"), flow("cf3", "CG", "CW"), flow("cf4", "CX", "CE"), flow("cf5", "CW", "CE2")]
    : [flow("cf1", "CS", "CX"), flow("cf2", "CX", "CE")];
  const caught = catcher === "callBoundary" ? [flow("fb", "B", "W"), flow("fw", "W", "E")] : [flow("ch1", "CHS", "CHE")];
  const program = withFlows({ ...called, processes: [{ definition: definitionRef("Called"), children, variables: [], executable: true }] },
    ...caught, ...flows);
  return withOptions(program, catcher === "rootEventSubProcess" ? { ...cib, abnormalScopeEnd: "completesNormally" } : cib);
}

function started(json: Json) {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const stimulus = stimulusFromJson({ commandId: "c", kind: "start", instanceId: "I", variables: [] });
  assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
  return step(hooks, decoded.value, null, stimulus.value[1]);
}

test("a raise caught by the busy called root's own Event Sub-Process whose Call maps outputs is refused", () => {
  assert.deepEqual(started(calling(slot, true, "rootEventSubProcess")),
    { ok: false, failure: { tag: "unsupported", code: "raise-caught-at-busy-called-root" } });
});

// Retained CIB answer `escalation-busy-called-root/caught-at-busy-called-root`: the Call's boundary catches at a busy
// root and CIB commits with the Call's output written.
test("a raise from a busy called root caught by the Call's boundary passes the Call's outputs before the catch", () => {
  const outcome = started(calling(slot, true));
  assert.ok(outcome.ok, JSON.stringify(outcome));
  assert.deepEqual(outcome.value.openItems.map((item) => item.element), ["W"]);
  assert.deepEqual(outcome.value.variables.flatMap((entry) => entry.entries), [["slot", { tag: "string", value: "x" }]]);
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

// CIB sets a catch variable on the execution of the catcher's event scope (`BpmnExceptionHandler.java:146-153`), which
// for a boundary on a Call is the Call's execution in the caller, not the called instance (CIB-EXT-0028).
test("a Call boundary's catch variables are written in the caller, not in the called instance", () => {
  const caller = append(task(activity("T", callWork(), {
    boundaries: [boundary("B", errorTrigger({ code: "FAIL", codeVariable: "code", messageVariable: "message" }))],
  }))(base()), activity("W", userWork()));
  const called = append(caller, start("CS"), end("CE", { error: { payload: { code: "FAIL", message: { literal: { value: "boom" } } } } }));
  const program = withFlows({ ...called, processes: [{ definition: definitionRef("Called"), children: ["CS", "CE"], variables: [], executable: true }] },
    flow("fb", "B", "W"), flow("fw", "W", "E"), flow("cf1", "CS", "CE"));
  const outcome = started(withOptions(program, { errorCatchVariables: "eventScope", undeclaredWrite: "atInstanceRoot" }));
  assert.ok(outcome.ok, JSON.stringify(outcome));
  assert.deepEqual(outcome.value.openItems.map((item) => item.element), ["W"]);
  assert.deepEqual(outcome.value.variables.flatMap((entry) => entry.entries),
    [["code", { tag: "string", value: "FAIL" }], ["message", { tag: "string", value: "boom" }]]);
});
