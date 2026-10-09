import assert from "node:assert/strict";
import { test } from "node:test";

import { serializeDefinitionVersionStartCommand } from "@bpmn-lean/platform-contracts";
import { prepareDefinitionStartCommand } from "../src/definition-start-input.ts";

test("preserves the metadata-free empty command without inventing required bindings", () => {
  assert.deepEqual(prepareDefinitionStartCommand([], null), { initialVariables: [] });
});

test("keeps string values literal, including empty values and whitespace", () => {
  const rows = [{ name: "request", value: "" }, { name: " note ", value: "  unchanged 🚀  " }];
  const command = prepareDefinitionStartCommand(rows, null);
  assert.deepEqual(command, { initialVariables: [
    { name: " note ", value: { kind: "string", value: "  unchanged 🚀  " } },
    { name: "request", value: { kind: "string", value: "" } },
  ] });
  rows[0]!.value = "later edit";
  assert.equal(command.initialVariables[1]?.value.kind, "string");
  assert.deepEqual(command.initialVariables[1]?.value, { kind: "string", value: "" });
});

test("orders names by Unicode scalars rather than locale or UTF-16 code units", () => {
  const command = prepareDefinitionStartCommand([
    { name: "𐀀", value: "astral" }, { name: "\ue000", value: "BMP" }, { name: "a", value: "first" },
  ], null);
  assert.deepEqual(command.initialVariables.map(({ name }) => name), ["a", "\ue000", "𐀀"]);
  assert.doesNotThrow(() => serializeDefinitionVersionStartCommand(command));
});

for (const name of ["request", " request "]) {
  test(`rejects duplicate literal input name ${JSON.stringify(name)} with a readable error`, () => {
    assert.throws(() => prepareDefinitionStartCommand([
      { name, value: "first" }, { name: "other", value: "" }, { name, value: "second" },
    ], null), { name: "TypeError", message: "Input names must be unique." });
  });
}

test("distinguishes literal names that differ only in whitespace", () => {
  const command = prepareDefinitionStartCommand([
    { name: "request", value: "first" }, { name: " request ", value: "second" },
  ], null);
  assert.deepEqual(command.initialVariables.map(({ name }) => name), [" request ", "request"]);
});

test("rejects blank and malformed names or values through the public command contract", () => {
  for (const rows of [
    [{ name: "", value: "" }],
    [{ name: "\ud800", value: "valid" }],
    [{ name: "valid", value: "\ud800" }],
  ]) assert.throws(() => prepareDefinitionStartCommand(rows, null), TypeError);
});

test("preserves an existing preset exactly, including non-string legacy values", () => {
  const preset = { initialVariables: [{
    name: "legacy-items", value: { kind: "stringList", value: ["contract", "invoice", "receipt"] },
  }] } as const;
  assert.equal(prepareDefinitionStartCommand([
    { name: "request", value: "replacement" }, { name: "request", value: "ignored duplicate" },
  ], preset), preset);
});
