import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import { projectCibProcessVariable } from "./contract-cib-evidence-projection.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("projects raw CIB Boolean without stringification", () => {
  assert.deepEqual(
    projectCibProcessVariable({ name: "approved", value: true }),
    { name: "approved", value: { kind: "boolean", value: true } },
  );
  assert.deepEqual(
    projectCibProcessVariable({ name: "approved", value: false }),
    { name: "approved", value: { kind: "boolean", value: false } },
  );
  assert.notDeepEqual(
    projectCibProcessVariable({ name: "approved", value: "true" }),
    projectCibProcessVariable({ name: "approved", value: true }),
  );
  assert.deepEqual(
    projectCibProcessVariable({ name: "cleared", value: null }),
    { name: "cleared", value: { kind: "null" } },
  );
  assert.throws(
    () => projectCibProcessVariable({ name: "unsupported", value: 1 as never }),
    /unsupported raw CIB variable/u,
  );
});

test("admits only primitive string, Boolean, and null raw CIB variable values", async () => {
  const schema = JSON.parse(await readFile(
    `${projectRoot}/contracts/schemas/cibseven-evidence.schema.json`,
    "utf8",
  )) as { readonly $defs: Readonly<Record<string, unknown>> };
  const validator = new Ajv2020({ strict: true }).compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: "#/$defs/processVariableSnapshot",
  });
  for (const value of ["true", true, false, null]) {
    assert.equal(validator({ name: "approved", value }), true);
  }
  for (const value of [1, {}, [], undefined]) {
    assert.equal(validator({ name: "approved", value }), false);
  }
  assert.equal(
    validator({ name: "approved", value: true, extra: null }),
    false,
  );
});
