import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  declaredConstObjectValues,
  declaredEnumMembers,
  isRecord,
} from "./schema-structure.ts";

const scenarioSchemaId = "https://bpmn-lean.local/schemas/scenario.schema.json";

const definition = {
  compiler: "bpmn-source-semantic-process",
  semanticProfile: "profile-publication",
  sourceId: "source-publication",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;

const rootScope = {
  processInstanceId: "Instance_1",
  definitionScopeId: "Scope_Process_1",
  activation: 1,
} as const;

const emptyDelta = {
  consumedTokens: [],
  producedTokens: [],
  enteredScopes: [],
  exitedScopes: [],
} as const;

const startStimulus = {
  kind: "start",
  commandId: "command-start",
  instanceId: "Instance_1",
  variables: [],
} as const;

const state = {
  kind: "state",
  instanceId: "Instance_1",
  status: "running",
  logicalTimeMs: 0,
  variables: [],
  openWaits: [],
} as const;

function publicationPage() {
  return {
    definition,
    processId: "Process_1",
    processInstanceId: "Instance_1",
    requestedAfterRevision: 0,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [{
      commandId: "command-start",
      fromRevision: 0,
      throughRevision: 2,
      transitions: [{
        revision: 1,
        logicalTimeMs: 0,
        transition: { kind: "externalStimulus", stimulus: startStimulus },
        positionDelta: emptyDelta,
      }, {
        revision: 2,
        logicalTimeMs: 0,
        transition: {
          kind: "internalOperation",
          operationId: "Operation_Start",
          operationKind: "initiate",
          origin: { kind: "bpmnElement", elementId: "StartEvent_1" },
          owner: rootScope,
        },
        positionDelta: {
          consumedTokens: [],
          producedTokens: [{ sequenceFlowId: "Flow_1", owner: rootScope, multiplicity: 1 }],
          enteredScopes: [{ id: rootScope, parent: null, bpmnElementId: "Process_1" }],
          exitedScopes: [],
        },
      }],
    }],
    current: {
      revision: 2,
      state,
      controlTokens: [{ sequenceFlowId: "Flow_1", owner: rootScope, multiplicity: 1 }],
      scopes: [{ id: rootScope, parent: null, bpmnElementId: "Process_1" }],
    },
  } as const;
}

// Escapes the JSON writer must round-trip: control characters, quote, backslash and an astral scalar.
const escapedNote = "control:\u0001 short:\b\f\n\r\t quote:\" slash:\\ scalar:\u{1f600}";

function canonicalExportFixture() {
  const variables = [
    { name: "note", value: { kind: "string", value: escapedNote } },
    { name: "truth", value: { kind: "boolean", value: true } },
  ] as const;
  return {
    format: "bpmn-lean.execution-publication.v1",
    definition,
    processId: "Process_1",
    processInstanceId: "Instance_1",
    headRevision: 1,
    batches: [{
      commandId: "command-start",
      fromRevision: 0,
      throughRevision: 1,
      transitions: [{
        revision: 1,
        logicalTimeMs: 0,
        transition: { kind: "externalStimulus", stimulus: { ...startStimulus, variables } },
        positionDelta: emptyDelta,
      }],
    }],
    current: { revision: 1, state: { ...state, variables }, controlTokens: [], scopes: [] },
  } as const;
}

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

function leanPublishedOperations(
  publicationSource: string,
): ReadonlyMap<string, string> {
  return new Map(
    [...publicationSource.matchAll(
      /\|\s+\.([A-Za-z0-9_]+)\s+=>\s+some\s+\(toJson\s+"([^"]+)"\)/gu,
    )].map((match) => {
      const [, name, value] = match;
      assert.ok(name !== undefined);
      assert.ok(value !== undefined);
      return [name, value];
    }),
  );
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
  const [
    schema,
    scenarioSchema,
    vocabulary,
    programSource,
    completenessSource,
    leanPublicationSource,
  ] = await Promise.all([
    readSchema("semantic-publication.schema.json"),
    readSchema("scenario.schema.json"),
    readSchema("vocabulary.schema.json"),
    readFile(`${projectRoot}/packages/semantic-core/src/semantic-process-contract.ts`, "utf8"),
    readFile(
      `${projectRoot}/packages/semantic-core/src/flow-node-occurrence-publication-completeness.ts`,
      "utf8",
    ),
    readFile(
      `${projectRoot}/BpmnSemantics/SemanticProcessJson/Publication.lean`,
      "utf8",
    ),
  ]);
  const schemaText = JSON.stringify(schema);
  const stimuli = inputKinds(vocabulary);
  const operations = declaredEnumMembers(programSource, "SemanticOperationKind");
  const failClosed = new Set(failClosedOperationNames(completenessSource));
  const leanPublished = leanPublishedOperations(leanPublicationSource);
  assert.ok(stimuli.length >= 5, "inputKind extraction lost current variants");
  assert.ok(operations.length >= 20, "SemanticOperationKind extraction lost current variants");
  for (const name of failClosed) {
    assert.ok(
      operations.some((member) => member.name === name),
      `${name} fails publication completeness but is not a declared operation kind`,
    );
  }
  // The publication carries the scenario's one stimulus union by reference, so its coverage is that union's: every
  // kernel input kind has exactly one arm, and the arm's discriminant is the kind.
  assert.ok(
    schemaText.includes(`\"${scenarioSchemaId}#/$defs/stimulus\"`),
    "publication schema does not reference the scenario stimulus union",
  );
  assert.deepEqual(stimulusArmNames(scenarioSchema), [...stimuli].sort());
  assert.ok(isRecord(scenarioSchema.$defs));
  for (const value of stimuli) {
    const arm: unknown = scenarioSchema.$defs[value];
    assert.ok(isRecord(arm) && isRecord(arm.properties), `scenario schema omits the ${value} arm`);
    assert.deepEqual(arm.properties.kind, { const: value });
  }
  // Exactly one of the two directions holds for every kind: publishable kinds must be enumerated, and
  // kinds that commit no transition must stay out so the schema cannot admit a record no producer can
  // emit.
  for (const { name, value } of operations) {
    // ACTH-HOST-01, SCPH-HOST-01: a host or exit publishes its work's legacy kind, so its discriminant is never a
    // published kind.
    if (value === "activity" || value === "scope" || value === "scopeExit") {
      assert.ok(!schemaText.includes(`\"${value}\"`), `schema carries the ${value} discriminant`);
      assert.ok(!leanPublished.has(value), `Lean publishes the ${value} discriminant`);
      continue;
    }
    if (failClosed.has(name)) {
      assert.ok(
        !schemaText.includes(`\"${value}\"`),
        `schema carries ${value} although its completeness arm fails closed`,
      );
      assert.ok(
        !leanPublished.has(value),
        `Lean publishes ${value} although its completeness arm fails closed`,
      );
      continue;
    }
    assert.ok(schemaText.includes(`\"${value}\"`), `schema omits ${value}`);
    assert.equal(leanPublished.get(value), value, `Lean publication omits ${value}`);
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

test("keeps the Product 2 operation-kind copy synchronized in the shared gate", async () => {
  const [schema, platformSource] = await Promise.all([
    readSchema("semantic-publication.schema.json"),
    readFile(
      `${projectRoot}/platform/contracts/src/execution-publications.ts`,
      "utf8",
    ),
  ]);
  const producerValues = internalOperationKindValues(schema);
  const copiedValues = declaredConstObjectValues(platformSource, "SemanticOperationKind");
  assert.ok(copiedValues.length >= 20, "Product 2 operation-kind extraction lost current variants");
  assert.deepEqual(operationKindDrift(producerValues, copiedValues), {
    missing: [],
    extra: [],
  });

  const omitted = platformSource.replace(
    '  AwaitCorrelatedPayloadMessage: "awaitCorrelatedPayloadMessage",\n',
    "",
  );
  assert.notEqual(omitted, platformSource, "operation-kind mutation did not apply");
  assert.deepEqual(
    operationKindDrift(
      producerValues,
      declaredConstObjectValues(omitted, "SemanticOperationKind"),
    ),
    { missing: ["awaitCorrelatedPayloadMessage"], extra: [] },
  );
});

async function publicationValidator() {
  const [scenario, canonicalResult, program, publication] = await Promise.all([
    readSchema("scenario.schema.json"),
    readSchema("canonical-result.schema.json"),
    readSchema("semantic-process.schema.json"),
    readSchema("semantic-publication.schema.json"),
  ]);
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
  ajv.addSchema(scenario);
  ajv.addSchema(canonicalResult);
  ajv.addSchema(program);
  return ajv.compile(publication);
}

test("keeps the Product 2 committed-status copy synchronized with the producer", async () => {
  const [schema, source] = await Promise.all([
    readSchema("canonical-result.schema.json"),
    readFile(`${projectRoot}/platform/contracts/src/execution-publications.ts`, "utf8"),
  ]);
  assert.ok(isRecord(schema.$defs));
  const stateSchema = schema.$defs.state;
  assert.ok(isRecord(stateSchema) && isRecord(stateSchema.properties));
  const status = stateSchema.properties.status;
  assert.ok(isRecord(status) && Array.isArray(status.enum));
  assert.ok(status.enum.every((value) => typeof value === "string"));
  // A committed publication never carries a not-started instance, so the producer's whole enum is the committed set.
  const committed = status.enum.toSorted();
  assert.deepEqual(declaredConstObjectValues(source, "ProcessStatus").toSorted(), committed);
  for (const omitted of committed) {
    const changed = source.replace(new RegExp(`^  [A-Za-z]+: "${omitted}",\\n`, "mu"), "");
    assert.notEqual(changed, source);
    assert.notDeepEqual(declaredConstObjectValues(changed, "ProcessStatus").toSorted(), committed);
  }
});

async function readSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/${name}`, "utf8"),
  ) as Record<string, unknown>;
}

function inputKinds(vocabulary: Readonly<Record<string, unknown>>): ReadonlyArray<string> {
  assert.ok(isRecord(vocabulary.$defs));
  const inputKind = vocabulary.$defs.inputKind;
  assert.ok(isRecord(inputKind) && Array.isArray(inputKind.enum));
  assert.ok(inputKind.enum.every((value) => typeof value === "string"));
  return inputKind.enum;
}

function stimulusArmNames(scenarioSchema: Readonly<Record<string, unknown>>): ReadonlyArray<string> {
  assert.ok(isRecord(scenarioSchema.$defs));
  const union = scenarioSchema.$defs.stimulus;
  assert.ok(isRecord(union) && Array.isArray(union.oneOf));
  return union.oneOf.map((arm) => {
    assert.ok(isRecord(arm) && typeof arm.$ref === "string");
    return arm.$ref.slice("#/$defs/".length);
  }).toSorted();
}

function internalOperationKindValues(
  schema: Readonly<Record<string, unknown>>,
): ReadonlyArray<string> {
  assert.ok(isRecord(schema.$defs));
  const internalTransition = schema.$defs.internalTransition;
  assert.ok(isRecord(internalTransition));
  assert.ok(isRecord(internalTransition.properties));
  const operationKind = internalTransition.properties.operationKind;
  assert.ok(isRecord(operationKind));
  assert.ok(Array.isArray(operationKind.enum));
  assert.ok(operationKind.enum.every((value) => typeof value === "string"));
  return operationKind.enum;
}

function operationKindDrift(
  producerValues: ReadonlyArray<string>,
  copiedValues: ReadonlyArray<string>,
): Readonly<{ missing: ReadonlyArray<string>; extra: ReadonlyArray<string> }> {
  const producer = new Set(producerValues);
  const copied = new Set(copiedValues);
  return {
    missing: producerValues.filter((value) => !copied.has(value)).toSorted(),
    extra: copiedValues.filter((value) => !producer.has(value)).toSorted(),
  };
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
