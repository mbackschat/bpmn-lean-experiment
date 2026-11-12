/**
 * The Simple Boolean predicates through the registry's evaluator (`feature/data.ts`, `simpleBoolean`): presence counts an
 * explicit null, `isNull` holds only for a bound null, and `stringEquals` is false for an absent name, a null and any
 * other type. Each row evaluates through lean-paired.ts, so the Lean kernel answers it too.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluate } from "./lean-paired.ts";

type Value = Readonly<Record<string, unknown>>;

const bool = (value: boolean): Value => ({ kind: "boolean", value });
const variables: readonly Value[] = [
  { name: "nothing", value: { kind: "null" } },
  { name: "word", value: { kind: "string", value: "web" } },
  { name: "count", value: { kind: "integer", value: 1 } },
];

const rows: ReadonlyArray<readonly [string, Value, boolean]> = [
  ["a literal", { literal: { value: true } }, true],
  ["isPresent of a bound null", { isPresent: { name: "nothing" } }, true],
  ["isPresent of an absent name", { isPresent: { name: "absent" } }, false],
  ["isNull of a bound null", { isNull: { name: "nothing" } }, true],
  ["isNull of a bound String", { isNull: { name: "word" } }, false],
  ["isNull of an absent name", { isNull: { name: "absent" } }, false],
  ["stringEquals of the same String", { stringEquals: { name: "word", value: "web" } }, true],
  ["stringEquals of another String", { stringEquals: { name: "word", value: "mail" } }, false],
  ["stringEquals of an Integer", { stringEquals: { name: "count", value: "1" } }, false],
  ["stringEquals of a bound null", { stringEquals: { name: "nothing", value: "" } }, false],
  ["stringEquals of an absent name", { stringEquals: { name: "absent", value: "" } }, false],
];

for (const [name, body, expected] of rows) {
  test(`simple boolean: ${name} is ${String(expected)}`, () => {
    assert.deepEqual(evaluate({ simpleBoolean: { body } }, variables), { value: bool(expected) });
  });
}
