/**
 * Strict decoding: the program and stimulus codecs refuse a repeated, unknown or missing key and a `null` optional
 * member, each with its stable code (`CodecRefusalCode`). `kernel-behavior-oracle.integration-test.ts` holds the Lean
 * kernel to the same codes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeProgram, parseStrict, stimulusFromJson } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const programText = readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8");
const program = JSON.parse(programText) as Json;
const occurrence = { processInstanceId: "pi-1", elementId: "Task", activation: 1 };
const command: Json = { kind: "command", commandId: "c-1", occurrence, action: { kind: "retryIncident", generation: 1 } };

const code = (refusal: string): string => refusal.split(":")[0] ?? refusal;
const programRefusal = (json: unknown): string => {
  const decoded = decodeProgram(json);
  assert.ok(!decoded.ok, "the program is refused");
  return code(decoded.refusal);
};
const stimulusRefusal = (json: unknown): string => {
  const decoded = stimulusFromJson(json);
  assert.ok(!decoded.ok, "the stimulus is refused");
  return code(decoded.refusal);
};

test("the canonical program and a well-formed stimulus decode", () => {
  assert.ok(decodeProgram(program).ok);
  assert.ok(stimulusFromJson(command).ok);
  assert.ok(parseStrict(programText).ok);
});

test("a repeated key is refused as codec.duplicateField", () => {
  const parsed = parseStrict(`{"kind":"command","kind":"command"}`);
  assert.ok(!parsed.ok);
  assert.equal(code(parsed.refusal), "codec.duplicateField");
  assert.ok(parseStrict(`{"a":"x:y","b":["\\":"]}`).ok, "a colon inside a string is no member");
});

test("an unknown key is refused as codec.unknownField", () => {
  assert.equal(programRefusal({ ...program, extra: true }), "codec.unknownField");
  assert.equal(stimulusRefusal({ ...command, extra: true }), "codec.unknownField");
  assert.equal(stimulusRefusal({ ...command, action: { kind: "retryIncident", generation: 1, values: [] } }), "codec.unknownField");
  const start = { kind: "start", commandId: "s", instanceId: "pi-1", variables: [{ name: "x", value: { kind: "null", value: 1 } }] };
  assert.equal(stimulusRefusal(start), "codec.unknownField");
});

test("a missing key is refused as codec.missingField", () => {
  const { occurrence: _occurrence, ...withoutOccurrence } = command;
  assert.equal(stimulusRefusal(withoutOccurrence), "codec.missingField");
  assert.equal(stimulusRefusal({ ...command, occurrence: { processInstanceId: "pi-1", elementId: "Task" } }), "codec.missingField");
  assert.equal(stimulusRefusal({ ...command, action: { kind: "cancelIncidentProcess" } }), "codec.missingField",
    "an incident command names the generation it resolves");
  const [first, ...rest] = program["elements"] as Array<{ gateway: { header: Json } & Json }>;
  const { parent: _parent, ...header } = first!.gateway.header;
  const withoutParent = { ...program, elements: [{ gateway: { ...first!.gateway, header } }, ...rest] };
  assert.equal(programRefusal(withoutParent), "codec.missingField", "an absent optional IL field is not its canonical null");
  const { variables: _variables, ...withoutVariables } = program;
  assert.equal(programRefusal(withoutVariables), "codec.malformed", "a required IL field absent reads as null and fails");
});

test("a null optional member or a mistyped value is refused as codec.malformed", () => {
  assert.equal(stimulusRefusal({ ...command, at: null }), "codec.malformed");
  assert.equal(stimulusRefusal({ ...command, commandId: 7 }), "codec.malformed");
  assert.equal(programRefusal({ ...program, flows: {} }), "codec.malformed");
});
