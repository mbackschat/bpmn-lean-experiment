/**
 * Caller-supplied invoice handlers for the business-invoice journeys, moved from the old adapter's runner
 * (`packages/temporal-adapter/runner/src/invoice-effect-activities.ts`) onto the host's effect handler.
 *
 * These pure business rules have no external effects, so retries need no deduplication store; an integration that
 * writes externally must honour the request's idempotency key at that boundary. A thrown error is a transport failure
 * the host retries; business outcomes are returned, never thrown.
 */
import { EffectResultKind } from "@bpmn-lean/temporal-host/worker";
import type { EffectRequest, EffectResult } from "@bpmn-lean/temporal-host/worker";

import type { EffectHandler } from "./host-worker.ts";

/** The neutral effect protocol the kernel reader gives a configured Service Task (`kernel-reader/work.ts`). */
const activityProtocol = "urn:bpmn-lean:effect-protocol:activity-v1";

/** The serial invoice journey: validation, then classification of a validated invoice. */
export const invoiceEffects: EffectHandler = async (request) => {
  const payload = invoicePayload(request);
  switch (request.operation) {
    case "invoiceValidator":
      return success(/^INV-[0-9]+$/u.test(payload) ? "valid" : "rework");
    case "invoiceClassifier":
      if (payload !== "valid") throw new TypeError("Classification requires a validated invoice");
      return success("standard");
    default:
      throw new TypeError(`Unknown invoice operation: ${request.operation}`);
  }
};

/**
 * The mixed-task business Error journey's two independent review stages. The request's payload selects
 * REVIEW_REQUIRED; Activity attempts and Workflow identity never select a business outcome.
 */
export const invoiceRecoveryEffects: EffectHandler = async (request) => {
  const payload = invoicePayload(request);
  let requiresReview: boolean;
  switch (request.operation) {
    case "invoiceValidator":
      requiresReview = payload === "missing-reference";
      break;
    case "policyChecker":
      requiresReview = payload === "policy-review";
      break;
    default:
      throw new TypeError(`Unknown invoice operation: ${request.operation}`);
  }
  if (requiresReview) {
    return {
      kind: EffectResultKind.BusinessFailure,
      code: "REVIEW_REQUIRED",
      message: "Invoice requires correction",
      outputs: [{ name: "result", value: { kind: "string", value: "correct" } }],
    };
  }
  return success("valid");
};

function success(value: string): EffectResult {
  return { kind: EffectResultKind.Success, outputs: [{ name: "result", value: { kind: "string", value } }] };
}

function invoicePayload(request: EffectRequest): string {
  if (request.protocol !== activityProtocol) {
    throw new TypeError(`Unsupported invoice effect protocol: ${request.protocol}`);
  }
  const payloads = request.arguments.filter((binding) => binding.name === "payload");
  const value = payloads[0]?.value;
  if (
    payloads.length !== 1 || value === null || typeof value !== "object" || Array.isArray(value) ||
    (value as { readonly kind?: unknown }).kind !== "string" ||
    typeof (value as { readonly value?: unknown }).value !== "string"
  ) {
    throw new TypeError("Invoice handler requires one string payload");
  }
  return (value as { readonly value: string }).value;
}
