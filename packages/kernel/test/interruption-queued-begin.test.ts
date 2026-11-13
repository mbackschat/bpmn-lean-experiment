/**
 * Work an earlier firing or a scope occurrence's entry started, and that a later interruption of the same closure would
 * remove before it reaches its first wait. Signals run first in, first out, and an interruption removes in two steps:
 * its firing withdraws the open items at once, its queued cancellation or interrupting begin removes the occurrences
 * later, so a begin, an arming or a token enqueued between the two never runs. CIB runs each variable event's handler to
 * its wait before the next event's interruption cancels it, so the earlier handler's no-wait work, a Signal it throws
 * included, happens there (CIB-LIM-0055). The kernel does not run it, and committing without it would lose that work,
 * so the input is `unsupported` (`interrupted-before-wait`): where the walk orders two firings of one micro-step's
 * writes (`Conditions.overtakes`), and where a queued signal finds what it names removed (`Step.stale`).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, boundary, catchEvent, duration, end, eventSubProcess, flow, gateway, juel, qName, replace, scope, signal, start, text,
  userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const options = { evaluator: "juel", conditionalRetrigger: "eachWrite", abnormalScopeEnd: "completesNormally", submission: "installsVariables" };

/** `${name}`, offered only writes of `name` unless `filtered` is false. */
const holds = (name: string, filtered = true): Json => ({
  condition: { payload: { condition: juel({ identifier: { name } }), variableName: filtered ? name : null, variableEvents: [] } },
});

function admitted(json: Json, over: Json = {}): Program {
  const decoded = decodeProgram(wired(withOptions({ ...json, variables: ["a", "b"] }, { ...options, ...over })));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

function run(program: Program, raws: readonly Json[]): Outcome {
  let state: State | null = null;
  let outcome: Outcome | null = null;
  for (const raw of raws) {
    const input = stimulusFromJson(raw);
    assert.ok(input.ok, input.ok ? "" : input.refusal);
    outcome = step(program, state, input.value[1]);
    if (!outcome.ok) return outcome;
    state = outcome.value;
  }
  assert.ok(outcome !== null);
  return outcome;
}

const begin: Json = { kind: "start", commandId: "start", instanceId: "I", variables: [] };
/** `names`, in order, written true on `element`. */
const write = (element: string, names: readonly string[], over: Json = {}): Json => ({
  kind: "command", commandId: "write", occurrence: { processInstanceId: "I", elementId: element, activation: 1 },
  action: { kind: "setVariables", values: names.map((name) => ({ name, value: { kind: "boolean", value: true } })) }, ...over,
});
const writeAThenB = (element: string): Json => write(element, ["a", "b"]);
const ranked = (...elements: string[]): Json => ({ conditionChoices: elements.map((elementId) => ({ elementId })) });
const interrupted = { ok: false, failure: { tag: "unsupported", code: "interrupted-before-wait" } };
const open = (outcome: Outcome): string[] => {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value.openItems.map((item) => item.element).sort();
};

/** `S -> T -> E` with the non-interrupting Event Sub-Process `HN` (`${a}`) and the interrupting `HI` (`${b}`). */
const handlers = admitted(withFlows(append(replace(base(), "T", activity("T", userWork())),
  scope("HN", eventSubProcess(holds("a"), false)), start("SN", holds("a"), [], "HN"), activity("WN", userWork(), {}, "HN"), end("EN", "none", "HN"),
  scope("HI", eventSubProcess(holds("b"), true)), start("SI", holds("b"), [], "HI"), activity("WI", userWork(), {}, "HI"), end("EI", "none", "HI")),
  flow("n1", "SN", "WN"), flow("n2", "WN", "EN"), flow("i1", "SI", "WI"), flow("i2", "WI", "EI")));

test("an interrupting Event Sub-Process that removes the region a handler an earlier write started is beginning in refuses the input", () => {
  assert.deepEqual(run(handlers, [begin, writeAThenB("T")]), interrupted);
});

/** `S -> P`, a fork to the User Task `W` and to the Sub-Process `R` with the interrupting boundary `BO` (`${b}`), inside
 * which the non-interrupting Event Sub-Process `HN` (`${a}`) waits beside the User Task `T2`. */
const region = admitted(withFlows(append(replace(base(), "T", gateway("P", "parallel", { outgoing: ["p1", "p2"] })),
  activity("W", userWork()), end("EW"),
  scope("R", "embedded", {}, { boundaries: [boundary("BO", holds("b"), { outgoing: ["bo"] })] }), end("ER"), activity("HO", userWork()), end("EHO"),
  start("RS", null, [], "R"), activity("T2", userWork(), {}, "R"), end("RE", "none", "R"),
  scope("HN", eventSubProcess(holds("a"), false), {}, {}, "R"), start("SN", holds("a"), [], "HN"), activity("WN", userWork(), {}, "HN"),
  end("EN", "none", "HN")),
  flow("p0", "S", "P"), flow("pe", "P", "E"), flow("p1", "P", "W"), flow("p2", "P", "R"), flow("w1", "W", "EW"), flow("r1", "R", "ER"),
  flow("bo", "BO", "HO"), flow("ho", "HO", "EHO"), flow("rs", "RS", "T2"), flow("t2", "T2", "RE"), flow("n1", "SN", "WN"), flow("n2", "WN", "EN")));

test("an interrupting boundary that removes the Sub-Process a handler an earlier write started is beginning in refuses the input", () => {
  assert.deepEqual(run(region, [begin, writeAThenB("W")]), interrupted);
});

/** The Sub-Process `P`, with no start Event, holds the Sub-Process `R`, with none either, holding the User Task `X` with
 * the non-interrupting Timer boundary `BX`; the interrupting Event Sub-Process `H` of `P` (`${a}`) is true when `P` is
 * entered. `R` and `X` begin by queued begins, so `X`'s arming is queued behind `H`'s begin, which clears `P`. */
const nestedImplicit = admitted(withFlows(append(replace(base(), "T", scope("P", "embedded", {}, {})),
  scope("R", "embedded", {}, {}, "P"),
  activity("X", userWork(), { boundaries: [boundary("BX", duration("PT1H"), { outgoing: ["bx"], interrupting: false })] }, "R"),
  activity("HX", userWork(), {}, "R"),
  scope("H", eventSubProcess(holds("a"), true), {}, {}, "P"), start("SH", holds("a"), [], "H"), activity("WH", userWork(), {}, "H"),
  end("EH", "none", "H")),
  flow("s1", "S", "P"), flow("p1", "P", "E"), flow("bx", "BX", "HX"), flow("h1", "SH", "WH"), flow("h2", "WH", "EH")));

test("an interrupting Event Sub-Process that removes the Activity whose boundaries a queued begin was still to arm refuses the input", () => {
  assert.deepEqual(run(nestedImplicit, [{ ...begin, variables: [{ name: "a", value: { kind: "boolean", value: true } }] }]), interrupted);
});

/** `S -> P`, a fork to the User Task `W`, the Signal catch `C` and the Sub-Process `R` with the interrupting boundary
 * `BO`, inside which the non-interrupting Event Sub-Process `HN` starts at `SN` and throws the Signal `S` that `C`
 * catches. `SN` holds `${a}` and `BO` holds `${b}`, each offered only writes of its variable, unless `oneVariable`
 * makes both hold `${a}` for every write. The fork runs under CIB's schedule (CIB-OP-0016): `HN` may start as `R` is
 * entered and throw before or after the fork's third branch opens `C`, which the standards schedule refuses
 * (`flow.concurrentInterference`, #81). */
const throwerModel = (oneVariable: boolean): Json => {
  const throwSignal: Json = {
    signal: {
      payload: { signalRef: qName("Sig"), name: text("S"), payload: [], propagateAll: null, localOnly: false, businessKey: null, asynchronous: false },
    },
  };
  const stop = oneVariable ? holds("a", false) : holds("b");
  const alert = oneVariable ? holds("a", false) : holds("a");
  return withFlows(append(replace(base(), "T", gateway("P", "parallel", { outgoing: ["p1", "p2", "p3"] })),
    activity("W", userWork()), end("EW"), catchEvent("C", signal()), activity("WC", userWork()), end("EC"),
    scope("R", "embedded", {}, { boundaries: [boundary("BO", stop, { outgoing: ["bo"] })] }), end("ER"), activity("HO", userWork()), end("EHO"),
    start("RS", null, [], "R"), activity("T2", userWork(), {}, "R"), end("RE", "none", "R"),
    scope("HN", eventSubProcess(alert, false), {}, {}, "R"), start("SN", alert, [], "HN"), end("EN", throwSignal, "HN")),
    flow("p0", "S", "P"), flow("pe", "P", "E"), flow("p1", "P", "W"), flow("p2", "P", "R"), flow("p3", "P", "C"), flow("c1", "C", "WC"),
    flow("c2", "WC", "EC"), flow("w1", "W", "EW"), flow("r1", "R", "ER"), flow("bo", "BO", "HO"), flow("ho", "HO", "EHO"),
    flow("rs", "RS", "T2"), flow("t2", "T2", "RE"), flow("n1", "SN", "EN"));
};
const thrower = (oneVariable: boolean): Program => admitted(throwerModel(oneVariable), { branchSchedule: "declarationDepthFirst" });

test("the standards schedule refuses the fork whose Event Sub-Process may throw before or after a sibling opens the catch", () => {
  const decoded = decodeProgram(wired(withOptions({ ...throwerModel(false), variables: ["a", "b"] }, options)));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), "flow.concurrentInterference");
});

test("an interruption never commits without the Signal an earlier-ordered handler throws before its first wait", () => {
  const caught = run(thrower(false), [begin, write("W", ["a"])]);
  assert.deepEqual(open(caught), ["BO", "SN", "T2", "W", "WC"], "the handler alone throws, and the catch takes it");
  assert.ok(caught.ok && caught.value.outbox.length === 1, "the throw is published");
  assert.deepEqual(run(thrower(false), [begin, write("W", ["a", "b"])]), interrupted, "the write order");
  assert.deepEqual(run(thrower(true), [begin, write("W", ["a"], ranked("SN", "BO"))]), interrupted, "the ranking");
  assert.deepEqual(open(run(thrower(true), [begin, write("W", ["a"], ranked("BO"))])), ["C", "HO", "W"], "the interruption first");
});
