import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const definition = {
  ref: { definitionKey: "Process_1", version: 1, sha256: "a".repeat(64) },
  profile: "profile-publication",
  sourceOverlay: null,
} as const;

const occurrence = {
  processInstanceId: "Instance_1",
  elementId: "StartEvent_1",
  activation: 1,
  role: "element",
} as const;

function page() {
  return {
    definition,
    processInstanceId: "Instance_1",
    requestedAfterRevision: 0,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [{
      commandId: "command-start",
      fromRevision: 0,
      throughRevision: 1,
      transitions: [{
        revision: 1,
        started: [{ occurrence, owner: 0, sourceType: "startEvent" }],
        ended: [{ occurrence, terminal: "completed" }],
      }],
    }, {
      commandId: "command-again",
      fromRevision: 1,
      throughRevision: 2,
      transitions: [],
    }],
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
    { kind: "notFound" },
    { kind: "unavailable" },
    { kind: "gap" },
    { kind: "integrityFailure" },
  ]) {
    assert.equal(validate(document), true, JSON.stringify(validate.errors));
  }
  const [first] = validPage.batches;
  for (const malformed of [
    { afterRevision: 0, limit: 0 },
    { afterRevision: 0, limit: 101 },
    { ...validPage, privateAnchor: "forbidden" },
    { ...validPage, currentOpen: [] },
    { ...validPage, headRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...validPage, batches: [{ ...first, committedAtEpochMs: 0 }] },
    { ...validPage, batches: [{ ...first, transitions: [{ revision: 1, started: [{ occurrence: { ...occurrence, role: "body" }, owner: 0, sourceType: "task" }], ended: [] }] }] },
    { kind: "notReady" },
    { kind: "partial", page: validPage },
  ]) {
    assert.equal(validate(malformed), false, JSON.stringify(malformed));
  }
});

test("covers safe integers, terminal kinds, the kernel's occurrence roles, and forbids position identities", async () => {
  const [schema, kernelJournal] = await Promise.all([
    readSchema("flow-node-occurrence-publication.schema.json"),
    readFile(`${projectRoot}/packages/kernel/src/state/journal.ts`, "utf8"),
  ]);
  const text = JSON.stringify(schema);
  for (const expected of [
    ...inlineEnumValues(kernelJournal, "Terminal"),
    ...inlineEnumValues(kernelJournal, "ActivationRole"),
    "available",
    "notFound",
    "unavailable",
    "gap",
    "integrityFailure",
  ]) {
    assert.ok(text.includes(`\"${expected}\"`), `schema omits ${expected}`);
  }
  assert.doesNotMatch(text, /startRevision|startIndex|transitionIndex|localIndex/u);
  for (const integer of collectIntegerSchemas(schema)) {
    assert.equal(typeof integer.maximum, "number");
    assert.ok(Number(integer.maximum) <= Number.MAX_SAFE_INTEGER);
  }
});

/** The members of a one-line TypeScript string enum, as the kernel declares its small vocabularies. */
function inlineEnumValues(source: string, enumName: string): ReadonlyArray<string> {
  const match = new RegExp(`export enum ${enumName} \\{([^}]*)\\}`, "u").exec(source);
  assert.ok(match?.[1] !== undefined, `${enumName} is not declared as a one-line enum`);
  return [...match[1].matchAll(/[A-Za-z0-9_]+ = "([A-Za-z0-9_]+)"/gu)].map((member) => member[1] ?? "");
}

async function validator() {
  const publication = await readSchema("flow-node-occurrence-publication.schema.json");
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
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
