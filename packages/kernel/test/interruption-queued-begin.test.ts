/**
 * What entering a scope occurrence queued for it, its start Event's begin and the arming of its Event Sub-Processes, goes
 * with the scope occurrence when a later signal of the same closure removes it. Signals run first in, first out: a
 * non-interrupting Event Sub-Process fired by an earlier write begins and queues that work, and an interrupting firing
 * by a later write then clears the region holding it. CIB runs the first
 * handler to its wait before the interruption cancels it and commits; the kernel committed nothing, failing the input
 * with `begin-into-missing-scope`. The writes are one command's, offered in write order, so no two items compete.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, boundary, end, eventSubProcess, flow, gateway, juel, replace, scope, start, userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const options = { evaluator: "juel", conditionalRetrigger: "eachWrite", abnormalScopeEnd: "completesNormally", submission: "installsVariables" };

/** `${name}`, offered only writes of `name`. */
const holds = (name: string): Json => ({ condition: { payload: { condition: juel({ identifier: { name } }), variableName: name, variableEvents: [] } } });

function admitted(json: Json): Program {
  const decoded = decodeProgram(wired(withOptions({ ...json, variables: ["a", "b"] }, options)));
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
/** `a`, then `b`, written true on `element`. */
const writeAThenB = (element: string): Json => ({
  kind: "command", commandId: "write", occurrence: { processInstanceId: "I", elementId: element, activation: 1 },
  action: { kind: "setVariables", values: ["a", "b"].map((name) => ({ name, value: { kind: "boolean", value: true } })) },
});
const open = (outcome: Outcome): string[] => {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value.openItems.map((item) => item.element).sort();
};

/** `S -> T -> E` with the non-interrupting Event Sub-Process `HN` (`${a}`) and the interrupting `HI` (`${b}`). */
const handlers = admitted(withFlows(append(replace(base(), "T", activity("T", userWork())),
  scope("HN", eventSubProcess(holds("a"), false)), start("SN", holds("a"), [], "HN"), activity("WN", userWork(), {}, "HN"), end("EN", "none", "HN"),
  scope("HI", eventSubProcess(holds("b"), true)), start("SI", holds("b"), [], "HI"), activity("WI", userWork(), {}, "HI"), end("EI", "none", "HI")),
  flow("n1", "SN", "WN"), flow("n2", "WN", "EN"), flow("i1", "SI", "WI"), flow("i2", "WI", "EI")));

test("an interrupting Event Sub-Process removes the region a handler an earlier write started is still beginning in", () => {
  assert.deepEqual(open(run(handlers, [begin, writeAThenB("T")])), ["WI"]);
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

test("an interrupting boundary removes the Sub-Process a handler an earlier write started is still beginning in", () => {
  assert.deepEqual(open(run(region, [begin, writeAThenB("W")])), ["HO", "W"]);
});
