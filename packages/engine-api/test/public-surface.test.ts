/** The public Product 1 entry point keeps hosting-address construction and decoding private. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import * as engineApi from "@bpmn-lean/engine-api";

test("exports opaque locator operations without a generic host-address escape", () => {
  assert.deepEqual(
    Object.keys(engineApi).filter((name) => name.toLowerCase().includes("locator")),
    [
      "engineProcessLocatorForCanonicalProcess",
      "engineProcessWorkLocatorForCanonicalProcess",
      "parseEngineProcessLocator",
      "parseEngineProcessWorkLocator",
      "serializeEngineProcessLocator",
      "serializeEngineProcessWorkLocator",
    ],
  );
});

test("schedule result declarations expose only the opaque Process locator", async () => {
  const declaration = await readFile(
    new URL("../dist/definition-schedule.d.ts", import.meta.url),
    "utf8",
  );
  const result = declaration.match(
    /export type EngineDefinitionScheduleResult = (?<result>[\s\S]*?);\nexport type EngineDefinitionScheduleAddressRequest/u,
  )?.groups?.result;
  assert.notEqual(result, undefined);
  assert.deepEqual(
    result?.match(
      /\b(?:client|descriptor|directory|firstExecutionRunId|handle|recovery|runId|segment|workflowId)\b/gu,
    ) ?? [],
    [],
  );
  assert.match(result ?? "", /locator: EngineProcessLocator/u);
});
