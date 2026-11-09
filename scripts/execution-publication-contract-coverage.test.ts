import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import { declaredConstObjectValues, isRecord } from "./schema-structure.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const definition = {
  ref: { definitionKey: "Process_1", version: 1, sha256: "a".repeat(64) },
  profile: "profile-publication",
  sourceOverlay: null,
} as const;

const state = {
  kind: "state",
  instanceId: "Instance_1",
  status: "running",
  logicalTimeMs: 0,
  variables: [{ name: "note", value: { kind: "string", value: "escaped   note" } }],
  scopes: [],
  openWaits: [],
} as const;

function publicationPage() {
  return {
    definition,
    processInstanceId: "Instance_1",
    requestedAfterRevision: 0,
    pageThroughRevision: 3,
    headRevision: 3,
    batches: [{
      commandId: "command-start",
      fromRevision: 0,
      throughRevision: 3,
      transitions: [
        { revision: 1, role: { kind: "input", input: "start" }, element: "StartEvent_1", sourceType: "startEvent", owner: 0 },
        { revision: 2, role: { kind: "signal", signal: "armScope" }, element: null, sourceType: null, owner: 0 },
        { revision: 3, role: { kind: "arrive", flow: "Flow_1" }, element: "Task_1", sourceType: "userTask", owner: 0 },
      ],
    }],
    current: { revision: 3, state },
  } as const;
}

function exportFixture() {
  const { requestedAfterRevision: _requested, pageThroughRevision: _through, ...page } = publicationPage();
  return { format: "bpmn-lean.execution-publication", ...page };
}

test("validates the closed page, result, and full-export structures", async () => {
  const validate = await publicationValidator();
  const page = publicationPage();
  for (const document of [
    { afterRevision: 0 },
    { afterRevision: Number.MAX_SAFE_INTEGER, limit: 100 },
    page,
    { ...page, current: null },
    { kind: "available", page },
    { kind: "notFound" },
    { kind: "unavailable" },
    { kind: "gap" },
    { kind: "integrityFailure" },
    exportFixture(),
  ]) {
    assert.equal(validate(document), true, JSON.stringify(validate.errors));
  }

  const [batch] = page.batches;
  for (const malformed of [
    { ...page, owner: "extra" },
    { afterRevision: 0, limit: 0 },
    { afterRevision: 0, limit: 101 },
    { ...page, current: undefined },
    { ...page, headRevision: null },
    { ...page, headRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...page, definition: { ...definition, ref: { ...definition.ref, version: null } } },
    { ...page, batches: [{ ...batch, transitions: [{ ...batch.transitions[0], role: { kind: "input", input: "fire" } }] }] },
    { ...page, batches: [{ ...batch, transitions: [{ ...batch.transitions[0], logicalTimeMs: 0 }] }] },
    { kind: "notReady" },
    { kind: "partial", page },
    { ...exportFixture(), format: "bpmn-lean.execution-publication.v1" },
  ]) {
    assert.equal(validate(malformed), false, JSON.stringify(malformed));
  }
});

test("publishes every kernel cause as a role, with the vocabulary's input kinds", async () => {
  const [schema, vocabulary, kernelState] = await Promise.all([
    readSchema("semantic-publication.schema.json"),
    readSchema("vocabulary.schema.json"),
    readFile(`${projectRoot}/packages/kernel/src/state.ts`, "utf8"),
  ]);
  assert.deepEqual(roleArms(schema).map(({ kind }) => kind).toSorted(), inlineEnumValues(kernelState, "CauseTag").toSorted());
  const input = roleArms(schema).find(({ kind }) => kind === "input");
  assert.deepEqual(input?.input, inputKinds(vocabulary));
  const integers = collectIntegerSchemas(schema);
  assert.ok(integers.length >= 2, "publication schema lost safe-integer definitions");
  for (const integer of integers) {
    assert.equal(typeof integer.maximum, "number");
    assert.ok(Number(integer.maximum) <= Number.MAX_SAFE_INTEGER);
  }
});

test("keeps the Product 2 role and input copies synchronized with the producer schema", async () => {
  const [schema, source] = await Promise.all([
    readSchema("semantic-publication.schema.json"),
    readFile(`${projectRoot}/platform/contracts/src/execution-publications.ts`, "utf8"),
  ]);
  const arms = roleArms(schema);
  assert.deepEqual(declaredConstObjectValues(source, "ExecutionRoleKind").toSorted(), arms.map(({ kind }) => kind).toSorted());
  const input = arms.find(({ kind }) => kind === "input")?.input ?? [];
  assert.deepEqual(declaredConstObjectValues(source, "ExecutionInputKind").toSorted(), [...input].toSorted());
});

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

async function publicationValidator() {
  const [scenario, canonicalResult, publication] = await Promise.all([
    readSchema("scenario.schema.json"),
    readSchema("canonical-result.schema.json"),
    readSchema("semantic-publication.schema.json"),
  ]);
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
  ajv.addSchema(scenario);
  ajv.addSchema(canonicalResult);
  return ajv.compile(publication);
}

async function readSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/${name}`, "utf8"),
  ) as Record<string, unknown>;
}

/** The members of a one-line TypeScript string enum, as the kernel declares its small vocabularies. */
function inlineEnumValues(source: string, enumName: string): ReadonlyArray<string> {
  const match = new RegExp(`export enum ${enumName} \\{([^}]*)\\}`, "u").exec(source);
  assert.ok(match?.[1] !== undefined, `${enumName} is not declared as a one-line enum`);
  return [...match[1].matchAll(/[A-Za-z0-9_]+ = "([A-Za-z0-9_]+)"/gu)].map((member) => member[1] ?? "");
}

function inputKinds(vocabulary: Readonly<Record<string, unknown>>): ReadonlyArray<string> {
  assert.ok(isRecord(vocabulary.$defs));
  const inputKind = vocabulary.$defs.inputKind;
  assert.ok(isRecord(inputKind) && Array.isArray(inputKind.enum));
  assert.ok(inputKind.enum.every((value) => typeof value === "string"));
  return inputKind.enum;
}

function roleArms(schema: Readonly<Record<string, unknown>>): ReadonlyArray<Readonly<{ kind: string; input?: ReadonlyArray<unknown> }>> {
  assert.ok(isRecord(schema.$defs));
  const role = schema.$defs.role;
  assert.ok(isRecord(role) && Array.isArray(role.oneOf));
  return role.oneOf.map((arm) => {
    assert.ok(isRecord(arm) && isRecord(arm.properties));
    const kind = arm.properties.kind;
    assert.ok(isRecord(kind) && typeof kind.const === "string");
    const input = arm.properties.input;
    if (!isRecord(input)) return { kind: kind.const };
    assert.ok(Array.isArray(input.enum));
    return { kind: kind.const, input: input.enum };
  });
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
