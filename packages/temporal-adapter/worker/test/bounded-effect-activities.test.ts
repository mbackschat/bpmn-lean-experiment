import assert from "node:assert/strict";
import test from "node:test";
import {
  ApplicationFailure,
  CancelledFailure,
  CompleteAsyncError,
  DefaultFailureConverter,
  defaultPayloadConverter,
  ensureApplicationFailure,
} from "@temporalio/common";
import proto from "@temporalio/proto";

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


async function rejectedImplementation(error: unknown): Promise<Error> {
  const bounded = boundEffectActivities({ executeBpmnEffect: async () => { throw error; } });
  try { await bounded.executeBpmnEffect(requestWithValue("")); }
  catch (failure) { assert.ok(failure instanceof Error); return failure; }
  return assert.fail("Expected a bounded implementation failure");
}

function assertBoundedFailure(failure: Error): void {
  assert.ok(Buffer.byteLength(failure.message, "utf8") <= 256);
  assert.equal(failure.stack, "");
  assert.equal(failure.cause, undefined);
  assert.equal(Reflect.get(failure, "failure"), undefined, "an original serialized SDK Failure must not bypass normalization");
}

test("bounds a thrown implementation Error before the Worker can serialize its message, stack and cause", async () => {
  const original = new Error("message".repeat(200_000), { cause: new Error("cause".repeat(200_000)) });
  original.stack = "stack".repeat(200_000);
  const failure = await rejectedImplementation(original);
  assertBoundedFailure(failure);
  assert.ok(failure instanceof ApplicationFailure);
  assert.equal(failure.nonRetryable, false);
});

test("bounds native ApplicationFailure payloads while retaining retry and category controls", async () => {
  for (const nonRetryable of [false, true]) {
    const original = ApplicationFailure.create({ message: "message".repeat(200_000), type: "type".repeat(200_000),
      details: ["detail".repeat(200_000)], cause: new Error("cause".repeat(200_000)), nonRetryable,
      nextRetryDelay: "1200ms", category: "BENIGN" });
    original.failure = { message: "serialized".repeat(200_000) };
    const failure = await rejectedImplementation(original);
    assertBoundedFailure(failure);
    assert.ok(failure instanceof ApplicationFailure);
    assert.equal(failure.nonRetryable, nonRetryable);
    assert.equal(failure.nextRetryDelay, "1200ms");
    assert.equal(failure.category, "BENIGN");
    assert.deepEqual(failure.details ?? [], []);
    assert.ok(Buffer.byteLength(failure.type ?? "", "utf8") <= 256);
  }
});

test("keeps SDK cancellation and AbortError recognizable with bounded diagnostic content", async () => {
  const cancellation = await rejectedImplementation(new CancelledFailure("cancel".repeat(200_000), ["detail".repeat(200_000)]));
  assertBoundedFailure(cancellation);
  assert.ok(cancellation instanceof CancelledFailure);
  assert.deepEqual(cancellation.details, []);
  const abort = new Error("abort".repeat(200_000));
  abort.name = "AbortError";
  const failure = await rejectedImplementation(abort);
  assertBoundedFailure(failure);
  assert.equal(failure.name, "AbortError");
});

test("bounds the actual SDK failure protobuf for Unicode, cyclic and non-Error rejections", async () => {
  const circular: { cause?: unknown } = {};
  circular.cause = circular;
  for (const error of [
    new Error("€".repeat(1000)),
    new Error("😀".repeat(1000)),
    new Error("\ud800".repeat(1000)),
    "x".repeat(100_000),
    circular,
    null,
    ApplicationFailure.create({ message: "😀".repeat(1000), type: "€".repeat(1000),
      details: [circular], nonRetryable: true, nextRetryDelay: "1200ms", category: "BENIGN" }),
    new CancelledFailure("😀".repeat(1000), [circular]),
  ]) {
    const bounded = await rejectedImplementation(error);
    assertBoundedFailure(bounded);
    assert.equal(bounded.message.isWellFormed(), true);
    const converter = new DefaultFailureConverter();
    const serialized = converter.errorToFailure(bounded, defaultPayloadConverter);
    const bytes = proto.temporal.api.failure.v1.Failure.encode(serialized).finish();
    assert.ok(bytes.length <= 1024, `serialized failure occupies ${bytes.length} bytes`);
    assert.equal(serialized.cause, undefined);
    assert.equal(serialized.encodedAttributes, undefined);
    assert.equal(serialized.stackTrace, "");
    if (bounded instanceof ApplicationFailure) {
      assert.equal(serialized.applicationFailureInfo?.nonRetryable, bounded.nonRetryable);
      assert.equal(serialized.applicationFailureInfo?.details, undefined);
    } else {
      assert.ok(serialized.canceledFailureInfo);
      // Without a cancellation request Activity.run converts a thrown CancelledFailure to an application failure.
      const ordinaryFailure = converter.errorToFailure(ensureApplicationFailure(bounded), defaultPayloadConverter);
      assert.equal(ordinaryFailure.applicationFailureInfo?.nonRetryable, false);
      assert.ok(proto.temporal.api.failure.v1.Failure.encode(ordinaryFailure).finish().length <= 1024);
    }
  }
});

test("retains ordinary failure identity and leaves the implementation's original object untouched", async () => {
  const original = ApplicationFailure.create({ message: "failed", type: "BusinessUnavailable",
    details: ["diagnostic"], nonRetryable: true, nextRetryDelay: "1200ms", category: "BENIGN" });
  const stack = original.stack;
  const failure = await rejectedImplementation(original);
  assert.notStrictEqual(failure, original);
  assert.ok(failure instanceof ApplicationFailure);
  assert.equal(failure.type, "BusinessUnavailable");
  assert.equal(failure.message, "failed");
  assert.equal(original.stack, stack);
  assert.deepEqual(original.details, ["diagnostic"]);
  const encoded = new DefaultFailureConverter().errorToFailure(failure, defaultPayloadConverter);
  assert.equal(encoded.applicationFailureInfo?.nonRetryable, true);
  assert.equal(Number(encoded.applicationFailureInfo?.nextRetryDelay?.seconds), 1);
  assert.equal(encoded.applicationFailureInfo?.nextRetryDelay?.nanos, 200_000_000);
  assert.equal(encoded.applicationFailureInfo?.category,
    proto.temporal.api.enums.v1.ApplicationErrorCategory.APPLICATION_ERROR_CATEGORY_BENIGN);
});

test("bounds a failure even when reading its diagnostic fields throws", async () => {
  const error = new Error("unreadable");
  Object.defineProperty(error, "message", {
    get() { throw new Error("nested diagnostic failure".repeat(100_000)); },
  });
  assertBoundedFailure(await rejectedImplementation(error));
});

test("unreadable diagnostics preserve native retry controls and cancellation identity", async () => {
  for (const diagnostic of ["message", "type"]) {
    const original = ApplicationFailure.create({ message: "failed", type: "TransportFailure",
      nonRetryable: true, nextRetryDelay: "1200ms", category: "BENIGN" });
    Object.defineProperty(original, diagnostic, {
      get() { throw new Error("unreadable diagnostic"); },
    });
    const failure = await rejectedImplementation(original);
    assertBoundedFailure(failure);
    assert.ok(failure instanceof ApplicationFailure);
    assert.equal(failure.nonRetryable, true);
    assert.equal(failure.nextRetryDelay, "1200ms");
    assert.equal(failure.category, "BENIGN");
    const encoded = new DefaultFailureConverter().errorToFailure(failure, defaultPayloadConverter);
    assert.equal(encoded.applicationFailureInfo?.nonRetryable, true);
    assert.ok(proto.temporal.api.failure.v1.Failure.encode(encoded).finish().length <= 1024);
  }
  const abort = new Error("aborted");
  abort.name = "AbortError";
  for (const original of [new CancelledFailure("cancelled"), abort]) {
    Object.defineProperty(original, "message", {
      get() { throw new Error("unreadable diagnostic"); },
    });
    const failure = await rejectedImplementation(original);
    assertBoundedFailure(failure);
    if (original instanceof CancelledFailure) assert.ok(failure instanceof CancelledFailure);
    else assert.equal(failure.name, "AbortError");
    const encoded = new DefaultFailureConverter().errorToFailure(failure, defaultPayloadConverter);
    assert.ok(proto.temporal.api.failure.v1.Failure.encode(encoded).finish().length <= 1024);
  }
});

test("preserves native asynchronous completion without treating a matching name as SDK control", async () => {
  const control = new CompleteAsyncError();
  control.message = "diagnostic".repeat(100_000);
  const bounded = await rejectedImplementation(control);
  assert.ok(bounded instanceof CompleteAsyncError);
  assertBoundedFailure(bounded);
  const spoof = new Error("diagnostic".repeat(100_000));
  spoof.name = "CompleteAsyncError";
  const failure = await rejectedImplementation(spoof);
  assert.ok(failure instanceof ApplicationFailure);
  assertBoundedFailure(failure);
});
