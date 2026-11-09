/**
 * Locks the Product 2 submission boundary against the engine's recursive portable value arms: until a Product 2 journey
 * selects them, the decoders of values Product 2 sends (a Process start and a Work form value) fail closed on a
 * well-formed Decimal, List or Map instead of coercing, flattening or dropping it. A published state is the engine's
 * to type, so its decoder carries those arms unchanged (see the execution publication contract test).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeDefinitionVersionStartCommand,
  decodePublicFormValue,
} from "@bpmn-lean/platform-contracts";

const order = {
  kind: "map",
  value: [
    { name: "address", value: { kind: "map", value: [{ name: "line2", value: { kind: "null" } }] } },
    { name: "items", value: { kind: "list", value: [{ kind: "string", value: "A" }, { kind: "string", value: "A" }] } },
    { name: "total", value: { kind: "decimal", coefficient: "12345", scale: 2 } },
  ],
} as const;
const portableValues = [
  order,
  { kind: "decimal", coefficient: "-125", scale: 2 },
  { kind: "list", value: [] },
  { kind: "map", value: [] },
] as const;

test("refuses a recursive portable value in a Process start command", () => {
  for (const value of portableValues) {
    assert.throws(
      () => decodeDefinitionVersionStartCommand({ initialVariables: [{ name: "order", value }] }),
      /kind is unknown/u,
      value.kind,
    );
  }
});

test("refuses a recursive portable value as a public Work form value", () => {
  for (const value of portableValues) {
    assert.throws(() => decodePublicFormValue(value), TypeError, value.kind);
  }
});
