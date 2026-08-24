import assert from "node:assert/strict";
import test from "node:test";

import { workflowRolloverPermitted } from "../dist/index.js";

test("permits only requested rollover with no armed managed boundary deadline", () => {
  assert.equal(workflowRolloverPermitted(false, false), false);
  assert.equal(workflowRolloverPermitted(false, true), false);
  assert.equal(workflowRolloverPermitted(true, false), true);
  assert.equal(workflowRolloverPermitted(true, true), false);
});
