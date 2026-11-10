/**
 * The order in which an element's mappings evaluate (PC-DATA-05, PC-DATA-06; `ctxEvaluateMappingsWith`). CIB runs a
 * parameter list one at a time in document order (`IoMapping.java:38-48`): the first throwing input ends the command,
 * a target named twice keeps the value written last, and under `OutputContext.activityScope` each output parameter is
 * written into the outer scope before the next one is evaluated in the inner scope (`OutputParameter.java:44-52`), so a
 * later output reads an earlier one's target unless an inner local shadows it (CIB-EXT-0031); a value the submission
 * installed outward reads behind that write (`AbstractVariableScope.java:331-345`). The oracle is that
 * source, until the evidence run answers the witnesses of `scenarios/open-rows/mapping-order`.
 *
 * `S → T → E`, `T` a User Task or a Sub-Process `S1 → E1`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, State } from "@bpmn-lean/kernel";

import {
  activity, base, end, flow, juel, literalValue, mapping, scope, start, userWork, variable, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const str = (value: string): Json => ({ kind: "string", value });
/** A String as the kernel state holds it. */
const held = (value: string): unknown => ({ tag: "string", value });
const reads = (name: string): Json => juel({ identifier: { name } });
/** `${'1.5' + 1 > 2}`: admitted, but its Double sum is `unsupported` when it runs. */
const doubleAtRunTime = juel(
  { stringLiteral: { value: "1.5" } }, { integer: { digits: "1" } }, { binary: { payload: { op: "add", left: 0, right: 1 } } },
  { integer: { digits: "2" } }, { binary: { payload: { op: "gt", left: 2, right: 3 } } },
);

function cib(outputContext: string): Json {
  return { evaluator: "juel", submission: "installsVariables", undeclaredWrite: "atInstanceRoot", outputContext };
}

function userTask(outputContext: string, env: Json): Json {
  return wired(withOptions({ ...base(), elements: [start("S"), activity("T", userWork(), env), end("E")] }, cib(outputContext)));
}

function subProcess(outputContext: string, env: Json): Json {
  const program = base();
  return wired(withOptions({
    ...program,
    elements: [start("S"), scope("T", "embedded", {}, env), start("S1", null, [], "T"), end("E1", "none", "T"), end("E")],
    flows: [...(program.flows as Json[]), flow("f3", "S1", "E1")],
  }, cib(outputContext)));
}

const at = { processInstanceId: "I", elementId: "T", activation: 1 };
const completion = (...values: [string, Json][]): Json =>
  ({ kind: "command", occurrence: at, action: { kind: "completeUserTask", values: values.map(([name, value]) => ({ name, value })) } });

/** Start the instance with `total = "old"`, run `stimuli` and return the last outcome. */
function run(json: Json, ...stimuli: Json[]): Outcome {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  let state: State | null = null;
  let outcome: Outcome | null = null;
  for (const raw of [{ kind: "start", instanceId: "I", variables: [{ name: "total", value: str("old") }] }, ...stimuli]) {
    const parsed = stimulusFromJson({ commandId: "c", ...raw });
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.refusal);
    outcome = step(hooks, decoded.value, state, parsed.value[1]);
    if (!outcome.ok) return outcome;
    state = outcome.value;
  }
  return outcome!;
}

const root = (outcome: Outcome): unknown => outcome.ok
  ? Object.fromEntries((outcome.value.variables.find((entry) => entry.scope === 0)?.entries ?? []).map(([name, value]) => [name, value]))
  : outcome.failure;

const chained = [mapping("total", reads("amount")), mapping("summary", reads("total"))];

test("an input that fails ends the entry before a later unsupported one is reached", () => {
  const inputs = [mapping("a", reads("missing")), mapping("b", doubleAtRunTime)];
  assert.deepEqual(root(run(userTask("activityScope", { inputs }))), { tag: "rolledBack", code: "unknown-variable" });
  assert.deepEqual(root(run(userTask("activityScope", { inputs: [...inputs].reverse() }))), { tag: "unsupported", code: "juel.double" });
});

test("an input target named twice holds the value written last", () => {
  const env = { inputs: [mapping("x", literalValue(str("first"))), mapping("x", literalValue(str("second")))], outputs: [mapping("out", reads("x"))] };
  assert.deepEqual((root(run(userTask("activityScope", env), completion())) as Record<string, unknown>).out, held("second"));
});

test("under the CIB output context a Scope's later output reads an earlier one's target", () => {
  const env = { inputs: [mapping("amount", literalValue(str("new")))], outputs: chained };
  assert.deepEqual((root(run(subProcess("activityScope", env))) as Record<string, unknown>).summary, held("new"));
});

test("under the standards reading a Scope's outputs all read the context before any of them is written", () => {
  const env = { inputs: [mapping("amount", literalValue(str("new")))], outputs: chained };
  assert.deepEqual((root(run(subProcess("submission", env))) as Record<string, unknown>).summary, held("old"));
});

test("a Scope's own local shadows an earlier output's target", () => {
  const env = { inputs: [mapping("amount", literalValue(str("new"))), mapping("total", literalValue(str("inner")))], outputs: chained };
  const variables = root(run(subProcess("activityScope", env))) as Record<string, unknown>;
  assert.deepEqual([variables.total, variables.summary], [held("new"), held("inner")]);
});

test("an output target named twice holds the value written last", () => {
  const env = { outputs: [mapping("out", literalValue(str("first"))), mapping("out", literalValue(str("second")))] };
  assert.deepEqual((root(run(subProcess("activityScope", env))) as Record<string, unknown>).out, held("second"));
});

test("a Data Association source that is unavailable does not hide a later unsupported one", () => {
  const inputs = [mapping("a", variable("missing"), "dataAssociation"), mapping("b", doubleAtRunTime)];
  assert.deepEqual(root(run(userTask("activityScope", { inputs }))), { tag: "unsupported", code: "juel.double" });
});

test("under the CIB output context a User Task's later output reads an earlier one's target", () => {
  const env = { outputs: chained };
  assert.deepEqual((root(run(userTask("activityScope", env), completion(["amount", str("new")]))) as Record<string, unknown>).summary, held("new"));
  assert.deepEqual(root(run(userTask("submission", env), completion(["amount", str("new")]))), { tag: "rolledBack", code: "unknown-variable" });
});

test("under the CIB output context a later output reads an earlier one's write of a name the submission installed", () => {
  const env = { outputs: [mapping("total", literalValue(str("mapped"))), mapping("summary", reads("total"))] };
  const variables = root(run(userTask("activityScope", env), completion(["total", str("submitted")]))) as Record<string, unknown>;
  assert.deepEqual([variables.total, variables.summary], [held("mapped"), held("mapped")]);
});

test("a submitted value of a name the task holds as a local shadows an earlier output's write", () => {
  const env = { inputs: [mapping("total", literalValue(str("inner")))], outputs: [mapping("total", literalValue(str("mapped"))), mapping("summary", reads("total"))] };
  const variables = root(run(userTask("activityScope", env), completion(["total", str("submitted")]))) as Record<string, unknown>;
  assert.deepEqual([variables.total, variables.summary], [held("mapped"), held("submitted")]);
});
