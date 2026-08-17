import assert from "node:assert/strict";
import test from "node:test";

import {
  VariableValueKind,
  EffectExecutionResultKind,
} from "@bpmn-lean/semantic-core";
import {
  EffectActivityCapacityPreflightKind,
  EffectActivityResultKind,
  WorkflowChainBudgetKind,
  bpmnEffectExecutionExhaustedFailureType,
  boundEffectActivityResult,
  isEffectActivityCapacityExceeded,
  preflightEffectActivityRequest,
  preflightEffectActivityResult,
  projectEffectActivityFailure,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "../dist/index.js";
import type {
  EffectActivityResult,
  EffectRequest,
} from "../dist/index.js";

const requestLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.EffectActivityRequestBytes,
);
const resultLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.EffectActivityResultBytes,
);

test("measures exact request and result boundaries in canonical UTF-8 bytes", () => {
  const exactRequest = requestAtBytes(requestLimit);
  const oversizedRequest = requestAtBytes(requestLimit + 1);
  assert.deepEqual(preflightEffectActivityRequest(exactRequest), {
    kind: EffectActivityCapacityPreflightKind.WithinCapacity,
    observedValue: requestLimit,
  });
  assert.deepEqual(preflightEffectActivityRequest(oversizedRequest), {
    kind: EffectActivityCapacityPreflightKind.CapacityExceeded,
    failure: {
      budget: WorkflowChainBudgetKind.EffectActivityRequestBytes,
      configuredBound: requestLimit,
      observedValue: requestLimit + 1,
    },
  });

  const exactResult = resultAtBytes(resultLimit);
  const oversizedResult = resultAtBytes(resultLimit + 1);
  assert.deepEqual(preflightEffectActivityResult(exactResult), {
    kind: EffectActivityCapacityPreflightKind.WithinCapacity,
    observedValue: resultLimit,
  });
  assert.deepEqual(preflightEffectActivityResult(oversizedResult), {
    kind: EffectActivityCapacityPreflightKind.CapacityExceeded,
    failure: {
      budget: WorkflowChainBudgetKind.EffectActivityResultBytes,
      configuredBound: resultLimit,
      observedValue: resultLimit + 1,
    },
  });
});

test("replaces an oversized Activity result with one bounded host-only outcome", () => {
  const exact = resultAtBytes(resultLimit);
  assert.strictEqual(boundEffectActivityResult(exact), exact);

  const bounded = boundEffectActivityResult(resultAtBytes(resultLimit + 1));
  assert.equal(isEffectActivityCapacityExceeded(bounded), true);
  assert.deepEqual(bounded, {
    kind: EffectActivityResultKind.CapacityExceeded,
    budget: WorkflowChainBudgetKind.EffectActivityResultBytes,
    configuredBound: resultLimit,
    observedValue: resultLimit + 1,
  });
  assert.ok(workflowChainCanonicalUtf8ByteLength(bounded) < resultLimit);

  assert.equal(isEffectActivityCapacityExceeded({
    ...bounded,
    observedValue: resultLimit,
  }), false);
  assert.equal(isEffectActivityCapacityExceeded({
    ...bounded,
    runId: "private",
  }), false);
});

test("projects arbitrary Activity failures without reading or copying their cause graph", () => {
  let getterCalls = 0;
  const hostile = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(hostile, "cause", {
    enumerable: true,
    get: () => {
      getterCalls += 1;
      return { message: "x".repeat(100_000) };
    },
  });

  const projection = projectEffectActivityFailure(hostile);
  assert.equal(getterCalls, 0);
  assert.deepEqual(projection, {
    failureType: bpmnEffectExecutionExhaustedFailureType,
    message: "Effect Activity exhausted its bounded execution policy",
  });
  assert.ok(
    workflowChainCanonicalUtf8ByteLength(projection) <=
      workflowChainProductionLimit(
        WorkflowChainBudgetKind.EffectActivityFailureProjectionBytes,
      ),
  );
});

function requestAtBytes(target: number): EffectRequest {
  return valueAtBytes(target, requestWithValue);
}

function resultAtBytes(target: number): EffectActivityResult {
  return valueAtBytes(target, resultWithValue);
}

function requestWithValue(value: string): EffectRequest {
  return {
    protocol: "urn:example:effect",
    operation: "write",
    idempotencyKey: `effect-transport-sha256:${"a".repeat(64)}`,
    arguments: [{
      name: "payload",
      value: { kind: VariableValueKind.String, value },
    }],
  };
}

function resultWithValue(value: string): EffectActivityResult {
  return {
    kind: EffectExecutionResultKind.Success,
    localPatch: [{
      name: "result",
      value: { kind: VariableValueKind.String, value },
    }],
  };
}

function valueAtBytes<T>(target: number, build: (value: string) => T): T {
  const empty = build("");
  const overhead = workflowChainCanonicalUtf8ByteLength(empty);
  assert.ok(overhead < target);
  const value = build("x".repeat(target - overhead));
  assert.equal(workflowChainCanonicalUtf8ByteLength(value), target);
  return value;
}
