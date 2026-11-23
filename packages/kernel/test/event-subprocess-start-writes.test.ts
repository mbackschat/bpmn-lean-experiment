/**
 * An Event Sub-Process start writes its values outward from the new occurrence, never as its locals (#150): a mapped
 * Data Output lands in the item it targets (BPMN 2.0.2 §10.4.2), a delivered variable at its nearest owner, as CIB's
 * `setVariables` on the parent's execution does (CIB-EXT-0025, CIB-EXT-0043), and the root otherwise under
 * `undeclaredWrite = atInstanceRoot`. The write runs in the Event Sub-Process's begin, after an interrupting clear and
 * the entry, before what the entry queued ([subscriptions](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md)).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, end, eventSubProcess, flow, literalValue, mapping, message, qName, replace, scope, signal, start, subscription, text,
  throwing, userWork, variable, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const str = (value: string): Json => ({ kind: "string", value });
const delivering = { deliveryVariables: "installs", undeclaredWrite: "atInstanceRoot" };

function admitted(json: Json, options: Json): Program {
  const decoded = decodeProgram(wired(withOptions(json, options)));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

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
  return Object.fromEntries(state.variables.flatMap(([scope, entries]) => {
    const value = entries.find(([key]) => key === name)?.[1];
    const element = state.scopes.find((entry) => entry.id === scope)?.element ?? "root";
    return value === undefined ? [] : [[element, value]];
  }));
}

const at = (element: string): Json => ({ processInstanceId: "I", elementId: element, activation: 1 });
const begin: Json = { kind: "start", instanceId: "I", variables: [] };
const complete = (element: string): Json => ({ kind: "command", occurrence: at(element), action: { kind: "completeUserTask", values: [] } });
const reply = message({ messageRef: "M", name: text("M") });
const deliver = (over: Json): Json =>
  ({ kind: "deliver", occurrence: at("HS"), trigger: { kind: "message", channel: { kind: "directMessage", messageId: "M" } }, ...over });
const note = [{ name: "note", value: str("delivered") }];

/** The non-interrupting Event Sub-Process `H` on `trigger` in `parent`, whose start `HS` (with `outputs`) ends at once. */
const handler = (trigger: Json, parent: string | null, outputs: Json[] = []): Json[] => [
  scope("H", { eventSubProcess: { start: subscription(trigger, outputs), interrupting: false } }, {}, {}, parent),
  start("HS", trigger, outputs, "H"), end("HE", "none", "H"),
];

/** `S → R → E`, `R` a Sub-Process with `over` and the envelope `env`, running `RS → W → RE` beside the handler `H`. */
const region = (env: Json, over: Json, outputs: Json[], options: Json): Program => admitted(withFlows(
  append(replace(base(), "T", scope("R", "embedded", over, env)), start("RS", null, [], "R"), activity("W", userWork(), {}, "R"),
    end("RE", "none", "R"), ...handler(reply, "R", outputs)),
  flow("f1", "S", "R"), flow("f2", "R", "E"), flow("r1", "RS", "W"), flow("r2", "W", "RE"), flow("h1", "HS", "HE")), options);

test("a delivered variable at a process-level start lands at the root and outlives its Event Sub-Process", () => {
  const program = admitted(withFlows(append(replace(base(), "T", activity("T", userWork())), ...handler(reply, null)),
    flow("h1", "HS", "HE")), delivering);
  const state = committed(run(program, [begin, deliver({ variables: note })]));
  assert.deepEqual(state.scopes.filter((entry) => entry.element === "H"), [], "the Event Sub-Process has completed");
  assert.deepEqual(bindings(state, "note"), { root: { tag: "string", value: "delivered" } });
});

test("a delivered variable inside a Sub-Process overwrites the Sub-Process's local of its name", () => {
  const program = region({ inputs: [mapping("note", literalValue(str("local")))] }, {}, [], delivering);
  const state = committed(run(program, [begin, deliver({ variables: note })]));
  assert.deepEqual(bindings(state, "note"), { R: { tag: "string", value: "delivered" } });
});

test("a Signal's variables at a process-level start land at the root", () => {
  // `S → T → M → E`: completing the User Task `T` reaches the Signal throw `M`, which carries `note` to `H`'s start.
  const thrown: Json = {
    signal: {
      payload: {
        signalRef: qName("Sig"), name: text("S"), payload: [mapping("note", literalValue(str("delivered")))], propagateAll: null,
        localOnly: false, businessKey: null, asynchronous: false,
      },
    },
  };
  const shaped = append(replace(base(), "T", activity("T", userWork())), throwing("M", thrown), ...handler(signal(), null));
  const program = admitted(withFlows({ ...shaped, flows: [flow("f1", "S", "T")] }, flow("t1", "T", "M"), flow("t2", "M", "E"),
    flow("h1", "HS", "HE")), { signalPayload: "variables", evaluator: "juel", undeclaredWrite: "atInstanceRoot" });
  const state = committed(run(program, [begin, complete("T")]));
  assert.deepEqual(bindings(state, "note"), { root: { tag: "string", value: "delivered" } });
});

test("a start's Data Output to a Property of its parent lands in the Property's owner", () => {
  const program = region({}, { items: ["P"] }, [mapping("P", variable("Out"), "dataAssociation")], {});
  const state = committed(run(program, [begin, deliver({ payload: str("p") })]));
  assert.deepEqual(bindings(state, "P"), { R: { tag: "string", value: "p" } });
});

test("a handler that an interrupting sibling removes before its first wait refuses the input", () => {
  // Guards `Step.gone`'s contract that a write is queued no later than its scope occurrence's removal: the start's
  // writes run in its begin, so the removal fails the arming as `stale` first.
  const thrown: Json = {
    signal: {
      payload: {
        signalRef: qName("Sig"), name: text("S"), payload: [mapping("note", literalValue(str("x")))], propagateAll: null,
        localOnly: false, businessKey: null, asynchronous: false,
      },
    },
  };
  // `S → T → M → E` beside the Signal Event Sub-Processes `HN`, non-interrupting and declared first, and `HI`.
  const shaped = append(replace(base(), "T", activity("T", userWork())), throwing("M", thrown),
    scope("HN", eventSubProcess(signal(), false)), start("SN", signal(), [], "HN"), activity("WN", userWork(), {}, "HN"), end("EN", "none", "HN"),
    scope("HI", eventSubProcess(signal(), true)), start("SI", signal(), [], "HI"), activity("WI", userWork(), {}, "HI"), end("EI", "none", "HI"));
  const program = admitted(withFlows({ ...shaped, flows: [flow("f1", "S", "T")] }, flow("t1", "T", "M"), flow("t2", "M", "E"),
    flow("n1", "SN", "WN"), flow("n2", "WN", "EN"), flow("i1", "SI", "WI"), flow("i2", "WI", "EI")), {
    signalPayload: "variables", evaluator: "juel", undeclaredWrite: "atInstanceRoot", abnormalScopeEnd: "completesNormally",
    branchSchedule: "declarationDepthFirst",
  });
  assert.deepEqual(run(program, [begin, complete("T")]), { ok: false, failure: { tag: "unsupported", code: "interrupted-before-wait" } });
});
