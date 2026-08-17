import assert from "node:assert/strict";
import test from "node:test";

import {
  EffectExecutionResultKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  EffectActivityResultKind,
  WorkflowChainBudgetKind,
  bpmnEffectExecutionExhaustedFailureType,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectActivityResult,
  EffectRequest,
} from "@bpmn-lean/temporal-protocol";
import {
  effectActivityExhaustionFailure,
  executeEffectWithinCapacity,
} from "../dist/index.js";

test("refuses an oversized request before invoking the Activity proxy", async () => {
  const request = requestAtBytes(
    workflowChainProductionLimit(
      WorkflowChainBudgetKind.EffectActivityRequestBytes,
    ) + 1,
  );
  let invocations = 0;
  const failure = Symbol("capacity");
  await assert.rejects(
    executeEffectWithinCapacity(
      request,
      async () => {
        invocations += 1;
        return { kind: EffectExecutionResultKind.Success, localPatch: [] };
      },
      (observed) => {
        assert.deepEqual(observed, {
          budget: WorkflowChainBudgetKind.EffectActivityRequestBytes,
          configuredBound: 64 * 1_024,
          observedValue: 64 * 1_024 + 1,
        });
        throw failure;
      },
    ),
    (error) => error === failure,
  );
  assert.equal(invocations, 0);
});

test("revalidates raw and Worker-bounded oversized results", async () => {
  const oversized = resultAtBytes(
    workflowChainProductionLimit(
      WorkflowChainBudgetKind.EffectActivityResultBytes,
    ) + 1,
  );
  const expected = {
    budget: WorkflowChainBudgetKind.EffectActivityResultBytes,
    configuredBound: 64 * 1_024,
    observedValue: 64 * 1_024 + 1,
  } as const;
  for (const result of [
    oversized,
    { kind: EffectActivityResultKind.CapacityExceeded, ...expected },
  ] as const) {
    const failure = Symbol("capacity");
    await assert.rejects(
      executeEffectWithinCapacity(
        requestAtBytes(512),
        async () => result,
        (observed) => {
          assert.deepEqual(observed, expected);
          throw failure;
        },
      ),
      (error) => error === failure,
    );
  }
});

test("emits a fixed exhausted-Activity failure without the original cause", () => {
  const nested = new Error("x".repeat(100_000), {
    cause: new Error("y".repeat(100_000)),
  });
  const failure = effectActivityExhaustionFailure(nested);
  assert.equal(failure.type, bpmnEffectExecutionExhaustedFailureType);
  assert.equal(failure.nonRetryable, true);
  assert.equal(failure.cause, undefined);
  assert.deepEqual(failure.details, [{
    failureType: bpmnEffectExecutionExhaustedFailureType,
    message: "Effect Activity exhausted its bounded execution policy",
  }]);
});

function requestAtBytes(target: number): EffectRequest {
  return valueAtBytes(target, (value) => ({
    protocol: "urn:example:effect",
    operation: "write",
    idempotencyKey: `effect-transport-sha256:${"a".repeat(64)}`,
    arguments: [{
      name: "payload",
      value: { kind: VariableValueKind.String, value },
    }],
  }));
}

function resultAtBytes(target: number): EffectActivityResult {
  return valueAtBytes(target, (value) => ({
    kind: EffectExecutionResultKind.Success,
    localPatch: [{
      name: "result",
      value: { kind: VariableValueKind.String, value },
    }],
  }));
}

function valueAtBytes<T>(target: number, build: (value: string) => T): T {
  const overhead = workflowChainCanonicalUtf8ByteLength(build(""));
  const value = build("x".repeat(target - overhead));
  assert.equal(workflowChainCanonicalUtf8ByteLength(value), target);
  return value;
}
