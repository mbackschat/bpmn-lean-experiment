/**
 * Conditional items true together at one evaluation where firing one withdraws another (PC-CONDITION-03,
 * PC-CONDITION-04): two arms of one Event-Based Gateway, interrupting and non-interrupting boundaries of one host, Event
 * Sub-Process starts of one scope, and nested cancellation regions. BPMN gives simultaneous triggers no order (§13.4.4)
 * and CIB takes one no profile selects (CIB-LIM-0053), so the input's ranking `conditionChoices` decides each contest
 * ([subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#conditions)); a contest it
 * leaves undecided refuses the input as `unsupported`, and one true item, or items none withdraws, commit unranked.
 *
 * `amount >= 1000` and `amount >= 500` are the two predicates; `amount` is unset at the start unless a case gives it.
 * The oracle is the occurrences the last input began (its journal), since a later cancellation can hide a firing.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, boundary, catchEvent, end, eventSubProcess, flow, gateway, juel, replace, scope, start, userWork, withFlows,
  withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const options = { evaluator: "juel", conditionalRetrigger: "eachWrite", abnormalScopeEnd: "completesNormally", submission: "installsVariables" };

const atLeast = (threshold: number): Json => ({
  condition: {
    payload: {
      condition: juel({ identifier: { name: "amount" } }, { integer: { digits: String(threshold) } },
        { binary: { payload: { op: "ge", left: 0, right: 1 } } }),
      variableName: null, variableEvents: [],
    },
  },
});

/** `${name}`, offered only writes of `filter` when it names one. */
const holds = (name: string, filter: string | null = null): Json => ({
  condition: { payload: { condition: juel({ identifier: { name } }), variableName: filter, variableEvents: [] } },
});

function admitted(json: Json, variables: readonly string[] = ["amount"]): Program {
  const decoded = decodeProgram(wired(withOptions({ ...json, variables }, options)));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

const amount = (value: number): Json[] => [{ name: "amount", value: { kind: "integer", value } }];
const flag = (name: string): Json => ({ name, value: { kind: "boolean", value: true } });
const ranked = (...elements: string[]): Json => ({ conditionChoices: elements.map((elementId) => ({ elementId })) });

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

const begin = (variables: Json[] = [], over: Json = {}): Json => ({ kind: "start", commandId: "start", instanceId: "I", variables, ...over });
const complete = (element: string, variables: Json[], over: Json = {}): Json => ({
  kind: "command", commandId: `complete-${element}`, occurrence: { processInstanceId: "I", elementId: element, activation: 1 },
  action: { kind: "completeUserTask", values: variables }, ...over,
});
const write = (element: string, values: Json[], over: Json = {}): Json => ({
  kind: "command", commandId: `write-${element}`, occurrence: { processInstanceId: "I", elementId: element, activation: 1 },
  action: { kind: "setVariables", values }, ...over,
});
const refused = (code: string) => ({ ok: false, failure: { tag: "unsupported", code } });
const rejected = (code: string) => ({ ok: false, failure: { tag: "rejected", code } });
const open = (outcome: Outcome): string[] => {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value.openItems.map((item) => item.element).sort();
};
/** The elements the last input began, in order, among `among`. */
const begun = (outcome: Outcome, among: readonly string[]): string[] => {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value.journal.flatMap((transition) => transition.started.map((fact) => fact.occurrence.element))
    .filter((element) => among.includes(element));
};

/** `S -> P`, a Parallel fork to the Event-Based Gateway `G` with arms `C1` (`>= 1000`) and `C2` (`>= 500`), and to the
 * User Task `W`, which writes `amount`. */
const arms = admitted(withFlows(
  append(replace(base(), "T", gateway("P", "parallel", { outgoing: ["p1", "p2"] })),
    gateway("G", { eventBased: { instantiation: "none" } }), catchEvent("C1", atLeast(1000)), catchEvent("C2", atLeast(500)),
    end("E1"), end("E2"), activity("W", userWork()), end("EW")),
  flow("p0", "S", "P"), flow("pe", "P", "E"), flow("p1", "P", "G"), flow("p2", "P", "W"), flow("g1", "G", "C1"), flow("g2", "G", "C2"), flow("c1", "C1", "E1"),
  flow("c2", "C2", "E2"), flow("w1", "W", "EW")));

test("two gateway arms true when the gateway arms them refuse the input", () => {
  assert.deepEqual(run(arms, [begin(amount(2000))]), refused("gateway-arms-simultaneous"));
});

test("two gateway arms made true by one write refuse the input", () => {
  assert.deepEqual(run(arms, [begin(), complete("W", amount(2000))]), refused("gateway-arms-simultaneous"));
});

test("one true gateway arm wins and disarms the other, and a ranking that meets no contest changes nothing", () => {
  assert.deepEqual(open(run(arms, [begin(amount(700))])), ["W"]);
  assert.deepEqual(open(run(arms, [begin(), complete("W", amount(700))])), []);
  assert.deepEqual(begun(run(arms, [begin(amount(700), ranked("C1"))]), ["C1", "C2"]), ["C2"]);
});

test("the ranking names the arm that wins when the gateway arms them, the other withdrawn", () => {
  assert.deepEqual(begun(run(arms, [begin(amount(2000), ranked("C2"))]), ["C1", "C2"]), ["C2"]);
  assert.deepEqual(begun(run(arms, [begin(amount(2000), ranked("C1", "C2"))]), ["C1", "C2"]), ["C1"]);
  assert.deepEqual(open(run(arms, [begin(amount(2000), ranked("C1"))])), ["W"]);
});

test("the ranking names the arm that wins when one write makes both true", () => {
  assert.deepEqual(begun(run(arms, [begin(), complete("W", amount(2000), ranked("C2"))]), ["C1", "C2"]), ["C2"]);
});

test("a ranking that repeats an element or names no Conditional item is rejected before the transition", () => {
  assert.deepEqual(run(arms, [begin(amount(2000), ranked("C2", "C2"))]), rejected("condition-choice-duplicate"));
  assert.deepEqual(run(arms, [begin(amount(2000), ranked("W"))]), rejected("condition-choice-not-candidate"));
  assert.deepEqual(run(arms, [begin(amount(2000), ranked("Nowhere"))]), rejected("condition-choice-not-candidate"));
  assert.deepEqual(run(arms, [begin(), complete("W", amount(2000), ranked("C1", "C1"))]), rejected("condition-choice-duplicate"));
  assert.deepEqual(run(arms, [begin([], { at: 50 }), complete("W", amount(2000), { ...ranked("C1", "C1"), at: 10 })]),
    rejected("logical-time-backward"), "the clock is checked first");
});

/** As `arms`, with a second Sequence Flow from `G` to `C1`: two arms of one element, which no ranking separates. */
const twinArms = admitted(withFlows(
  append(replace(base(), "T", gateway("P", "parallel", { outgoing: ["p1", "p2"] })),
    gateway("G", { eventBased: { instantiation: "none" } }), catchEvent("C1", atLeast(1000)), end("E1"), activity("W", userWork()), end("EW")),
  flow("p0", "S", "P"), flow("pe", "P", "E"), flow("p1", "P", "G"), flow("p2", "P", "W"), flow("g1", "G", "C1"), flow("g2", "G", "C1"),
  flow("c1", "C1", "E1"), flow("w1", "W", "EW")));

test("two arms of one element true together refuse the input under every ranking", () => {
  assert.deepEqual(run(twinArms, [begin(amount(2000))]), refused("gateway-arms-simultaneous"));
  assert.deepEqual(run(twinArms, [begin(amount(2000), ranked("C1"))]), refused("gateway-arms-simultaneous"));
});

/** The User Task `T` with the Conditional boundaries `B1` (`>= 1000`, interrupting) and `B2` (`>= 500`). */
const hosted = (secondInterrupts: boolean): Program => admitted(withFlows(
  append(replace(base(), "T", activity("T", userWork(), {
    boundaries: [boundary("B1", atLeast(1000), { outgoing: ["b1"] }), boundary("B2", atLeast(500), { outgoing: ["b2"], interrupting: secondInterrupts })],
  })), end("EB1"), end("EB2")),
  flow("b1", "B1", "EB1"), flow("b2", "B2", "EB2")));

test("two interrupting boundaries true at host entry refuse the input unranked and fire the ranked one", () => {
  assert.deepEqual(run(hosted(true), [begin(amount(2000))]), refused("conditions-simultaneous"));
  assert.deepEqual(begun(run(hosted(true), [begin(amount(2000), ranked("B2"))]), ["B1", "B2"]), ["B2"]);
});

test("an interrupting and a non-interrupting boundary true together fire in the ranked order, and unranked refuse the input", () => {
  assert.deepEqual(run(hosted(false), [begin(amount(2000))]), refused("conditions-simultaneous"));
  assert.deepEqual(begun(run(hosted(false), [begin(amount(2000), ranked("B2", "B1"))]), ["B1", "B2"]), ["B2", "B1"]);
  assert.deepEqual(begun(run(hosted(false), [begin(amount(2000), ranked("B1", "B2"))]), ["B1", "B2"]), ["B1"]);
  assert.deepEqual(run(hosted(false), [begin(amount(2000), ranked("B2"))]), refused("conditions-simultaneous"),
    "the interrupting boundary the ranking leaves unlisted neither fires nor loses by default");
  assert.deepEqual(begun(run(hosted(false), [begin(amount(700))]), ["B1", "B2"]), ["B2"], "one true item needs no ranking");
});

/** `S -> T -> E`, `T` a User Task, with the Conditional Event Sub-Processes `H1` (`>= 1000`, interrupting) and `H2`
 * (`>= 500`). */
const handlers = (secondInterrupts: boolean): Program => admitted(withFlows(
  append(replace(base(), "T", activity("T", userWork())),
    scope("H1", eventSubProcess(atLeast(1000), true)), start("HS1", atLeast(1000), [], "H1"), end("HE1", "none", "H1"),
    scope("H2", eventSubProcess(atLeast(500), secondInterrupts)), start("HS2", atLeast(500), [], "H2"), end("HE2", "none", "H2")),
  flow("h1", "HS1", "HE1"), flow("h2", "HS2", "HE2")));

test("two interrupting Event Sub-Process starts made true by one write refuse the input unranked and fire the ranked one", () => {
  assert.deepEqual(run(handlers(true), [begin(), complete("T", amount(2000))]), refused("conditions-simultaneous"));
  const one = run(handlers(true), [begin(), complete("T", amount(700))]);
  assert.ok(one.ok, JSON.stringify(one));
  assert.deepEqual(begun(run(handlers(true), [begin(), complete("T", amount(2000), ranked("HS2"))]), ["H1", "H2"]), ["H2"]);
});

test("an interrupting and a non-interrupting Event Sub-Process start fire in the ranked order", () => {
  assert.deepEqual(run(handlers(false), [begin(), complete("T", amount(2000))]), refused("conditions-simultaneous"));
  assert.deepEqual(begun(run(handlers(false), [begin(), complete("T", amount(2000), ranked("HS2", "HS1"))]), ["H1", "H2"]), ["H2", "H1"]);
  assert.deepEqual(begun(run(handlers(false), [begin(), complete("T", amount(2000), ranked("HS1", "HS2"))]), ["H1", "H2"]), ["H1"]);
});

/** `S -> P`, a Parallel fork to the User Task `W` and to the Sub-Process `R` with the interrupting boundary `BO`
 * (`>= 500`), inside which the User Task `T2` carries the boundary `BI` (`>= 1000`, interrupting unless stated). */
const nested = (innerInterrupts: boolean): Program => admitted(withFlows(
  append(replace(base(), "T", gateway("P", "parallel", { outgoing: ["p1", "p2"] })),
    activity("W", userWork()), end("EW"),
    scope("R", "embedded", {}, { boundaries: [boundary("BO", atLeast(500), { outgoing: ["bo"] })] }), end("ER"), activity("HO", userWork()), end("EHO"),
    start("RS", null, [], "R"), activity("T2", userWork(), { boundaries: [boundary("BI", atLeast(1000), { outgoing: ["bi"], interrupting: innerInterrupts })] }, "R"),
    end("RE", "none", "R"), activity("HI", userWork(), {}, "R"), end("EHI", "none", "R")),
  flow("p0", "S", "P"), flow("pe", "P", "E"), flow("p1", "P", "W"), flow("p2", "P", "R"), flow("w1", "W", "EW"), flow("r1", "R", "ER"),
  flow("bo", "BO", "HO"), flow("ho", "HO", "EHO"), flow("rs", "RS", "T2"), flow("t2", "T2", "RE"), flow("bi", "BI", "HI"), flow("hi", "HI", "EHI")));

test("an outer boundary and an inner one inside its host true at one write fire in the ranked order", () => {
  for (const inner of [true, false]) {
    assert.deepEqual(run(nested(inner), [begin(), complete("W", amount(2000))]), refused("conditions-simultaneous"), "unranked");
    assert.deepEqual(begun(run(nested(inner), [begin(), complete("W", amount(2000), ranked("BO"))]), ["BO", "BI"]), ["BO"]);
    assert.deepEqual(begun(run(nested(inner), [begin(), complete("W", amount(2000), ranked("BI", "BO"))]), ["BO", "BI"]), ["BI", "BO"]);
    assert.deepEqual(run(nested(inner), [begin(), complete("W", amount(2000), ranked("BI"))]), refused("conditions-simultaneous"));
  }
  assert.deepEqual(begun(run(nested(true), [begin(), complete("W", amount(700))]), ["BO", "BI"]), ["BO"], "only the outer is true");
});

/** The User Task `T` with the interrupting boundaries `B1` (`${a}`, every write) and `B2` (`${b}`, writes of `b` only). */
const filtered = admitted(withFlows(
  append(replace(base(), "T", activity("T", userWork(), {
    boundaries: [boundary("B1", holds("a"), { outgoing: ["b1"] }), boundary("B2", holds("b", "b"), { outgoing: ["b2"] })],
  })), activity("H1", userWork()), end("EH1"), activity("H2", userWork()), end("EH2")),
  flow("b1", "B1", "H1"), flow("h1", "H1", "EH1"), flow("b2", "B2", "H2"), flow("h2", "H2", "EH2")), ["a", "b"]);

test("an interrupting firing an earlier write of the input enqueued decides a later write's contest", () => {
  assert.deepEqual(begun(run(filtered, [begin(), write("T", [flag("a"), flag("b")])]), ["H1", "H2"]), ["H1"]);
});
