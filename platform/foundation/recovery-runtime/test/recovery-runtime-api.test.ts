import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RecoveryHandlerOutcomeKind,
  RecoveryLoop,
} from "../dist/index.js";

test("exports the bounded recovery loop contract", () => {
  assert.equal(RecoveryHandlerOutcomeKind.Complete, "complete");
  assert.equal(typeof RecoveryLoop, "function");
});
