/**
 * Locks the closed profile source binding of configured and Service Task effects.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const descriptor = {
  protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
  operation: "urn:bpmn-lean:effect-operation:probe-v1",
} as const;

test("keeps configured and Service Task effect sources on one closed union", async () => {
  const schema = await readSchema("semantic-profile.schema.json");
  const validate = compileProperty(schema, "effectBindings");
  const configuredSource = {
    taskDefinitionNamespace: "urn:bpmn-lean:bpmn:extensions:v1",
    taskDefinitionType: "urn:bpmn-lean:task-handler:probe-v1",
  } as const;
  const configured = [{ source: configuredSource, descriptor }] as const;
  const service = [{
    source: {
      implementation: "urn:bpmn-lean:effect:probe-v1",
      delegateExpression: "${bpmnLeanEffectHandler}",
    },
    descriptor,
  }] as const;

  assert.equal(validate(configured), true, JSON.stringify(validate.errors));
  assert.equal(validate(service), true, JSON.stringify(validate.errors));
  assert.equal(validate([{ source: {
    ...configuredSource,
    taskDefinitionType: "",
  }, descriptor }]), false);
  assert.equal(validate([{ source: {
    ...configuredSource,
    implementation: null,
  }, descriptor }]), false);
  assert.equal(validate([{ source: {
    taskDefinitionType: configuredSource.taskDefinitionType,
  }, descriptor }]), false);
  assert.equal(validate([{ source: configuredSource, descriptor, extra: true }]), false);
});

async function readSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/${name}`, "utf8"),
  ) as Record<string, unknown>;
}

function compileProperty(
  schema: Record<string, unknown>,
  property: string,
) {
  const properties = schema.properties as Record<string, unknown> | undefined;
  const propertySchema = properties?.[property];
  assert.notEqual(propertySchema, undefined, `missing property ${property}`);
  return new Ajv2020({ strict: true }).compile({
    ...(propertySchema as Record<string, unknown>),
  });
}
