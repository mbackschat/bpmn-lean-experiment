import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";

import { compareCanonicalStrings } from "./contract-artifacts.ts";
import {
  declaredEnumValues,
  isRecord,
  reachableDiscriminators,
} from "./schema-structure.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("direct Activity data endpoints distinguish Property and directional Process ports", async () => {
  for (const schema of ["checked-process.schema.json", "semantic-process.schema.json"]) {
    const document: unknown = JSON.parse(await readFile(`${projectRoot}/contracts/schemas/${schema}`, "utf8"));
    assert.ok(isRecord(document));
    assert.ok(isRecord(document.$defs));
    const ajv = new Ajv2020({ strict: true });
    const input = ajv.compile({ $defs: document.$defs, $ref: "#/$defs/directActivityDataInput" });
    const output = ajv.compile({ $defs: document.$defs, $ref: "#/$defs/directActivityDataOutput" });
    const inputBase = { associationId: "Read", targetDataInputId: "TaskInput", targetDataInputName: null };
    const outputBase = { associationId: "Write", sourceDataOutputId: "TaskOutput", sourceDataOutputName: null };
    for (const source of [{ kind: "property", propertyId: "Request" }, { kind: "processDataInput", dataInputId: "ProcessInput" }]) {
      assert.equal(input({ ...inputBase, source }), true, `${schema}: ${JSON.stringify(input.errors)}`);
    }
    for (const target of [{ kind: "property", propertyId: "Result" }, { kind: "processDataOutput", dataOutputId: "ProcessOutput" }]) {
      assert.equal(output({ ...outputBase, target }), true, `${schema}: ${JSON.stringify(output.errors)}`);
    }
    for (const source of [
      { kind: "processDataOutput", dataOutputId: "WrongDirection" },
      { kind: "processDataInput", dataInputId: "", propertyId: "Extra" },
      { kind: "property", propertyId: "Request", dataInputId: "Extra" },
      { kind: "property" },
    ]) assert.equal(input({ ...inputBase, source }), false, `${schema}: accepts invalid source`);
    for (const target of [
      { kind: "processDataInput", dataInputId: "WrongDirection" },
      { kind: "processDataOutput", dataOutputId: "" },
      { kind: "property", propertyId: "Result", dataOutputId: "Extra" },
      { kind: "property" },
    ]) assert.equal(output({ ...outputBase, target }), false, `${schema}: accepts invalid target`);
    assert.equal(input({ ...inputBase, sourcePropertyId: "Request" }), false);
    assert.equal(output({ ...outputBase, targetPropertyId: "Result" }), false);
    assert.equal(input({ ...inputBase, source: { kind: "property", propertyId: "Request" }, sourcePropertyId: "Request" }), false);
    assert.equal(output({ ...outputBase, target: { kind: "property", propertyId: "Result" }, targetPropertyId: "Result" }), false);
  }
});

/**
 * The projection guard is one-directional: it validates the artifacts that exist, so a semantic
 * variant with no registered artifact can be added to the code enums while both closed wire schemas
 * silently reject it. This closes that direction — every enum member must have a schema branch —
 * and is the reason the interrupting boundary Timer's operation and node kinds were absent from both
 * schemas while every other gate passed.
 */
test("gives every semantic operation and checked node kind a wire-schema branch", async () => {
  const [program, checked] = await Promise.all([
    readFile(
      `${projectRoot}/packages/semantic-core/src/semantic-process-contract.ts`,
      "utf8",
    ),
    readFile(
      `${projectRoot}/packages/semantic-core/src/checked-process-contract.ts`,
      "utf8",
    ),
  ]);
  const cases = [
    {
      schema: "semantic-process.schema.json",
      kinds: declaredEnumValues(program, "SemanticOperationKind"),
      anchor: "awaitBoundedUserTask",
    },
    {
      schema: "checked-process.schema.json",
      kinds: declaredEnumValues(checked, "CheckedNodeKind"),
      anchor: "timerBoundaryEvent",
    },
  ];
  for (const { schema, kinds, anchor } of cases) {
    // Anti-vacuity: an earlier version of this guard read an enum that was in scope only as a type,
    // so it compared an empty list and passed while both schemas were in fact missing a branch.
    assert.ok(kinds.length > 10, `${schema}: enum extraction returned ${kinds.length} members`);
    assert.ok(kinds.includes(anchor), `${schema}: enum extraction lost ${anchor}`);
    const document: unknown = JSON.parse(
      await readFile(`${projectRoot}/contracts/schemas/${schema}`, "utf8"),
    );
    assert.ok(isRecord(document));
    const definitions = document.$defs;
    assert.ok(isRecord(definitions));
    const discriminators = reachableDiscriminators(
      Object.fromEntries(
        Object.entries(document).filter(([key]) => key !== "$defs"),
      ),
      definitions,
    );
    const absent = kinds
      .filter((kind) => !discriminators.has(kind))
      .sort(compareCanonicalStrings);
    assert.deepEqual(absent, [], `${schema} has no branch for these kinds`);
  }
});

test("gives every internal scheduling mode an exact top-level schema value", async () => {
  const source = await readFile(
    `${projectRoot}/packages/semantic-core/src/semantic-process-contract.ts`,
    "utf8",
  );
  const declared = declaredEnumValues(source, "InternalSchedulingMode");
  assert.deepEqual(declared, [
    "rejectObservableChoice",
    "requireChoiceSchedule",
  ]);

  const document: unknown = JSON.parse(
    await readFile(
      `${projectRoot}/contracts/schemas/semantic-process.schema.json`,
      "utf8",
    ),
  );
  assert.ok(isRecord(document));
  assert.ok(isRecord(document.properties));
  const mode = document.properties.internalSchedulingMode;
  assert.ok(isRecord(mode));
  assert.deepEqual(mode.enum, declared);
  assert.ok(Array.isArray(document.required));
  assert.equal(document.required.includes("internalSchedulingMode"), true);
});

test("keeps correlated Message definition identity standalone and exact", async () => {
  const [scenarioDocument, programDocument] = await Promise.all([
    readFile(`${projectRoot}/contracts/schemas/scenario.schema.json`, "utf8"),
    readFile(`${projectRoot}/contracts/schemas/semantic-process.schema.json`, "utf8"),
  ]).then((documents) => documents.map((document) => JSON.parse(document) as unknown));
  assert.ok(isRecord(scenarioDocument));
  assert.ok(isRecord(programDocument));
  assert.ok(isRecord(scenarioDocument.$defs));
  assert.ok(isRecord(programDocument.$defs));

  const address = scenarioDocument.$defs.correlatedMessageAddress;
  assert.ok(isRecord(address));
  assert.ok(isRecord(address.properties));
  assert.deepEqual(address.properties.definition, {
    $ref: "#/$defs/programIdentity",
  });

  // Scenario schemas are compiled independently throughout the repository, so this identity must
  // stay local while remaining byte-for-byte equivalent modulo the historic definition-name case.
  const normalizeLocalReferenceCase = (value: unknown): unknown => JSON.parse(
    JSON.stringify(value).replaceAll("#/$defs/nonEmptyString", "#/$defs/nonemptyString"),
  ) as unknown;
  assert.deepEqual(
    normalizeLocalReferenceCase(scenarioDocument.$defs.programIdentity),
    programDocument.$defs.programIdentity,
  );
  assert.deepEqual(
    normalizeLocalReferenceCase(scenarioDocument.$defs.sourceOverlayIdentity),
    programDocument.$defs.sourceOverlayIdentity,
  );
});

test("keeps engine-population input closed and separate from single-instance scenarios", async () => {
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
    const: "enginePopulationScenario",
  });
  assert.equal(JSON.stringify(scenarioDocument).includes("enginePopulationScenario"), false);

  const serialized = JSON.stringify(populationDocument);
  for (const definition of [
    "bpmnResource",
    "startProcess",
    "deliverPayloadMessage",
    "correlatedMessageAddress",
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
