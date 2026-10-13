/**
 * Locks the Product 2 boundary against the engine's recursive portable value arms: until a Product 2 journey selects
 * them, every decoder fails closed on a well-formed Decimal, List or Map instead of coercing, flattening or dropping it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeDefinitionVersionStartCommand,
  decodeExecutionPublicationPage,
  decodePublicFormValue,
} from "@bpmn-lean/platform-contracts";

import {
  executionPublicationPage,
  publicationIdentity,
} from "./execution-publication-fixture.ts";

const order = {
  kind: "map",
  value: [
    { name: "address", value: { kind: "map", value: [{ name: "line2", value: { kind: "null" } }] } },
    { name: "items", value: { kind: "list", value: [{ kind: "string", value: "A" }, { kind: "string", value: "A" }] } },
    { name: "total", value: { kind: "decimal", coefficient: "12345", scale: 2 } },
  ],
} as const;
const portableValues = [
  order,
  { kind: "decimal", coefficient: "-125", scale: 2 },
  { kind: "list", value: [] },
  { kind: "map", value: [] },
] as const;

function publicationWithVariable(value: unknown): unknown {
  const page = executionPublicationPage();
  return {
    ...page,
    current: { ...page.current, state: { ...page.current?.state, variables: [{ name: "order", value }] } },
  };
}

test("refuses a recursive portable value in a Process start command", () => {
  for (const value of portableValues) {
    assert.throws(
      () => decodeDefinitionVersionStartCommand({ initialVariables: [{ name: "order", value }] }),
      /kind is unknown/u,
      value.kind,
    );
  }
});

test("refuses a recursive portable value in a decoded execution publication", () => {
  for (const value of portableValues) {
    assert.throws(
      () => decodeExecutionPublicationPage(publicationWithVariable(value), { ...publicationIdentity, afterRevision: 0 }),
      /kind is unknown/u,
      value.kind,
    );
  }
});

test("refuses a recursive portable value as a public Work form value", () => {
  for (const value of portableValues) {
    assert.throws(() => decodePublicFormValue(value), TypeError, value.kind);
  }
});
