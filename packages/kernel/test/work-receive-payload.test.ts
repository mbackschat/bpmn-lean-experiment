/**
 * A Receive Task's delivery is checked in the order a Message catch checks one, then mapped through the task's one Data
 * Output (PC-HUM-03; BPMN 2.0.2 §13.3.3, §10.4.1 "Receive Task Mapping"): a task with a Data Output requires a payload
 * and writes it through the associations that read it, a task without one rejects a payload (account P1's restriction),
 * and the delivery's own variables follow the mapped outputs (CIB-EXT-0025)
 * ([work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#receive-tasks)).
 *
 * `S → T → E`, `T` a Receive Task on the Message `M`, with the Data Output `Out` whose association writes `note`, or with
 * none; under `withinScope` the same task `R` runs inside the Sub-Process `T`, which declares `note` as its Property.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, end, flow, mapping, receiveWork, replace, scope, start, text, userWork, variable, withFlows, withOptions,
  wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const withOutput = { dataOutputs: [{ id: "Out", itemRef: null }], outputSets: 1 };
const receiving = (data: Json, outputs: Json[], id = "T", parent: string | null = null): Json =>
  activity(id, receiveWork({ messageRef: "M", name: text("M") }, false, data), { outputs }, parent);
const writesNote = [mapping("note", variable("Out"), "dataAssociation")];

function admitted(json: Json): Program {
  const decoded = decodeProgram(wired(withOptions({ ...json, variables: ["note"] }, { deliveryVariables: "installs" })));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

const mapped = admitted(replace(base(), "T", receiving(withOutput, writesNote)));
const unmapped = admitted(replace(base(), "T", receiving({}, [])));
const withinScope = admitted(withFlows(
  append(replace(base(), "T", scope("T", "embedded", { items: ["note"] })), start("TS", null, [], "T"),
    receiving(withOutput, writesNote, "R", "T"), activity("W", userWork(), {}, "T"), end("TE", "none", "T")),
  flow("t1", "TS", "R"), flow("t2", "R", "W"), flow("t3", "W", "TE")));

const str = (value: string): Json => ({ kind: "string", value });
const begin: Json = { kind: "start", instanceId: "I", variables: [] };
const deliver = (over: Json = {}, element = "T"): Json => ({
  kind: "deliver", occurrence: { processInstanceId: "I", elementId: element, activation: 1 },
  trigger: { kind: "message", channel: { kind: "directMessage", messageId: "M" } }, ...over,
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

/** The value each frame binds to `name`, by the element of the scope occurrence holding it (`root` for the process). */
function bindings(outcome: Outcome, name: string): Record<string, unknown> {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  const state = outcome.value;
  return Object.fromEntries(state.variables.flatMap((frame) => {
    const value = frame.entries.find(([key]) => key === name)?.[1];
    const element = state.scopes.find((entry) => entry.id === frame.scope)?.element ?? "root";
    return value === undefined ? [] : [[element, value]];
  }));
}

const rejected = (code: string) => ({ ok: false, failure: { tag: "rejected", code } });

test("a payload delivered to a task with a Data Output is written through the association that reads it", () => {
  assert.deepEqual(bindings(run(mapped, [begin, deliver({ payload: str("p") })]), "note"), { root: { tag: "string", value: "p" } });
});

test("the delivery's own variables follow the mapped outputs", () => {
  const both = run(mapped, [begin, deliver({ payload: str("p"), variables: [{ name: "note", value: str("v") }] })]);
  assert.deepEqual(bindings(both, "note"), { root: { tag: "string", value: "v" } });
});

test("a task with a Data Output requires a payload, and a task without one accepts none", () => {
  assert.deepEqual(run(mapped, [begin, deliver()]), rejected("message-payload-required"));
  assert.deepEqual(run(unmapped, [begin, deliver({ payload: str("p") })]), rejected("message-payload-not-accepted"));
  const completed = run(unmapped, [begin, deliver()]);
  assert.ok(completed.ok && completed.value.status === "completed", JSON.stringify(completed));
});

test("the channel is checked before the payload, as on a catch", () => {
  const elsewhere = deliver({ trigger: { kind: "message", channel: { kind: "directMessage", messageId: "Other" } } });
  assert.deepEqual(run(mapped, [begin, elsewhere]), rejected("message-channel-mismatch"));
});

test("a payload delivered inside a Sub-Process lands in the item its occurrence declares", () => {
  assert.deepEqual(bindings(run(withinScope, [begin, deliver({ payload: str("p") }, "R")]), "note"), { T: { tag: "string", value: "p" } });
});
