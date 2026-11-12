/**
 * An interrupting Message Event Sub-Process (PC-MESSAGE-06) goes through the shared interrupting path: a delivery to
 * its start cancels the ordinary work of the scope occurrence it belongs to, its handler runs in that occurrence and
 * reads the parent's data, and the handler's completion completes the occurrence once, never resuming the cancelled
 * work (BPMN 2.0.2 §13.5.4; [subscriptions](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md)).
 *
 * The Event Sub-Process `H` (start `HS`, handler User Task `HU`, which publishes the parent's `orderRef` as its input
 * `seen`) is declared at the process level, `S → T → E`, or inside the Sub-Process `R`, `S → R → F → E` with `R`
 * running `RS → I → RE`. `abnormalScopeEnd = completesNormally` admits an interrupting Event Sub-Process.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, end, eventSubProcess, flow, mapping, message, replace, scope, start, text, userWork, variable,
  withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const options = { abnormalScopeEnd: "completesNormally" };
const cancel = message({ messageRef: "M", name: text("cancelOrder") });
const handler = (parent: string | null): Json[] => [
  scope("H", eventSubProcess(cancel, true), {}, {}, parent), start("HS", cancel, [], "H"),
  activity("HU", userWork(), { inputs: [mapping("seen", variable("orderRef"), "dataAssociation")] }, "H"), end("HE", "none", "H"),
];
const handlerFlows = [flow("h1", "HS", "HU"), flow("h2", "HU", "HE")];

function admitted(json: Json): Program {
  const decoded = decodeProgram(wired(withOptions({ ...json, variables: ["orderRef"] }, options)));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

const atProcess = admitted(withFlows(append(replace(base(), "T", activity("T", userWork())), ...handler(null)), ...handlerFlows));
const inRegion = admitted(withFlows(
  append(replace(base(), "T", scope("R", "embedded")), start("RS", null, [], "R"), activity("I", userWork(), {}, "R"),
    end("RE", "none", "R"), activity("F", userWork()), ...handler("R")),
  flow("f1", "S", "R"), flow("r1", "RS", "I"), flow("r2", "I", "RE"), flow("f2", "R", "F"), flow("f3", "F", "E"), ...handlerFlows));

const at = (element: string): Json => ({ processInstanceId: "I", elementId: element, activation: 1 });
const begin: Json = { kind: "start", instanceId: "I", variables: [{ name: "orderRef", value: { kind: "string", value: "o-1" } }] };
const deliver: Json = { kind: "deliver", occurrence: at("HS"), trigger: { kind: "message", channel: { kind: "directMessage", messageId: "M" } } };
const complete = (element: string): Json => ({ kind: "command", occurrence: at(element), action: { kind: "completeUserTask", values: [] } });

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

const open = (outcome: Outcome): string[] => {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value.openItems.map((item) => item.element).sort();
};
const seen = (outcome: Outcome): unknown => {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value.variables.flatMap((frame) => frame.entries.filter(([name]) => name === "seen").map(([, value]) => value));
};

test("a process-level delivery cancels the ordinary work and runs the handler over the parent's data", () => {
  const delivered = run(atProcess, [begin, deliver]);
  assert.deepEqual(open(delivered), ["HU"]);
  assert.deepEqual(seen(delivered), [{ tag: "string", value: "o-1" }]);
  assert.deepEqual(run(atProcess, [begin, deliver, complete("T")]), { ok: false, failure: { tag: "rejected", code: "unknown-user-task" } });
});

test("a process-level handler's completion ends the instance without resuming the cancelled work", () => {
  const finished = run(atProcess, [begin, deliver, complete("HU")]);
  assert.ok(finished.ok, JSON.stringify(finished));
  assert.deepEqual(finished.value.openItems, []);
  assert.deepEqual(finished.value.status, "completed");
});

test("a delivery inside a Sub-Process cancels its work and the handler's completion continues the parent once", () => {
  assert.deepEqual(open(run(inRegion, [begin, deliver])), ["HU"]);
  assert.deepEqual(open(run(inRegion, [begin, deliver, complete("HU")])), ["F"]);
  assert.deepEqual(run(inRegion, [begin, deliver, complete("HU"), complete("I")]),
    { ok: false, failure: { tag: "rejected", code: "unknown-user-task" } });
});

test("an interrupting start fires once: a second delivery finds no subscription", () => {
  assert.deepEqual(run(atProcess, [begin, deliver, deliver]), { ok: false, failure: { tag: "rejected", code: "unknown-message-subscription" } });
});
