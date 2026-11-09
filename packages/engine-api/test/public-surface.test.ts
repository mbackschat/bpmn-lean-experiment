/** The public entry point keeps host addresses private: only opaque locators cross it, and no SDK identity leaks. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import * as engineApi from "@bpmn-lean/engine-api";

test("exports opaque locator operations without a way to decode one", () => {
  assert.deepEqual(
    Object.keys(engineApi).filter((name) => name.toLowerCase().includes("locator")).sort(),
    [
      "engineProcessLocatorForCanonicalProcess",
      "engineProcessLocatorForWorkflowId",
      "parseEngineProcessLocator",
      "serializeEngineProcessLocator",
    ],
  );
});

test("schedule and publication result declarations carry no Workflow, Run or SDK identity", async () => {
  for (const file of ["definition-correlated-message.d.ts", "definition-schedule.d.ts", "process-publication.d.ts", "process-work.d.ts"]) {
    const declaration = await readFile(new URL(`../dist/${file}`, import.meta.url), "utf8");
    const results = declaration.match(/export type Engine\w*Result[\s\S]*?;\n/gu) ?? [];
    assert.notDeepEqual(results, [], file);
    for (const result of results) {
      assert.deepEqual(result.match(/\b(?:firstExecutionRunId|runId|workflowId|taskQueue|handle|client)\b/gu) ?? [], [], file);
    }
  }
});
