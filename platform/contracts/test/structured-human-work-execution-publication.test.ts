import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeExecutionPublicationPage,
} from "@bpmn-lean/platform-contracts";

import {
  executionPublicationPage,
  publicationIdentity,
} from "./execution-publication-fixture.ts";

function withVariables(variables: readonly unknown[]): unknown {
  const page = executionPublicationPage();
  return {
    ...page,
    current: {
      ...page.current,
      state: { ...page.current?.state, variables },
    },
  };
}

test("decodes safe integers and ordered duplicate-preserving string lists", () => {
  const variables = [
    { name: "approvedAmount", value: { kind: "integer", value: 4250 } },
    {
      name: "riskFlags",
      value: { kind: "stringList", value: ["policy", "policy", "receipt"] },
    },
  ];
  const decoded = decodeExecutionPublicationPage(withVariables(variables), {
    ...publicationIdentity,
    afterRevision: 0,
  });
  assert.deepEqual(decoded.current?.state.variables, variables);
});

test("rejects invalid integer and string-list publication values", () => {
  const invalidValues = [
    { kind: "integer", value: -0 },
    { kind: "integer", value: -1 },
    { kind: "integer", value: 1.5 },
    { kind: "integer", value: Number.MAX_SAFE_INTEGER + 1 },
    { kind: "stringList", value: Array(33).fill("x") },
    { kind: "stringList", value: ["é".repeat(513)] },
    { kind: "stringList", value: Array(17).fill("x".repeat(1024)) },
  ];
  for (const [index, value] of invalidValues.entries()) {
    assert.throws(
      () => decodeExecutionPublicationPage(
        withVariables([{ name: `invalid${index}`, value }]),
        { ...publicationIdentity, afterRevision: 0 },
      ),
      JSON.stringify(value),
    );
  }
});
