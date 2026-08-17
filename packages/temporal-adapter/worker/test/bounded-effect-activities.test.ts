import assert from "node:assert/strict";
import test from "node:test";

import {
  EffectActivityResultKind,
  WorkflowChainBudgetKind,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectActivityImplementations,
  EffectActivityImplementationResult,
  EffectRequest,
} from "@bpmn-lean/temporal-protocol";
import { boundEffectActivities } from "../dist/index.js";

test("does not invoke an Activity for an oversized request", async () => {
  let invocations = 0;
  const activities: EffectActivityImplementations = {
    executeBpmnEffect: async () => {
      invocations += 1;
      return smallResult();
    },
  };
  const bounded = boundEffectActivities(activities, {
    requestBytes: 128,
    resultBytes: 128,
  });

  const result = await bounded.executeBpmnEffect(requestWithValue("x".repeat(128)));
  assert.equal(invocations, 0);
  assert.equal(result.kind, EffectActivityResultKind.CapacityExceeded);
  if (result.kind !== EffectActivityResultKind.CapacityExceeded) {
    assert.fail("expected request capacity result");
  }
  assert.equal(result.budget, WorkflowChainBudgetKind.EffectActivityRequestBytes);
});

test("replaces an oversized result before the Activity boundary returns", async () => {
  const oversized = resultWithValue("x".repeat(128));
  const activities: EffectActivityImplementations = {
    executeBpmnEffect: async () => oversized,
  };
  const bounded = boundEffectActivities(activities, {
    requestBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.EffectActivityRequestBytes,
    ),
    resultBytes: 64,
  });

  const result = await bounded.executeBpmnEffect(requestWithValue(""));
  assert.deepEqual(result, {
    kind: EffectActivityResultKind.CapacityExceeded,
    budget: WorkflowChainBudgetKind.EffectActivityResultBytes,
    configuredBound: 64,
    observedValue: workflowChainCanonicalUtf8ByteLength(oversized),
  });
});

function requestWithValue(value: string): EffectRequest {
  return {
    protocol: "urn:example:effect",
    operation: "write",
    idempotencyKey: `effect-transport-sha256:${"a".repeat(64)}`,
    arguments: [{ name: "payload", value: { kind: "string", value } }],
  };
}

function smallResult(): EffectActivityImplementationResult {
  return { kind: "success", localPatch: [] };
}

function resultWithValue(value: string): EffectActivityImplementationResult {
  return {
    kind: "success",
    localPatch: [{ name: "result", value: { kind: "string", value } }],
  };
}
