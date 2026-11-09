import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isRecord } from "./schema-structure.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("keeps population input closed and separate from single-instance scenarios", async () => {
  const [scenarioDocument, populationDocument] = await Promise.all([
    readFile(`${projectRoot}/contracts/schemas/scenario.schema.json`, "utf8"),
    readFile(
      `${projectRoot}/contracts/schemas/engine-population-scenario.schema.json`,
      "utf8",
    ),
  ]).then((documents) => documents.map((document) => JSON.parse(document) as unknown));
  assert.ok(isRecord(scenarioDocument));
  assert.ok(isRecord(populationDocument));
  assert.ok(isRecord(populationDocument.properties));
  assert.deepEqual(populationDocument.properties.kind, {
    const: "populationScenario",
  });
  assert.equal(populationDocument.additionalProperties, false);
  assert.equal(JSON.stringify(scenarioDocument).includes("populationScenario"), false);

  const serialized = JSON.stringify(populationDocument);
  for (const definition of [
    "bpmnResource",
    "stimulus",
    "commandId",
    "messageChannel",
    "bindings",
    "provenance",
  ]) {
    assert.equal(
      serialized.includes(
        `https://bpmn-lean.local/schemas/scenario.schema.json#/$defs/${definition}`,
      ),
      true,
      `population schema lost scenario definition ${definition}`,
    );
  }
});
