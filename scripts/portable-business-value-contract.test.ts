/**
 * Locks the scenario wire schema of the recursive portable value arms and the refusal that keeps every registered
 * scenario profile closed to them (`PBV-INGRESS-01`, `PBV-IDENTITY-01`).
 *
 * The schema is a necessary filter only: it cannot express Map key order, signed 64-bit range, container depth, node
 * count or canonical bytes. The semantic-core schema test owns the comparison against the TypeScript validator, which
 * stays the single owner of those rules.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";

import { verifyScenarioVariableValueContract } from "./contract-artifacts.ts";
import {
  declaredEnumValues,
  isRecord,
  reachableDiscriminators,
} from "./schema-structure.ts";

const projectRoot = new URL("../", import.meta.url);

async function schemaDocument(): Promise<Readonly<Record<string, unknown>>> {
  const document: unknown = JSON.parse(
    await readFile(new URL("contracts/schemas/scenario.schema.json", projectRoot), "utf8"),
  );
  assert.ok(isRecord(document) && isRecord(document.$defs));
  return document;
}

async function compileDefinition(definition: string): Promise<ValidateFunction> {
  const { $defs } = await schemaDocument();
  return new Ajv2020({ strict: true }).compile({ $defs, $ref: `#/$defs/${definition}` });
}

const nothing = { kind: "null" };
const text = (value: string) => ({ kind: "string", value });
const decimal = (coefficient: string, scale: number) => ({ kind: "decimal", coefficient, scale });
const list = (...value: unknown[]) => ({ kind: "list", value });
const map = (...entries: Array<readonly [string, unknown]>) =>
  ({ kind: "map", value: entries.map(([name, value]) => ({ name, value })) });
const line = (quantity: number, sku: string) =>
  map(["quantity", { kind: "integer", value: quantity }], ["sku", text(sku)]);

const order = map(
  ["address", map(["city", text("Berlin")], ["line2", nothing])],
  ["items", list(line(1, "A"), line(1, "A"))],
  ["total", decimal("12345", 2)],
);
const revision = map(
  ["address", map(["city", text("Berlin")], ["line2", nothing])],
  ["items", list(line(2, "B"), line(1, "A"))],
  ["total", decimal("-125", 2)],
);

test("every declared value kind has a reachable schema branch", async () => {
  const [{ $defs }, source] = await Promise.all([
    schemaDocument(),
    readFile(new URL("packages/semantic-core/src/contract.ts", projectRoot), "utf8"),
  ]);
  assert.ok(isRecord($defs));
  const kinds = declaredEnumValues(source, "VariableValueKind");
  // Anti-vacuity: the three recursive arms were added to an enum that previously held five members.
  assert.deepEqual(
    [...kinds].sort(),
    ["boolean", "decimal", "integer", "list", "map", "null", "string", "stringList"],
  );
  const reachable = reachableDiscriminators({ $ref: "#/$defs/variableValue" }, $defs);
  assert.deepEqual(kinds.filter((kind) => !reachable.has(kind)), []);
});

test("accepts the order, its revision and every Decimal bound as a variable binding value", async () => {
  const validateValue = await compileDefinition("variableValue");
  const validateBinding = await compileDefinition("variableBinding");
  for (const value of [
    order, revision, decimal("0", 0), decimal("9223372036854775807", 0), decimal("-9223372036854775808", 6),
    decimal("5", 1), list(), map(), list(list(list(list()))), { kind: "stringList", value: ["a", "a"] },
  ]) {
    assert.equal(validateValue(value), true, JSON.stringify(validateValue.errors));
    assert.equal(validateBinding({ name: "candidate", value }), true);
  }
});

test("rejects every shape the schema can express", async () => {
  const validate = await compileDefinition("variableValue");
  const invalid: ReadonlyArray<readonly [string, unknown]> = [
    ["negative zero", decimal("-0", 0)],
    ["a leading zero", decimal("01", 0)],
    ["a plus sign", decimal("+1", 0)],
    ["an exponent", decimal("1e2", 0)],
    ["an empty coefficient", decimal("", 0)],
    ["a surrounding space", decimal(" 1", 0)],
    ["a non-ASCII digit", decimal("٣", 0)],
    ["scale seven", decimal("1", 7)],
    ["a negative scale", decimal("1", -1)],
    ["a fractional scale", decimal("1", 1.5)],
    ["a Number coefficient", { kind: "decimal", coefficient: 12345, scale: 2 }],
    ["a missing scale", { kind: "decimal", coefficient: "1" }],
    ["an extra Decimal field", { kind: "decimal", coefficient: "1", scale: 0, value: 1 }],
    ["33 List members", list(...Array.from({ length: 33 }, () => nothing))],
    ["33 Map entries", map(...Array.from({ length: 33 }, (_, index) => [`k${index}`, nothing] as const))],
    ["a nested legacy StringList", list({ kind: "stringList", value: [] })],
    ["a nested legacy StringList in a Map", map(["a", { kind: "stringList", value: [] }])],
    ["a nested unknown kind", list({ kind: "object" })],
    ["a nested negative Integer", list({ kind: "integer", value: -1 })],
    ["a nested over-long String", list(text("a".repeat(1025)))],
    ["an over-long Map name", map(["a".repeat(1025), nothing])],
    ["a Map entry without a value", { kind: "map", value: [{ name: "a" }] }],
    ["a Map entry with an extra field", { kind: "map", value: [{ name: "a", value: nothing, extra: 1 }] }],
    ["a Map value that is an object", { kind: "map", value: {} }],
    ["a List with an extra field", { kind: "list", value: [], extra: 1 }],
    ["a List without a value", { kind: "list" }],
  ];
  for (const [label, value] of invalid) {
    assert.equal(validate(value), false, label);
  }
});

test("keeps the root String arm unbounded while nested Strings carry the portable bound", async () => {
  const validate = await compileDefinition("variableValue");
  assert.equal(validate(text("a".repeat(5000))), true);
  assert.equal(validate(list(text("a".repeat(1024)))), true);
  assert.equal(validate(list(text("a".repeat(1025)))), false);
});

test("scenario verification refuses the recursive arms on every surface of every profile", () => {
  const profiles = [
    "bpmn-2.0.2-bpmn-lean-structured-human-work-draft",
    "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
    "bpmn-2.0.2-parallel-multi-instance-user-task-draft",
    "bpmn-2.0.2-message-payload-catch-draft",
    "bpmn-2.0.2-user-task-draft",
    "not-a-registered-profile",
  ];
  for (const profile of profiles) {
    for (const value of [order, decimal("1", 0), list(), map()]) {
      const binding = { name: "candidate", value };
      for (const stimulus of [
        { kind: "startProcess", initialVariables: [binding] },
        { kind: "completeUserTaskInstance", submittedValues: [binding] },
        { kind: "completeEffect", result: { kind: "success", localPatch: [binding] } },
        { kind: "deliverPayloadMessage", payload: value },
      ]) {
        assert.throws(
          () => verifyScenarioVariableValueContract({ profile, stimuli: [stimulus] }),
          TypeError,
          `${profile} ${stimulus.kind} ${value.kind}`,
        );
      }
    }
  }
});
