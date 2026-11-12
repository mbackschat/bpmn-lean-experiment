/**
 * The strict codecs' refusals of malformed wire forms the scenario and IL contracts exclude: an unknown kind at every
 * stimulus discriminator, a mistyped identifier, Message channel, occurrence or value member, an IL inductive without a
 * tag, constructor or payload, and a text that is no JSON. Each refusal carries a stable code (`CodecRefusalCode`); the
 * Lean kernel answers the same documents through lean-paired.ts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, parseStrict, stimulusFromJson } from "./lean-paired.ts";

import { activity, base, replace, userWork } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const code = (refusal: string): string => refusal.split(":")[0] ?? refusal;
const stimulusCode = (json: Json): string => {
  const decoded = stimulusFromJson(json);
  return decoded.ok ? "accepted" : code(decoded.refusal);
};
const programCode = (json: Json): string => {
  const decoded = decodeProgram(json);
  return decoded.ok ? "accepted" : code(decoded.refusal);
};

const occurrence = { processInstanceId: "I", elementId: "T", activation: 1 };
const start = (over: Json = {}): Json => ({ kind: "start", commandId: "c", instanceId: "I", variables: [], ...over });
const deliver = (over: Json): Json => ({ kind: "deliver", commandId: "c", occurrence, ...over });
const message = (channel: unknown): Json => deliver({ trigger: { kind: "message", channel } });
const operation = { kind: "operationMessage", messageId: "M", interfaceId: "I", interfaceOperationId: "O" };

const stimuli: ReadonlyArray<readonly [string, Json, string]> = [
  ["an unknown stimulus kind", { kind: "bogus", commandId: "c" }, "codec.malformed"],
  ["an explicit none start trigger", start({ trigger: { kind: "none" } }), "accepted"],
  ["an unknown start trigger kind", start({ trigger: { kind: "bogus" } }), "codec.malformed"],
  ["an unknown command action kind", { kind: "command", commandId: "c", occurrence, action: { kind: "bogus" } }, "codec.malformed"],
  ["an unknown delivery trigger kind", deliver({ trigger: { kind: "bogus" } }), "codec.malformed"],
  ["an unknown Message channel kind", message({ kind: "bogus" }), "codec.malformed"],
  ["a Message channel kind that is no String", message({ kind: 5 }), "codec.malformed"],
  ["an operation channel without its interface", message({ kind: "operationMessage", messageId: "M", interfaceOperationId: "O" }), "codec.missingField"],
  ["an operation channel's Message identifier that is no String", message({ ...operation, messageId: 5 }), "codec.malformed"],
  ["an operation channel's interface that is no String", message({ ...operation, interfaceId: 5 }), "codec.malformed"],
  ["an occurrence's process instance that is no String", deliver({ occurrence: { ...occurrence, processInstanceId: 5 }, trigger: { kind: "timer" } }),
    "codec.malformed"],
  ["an occurrence's element that is no String", deliver({ occurrence: { ...occurrence, elementId: 5 }, trigger: { kind: "timer" } }), "codec.malformed"],
  ["an unknown correlation target kind", { ...message(operation), correlation: [{ target: { kind: "bogus" }, expected: { kind: "null" } }] },
    "codec.malformed"],
  ["an unknown effect outcome kind", { kind: "effectResult", commandId: "c", occurrence, outcome: { kind: "bogus" } }, "codec.malformed"],
  ["a value kind that is no String", start({ variables: [{ name: "x", value: { kind: 5 } }] }), "codec.malformed"],
  ["a Decimal coefficient that is no String", start({ variables: [{ name: "x", value: { kind: "decimal", coefficient: 5, scale: 0 } }] }), "codec.malformed"],
  ["a Decimal coefficient that is no integer", start({ variables: [{ name: "x", value: { kind: "decimal", coefficient: "x", scale: 0 } }] }),
    "codec.malformed"],
  ["a binding without a name", start({ variables: [{ value: { kind: "null" } }] }), "codec.malformed"],
];

for (const [description, stimulus, expected] of stimuli) {
  test(`stimulus codec: ${description} is ${expected}`, () => assert.equal(stimulusCode(stimulus), expected));
}

const formFields = (fields: unknown): Json => replace(base(), "T", activity("T", userWork({ formFields: fields })));
const elements = (element: unknown): Json => ({ ...base(), elements: [element] });

const programs: ReadonlyArray<readonly [string, Json, string]> = [
  ["a form field that is no pair", formFields([["key"]]), "codec.malformed"],
  ["a form field whose key is no String", formFields([[1, "string"]]), "codec.malformed"],
  ["an element without a constructor tag", elements(5), "codec.malformed"],
  ["an element of an unknown constructor", elements({ bogus: {} }), "codec.malformed"],
  ["an element whose payload is no object", elements({ activity: 5 }), "codec.malformed"],
];

for (const [description, program, expected] of programs) {
  test(`program codec: ${description} is ${expected}`, () => assert.equal(programCode(program), expected));
}

test("program codec: a text that is no JSON is codec.malformed", () => {
  const parsed = parseStrict("{");
  assert.ok(!parsed.ok);
  assert.equal(code(parsed.refusal), "codec.malformed");
});
