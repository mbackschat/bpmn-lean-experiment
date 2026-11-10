/**
 * The portable value domain at ingress (PC-DATA-03; docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#values): every value an
 * input carries, at Start, at a User Task completion, in a variable update and in an effect result, is checked against
 * the domain's bounds before the input's transition, and one outside it rejects the whole input with the state
 * unchanged (`value-outside-domain`), never truncated or partly written. The bounds are project policy, not CIB limits
 * (the portable-values contract's "Finite limits"): at most four container levels counting the root container, 32
 * members per container, 256 value nodes and 16,384 canonical JSON bytes per root value, Strings and Map keys of at most
 * 1,024 UTF-8 bytes, Integers in `0..2^53-1`, canonical Decimals, and Map keys in strictly increasing order; each is
 * accepted at its limit and refused one over it. The legacy `stringList` is admitted only as a whole variable value.
 *
 * `S → T → E`, `T` a User Task, a Service Task or a Message catch Event.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, State } from "@bpmn-lean/kernel";

import { activity, base, catchEvent, mapping, message, replace, serviceWork, start, task, userWork, variable, withOptions, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const outside = { ok: false, failure: { tag: "rejected", code: "value-outside-domain" } };

const int = (value: number): Json => ({ kind: "integer", value });
const str = (value: string): Json => ({ kind: "string", value });
const list = (...items: Json[]): Json => ({ kind: "list", value: items });
const map = (...entries: [string, Json][]): Json => ({ kind: "map", value: entries.map(([name, value]) => ({ name, value })) });
const decimal = (coefficient: string, scale: number): Json => ({ kind: "decimal", coefficient, scale });

/** `depth` nested Lists around one Integer: the root container counts as one level. */
const nested = (depth: number): Json => (depth === 0 ? int(1) : list(nested(depth - 1)));

/** One Map of Lists of Integers with exactly `nodes` value nodes, the root included, no container above 32 members. */
function withNodes(nodes: number): Json {
  const leaves = nodes - 1 - 8;
  const sizes = Array.from({ length: 8 }, (_, index) => Math.floor(leaves / 8) + (index < leaves % 8 ? 1 : 0));
  return map(...sizes.map((size, index): [string, Json] => [`k${index}`, list(...Array.from({ length: size }, () => int(1)))]));
}

/** One Map of Strings whose canonical JSON (`kind` before `value`, entries `name` before `value`) takes exactly `bytes`. */
function withBytes(bytes: number): Json {
  const entries: [string, Json][] = Array.from({ length: 15 }, (_, index) => [`k${String(index).padStart(2, "0")}`, str("x".repeat(1024))]);
  const without = JSON.stringify(map(...entries, ["k15", str("")])).length;
  const value = map(...entries, ["k15", str("x".repeat(bytes - without))]);
  assert.equal(JSON.stringify(value).length, bytes);
  return value;
}

const userTask = (): Json => wired(withOptions(task(activity("T", userWork()))(base()), {
  submission: "installsVariables", undeclaredWrite: "atInstanceRoot",
}));
const serviceTask = (): Json => wired(withOptions(task(activity("T", serviceWork(), { outputs: [mapping("result", variable("r"))] }))(base()), {
  undeclaredWrite: "atInstanceRoot",
}));

const at = { processInstanceId: "I", elementId: "T", activation: 1 };
const startWith = (value: Json): Json => ({ kind: "start", instanceId: "I", variables: [{ name: "payload", value }] });
const completeWith = (...values: [string, Json][]): Json =>
  ({ kind: "command", occurrence: at, action: { kind: "completeUserTask", values: values.map(([name, value]) => ({ name, value })) } });

/** Run `stimuli` from no instance, a rejected input leaving the state as it was, and return every outcome. */
function runAll(program: Json, ...stimuli: Json[]): Outcome[] {
  const decoded = decodeProgram(program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  let state: State | null = null;
  return stimuli.map((raw) => {
    const stimulus = stimulusFromJson({ commandId: "c", ...raw });
    assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
    const outcome = step(hooks, decoded.value, state, stimulus.value[1]);
    if (outcome.ok) state = outcome.value;
    return outcome;
  });
}

/** The last outcome of `runAll`. */
const run = (program: Json, ...stimuli: Json[]): Outcome => runAll(program, ...stimuli).at(-1)!;

const committed = (outcome: Outcome): boolean => outcome.ok;

test("a Start value is accepted at each structural bound and rejected one over it, installing nothing", () => {
  for (const [name, atBound, over] of [
    ["depth", nested(4), nested(5)],
    ["nodes", withNodes(256), withNodes(257)],
    ["bytes", withBytes(16384), withBytes(16385)],
    ["members", list(...Array.from({ length: 32 }, () => int(1))), list(...Array.from({ length: 33 }, () => int(1)))],
  ] as const) {
    assert.ok(committed(run(userTask(), startWith(atBound))), `${name} at its bound`);
    assert.deepEqual(run(userTask(), startWith(over)), outside, `${name} over its bound`);
  }
});

test("a Start value outside a scalar domain is rejected at any depth", () => {
  for (const [name, accepted, rejected] of [
    ["String bytes", str("é".repeat(512)), str(`${"é".repeat(512)}x`)],
    ["Map key bytes", map(["k".repeat(1024), int(1)]), map(["k".repeat(1025), int(1)])],
    ["Integer range", int(9007199254740991), int(-1)],
    ["Decimal trailing zero", decimal("125", 1), decimal("1250", 2)],
    ["Decimal zero scale", decimal("0", 0), decimal("0", 1)],
    ["Decimal scale", decimal("1", 6), decimal("1", 7)],
    ["Decimal coefficient", decimal("-9223372036854775808", 0), decimal("9223372036854775808", 0)],
    ["Map key order", map(["a", int(1)], ["b", int(2)]), map(["b", int(2)], ["a", int(1)])],
    ["Map key uniqueness", map(["a", int(1)]), map(["a", int(1)], ["a", int(2)])],
  ] as const) {
    assert.ok(committed(run(userTask(), startWith(list(accepted)))), `${name} accepted`);
    assert.deepEqual(run(userTask(), startWith(list(rejected))), outside, `${name} rejected`);
  }
});

test("the legacy String List is admitted as a whole variable value only", () => {
  const strings: Json = { kind: "stringList", value: ["a", "b"] };
  assert.ok(committed(run(userTask(), startWith(strings))));
  assert.deepEqual(run(userTask(), startWith(list(strings))), outside);
});

test("a completion with one value over a bound is rejected whole, and the task then completes with valid values", () => {
  const valid: [string, Json] = ["accepted", map(["ok", { kind: "boolean", value: true }])];
  const [started, overflow, completed] = runAll(userTask(), startWith(map(["id", str("p-1")])),
    completeWith(valid, ["overflow", nested(5)]), completeWith(valid));
  assert.ok(committed(started!));
  assert.deepEqual(overflow, outside);
  assert.ok(completed !== undefined && completed.ok);
  assert.deepEqual(completed.value.variables.find((entry) => entry.scope === 0)?.entries.map(([name]) => name).sort(), ["accepted", "payload"]);
});

test("a variable update and an effect result outside the domain are rejected", () => {
  const setVariables = { kind: "command", occurrence: at, action: { kind: "setVariables", values: [{ name: "v", value: nested(5) }] } };
  assert.deepEqual(run(userTask(), startWith(int(1)), setVariables), outside);
  const result = { kind: "effectResult", occurrence: at, outcome: { kind: "success", outputs: [{ name: "r", value: withNodes(257) }] } };
  assert.deepEqual(run(serviceTask(), startWith(int(1)), result), outside);
  const accepted = { kind: "effectResult", occurrence: at, outcome: { kind: "success", outputs: [{ name: "r", value: withNodes(256) }] } };
  assert.ok(committed(run(serviceTask(), startWith(int(1)), accepted)));
});

test("a delivered Message payload and a Message Start's payload outside the domain are rejected before their transition", () => {
  const unspecified = { kind: "unspecifiedMessage" };
  const catching = wired(replace(base(), "T", catchEvent("T", message())));
  const deliver = (payload: Json): Json => ({ kind: "deliver", occurrence: at, trigger: { kind: "message", channel: unspecified }, payload });
  assert.deepEqual(run(catching, startWith(int(1)), deliver(nested(5))), outside);
  // An in-domain payload reaches the subscription, which accepts none here.
  assert.deepEqual(run(catching, startWith(int(1)), deliver(int(1))),
    { ok: false, failure: { tag: "rejected", code: "message-payload-not-accepted" } });
  const messageStart = wired(replace(base(), "S", start("S", message())));
  const startCarrying = (payload: Json): Json =>
    ({ kind: "start", instanceId: "I", variables: [], trigger: { kind: "message", channel: unspecified, payload } });
  assert.deepEqual(run(messageStart, startCarrying(withNodes(257))), outside);
  assert.ok(committed(run(messageStart, startCarrying(withNodes(256)))));
});
