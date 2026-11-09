import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("admits the exact raw CIB scalar and flat string-list value domain", async () => {
  const schema = JSON.parse(await readFile(
    `${projectRoot}/contracts/schemas/cibseven-evidence.schema.json`,
    "utf8",
  )) as { readonly $defs: Readonly<Record<string, unknown>> };
  const validator = new Ajv2020({ strict: true }).compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: "#/$defs/processVariableSnapshot",
  });
  for (const value of ["true", true, false, null, 0, 9007199254740991, [], ["a", "a"]]) {
    assert.equal(validator({ name: "approved", value }), true);
  }
  for (const value of [-1, 1.5, 9007199254740992, {}, [1], undefined]) {
    assert.equal(validator({ name: "approved", value }), false);
  }
  assert.equal(
    validator({ name: "approved", value: true, extra: null }),
    false,
  );
});
