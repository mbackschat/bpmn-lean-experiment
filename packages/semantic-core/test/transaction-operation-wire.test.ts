import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import { SemanticOperationKind } from "@bpmn-lean/semantic-core";

import {
  transactionChildScope,
  transactionInstanceId,
  transactionProgramWire,
  transactionRootScope,
} from "./transaction-cancellation-fixtures.ts";

const cancel = transactionProgramWire.operations.find((operation) => operation.kind === SemanticOperationKind.CancelTransaction);
assert.ok(cancel);

const validators = loadValidators();

test("Transaction wire admits the closed Cancel arm with separate parent output and Boundary identity", async () => {
  const { program, operation } = await validators;
  assert.equal(operation(cancel), true, JSON.stringify(operation.errors));
  assert.equal(program(transactionProgramWire), true, JSON.stringify(program.errors));
  assert.notEqual(cancel.output, cancel.boundaryEventElementId);
  assert.equal(transactionProgramWire.controlPlaceScopes.find(
    ({ controlPlaceId }) => controlPlaceId === cancel.output,
  )?.scopeId, transactionRootScope);
  assert.equal(cancel.definitionScopeId, transactionChildScope);
});

test("Transaction wire rejects every missing field, empty identifier, wrong type, and unknown field or kind", async () => {
  const { program, operation } = await validators;
  const malformed: Record<string, unknown>[] = [
    { ...cancel, kind: "cancelUnknownTransaction" },
    { ...cancel, extra: null },
    { ...cancel, parentOutput: cancel.output },
    { ...cancel, origin: { ...cancel.origin, extra: null } },
    { ...cancel, origin: { kind: "bpmnElement" } },
    { ...cancel, origin: { elementId: "Cancel" } },
    { ...cancel, origin: { kind: "sequenceFlow", elementId: "Cancel" } },
    { ...cancel, origin: { ...cancel.origin, elementId: "" } },
    { ...cancel, origin: { ...cancel.origin, elementId: null } },
  ];
  for (const field of Object.keys(cancel)) {
    const missing: Record<string, unknown> = { ...cancel };
    delete missing[field];
    malformed.push(missing, { ...cancel, [field]: null }, { ...cancel, [field]: 1 });
  }
  for (const field of ["id", "definitionScopeId", "input", "output", "boundaryEventElementId"]) {
    malformed.push({ ...cancel, [field]: "" });
  }
  for (const mutation of malformed) {
    assert.equal(operation(mutation), false, JSON.stringify(mutation));
    assert.equal(program({
      ...transactionProgramWire,
      operations: transactionProgramWire.operations.map((value): Record<string, unknown> => value === cancel ? mutation : value),
    }), false, JSON.stringify(mutation));
  }
});

test("Transaction wire preserves the closed triggerCompensation arm", async () => {
  const { operation } = await validators;
  const { boundaryEventElementId: _boundary, ...fields } = cancel;
  const trigger = { ...fields, kind: "triggerCompensation", definitionScopeId: transactionRootScope };
  assert.equal(operation(trigger), true, JSON.stringify(operation.errors));
  assert.equal(operation({ ...trigger, boundaryEventElementId: "Boundary_Cancel" }), false);
  assert.equal(operation({ ...trigger, kind: "cancelTransaction" }), false);
});

test("Transaction publication admits the Cancel discriminator without widening the transition shape", async () => {
  const { transition } = await validators;
  const value = {
    kind: "internalOperation",
    operationId: cancel.id,
    operationKind: "cancelTransaction",
    origin: cancel.origin,
    owner: {
      processInstanceId: transactionInstanceId,
      definitionScopeId: transactionChildScope,
      activation: 1,
    },
  };
  assert.equal(transition(value), true, JSON.stringify(transition.errors));
  assert.equal(transition({ ...value, operationKind: "triggerCompensation" }), true);
  assert.equal(transition({ ...value, operationKind: "cancelUnknownTransaction" }), false);
  assert.equal(transition({ ...value, boundaryEventElementId: cancel.boundaryEventElementId }), false);
  assert.equal(transition({ ...value, output: cancel.output }), false);
  for (const field of Object.keys(value)) {
    const missing: Record<string, unknown> = { ...value };
    delete missing[field];
    assert.equal(transition(missing), false, field);
  }
});

async function loadValidators() {
  const [programSchema, publicationSchema] = await Promise.all([
    readSchema("semantic-process.schema.json"),
    readSchema("semantic-publication.schema.json"),
  ]);
  const ajv = new Ajv2020({ strict: true });
  ajv.addSchema(programSchema);
  const base = { $schema: "https://json-schema.org/draft/2020-12/schema" };
  return {
    program: ajv.compile(programSchema),
    operation: ajv.compile({ ...base, $defs: programSchema.$defs, $ref: "#/$defs/operation" }),
    transition: ajv.compile({ ...base, $defs: publicationSchema.$defs, $ref: "#/$defs/internalTransition" }),
  };
}

async function readSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(
    new URL(`../../../contracts/schemas/${name}`, import.meta.url), "utf8",
  )) as Record<string, unknown>;
}
