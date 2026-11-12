/**
 * A Service Task whose business Error its own boundaries do not catch leaves where the search decides, under the CIB
 * profiles (PC-ERROR-03; CIB-EXT-0016, CIB-EXT-0028, CIB-EXT-0034): after every Call output pass and the catcher's
 * variables, before the interrupted host's outputs. CIB's search starts at the task's own execution and destroys it only
 * once the catcher starts or the path ends (`BpmnExceptionHandler.java:97-155`), running its output parameters then
 * (`ExecutionEntity.java:521-525`). The caught values land where `setVariable` on the event scope's execution leaves
 * them, so the task's outputs read them behind its own locals and those of every scope between it and the event scope,
 * and never across instances.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";

import {
  activity, append, base, boundary, callWork, definitionRef, end, errorTrigger, flow, gateway, literalValue, mapping, scope,
  refusalOf, serviceWork, start, task, userWork, variable, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const cib = {
  errorCatchVariables: "eventScope", errorPathOutputs: "mapped", raisedCallOutputs: "atCalledRoot", undeclaredWrite: "atInstanceRoot",
  outputContext: "activityScope", unhandledError: "endsThrowingPath", effectResultValues: "activityLocals",
};
const text = (value: string): Json => literalValue({ kind: "string", value });
const held = (value: string) => ({ tag: "string", value });

const stimulus = (json: Json) => {
  const decoded = stimulusFromJson({ commandId: "c", ...json });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

/** Start `json`, then fail the Service Task `element` of `instance` with `code`, reporting `result = rejected`. */
function failure(json: Json, element: string, code: string, instance = "I", variables: Json[] = []) {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const started = step(decoded.value, null, stimulus({ kind: "start", instanceId: "I", variables }));
  assert.ok(started.ok, JSON.stringify(started));
  return step(decoded.value, started.value, stimulus({
    kind: "effectResult",
    occurrence: { processInstanceId: instance, elementId: element, activation: 1 },
    outcome: { kind: "businessFailure", code, outputs: [{ name: "result", value: { kind: "string", value: "rejected" } }] },
  }));
}

/** `failure`, committed. */
function failed(json: Json, element: string, code: string, instance = "I", variables: Json[] = []) {
  const outcome = failure(json, element, code, instance, variables);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

type Nesting = Readonly<{ hostInputs?: Json[]; hostOutputs?: Json[]; middleInputs?: Json[] | null; taskOutputs: Json[] }>;

/**
 * The Sub-Process `T` with the interrupting boundary `B`, which catches `FAIL` into `label` and leads to the User Task
 * `W`; inside it the Service Task `PT`, directly or inside the Sub-Process `M` when `middleInputs` is given.
 */
function nested({ hostInputs = [], hostOutputs = [], middleInputs = null, taskOutputs }: Nesting): Json {
  const host = scope("T", "embedded", {}, {
    inputs: hostInputs, outputs: hostOutputs, boundaries: [boundary("B", errorTrigger({ code: "FAIL", codeVariable: "label" }))],
  });
  const thrower = middleInputs === null ? "T" : "M";
  const inner = [activity("PT", serviceWork(), { outputs: taskOutputs }, thrower)];
  const middle = middleInputs === null
    ? []
    : [scope("M", "embedded", {}, { inputs: middleInputs }, "T"), start("MS", null, [], "M"), end("ME", "none", "M")];
  const json = append(task(host)(base()), start("PS", null, [], "T"), ...middle, ...inner, end("PE", "none", "T"),
    activity("W", userWork()));
  const flows = middleInputs === null
    ? [flow("pf1", "PS", "PT"), flow("pf2", "PT", "PE")]
    : [flow("pf1", "PS", "M"), flow("pf2", "M", "PE"), flow("mf1", "MS", "PT"), flow("mf2", "PT", "ME")];
  return withOptions(withFlows(json, ...flows, flow("fb", "B", "W"), flow("fw", "W", "E")), cib);
}

const root = (state: ReturnType<typeof failed>): Record<string, unknown> =>
  Object.fromEntries(state.variables.flatMap((entry) => entry.entries));

test("the task's output named like an ancestor catcher's variable is written after it", () => {
  assert.deepEqual(root(failed(nested({ taskOutputs: [mapping("label", text("mapped"))] }), "PT", "FAIL")), { label: held("mapped") });
});

test("the task's output reads an ancestor catcher's variable", () => {
  assert.deepEqual(root(failed(nested({ taskOutputs: [mapping("seen", variable("label"))] }), "PT", "FAIL")),
    { label: held("FAIL"), seen: held("FAIL") });
});

test("the interrupted host's outputs read the task's outputs", () => {
  const state = failed(nested({ taskOutputs: [mapping("label", text("mapped"))], hostOutputs: [mapping("hostSeen", variable("label"))] }),
    "PT", "FAIL");
  assert.deepEqual(root(state), { label: held("mapped"), hostSeen: held("mapped") });
  assert.deepEqual(state.openItems.map((item) => item.element), ["W"]);
});

test("the task's output reads the caught value in the event scope's own local", () => {
  const state = failed(nested({ hostInputs: [mapping("label", text("host"))], taskOutputs: [mapping("seen", variable("label"))] }), "PT", "FAIL");
  assert.deepEqual(root(state), { seen: held("FAIL") });
});

test("a local of the caught name in a scope between the task and the event scope hides the caught value", () => {
  const state = failed(nested({ middleInputs: [mapping("label", text("inner"))], taskOutputs: [mapping("seen", variable("label"))] }),
    "PT", "FAIL");
  assert.deepEqual(root(state), { label: held("FAIL"), seen: held("inner") });
});

/**
 * The Call `T` maps `seed` in as `verdict` and `verdict` out as `checkVerdict`; its called process runs the Service Task
 * `CA`, whose outputs are `taskOutputs`, beside the User Task `CW` when `busy`. When `caught`, a boundary on `T` catches
 * `FAIL` into `label` and leads to `W`.
 */
function calling(caught: boolean, busy: boolean, taskOutputs: Json[]): Json {
  const boundaries = caught ? [boundary("B", errorTrigger({ code: "FAIL", codeVariable: "label" }))] : [];
  const work = callWork({
    inputs: [mapping("verdict", variable("seed"), "callVariable")], outputs: [mapping("checkVerdict", variable("verdict"), "callVariable")],
  });
  const caller = append(task(activity("T", work, { boundaries }))(base()), activity("W", userWork()));
  const children = busy ? ["CS", "CG", "CA", "CW", "CE", "CE2"] : ["CS", "CA", "CE"];
  const called = append(caller, start("CS"), activity("CA", serviceWork(), { outputs: taskOutputs }), end("CE"),
    ...(busy ? [gateway("CG", "parallel"), activity("CW", userWork()), end("CE2")] : []));
  const flows = busy
    ? [flow("cf1", "CS", "CG"), flow("cf2", "CG", "CA"), flow("cf3", "CG", "CW"), flow("cf4", "CA", "CE"), flow("cf5", "CW", "CE2")]
    : [flow("cf1", "CS", "CA"), flow("cf2", "CA", "CE")];
  const program = withFlows({ ...called, processes: [{ definition: definitionRef("Called"), children, variables: [], executable: true }] },
    flow("fb", "B", "W"), flow("fw", "W", "E"), ...flows);
  return withOptions(program, cib);
}

const seed = [{ name: "seed", value: { kind: "string", value: "pending" } }];
const called = "call:1:I:1:T:1";
const toVerdict = [mapping("verdict", variable("result"))];

test("an uncaught Error in a called instance passes the Call's outputs before the task's outputs run", () => {
  const state = failed(calling(false, true, toVerdict), "CA", "UNLISTED", called, seed);
  const scopes = state.variables.map((entry) => Object.fromEntries(entry.entries));
  assert.deepEqual(scopes, [{ seed: held("pending"), checkVerdict: held("pending") }, { verdict: held("rejected") }]);
  assert.deepEqual(state.openItems.map((item) => item.element), ["CW"]);
});

test("a Call boundary that catches a called task's Error passes the Call's outputs before the task's outputs run", () => {
  const state = failed(calling(true, false, toVerdict), "CA", "FAIL", called, seed);
  assert.deepEqual(root(state), { seed: held("pending"), checkVerdict: held("pending"), label: held("FAIL") });
  assert.deepEqual(state.openItems.map((item) => item.element), ["W"]);
});

// CIB sets the caught value on the Call's execution in the caller (`BpmnExceptionHandler.java:146-153`), which the
// called instance's variables do not reach, so the task's output finds no `label` and its expression rolls the command
// back (CIB-EXT-0024).
test("a Call boundary's catch variable is not visible to the failing task in the called instance", () => {
  const outcome = failure(calling(true, false, [mapping("seen", variable("label"))]), "CA", "FAIL", called, seed);
  assert.deepEqual(outcome, { ok: false, failure: { tag: "rolledBack", code: "unknown-variable" } });
});

// A Call boundary writes its catch variables from the Call's occurrence outward, as CIB's `setVariable` on the Call's
// execution does. A Call input parameter would make that execution hold a local of the name, which the kernel's Call
// has no frame for, so admission refuses every Call input parameter (`Admission.Work.workEnvelope`).
test("a Call's input parameter, which would hold a local named like its boundary's catch variable, is refused", () => {
  const program = calling(true, false, toVerdict);
  const withLocal = {
    ...program,
    elements: (program.elements as Json[]).map((element) => {
      const body = (element as Record<string, Json>).activity;
      if (body === undefined || (body.header as Json).id !== "T") return element;
      const payload = body.payload as Json;
      return { activity: { ...body, payload: { ...payload, envelope: { ...(payload.envelope as Json), inputs: [mapping("label", text("local"))] } } } };
    }),
  };
  assert.equal(refusalOf(program), null);
  assert.equal(refusalOf(withLocal), "activity.inputMappings");
});
