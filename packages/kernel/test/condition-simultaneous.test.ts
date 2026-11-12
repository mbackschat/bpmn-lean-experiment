/**
 * Conditional items of which only one may fire, true together at one evaluation (PC-CONDITION-03, PC-CONDITION-04):
 * two arms of one Event-Based Gateway, two interrupting boundaries of one host, two interrupting Event Sub-Process starts
 * of one scope. BPMN gives simultaneous triggers no order (§13.4.4) and CIB picks by `HashSet` order, so the kernel
 * refuses the input as `unsupported` rather than letting arming order choose
 * ([flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md)). One true item, or items no other disarms,
 * commit.
 *
 * `amount >= 1000` and `amount >= 500` are the two predicates; `amount` is unset at the start unless a case gives it.
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

function admitted(json: Json): Program {
  const decoded = decodeProgram(wired(withOptions({ ...json, variables: ["amount"] }, options)));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

const amount = (value: number): Json[] => [{ name: "amount", value: { kind: "integer", value } }];

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

const begin = (variables: Json[] = []): Json => ({ kind: "start", commandId: "start", instanceId: "I", variables });
const complete = (element: string, variables: Json[]): Json => ({
  kind: "command", commandId: `complete-${element}`, occurrence: { processInstanceId: "I", elementId: element, activation: 1 },
  action: { kind: "completeUserTask", values: variables },
});
const refused = (code: string) => ({ ok: false, failure: { tag: "unsupported", code } });
const open = (outcome: Outcome): string[] => {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value.openItems.map((item) => item.element).sort();
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

test("one true gateway arm wins and disarms the other", () => {
  assert.deepEqual(open(run(arms, [begin(amount(700))])), ["W"]);
  assert.deepEqual(open(run(arms, [begin(), complete("W", amount(700))])), []);
});

/** The User Task `T` with the Conditional boundaries `B1` (`>= 1000`) and `B2` (`>= 500`). */
const hosted = (secondInterrupts: boolean): Program => admitted(withFlows(
  append(replace(base(), "T", activity("T", userWork(), {
    boundaries: [boundary("B1", atLeast(1000), { outgoing: ["b1"] }), boundary("B2", atLeast(500), { outgoing: ["b2"], interrupting: secondInterrupts })],
  })), end("EB1"), end("EB2")),
  flow("b1", "B1", "EB1"), flow("b2", "B2", "EB2")));

test("two interrupting boundaries true at host entry refuse the input", () => {
  assert.deepEqual(run(hosted(true), [begin(amount(2000))]), refused("conditions-simultaneous"));
});

test("an interrupting and a non-interrupting boundary true together do not compete", () => {
  const outcome = run(hosted(false), [begin(amount(2000))]);
  assert.ok(outcome.ok, JSON.stringify(outcome));
});

/** `S -> T -> E`, `T` a User Task, with two interrupting Conditional Event Sub-Processes `H1` (`>= 1000`) and `H2`
 * (`>= 500`). */
const handlers = admitted(withFlows(
  append(replace(base(), "T", activity("T", userWork())),
    scope("H1", eventSubProcess(atLeast(1000), true)), start("HS1", atLeast(1000), [], "H1"), end("HE1", "none", "H1"),
    scope("H2", eventSubProcess(atLeast(500), true)), start("HS2", atLeast(500), [], "H2"), end("HE2", "none", "H2")),
  flow("h1", "HS1", "HE1"), flow("h2", "HS2", "HE2")));

test("two interrupting Event Sub-Process starts made true by one write refuse the input", () => {
  assert.deepEqual(run(handlers, [begin(), complete("T", amount(2000))]), refused("conditions-simultaneous"));
  const one = run(handlers, [begin(), complete("T", amount(700))]);
  assert.ok(one.ok, JSON.stringify(one));
});
