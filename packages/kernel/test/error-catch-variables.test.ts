/**
 * An Error boundary's catch variables under `ErrorCatchVariables.eventScope` (CIB-EXT-0028) and the output mappings of
 * the Sub-Process it interrupts under `ErrorPathOutputs.mapped` (CIB-EXT-0016). CIB sets the catch variables on the
 * host before it destroys the host and runs its output parameters (`BpmnExceptionHandler#propagateError:146-154`), so
 * an output mapping reads the caught values. The host is the Sub-Process `T`, `PS -> PT -> PE`, whose boundary `B`
 * catches `FAIL` into `failMessage` and leads to the User Task `W`; `T` maps the output `reason` from `failMessage`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";

import {
  activity, append, base, boundary, end, errorTrigger, flow, literalValue, mapping, scope, serviceWork, start, task, userWork,
  variable, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const cib = { errorCatchVariables: "eventScope", errorPathOutputs: "mapped", undeclaredWrite: "atInstanceRoot" };

function program(inputs: Json[], outputs: Json[] = [mapping("reason", variable("failMessage"))], over: Json = {}): Json {
  const host = scope("T", "embedded", {}, {
    inputs,
    outputs,
    boundaries: [boundary("B", errorTrigger({ code: "FAIL", messageVariable: "failMessage" }))],
  });
  const json = append(task(host)(base()), start("PS", null, [], "T"), activity("PT", serviceWork(), {}, "T"), end("PE", "none", "T"),
    activity("W", userWork()));
  return withOptions(withFlows(json, flow("pf1", "PS", "PT"), flow("pf2", "PT", "PE"), flow("fb", "B", "W"), flow("fw", "W", "E")),
    { ...cib, ...over });
}

const stimulus = (json: Json) => {
  const decoded = stimulusFromJson({ commandId: "c", ...json });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

/** Start, fail `PT` with `FAIL` and the message `boom`, and return the root variables by name. */
function rootAfterCatch(json: Json): Record<string, unknown> {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const started = step(decoded.value, null, stimulus({ kind: "start", instanceId: "I", variables: [] }));
  assert.ok(started.ok, JSON.stringify(started));
  const caught = step(decoded.value, started.value, stimulus({
    kind: "effectResult",
    occurrence: { processInstanceId: "I", elementId: "PT", activation: 1 },
    outcome: { kind: "businessFailure", code: "FAIL", message: "boom", outputs: [] },
  }));
  assert.ok(caught.ok, JSON.stringify(caught));
  assert.deepEqual(caught.value.openItems.map((item) => item.element), ["W"]);
  return Object.fromEntries(caught.value.variables.flatMap((entry) => entry.entries));
}

const boom = { tag: "string", value: "boom" };

test("the interrupted host's output mapping reads the caught message", () => {
  assert.deepEqual(rootAfterCatch(program([])), { failMessage: boom, reason: boom });
});

test("the catch variable updates the host's same-named local, which the host's output mapping then reads", () => {
  const local = [mapping("failMessage", literalValue({ kind: "string", value: "initial" }))];
  assert.deepEqual(rootAfterCatch(program(local)), { reason: boom });
});

// CIB sets the caught value with `setVariable` on the host's execution (`BpmnExceptionHandler.java:148-152`), so it
// reaches the root unless the host holds a local of its name, and the first output's write of that name replaces it
// before the second output reads it (CIB-EXT-0031).
const chainedOverCaught = [mapping("failMessage", literalValue({ kind: "string", value: "mapped" })), mapping("reason", variable("failMessage"))];
const mapped = { tag: "string", value: "mapped" };

test("under the CIB output context a later output reads an earlier one's write of the caught name", () => {
  assert.deepEqual(rootAfterCatch(program([], chainedOverCaught, { outputContext: "activityScope" })), { failMessage: mapped, reason: mapped });
});

test("a caught value the host holds as a local shadows an earlier output's write", () => {
  const local = [mapping("failMessage", literalValue({ kind: "string", value: "initial" }))];
  assert.deepEqual(rootAfterCatch(program(local, chainedOverCaught, { outputContext: "activityScope" })), { failMessage: mapped, reason: boom });
});

// A Service Task host leaves only once its boundary catches: CIB sets the catch variable on the task's execution and
// then runs its output parameters as `deleteCascade` destroys it (`BpmnExceptionHandler.java:146-154`,
// `PvmAtomicOperationCancelActivity.java:60`, `ExecutionEntity.java:521-525`).
function serviceHost(inputs: Json[], outputs: Json[]): Json {
  const host = activity("T", serviceWork(), {
    inputs, outputs, boundaries: [boundary("B", errorTrigger({ code: "FAIL", codeVariable: "code" }))],
  });
  return withOptions(withFlows(append(task(host)(base()), activity("W", userWork())), flow("fb", "B", "W"), flow("fw", "W", "E")),
    { ...cib, outputContext: "activityScope" });
}

/** Start, fail `T` with `FAIL`, and return the root variables by name, or the failure. */
function rootAfterTaskCatch(json: Json): unknown {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const started = step(decoded.value, null, stimulus({ kind: "start", instanceId: "I", variables: [] }));
  assert.ok(started.ok, JSON.stringify(started));
  const caught = step(decoded.value, started.value, stimulus({
    kind: "effectResult",
    occurrence: { processInstanceId: "I", elementId: "T", activation: 1 },
    outcome: { kind: "businessFailure", code: "FAIL", message: "boom", outputs: [] },
  }));
  return caught.ok ? Object.fromEntries(caught.value.variables.flatMap((entry) => entry.entries)) : caught.failure;
}

const fail = { tag: "string", value: "FAIL" };

test("a task host's output named like its catch variable is written after it", () => {
  const outputs = [mapping("code", literalValue({ kind: "string", value: "mapped" })), mapping("seen", variable("code"))];
  assert.deepEqual(rootAfterTaskCatch(serviceHost([], outputs)), { code: mapped, seen: mapped });
});

test("a task host's output reads its catch variable", () => {
  assert.deepEqual(rootAfterTaskCatch(serviceHost([], [mapping("seen", variable("code"))])), { code: fail, seen: fail });
});

test("a catch variable a task host holds as a local updates that local, which ends with the task", () => {
  const local = [mapping("code", literalValue({ kind: "string", value: "inner" }))];
  assert.deepEqual(rootAfterTaskCatch(serviceHost(local, [mapping("seen", variable("code"))])), { seen: fail });
});
