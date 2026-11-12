/**
 * The items a Sub-Process declares (PC-MESSAGE-03's frame, PC-DATA-05 and PC-DATA-06 sites): each occurrence holds its
 * own, read and written there by element identity (BPMN 2.0.2 §10.4.1), never through another frame's binding of the
 * identifier, and disposed with the occurrence. An unset item is unavailable at each site by that site's rule
 * ([data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#scope-data)).
 *
 * `S → T → E`, `T` a Sub-Process declaring the Property `P`, which runs `TS → U → TE`; `U` a Sub-Process with the local
 * `P := "local"` (an `ioParameter`, a variable named like the item), which runs `US → A → B → UE`. `A` writes `P` from its
 * submitted `y`; `B` reads `P` into its Data Input `x`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, end, eventSubProcess, duration, flow, literalValue, loop, mapping, replace, scope, start, userWork,
  variable, withFlows, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const str = (value: string): Json => ({ kind: "string", value });
const association = (target: string, source: string): Json => mapping(target, variable(source), "dataAssociation");
const writesP = { outputs: [association("P", "y")] };
const readsP = { inputs: [association("x", "P")] };

function admitted(json: Json): Program {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value;
}

/** `T` declaring `P` around `U`, whose envelope is `inner`, running `A` (envelope `first`) then `B` (envelope `second`). */
const nested = (inner: Json, first: Json, second: Json, extra: Json[] = [], extraFlows: Json[] = []): Program => admitted(withFlows(
  append(replace(base(), "T", scope("T", "embedded", { items: ["P"] })),
    start("TS", null, [], "T"), scope("U", "embedded", {}, inner, "T"), end("TE", "none", "T"),
    start("US", null, [], "U"), activity("A", userWork(), first, "U"), activity("B", userWork(), second, "U"), end("UE", "none", "U"),
    ...extra),
  flow("t1", "TS", "U"), flow("t2", "U", "TE"), flow("u1", "US", "A"), flow("u2", "A", "B"), flow("u3", "B", "UE"), ...extraFlows));

const local = { inputs: [mapping("P", literalValue(str("local")))] };

const begin: Json = { kind: "start", instanceId: "I", variables: [] };
const complete = (element: string, values: [string, Json][] = [], activation = 1): Json => ({
  kind: "command", occurrence: { processInstanceId: "I", elementId: element, activation },
  action: { kind: "completeUserTask", values: values.map(([name, value]) => ({ name, value })) },
});

function run(program: Program, raws: readonly Json[]): Outcome {
  let state: State | null = null;
  let outcome: Outcome | null = null;
  for (const [index, raw] of raws.entries()) {
    const input = stimulusFromJson({ commandId: `c${index}`, ...raw });
    assert.ok(input.ok, input.ok ? "" : input.refusal);
    outcome = step(program, state, input.value[1]);
    if (!outcome.ok) return outcome;
    state = outcome.value;
  }
  assert.ok(outcome !== null);
  return outcome;
}

function committed(outcome: Outcome): State {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

/** The value each frame binds to `name`, by the element of the scope occurrence holding it (`root` for the process). */
function bindings(state: State, name: string): Record<string, unknown> {
  return Object.fromEntries(state.variables.flatMap((frame) => {
    const value = frame.entries.find(([key]) => key === name)?.[1];
    const element = state.scopes.find((entry) => entry.id === frame.scope)?.element ?? "root";
    return value === undefined ? [] : [[element, value]];
  }));
}

const open = (state: State): string[] => state.openItems.map((item) => item.element).sort();

test("a write of an item lands in its declaring occurrence, past a nearer frame binding its identifier", () => {
  const state = committed(run(nested(local, writesP, readsP), [begin, complete("A", [["y", str("written")]])]));
  assert.deepEqual(bindings(state, "P"), { T: { tag: "string", value: "written" }, U: { tag: "string", value: "local" } });
});

test("a read of an item takes its declaring occurrence's value, not a nearer frame's binding of its identifier", () => {
  const state = committed(run(nested(local, writesP, readsP), [begin, complete("A", [["y", str("written")]])]));
  assert.deepEqual(bindings(state, "x"), { B: { tag: "string", value: "written" } });
});

test("an item leaves with its declaring occurrence", () => {
  const state = committed(run(nested({}, writesP, {}), [begin, complete("A", [["y", str("written")]]), complete("B")]));
  assert.deepEqual(bindings(state, "P"), {});
});

test("an unset item holds an Activity a token began, even where a nearer frame binds its identifier", () => {
  const state = committed(run(nested(local, {}, readsP), [begin, complete("A")]));
  assert.deepEqual(open(state), []);
  assert.deepEqual(state.slots.held.length, 1);
});

test("an unset item read by a Scope's input fails the entry as mapping-source-unavailable", () => {
  const outcome = run(nested({ inputs: [association("x", "P")] }, {}, {}), [begin]);
  assert.deepEqual(outcome, { ok: false, failure: { tag: "semanticFailure", code: "mapping-source-unavailable" } });
});

test("an interrupting Event Sub-Process of the declaring Scope reads the item its occurrence held", () => {
  const handler = [
    scope("H", eventSubProcess(duration("PT1M"), true), {}, {}, "T"), start("HS", duration("PT1M"), [], "H"),
    activity("R", userWork(), readsP, "H"), end("HE", "none", "H"),
  ];
  const program = nested({}, writesP, {}, handler, [flow("h1", "HS", "R"), flow("h2", "R", "HE")]);
  const fire: Json = { kind: "timerFire", logicalTimeMs: 60_000, occurrence: { processInstanceId: "I", elementId: "HS", activation: 1 } };
  const state = committed(run(program, [begin, complete("A", [["y", str("written")]]), fire]));
  assert.deepEqual(open(state), ["R"]);
  assert.deepEqual(bindings(state, "x"), { R: { tag: "string", value: "written" } });
});

test("each Multi-Instance instance of the declaring Scope holds its own item", () => {
  const twice = loop({ count: { cardinality: { count: literalValue({ kind: "integer", value: 2 }) } }, inputDataItem: null, outputDataItem: null });
  const program = admitted(withFlows(
    append(replace(base(), "T", scope("T", "embedded", { items: ["P"] }, { multiInstance: twice })),
      start("TS", null, [], "T"), activity("A", userWork(), writesP, "T"), activity("B", userWork(), {}, "T"), end("TE", "none", "T")),
    flow("t1", "TS", "A"), flow("t2", "A", "B"), flow("t3", "B", "TE")));
  const state = committed(run(program, [begin, complete("A", [["y", str("first")]], 1), complete("A", [["y", str("second")]], 2)]));
  const held = state.variables.flatMap((frame) => frame.entries.filter(([key]) => key === "P").map(([, value]) => value));
  assert.deepEqual(held, [{ tag: "string", value: "first" }, { tag: "string", value: "second" }]);
  assert.deepEqual(open(state), ["B", "B"]);
});
