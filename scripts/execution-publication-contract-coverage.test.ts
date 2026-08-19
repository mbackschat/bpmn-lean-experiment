import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  canonicalExportFixture,
  publicationPage,
} from "../packages/temporal-adapter/protocol/test/semantic-publication-fixture.ts";
import { declaredEnumMembers, declaredEnumValues } from "./schema-structure.ts";

/**
 * Operation kinds the publication contract deliberately cannot carry.
 *
 * Derived from the producer that refuses them instead of from a list maintained here: an operation
 * whose completeness arm fails closed commits no transition, so no publication can name it and the
 * schema must stay tight against it. A kind that later gains a runtime stops failing closed, and this
 * guard then requires its schema entry in that same change. Broken extraction cannot pass silently,
 * because the partition below would demand a schema entry that is absent.
 */
function failClosedOperationNames(completenessSource: string): ReadonlyArray<string> {
  return [
    ...completenessSource.matchAll(
      /case SemanticOperationKind\.([A-Za-z0-9_]+):\s*\n\s*return failCompleteness\(\);/gu,
    ),
  ].map((match) => {
    const name = match[1];
    assert.ok(name !== undefined);
    return name;
  });
}

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("validates the closed page, result, and full-export structures", async () => {
  const validate = await publicationValidator();
  const page = publicationPage();
  for (const document of [
    { afterRevision: 0 },
    { afterRevision: Number.MAX_SAFE_INTEGER, limit: 100 },
    page,
    { kind: "available", page },
    { kind: "notReady" },
    { kind: "notFound" },
    { kind: "unavailable" },
    { kind: "gap" },
    canonicalExportFixture(),
  ]) {
    assert.equal(validate(document), true, JSON.stringify(validate.errors));
  }

  for (const malformed of [
    { ...page, owner: "extra" },
    { afterRevision: 0, limit: 0 },
    { afterRevision: 0, limit: 101 },
    { ...page, current: undefined },
    { ...page, headRevision: null },
    { ...page, headRevision: Number.MAX_SAFE_INTEGER + 1 },
    { kind: "partial", page },
    { ...canonicalExportFixture(), format: "bpmn-lean.execution-publication.v2" },
  ]) {
    assert.equal(validate(malformed), false);
  }
});

test("covers every stimulus, operation, result, and safe-integer branch", async () => {
  const [schema, contractSource, programSource, completenessSource] = await Promise.all([
    readSchema("semantic-publication.schema.json"),
    readFile(`${projectRoot}/packages/semantic-core/src/contract.ts`, "utf8"),
    readFile(`${projectRoot}/packages/semantic-core/src/semantic-process-contract.ts`, "utf8"),
    readFile(
      `${projectRoot}/packages/semantic-core/src/flow-node-occurrence-publication-completeness.ts`,
      "utf8",
    ),
  ]);
  const schemaText = JSON.stringify(schema);
  const stimuli = declaredEnumValues(contractSource, "StimulusKind");
  const operations = declaredEnumMembers(programSource, "SemanticOperationKind");
  const failClosed = new Set(failClosedOperationNames(completenessSource));
  assert.ok(stimuli.length >= 10, "StimulusKind extraction lost current variants");
  assert.ok(operations.length >= 20, "SemanticOperationKind extraction lost current variants");
  for (const name of failClosed) {
    assert.ok(
      operations.some((member) => member.name === name),
      `${name} fails publication completeness but is not a declared operation kind`,
    );
  }
  for (const value of stimuli) {
    assert.ok(schemaText.includes(`/$defs/${value}\"`), `schema omits ${value}`);
  }
  // Exactly one of the two directions holds for every kind: publishable kinds must be enumerated, and
  // kinds that commit no transition must stay out so the schema cannot admit a record no producer can
  // emit.
  for (const { name, value } of operations) {
    if (failClosed.has(name)) {
      assert.ok(
        !schemaText.includes(`\"${value}\"`),
        `schema carries ${value} although its completeness arm fails closed`,
      );
      continue;
    }
    assert.ok(schemaText.includes(`\"${value}\"`), `schema omits ${value}`);
  }
  for (const value of [
    "externalStimulus",
    "internalOperation",
    "available",
    "notReady",
    "notFound",
    "unavailable",
    "gap",
    "bpmn-lean.execution-publication.v1",
  ]) {
    assert.ok(schemaText.includes(`\"${value}\"`), `schema omits ${value}`);
  }
  const integers = collectIntegerSchemas(schema);
  assert.ok(integers.length >= 2, "publication schema lost safe-integer definitions");
  for (const integer of integers) {
    assert.equal(typeof integer.maximum, "number");
    assert.ok(Number(integer.maximum) <= Number.MAX_SAFE_INTEGER);
  }
});

async function publicationValidator() {
  const [scenario, program, publication] = await Promise.all([
    readSchema("scenario.schema.json"),
    readSchema("semantic-process.schema.json"),
    readSchema("semantic-publication.schema.json"),
  ]);
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
  ajv.addSchema(scenario);
  ajv.addSchema(program);
  return ajv.compile(publication);
}

async function readSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/${name}`, "utf8"),
  ) as Record<string, unknown>;
}

function collectIntegerSchemas(value: unknown): Array<{ maximum?: unknown }> {
  if (Array.isArray(value)) {
    return value.flatMap(collectIntegerSchemas);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const record = value as Record<string, unknown>;
  return [
    ...(record.type === "integer" ? [record] : []),
    ...Object.values(record).flatMap(collectIntegerSchemas),
  ];
}
