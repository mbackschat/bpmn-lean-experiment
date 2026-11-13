import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { SchemaObject } from "ajv/dist/2020.js";

async function schemaDefinition(
  schemaName: string,
  definition: string,
): Promise<SchemaObject> {
  const schema = JSON.parse(await readFile(
    new URL(`../contracts/schemas/${schemaName}`, import.meta.url),
    "utf8",
  )) as { readonly $defs: Readonly<Record<string, unknown>> };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: `#/$defs/${definition}`,
  } as SchemaObject;
}

function validateDefinition(definition: SchemaObject, value: unknown): boolean {
  return new Ajv2020({ strict: true }).compile(definition)(value);
}

test("adds exact integer and ordered string-list arms to the generic value schema", async () => {
  const variableValue = await schemaDefinition(
    "scenario.schema.json",
    "variableValue",
  );
  for (const value of [
    { kind: "integer", value: 0 },
    { kind: "integer", value: Number.MAX_SAFE_INTEGER },
    { kind: "stringList", value: ["duplicate", "duplicate", "policy"] },
  ]) {
    assert.equal(validateDefinition(variableValue, value), true);
  }
  for (const value of [
    { kind: "integer", value: -1 },
    { kind: "integer", value: 1.5 },
    { kind: "integer", value: Number.MAX_SAFE_INTEGER + 1 },
    { kind: "stringList", value: Array.from({ length: 33 }, () => "x") },
    { kind: "stringList", value: ["x".repeat(1025)] },
  ]) {
    assert.equal(validateDefinition(variableValue, value), false);
  }
});
