/**
 * A Message delivery whose output mapping fails while the payload is written rolls the delivery back and leaves the
 * wait open (PC-MESSAGE-03, "an output mapping that fails over the payload rolls back"): the payload's binding and the
 * failing parameter are one committed step, so neither lands
 * ([subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md)). Only the catch arm reaches
 * it: a Receive Task's outputs are refused unless each reads its Data Output (`activity.outputMappings`), and such a read
 * of a delivered payload cannot fail, which the refusal is held to here.
 *
 * `S → T → E`, `T` a Message catch on `M` whose outputs write the payload to `note` and then a JUEL parameter reading
 * `missing`, which no scope binds.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, base, catchEvent, juel, mapping, message, receiveWork, replace, text, variable, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const outputs = [mapping("note", variable("Out"), "dataAssociation"), mapping("copy", juel({ identifier: { name: "missing" } }))];

const programOf = (element: Json): Json =>
  wired(withOptions({ ...replace(base(), "T", element), variables: ["note"] }, { evaluator: "juel" }));

function admitted(element: Json): Program {
  const decoded = decodeProgram(programOf(element));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

const catching = admitted(catchEvent("T", message({ messageRef: "M", name: text("M") }), outputs));

function stepped(program: Program, state: State | null, raw: Json): Outcome {
  const input = stimulusFromJson({ commandId: "c", ...raw });
  assert.ok(input.ok, input.ok ? "" : input.refusal);
  return step(program, state, input.value[1]);
}

test("a Message catch whose output parameter fails over the payload rolls the delivery back and keeps waiting", () => {
  const started = stepped(catching, null, { kind: "start", instanceId: "I", variables: [] });
  assert.ok(started.ok, JSON.stringify(started));
  const delivered = stepped(catching, started.value, {
    kind: "deliver", occurrence: { processInstanceId: "I", elementId: "T", activation: 1 },
    trigger: { kind: "message", channel: { kind: "directMessage", messageId: "M" } }, payload: { kind: "string", value: "p" },
  });
  assert.deepEqual(delivered, { ok: false, failure: { tag: "rolledBack", code: "unknown-variable" } });
  assert.ok(started.value.openItems.some((item) => item.element === "T"));
});

test("a Receive Task cannot carry the failing parameter: its outputs only read its Data Output", () => {
  const decoded = decodeProgram(programOf(activity("T", receiveWork({ messageRef: "M", name: text("M") }, false,
    { dataOutputs: [{ id: "Out", itemRef: null }], outputSets: 1 }), { outputs })));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), "activity.outputMappings");
});
