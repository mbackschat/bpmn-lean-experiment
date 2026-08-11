import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("admits only the exact Terminate End checked and IL wire shapes", async () => {
  const [checkedSchema, programSchema] = await Promise.all([
    readSchema("checked-process.schema.json"),
    readSchema("semantic-process.schema.json"),
  ]);
  const checkedNode = compileDefinition(checkedSchema, "node");
  const operation = compileDefinition(programSchema, "operation");
  const checked = {
    kind: "terminateEndEvent",
    id: "End_Terminate",
  } as const;
  const terminate = {
    kind: "terminateScope",
    id: "operation:End_Terminate",
    origin: {
      kind: "bpmnElement",
      elementId: "End_Terminate",
    },
    input: "place:Flow_Trigger_Terminate",
    scopeId: "SubProcess_Work",
  } as const;

  assert.equal(checkedNode(checked), true, JSON.stringify(checkedNode.errors));
  assert.equal(operation(terminate), true, JSON.stringify(operation.errors));

  assert.equal(checkedNode({ kind: "terminateEndEvent" }), false);
  assert.equal(checkedNode({ ...checked, id: "" }), false);
  assert.equal(checkedNode({ ...checked, payload: null }), false);

  assert.equal(operation({ ...terminate, input: "" }), false);
  assert.equal(operation({ ...terminate, scopeId: "" }), false);
  assert.equal(operation({ ...terminate, output: "place:forbidden" }), false);
  assert.equal(operation({ ...terminate, privateField: "forbidden" }), false);
});

async function readSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/${name}`, "utf8"),
  ) as Record<string, unknown>;
}

function compileDefinition(
  schema: Record<string, unknown>,
  definition: string,
) {
  return new Ajv2020({ strict: true }).compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: `#/$defs/${definition}`,
  });
}
