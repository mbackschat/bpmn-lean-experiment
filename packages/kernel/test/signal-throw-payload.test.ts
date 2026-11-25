/**
 * A Signal throw's payload under `SignalPayload.variables` (CIB-EXT-0040): `variables="all"` copies, per name, the
 * binding nearest the throw, as CIB's `getVariables` collects a scope's own variables before its parent's and adds a
 * parent's only for a name not yet collected (`AbstractVariableScope.java:110-125`); the `camunda:in` copies apply in
 * document order around it, a later target replacing an earlier (`CallableElement.java:127-135`).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, end, flow, literalValue, mapping, qName, replace, scope, signal, start, subscription, text, throwing,
  userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const str = (value: string): Json => ({ kind: "string", value });

/**
 * `S → R → E` with the process variable `x`, where the Sub-Process `R` declares the local input `x` and runs
 * `RS → M → W → RE`; `M` throws `Sig` with `payload` and `variables="all"` at `position`, and the non-interrupting
 * Event Sub-Process `H` at the process level catches it, so its start installs the payload at the root.
 */
function shadowing(payload: Json[], position: number): Program {
  const thrown: Json = {
    signal: {
      payload: { signalRef: qName("Sig"), name: text("S"), payload, propagateAll: position, localOnly: false, businessKey: null, asynchronous: false },
    },
  };
  const shaped = append(replace(base(), "T", scope("R", "embedded", {}, { inputs: [mapping("x", literalValue(str("inner")))] })),
    start("RS", null, [], "R"), throwing("M", thrown, "R"), activity("W", userWork(), {}, "R"), end("RE", "none", "R"),
    scope("H", { eventSubProcess: { start: subscription(signal()), interrupting: false } }), start("HS", signal(), [], "H"), end("HE", "none", "H"));
  const json = withFlows({ ...shaped, flows: [flow("f1", "S", "R"), flow("f2", "R", "E")] },
    flow("r1", "RS", "M"), flow("r2", "M", "W"), flow("r3", "W", "RE"), flow("h1", "HS", "HE"));
  const decoded = decodeProgram(wired(withOptions(json, { signalPayload: "variables", evaluator: "juel", undeclaredWrite: "atInstanceRoot" })));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

/** The root's bindings of `names` once the instance started with `x = "outer"` has thrown. */
function delivered(program: Program, names: readonly string[]): Record<string, unknown> {
  const input = stimulusFromJson({ commandId: "c0", kind: "start", instanceId: "I", variables: [{ name: "x", value: str("outer") }] });
  assert.ok(input.ok, input.ok ? "" : input.refusal);
  const outcome = step(program, null, input.value[1]);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  const state: State = outcome.value;
  const root = state.variables.find(([scopeId]) => scopeId === "")?.[1] ?? [];
  return Object.fromEntries(root.filter(([name]) => names.includes(name)));
}

test("variables=\"all\" carries a shadowed name's innermost value", () => {
  assert.deepEqual(delivered(shadowing([], 0), ["x"]), { x: { tag: "string", value: "inner" } });
});

test("a camunda:in before variables=\"all\" yields to the innermost value and one after replaces it", () => {
  const program = shadowing([mapping("x", literalValue(str("before"))), mapping("y", literalValue(str("after")))], 1);
  assert.deepEqual(delivered(program, ["x", "y"]), { x: { tag: "string", value: "inner" }, y: { tag: "string", value: "after" } });
  const replaced = shadowing([mapping("x", literalValue(str("after")))], 0);
  assert.deepEqual(delivered(replaced, ["x"]), { x: { tag: "string", value: "after" } });
});
