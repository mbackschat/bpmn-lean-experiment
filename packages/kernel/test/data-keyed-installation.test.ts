/**
 * A new variable set holds one value per name (#147): a Data Association's copy replaces its target's value (BPMN 2.0.2
 * §10.4.2) and CIB keys a scope's variables by name, so where an installer's sources bind a name twice the last binding
 * stands. The kernel's codecs accept a binding list that repeats a name, which the scenario contract and the CIB runner
 * refuse (`scripts/scenario-binding-order.ts`, `ScenarioVariableBindings.requireCanonical`), so these inputs have no
 * scenario form; the two installers are `State.initial` (a start's variables) and `State.enterScope` (here an Event
 * Sub-Process start's delivered Message variables).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, end, eventSubProcess, flow, message, replace, scope, start, text, userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

function admitted(json: Json): Program {
  const decoded = decodeProgram(wired(withOptions(json, { deliveryVariables: "installs" })));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

function run(program: Program, raws: readonly Json[]): State {
  let state: State | null = null;
  for (const raw of raws) {
    const input = stimulusFromJson(raw);
    assert.ok(input.ok, input.ok ? "" : input.refusal);
    const outcome: Outcome = step(program, state, input.value[1]);
    assert.ok(outcome.ok, JSON.stringify(outcome));
    state = outcome.value;
  }
  assert.ok(state !== null);
  return state;
}

const twice = (name: string): Json[] =>
  [{ name, value: { kind: "string", value: "first" } }, { name, value: { kind: "string", value: "second" } }];
const begin = (variables: Json[] = []): Json => ({ kind: "start", commandId: "start", instanceId: "I", variables });
/** The bindings of the variable set of the scope occurrence `scope`. */
const frame = (state: State, scope: number): unknown => state.variables.find((vars) => vars.scope === scope)?.entries;

const reply = message({ messageRef: "M", name: text("M") });
/** `S -> T -> E`, `T` a User Task, beside the non-interrupting Message Event Sub-Process `H`, whose start `HS` leads to
 * the User Task `HT`. */
const program = admitted(withFlows(append(replace(base(), "T", activity("T", userWork())),
  scope("H", eventSubProcess(reply, false)), start("HS", reply, [], "H"), activity("HT", userWork(), {}, "H"), end("HE", "none", "H")),
  flow("h1", "HS", "HT"), flow("h2", "HT", "HE")));

test("a start that binds a name twice installs the last binding at the root", () => {
  assert.deepEqual(frame(run(program, [begin(twice("outcome"))]), 0), [["outcome", { tag: "string", value: "second" }]]);
});

test("an Event Sub-Process start whose delivered variables bind a name twice installs the last binding in its frame", () => {
  const state = run(program, [begin(), {
    kind: "deliver", commandId: "deliver", occurrence: { processInstanceId: "I", elementId: "HS", activation: 1 },
    trigger: { kind: "message", channel: { kind: "directMessage", messageId: "M" } }, variables: twice("outcome"),
  }]);
  const handler = state.scopes.find((entry) => entry.element === "H");
  assert.ok(handler !== undefined, "the Event Sub-Process has begun");
  assert.deepEqual(frame(state, handler.id), [["outcome", { tag: "string", value: "second" }]]);
});
