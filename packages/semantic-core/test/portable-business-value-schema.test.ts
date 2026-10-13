/**
 * Compares the scenario wire schema with the TypeScript validator for the recursive portable value arms.
 *
 * The schema is a necessary filter: every value the validator accepts must be schema-valid. It cannot express Map key
 * order, signed 64-bit range, container depth, node count or canonical bytes, so those cases are asserted
 * schema-valid and validator-invalid, which keeps `isVariableValue` the single owner of each rule.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { isVariableValue } from "@bpmn-lean/semantic-core";

const document: unknown = JSON.parse(await readFile(
  new URL("../../../contracts/schemas/scenario.schema.json", import.meta.url),
  "utf8",
));
assert.ok(typeof document === "object" && document !== null && "$defs" in document);
const validateSchema = new Ajv2020({ strict: true }).compile({
  $defs: document.$defs,
  $ref: "#/$defs/variableValue",
});

const nothing = { kind: "null" };
const text = (value: string) => ({ kind: "string", value });
const decimal = (coefficient: string, scale: number) => ({ kind: "decimal", coefficient, scale });
const list = (...value: unknown[]) => ({ kind: "list", value });
const map = (...entries: Array<readonly [string, unknown]>) =>
  ({ kind: "map", value: entries.map(([name, value]) => ({ name, value })) });
const line = (quantity: number, sku: string) =>
  map(["quantity", { kind: "integer", value: quantity }], ["sku", text(sku)]);

test("every value the validator accepts is schema-valid", () => {
  const accepted: ReadonlyArray<unknown> = [
    map(
      ["address", map(["city", text("Berlin")], ["line2", nothing])],
      ["items", list(line(1, "A"), line(1, "A"))],
      ["total", decimal("12345", 2)],
    ),
    map(
      ["address", map(["city", text("Berlin")], ["line2", nothing])],
      ["items", list(line(2, "B"), line(1, "A"))],
      ["total", decimal("-125", 2)],
    ),
    decimal("0", 0), decimal("9223372036854775807", 0), decimal("-9223372036854775808", 6), decimal("10", 0),
    list(), map(), list(list(list(list()))), map(["", nothing], ["\u{10000}", text("\u{1d11e}")]),
    { kind: "stringList", value: ["a", "a"] }, { kind: "integer", value: 0 }, text("a".repeat(5000)),
    list(...Array.from({ length: 32 }, () => nothing)),
  ];
  for (const value of accepted) {
    assert.equal(isVariableValue(value), true, JSON.stringify(value));
    assert.equal(validateSchema(value), true, JSON.stringify(validateSchema.errors));
  }
});

test("order, range, depth, node count and bytes are enforced by the validator alone", () => {
  const beyondTheSchema: ReadonlyArray<readonly [string, unknown]> = [
    ["a Map in descending key order", map(["b", nothing], ["a", nothing])],
    ["a Map with a duplicate key", map(["a", nothing], ["a", nothing])],
    ["a Map in UTF-16 rather than scalar order", map(["\u{10000}", nothing], ["￿", nothing])],
    ["a coefficient one over the signed 64-bit bound", decimal("9223372036854775808", 0)],
    ["a coefficient one under the signed 64-bit bound", decimal("-9223372036854775809", 0)],
    ["a trailing zero at positive scale", decimal("123450", 3)],
    ["a zero coefficient at positive scale", decimal("0", 1)],
    ["five nested containers", list(list(list(list(list()))))],
    ["more than 256 value nodes", list(
      ...Array.from({ length: 9 }, () => list(...Array.from({ length: 28 }, () => nothing))),
      ...Array.from({ length: 5 }, () => nothing),
    )],
    ["more than 16384 canonical bytes", list(...Array.from({ length: 16 }, () => text("a".repeat(1024))))],
  ];
  for (const [label, value] of beyondTheSchema) {
    assert.equal(validateSchema(value), true, `${label} is not expressible in the schema`);
    assert.equal(isVariableValue(value), false, `${label} must be rejected by the validator`);
  }
});
