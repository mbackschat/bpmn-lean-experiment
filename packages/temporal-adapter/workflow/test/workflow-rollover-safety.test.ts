import assert from "node:assert/strict";
import test from "node:test";

import { workflowRolloverPermitted } from "../dist/index.js";

test("permits only requested rollover with no managed host callback in flight", () => {
  assert.equal(workflowRolloverPermitted(false, false, false), false);
  assert.equal(workflowRolloverPermitted(false, true, false), false);
  assert.equal(workflowRolloverPermitted(true, false, false), true);
  assert.equal(workflowRolloverPermitted(true, true, false), false);
  assert.equal(workflowRolloverPermitted(true, false, true), false);
});
