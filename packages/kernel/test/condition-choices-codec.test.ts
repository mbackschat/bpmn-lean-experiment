/**
 * The stimulus codec's `conditionChoices`, the ranking every input may state for its competing Conditional items: each
 * of the five stimulus forms reads it back in order through the `conditionChoices` kernel fixture, which Lean answers
 * too, absent is the empty ranking, and a malformed entry is refused with the same code in both kernels.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture, stimulusFromJson } from "./lean-paired.ts";

type Json = Record<string, unknown>;

const occurrence = { processInstanceId: "I", elementId: "Task", activation: 1 };
const forms: Readonly<Record<string, Json>> = {
  start: { kind: "start", commandId: "s", instanceId: "I", variables: [] },
  command: { kind: "command", commandId: "c", occurrence, action: { kind: "setVariables", values: [] } },
  deliver: { kind: "deliver", commandId: "d", occurrence, trigger: { kind: "message", channel: { kind: "unspecifiedMessage" } } },
  timerFire: { kind: "timerFire", commandId: "t", occurrence, logicalTimeMs: 5 },
  effectResult: { kind: "effectResult", commandId: "e", occurrence, outcome: { kind: "technicalFailure" } },
};

const ranking = [{ elementId: "Stop_Level" }, { elementId: "Warn_Level" }];

/** The ranking `stimulus` decodes to, read back by the kernel fixture. */
const readBack = (stimulus: Json): unknown => fixture("conditionChoices", [], { stimulus });

const refusal = (json: Json): string => {
  const decoded = stimulusFromJson(json);
  assert.ok(!decoded.ok, "the stimulus is refused");
  return decoded.refusal.split(":")[0] ?? decoded.refusal;
};

test("every stimulus form carries its ranking in the order stated", () => {
  for (const [kind, form] of Object.entries(forms)) {
    const decoded = stimulusFromJson({ ...form, conditionChoices: ranking });
    assert.ok(decoded.ok, decoded.ok ? "" : `${kind}: ${decoded.refusal}`);
    assert.deepEqual(readBack({ ...form, conditionChoices: ranking }), ranking, kind);
  }
});

test("an absent or empty ranking decodes to the empty ranking", () => {
  for (const [kind, form] of Object.entries(forms)) {
    assert.deepEqual(readBack(form), [], kind);
    assert.deepEqual(readBack({ ...form, conditionChoices: [] }), [], kind);
  }
});

test("a malformed ranking is refused with its strict-decoding code", () => {
  const command = forms["command"] ?? {};
  assert.equal(refusal({ ...command, conditionChoices: null }), "codec.malformed");
  assert.equal(refusal({ ...command, conditionChoices: { elementId: "A" } }), "codec.malformed");
  assert.equal(refusal({ ...command, conditionChoices: ["A"] }), "codec.malformed");
  assert.equal(refusal({ ...command, conditionChoices: [{}] }), "codec.missingField");
  assert.equal(refusal({ ...command, conditionChoices: [{ elementId: "A", contest: "B" }] }), "codec.unknownField");
  assert.equal(refusal({ ...command, conditionChoices: [{ elementId: 7 }] }), "codec.malformed");
});
