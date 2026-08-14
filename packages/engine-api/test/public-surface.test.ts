/** The public Product 1 entry point keeps hosting-address construction and decoding private. */
import assert from "node:assert/strict";
import { test } from "node:test";

import * as engineApi from "@bpmn-lean/engine-api";

test("exports opaque locator operations without a generic host-address escape", () => {
  assert.deepEqual(
    Object.keys(engineApi).filter((name) => name.toLowerCase().includes("locator")),
    [
      "engineProcessLocatorForCanonicalProcess",
      "engineProcessLocatorForScheduleExecution",
      "engineProcessWorkLocatorForCanonicalProcess",
      "engineProcessWorkLocatorForScheduleExecution",
      "parseEngineProcessLocator",
      "parseEngineProcessWorkLocator",
      "serializeEngineProcessLocator",
      "serializeEngineProcessWorkLocator",
    ],
  );
});
