import assert from "node:assert/strict";
import test from "node:test";

import { workflowRolloverPermitted } from "../dist/index.js";

test("permits only requested rollover with no managed host callback in flight", () => {
  assert.equal(workflowRolloverPermitted(safety({ requested: false })), false);
  assert.equal(
    workflowRolloverPermitted(safety({ managedBoundaryDeadlineArmed: true })),
    false,
  );
  assert.equal(workflowRolloverPermitted(safety()), true);
  assert.equal(
    workflowRolloverPermitted(safety({ managedReadinessCallbackPending: true })),
    false,
  );
  assert.equal(
    workflowRolloverPermitted(safety({ compensationActivityUnreconciled: true })),
    false,
  );
});

function safety(overrides: Partial<Parameters<typeof workflowRolloverPermitted>[0]> = {}) {
  return {
    requested: true,
    managedBoundaryDeadlineArmed: false,
    managedReadinessCallbackPending: false,
    compensationActivityUnreconciled: false,
    ...overrides,
  };
}
