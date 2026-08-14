import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const definition = {
  compiler: "bpmn-source-semantic-process",
  semanticProfile: "profile-publication",
  sourceId: "source-publication",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;

const owner = {
  processInstanceId: "Instance_1",
  definitionScopeId: "Scope_Process_1",
  activation: 1,
} as const;

function page() {
  return {
    definition,
    processId: "Process_1",
    processInstanceId: "Instance_1",
    requestedAfterRevision: 0,
    pageThroughRevision: 1,
    headRevision: 1,
    batches: [{
      commandId: "command-start",
      fromRevision: 0,
      throughRevision: 1,
      committedAtEpochMs: 1_000,
      transitions: [{
        revision: 1,
        lifecycle: {
          started: [{
            id: {
              processInstanceId: "Instance_1",
              startRevision: 1,
              startIndex: 0,
            },
            processId: "Process_1",
            elementId: "StartEvent_1",
            owner,
          }],
          ended: [{
            id: {
              processInstanceId: "Instance_1",
              startRevision: 1,
              startIndex: 0,
            },
            terminal: "completed",
          }],
        },
      }],
    }],
    currentOpen: [],
  } as const;
}

test("validates the strict request, page, and five closed result arms", async () => {
  const validate = await validator();
  const validPage = page();
  for (const document of [
    { afterRevision: 0 },
    { afterRevision: Number.MAX_SAFE_INTEGER, limit: 100 },
    validPage,
    { kind: "available", page: validPage },
    { kind: "notReady" },
    { kind: "notFound" },
    { kind: "unavailable" },
    { kind: "gap" },
  ]) {
    assert.equal(validate(document), true, JSON.stringify(validate.errors));
  }
  for (const malformed of [
    { afterRevision: 0, limit: 0 },
    { afterRevision: 0, limit: 101 },
    { ...validPage, privateAnchor: "forbidden" },
    { ...validPage, currentOpen: undefined },
    { ...validPage, headRevision: Number.MAX_SAFE_INTEGER + 1 },
    { kind: "partial", page: validPage },
  ]) {
    assert.equal(validate(malformed), false);
  }
});

test("covers safe integers, terminal kinds, and forbids semantic anchors", async () => {
  const schema = await readSchema(
    "flow-node-occurrence-publication.schema.json",
  );
  const text = JSON.stringify(schema);
  for (const expected of [
    "completed",
    "cancelled",
    "available",
    "notReady",
    "notFound",
    "unavailable",
    "gap",
  ]) {
    assert.ok(text.includes(`\"${expected}\"`), `schema omits ${expected}`);
  }
  assert.doesNotMatch(
    text,
    /SemanticFlowNodeOccurrenceAnchor|transitionIndex|localIndex/u,
  );
  for (const integer of collectIntegerSchemas(schema)) {
    assert.equal(typeof integer.maximum, "number");
    assert.ok(Number(integer.maximum) <= Number.MAX_SAFE_INTEGER);
  }
});

async function validator() {
  const [program, publication] = await Promise.all([
    readSchema("semantic-process.schema.json"),
    readSchema("flow-node-occurrence-publication.schema.json"),
  ]);
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
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
