import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import { isRecord } from "./schema-structure.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("keeps the scenario MessageChannel schema a closed union", async () => {
  const values = [
    {
      kind: "operationMessage",
      interfaceId: "Interface_1",
      interfaceOperationId: "Operation_1",
      messageId: "Message_1",
    },
    {
      kind: "directMessage",
      messageId: "Message_1",
    },
  ] as const;
  const invalidValues = [
    { kind: "directMessage" },
    {
      kind: "directMessage",
      messageId: "Message_1",
      interfaceId: "Interface_1",
    },
    {
      kind: "operationMessage",
      interfaceId: "Interface_1",
      messageId: "Message_1",
    },
    { kind: "otherMessage", messageId: "Message_1" },
  ] as const;

  for (const schemaName of ["scenario.schema.json"]) {
    const schema = JSON.parse(
      await readFile(
        `${projectRoot}/contracts/schemas/${schemaName}`,
        "utf8",
      ),
    ) as { readonly $defs: Readonly<Record<string, unknown>> };
    const validate = new Ajv2020({ strict: true }).compile({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: schema.$defs,
      $ref: "#/$defs/messageChannel",
    });

    for (const value of values) {
      assert.equal(validate(value), true, schemaName);
    }
    for (const value of invalidValues) {
      assert.equal(validate(value), false, schemaName);
    }
  }
});

test("keeps payload-bearing Message delivery and open-wait arms exact", async () => {
  const scenarioId = "https://bpmn-lean.local/schemas/scenario.schema.json";
  const resultId = "https://bpmn-lean.local/schemas/canonical-result.schema.json";
  type SchemaDocument = Readonly<Record<string, unknown>> & { readonly $defs: Readonly<Record<string, unknown>> };
  const readSchemaDocument = async (name: string) => JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/${name}.schema.json`, "utf8"),
  ) as SchemaDocument;
  const scenarioDocument = await readSchemaDocument("scenario");
  const resultDocument = await readSchemaDocument("canonical-result");
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
  ajv.addSchema(scenarioDocument as never);
  ajv.addSchema(resultDocument as never);
  const schemaAt = (id: string, definition: string) => {
    const validate = ajv.getSchema(`${id}#/$defs/${definition}`);
    assert.ok(validate !== undefined, `${id} has no definition ${definition}`);
    return validate;
  };
  const deliver = schemaAt(scenarioId, "deliver");
  const messageDetail = schemaAt(resultId, "messageDetail");
  const channel = { kind: "directMessage", messageId: "Message_1" } as const;
  const delivery = {
    kind: "deliver",
    commandId: "command-1",
    occurrence: { processInstanceId: "instance-1", elementId: "CatchEvent_1", activation: 1 },
    trigger: { kind: "message", channel },
  } as const;

  assert.ok(isRecord(scenarioDocument.properties));
  const stimuli = scenarioDocument.properties.stimuli;
  assert.ok(isRecord(stimuli) && isRecord(stimuli.items) && Array.isArray(stimuli.items.oneOf));
  assert.equal(stimuli.items.oneOf.some((arm) => isRecord(arm) && arm.$ref === "#/$defs/deliver"), true);
  const openWait = resultDocument.$defs.openWait;
  assert.ok(isRecord(openWait) && Array.isArray(openWait.oneOf));
  assert.equal(openWait.oneOf.some((arm) =>
    isRecord(arm) && isRecord(arm.properties) && isRecord(arm.properties.detail) &&
      arm.properties.detail.$ref === "#/$defs/messageDetail"
  ), true);

  // One delivery arm serves both: the payload is optional input, so the payload-free and the payload-bearing wait are
  // told apart by the open wait's Boolean `payload`, never by the delivery's shape.
  assert.equal(deliver(delivery), true, JSON.stringify(deliver.errors));
  assert.equal(deliver({ ...delivery, payload: { kind: "null" } }), true, JSON.stringify(deliver.errors));
  assert.equal(deliver({ ...delivery, payload: { kind: "unknown" } }), false);
  assert.equal(deliver({ ...delivery, trigger: { kind: "message" } }), false);
  assert.equal(deliver({ ...delivery, trigger: { kind: "message", channel, payload: { kind: "null" } } }), false);
  assert.equal(deliver({ ...delivery, privateField: "forbidden" }), false);
  assert.equal(deliver({ ...delivery, occurrence: { ...delivery.occurrence, activation: 0 } }), false);

  const wait = { kind: "message", channel, payload: true, criteria: [] } as const;
  assert.equal(messageDetail(wait), true, JSON.stringify(messageDetail.errors));
  assert.equal(messageDetail({ ...wait, payload: false }), true);
  const { payload: _payload, ...withoutPayloadFlag } = wait;
  assert.equal(messageDetail(withoutPayloadFlag), false);
  assert.equal(messageDetail({ ...wait, payload: { kind: "null" } }), false);
  assert.equal(messageDetail({ ...wait, privateField: "forbidden" }), false);
});
