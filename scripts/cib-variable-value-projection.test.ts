import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * A state query's root variables are retained as wire-typed bindings, never as raw JSON of the Java value: the runner's
 * host carriers include BigDecimal, List and Map, which raw JSON spells as numbers the strict wire parser rejects
 * (`scripts/strict-json.ts`: only nonnegative safe integers).
 */
test("a state query snapshot retains its variables as wire-typed bindings", async () => {
  const schema = async (name: string) =>
    JSON.parse(await readFile(`${projectRoot}/contracts/schemas/${name}`, "utf8")) as Readonly<Record<string, unknown>> & {
      readonly $defs: Readonly<Record<string, unknown>>;
    };
  const evidence = await schema("cibseven-evidence.schema.json");
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
  ajv.addSchema(await schema("scenario.schema.json"));
  ajv.addSchema(await schema("canonical-result.schema.json"));
  const validator = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: evidence.$defs,
    $ref: "#/$defs/stateQuerySnapshot",
  });
  const snapshot = (variables: unknown) => ({ afterCommandId: "start", processInstanceCount: 1, engineClockTimeMs: 0, variables });
  for (const value of [
    { kind: "decimal", coefficient: "-15", scale: 1 },
    { kind: "list", value: [{ kind: "integer", value: 1 }] },
    { kind: "map", value: [{ name: "a", value: { kind: "null" } }] },
    { kind: "stringList", value: ["a", "a"] },
    { kind: "boolean", value: true },
  ]) {
    assert.equal(validator(snapshot([{ name: "v", value }])), true, JSON.stringify(value));
  }
  for (const value of [1.5, -1, true, "x", ["a"], null]) {
    assert.equal(validator(snapshot([{ name: "v", value }])), false, JSON.stringify(value));
  }
});
