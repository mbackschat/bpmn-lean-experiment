/**
 * Where an Activity's output mappings read (PC-DATA-06; docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#activity-data).
 * The standards reading evaluates them against the submitted values alone (BPMN 2.0.2 §10.4.2), so an output whose
 * source only a captured input holds is unavailable and its `ioParameter` expression rolls the command back
 * (CIB-EXT-0024). Under `OutputContext.activityScope` (CIB-EXT-0031) they read the Activity's own scope, as CIB's
 * `OutputParameter.java:47` evaluates them in the Activity's execution: the submitted values first, then the Activity's
 * captured inputs and the variables visible from it. The oracle is the retained CIB answer of
 * `output-mapping-fanout/captured-input-fallback` and `completion-captured-fallback`, which commit.
 *
 * `S → T → E`, `T` a User Task or a Service Task with the input `captured := "from-input"`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, State } from "@bpmn-lean/kernel";

import { activity, base, literalValue, mapping, serviceWork, task, userWork, variable, withOptions, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const str = (value: string): Json => ({ kind: "string", value });
const envelope = (...outputs: Json[]): Json => ({ inputs: [mapping("captured", literalValue(str("from-input")))], outputs });

const cib = { submission: "installsVariables", undeclaredWrite: "atInstanceRoot", effectResultValues: "activityLocals" };

function program(work: Json, outputContext: string, ...outputs: Json[]): Json {
  return wired(withOptions(task(activity("T", work, envelope(...outputs)))(base()), { ...cib, outputContext }));
}

const at = { processInstanceId: "I", elementId: "T", activation: 1 };
const completion = (...values: [string, Json][]): Json =>
  ({ kind: "command", occurrence: at, action: { kind: "completeUserTask", values: values.map(([name, value]) => ({ name, value })) } });
const result = (...values: [string, Json][]): Json =>
  ({ kind: "effectResult", occurrence: at, outcome: { kind: "success", outputs: values.map(([name, value]) => ({ name, value })) } });

/** Start the instance, run `stimulus` and return its outcome. */
function after(json: Json, stimulus: Json): Outcome {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  let state: State | null = null;
  let outcome: Outcome | null = null;
  for (const raw of [{ kind: "start", instanceId: "I", variables: [] }, stimulus]) {
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

const captured = mapping("out", variable("captured"));

test("under the standards reading an output whose source only a captured input holds rolls back", () => {
  const unresolved = { tag: "rolledBack", code: "unknown-variable" };
  assert.deepEqual(root(after(program(userWork(), "submission", captured), completion())), unresolved);
  assert.deepEqual(root(after(program(serviceWork(), "submission", captured), result())), unresolved);
});

test("under the CIB output context an output reads the Activity's captured input", () => {
  assert.deepEqual(root(after(program(userWork(), "activityScope", captured), completion())), { out: { tag: "string", value: "from-input" } });
  assert.deepEqual(root(after(program(serviceWork(), "activityScope", captured), result())), { out: { tag: "string", value: "from-input" } });
});

test("a submitted value of the same name precedes the captured input", () => {
  assert.deepEqual(root(after(program(userWork(), "activityScope", captured), completion(["captured", str("submitted")]))),
    { out: { tag: "string", value: "submitted" } });
  assert.deepEqual(root(after(program(serviceWork(), "activityScope", captured), result(["captured", str("submitted")]))),
    { out: { tag: "string", value: "submitted" } });
});
