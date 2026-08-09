/**
 * Specifies the host-only mapping from semantic Process address to Temporal Workflow identity.
 *
 * The digest makes arbitrary semantic instance IDs safe as Workflow IDs without exposing host identity in semantic state.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalProcessAddressEncoding,
  processWorkflowId,
} from "@bpmn-lean/temporal-testkit";

test("derives one fixed collision-resistant Workflow ID from the Process address", () => {
  assert.equal(
    canonicalProcessAddressEncoding("Instance_1"),
    '["semanticProcessInstance","Instance_1"]',
  );
  assert.equal(
    processWorkflowId("Instance_1"),
    "bpmn-process-sha256:c60cac43b6a8aad7a143994a60c8176662bb13d6cd66672430343be72b038b34",
  );
  assert.notEqual(
    processWorkflowId("Instance_1"),
    processWorkflowId("Instance_2"),
  );
});

test("rejects an empty semantic Process address", () => {
  assert.throws(
    () => processWorkflowId(""),
    /non-empty semantic Process-instance ID/,
  );
});
