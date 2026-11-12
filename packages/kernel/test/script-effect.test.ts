/**
 * A JavaScript Script Task is an effect ([script semantics](../../../docs/kernel/semantics/SCRIPT-SEMANTICS-SPEC.md),
 * items 3 and 5): its occurrence opens one effect item whose arguments are the snapshot of every variable visible from
 * its scope occurrence, nearest owner first, one entry per name, and the result patch names at most its result
 * variable, which is written to the nearest scope holding the name. A result for an occurrence its scope's
 * cancellation removed is stale, which no schedule can author since the host never evaluates a cancelled script.
 *
 * `S → P → E`, `P` a Sub-Process `PS → T → W → PE` with the input `b = "inner"`, `T` the Script Task and `W` a User
 * Task that keeps `P` open; the instance starts with `a = 1` and `b = "outer"`. In the cancellation case `P` carries an interrupting Timer boundary `B → E`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, hostView, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, base, boundary, duration, end, flow, literalValue, mapping, scope, scriptWork, start, userWork, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const str = (value: string): Json => ({ kind: "string", value });
const int = (value: number): Json => ({ kind: "integer", value });

function program(resultVariable: string | null, boundaries: Json[] = []): Program {
  const json = wired(withOptions({
    ...base(),
    elements: [
      start("S"),
      scope("P", "embedded", {}, { inputs: [mapping("b", literalValue(str("inner")))], boundaries }),
      start("PS", null, [], "P"), activity("T", scriptWork({ format: "javascript", source: "b + a", resultVariable }), {}, "P"),
      activity("W", userWork(), {}, "P"), end("PE", "none", "P"), end("E"),
    ],
    flows: [flow("f1", "S", "P"), flow("f2", "P", "E"), flow("f3", "PS", "T"), flow("f4", "T", "W"), flow("f5", "W", "PE"), flow("fb", "B", "E")],
  }, { scriptTask: "javascript", evaluator: "juel", undeclaredWrite: "atInstanceRoot", outputContext: "activityScope" }));
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value;
}

function apply(current: Program, state: State | null, raw: Json): Outcome {
  const stimulus = stimulusFromJson({ commandId: "c", ...raw });
  assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
  return step(hooks, current, state, stimulus.value[1]);
}

function started(current: Program): State {
  const outcome = apply(current, null, { kind: "start", instanceId: "I", variables: [{ name: "a", value: int(1) }, { name: "b", value: str("outer") }] });
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

const result = (outputs: [string, Json][]): Json => ({
  kind: "effectResult",
  occurrence: { processInstanceId: "I", elementId: "T", activation: 1 },
  outcome: { kind: "success", outputs: outputs.map(([name, value]) => ({ name, value })) },
});

/** The variables `state` holds, by owning scope element (`null` for the instance root). */
function holdings(state: State): Record<string, Record<string, unknown>> {
  return Object.fromEntries(state.variables.map(({ scope: id, entries }) => {
    const element = state.scopes.find((entry) => entry.id === id)?.element ?? null;
    return [String(element), Object.fromEntries(entries)];
  }));
}

test("a Script Task opens one effect whose arguments are the visible variables, nearest owner first, one per name", () => {
  const current = program("total");
  const waits = hostView(current, started(current)).openWaits;
  assert.equal(waits.length, 1, JSON.stringify(waits));
  const effect = waits[0]?.view.effect ?? null;
  assert.deepEqual(effect === null ? null : [effect.protocol, effect.operation, effect.arguments], [
    "urn:bpmn-lean:effect-protocol:script-v1", "javascript",
    [["b", { tag: "string", value: "inner" }], ["a", { tag: "int", value: 1 }]],
  ]);
});

test("a Script Task's result is written to the nearest scope holding its result variable", () => {
  const current = program("b");
  const outcome = apply(current, started(current), result([["b", str("innerB")]]));
  assert.ok(outcome.ok, JSON.stringify(outcome));
  assert.deepEqual(holdings(outcome.value), {
    null: { a: { tag: "int", value: 1 }, b: { tag: "string", value: "outer" } },
    P: { b: { tag: "string", value: "innerB" } },
  });
});

test("a Script Task's result for a name no scope holds reaches the instance root", () => {
  const current = program("total");
  const outcome = apply(current, started(current), result([["total", int(2)]]));
  assert.ok(outcome.ok, JSON.stringify(outcome));
  assert.deepEqual(holdings(outcome.value).null?.total, { tag: "int", value: 2 });
});

test("a Script Task's empty result writes nothing", () => {
  const current = program("total");
  const outcome = apply(current, started(current), result([]));
  assert.ok(outcome.ok, JSON.stringify(outcome));
  assert.equal(holdings(outcome.value).null?.total, undefined);
});

for (const [label, resultVariable, outputs, code] of [
  ["a name other than the result variable", "total", [["other", int(1)]], "undeclared-output"],
  ["any name without a result variable", null, [["total", int(1)]], "undeclared-output"],
  ["the result variable and another name", "total", [["total", int(1)], ["other", int(1)]], "undeclared-output"],
  ["the result variable twice", "total", [["total", int(1)], ["total", int(2)]], "duplicate-output"],
] as const) {
  test(`a Script Task's result naming ${label} is rejected as ${code}`, () => {
    const current = program(resultVariable);
    assert.deepEqual(apply(current, started(current), result(outputs.map(([name, value]) => [name, value]))),
      { ok: false, failure: { tag: "rejected", code } });
  });
}

test("a Script Task's result after its scope was cancelled is rejected and changes nothing", () => {
  const current = program("total", [boundary("B", duration("PT1M"))]);
  const fired = apply(current, started(current), {
    kind: "timerFire", occurrence: { processInstanceId: "I", elementId: "B", activation: 1 }, logicalTimeMs: 60_000,
  });
  assert.ok(fired.ok, JSON.stringify(fired));
  const stale = apply(current, fired.value, result([["total", int(2)]]));
  assert.equal(stale.ok, false, JSON.stringify(stale));
  assert.equal(stale.ok ? null : stale.failure.tag, "rejected");
});
