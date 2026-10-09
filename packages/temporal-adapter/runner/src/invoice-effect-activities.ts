import { EffectExecutionResultKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { EffectActivityImplementations, EffectRequest } from "@bpmn-lean/temporal-protocol";

/**
 * Caller-supplied invoice handlers for the serial business-task proposal's Activity contract.
 * These pure business rules have no external effects, so retries need no deduplication store.
 * An integration that writes externally must honor the request's idempotency key at that boundary.
 */
export function createInvoiceEffectActivities(): EffectActivityImplementations {
  return {
    executeBpmnEffect: async (request) => {
      const payload = invoicePayload(request);
      let value: string;
      switch (request.operation) {
        case "invoiceValidator":
          value = /^INV-[0-9]+$/u.test(payload) ? "valid" : "rework";
          break;
        case "invoiceClassifier":
          if (payload !== "valid") throw new TypeError("Classification requires a validated invoice");
          value = "standard";
          break;
        default:
          throw new TypeError(`Unknown invoice operation: ${request.operation}`);
      }
      return { kind: EffectExecutionResultKind.Success,
        localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value } }] };
    },
  };
}

function invoicePayload(request: EffectRequest): string {
  if (request.protocol !== "urn:bpmn-lean:effect-protocol:activity-v1") {
    throw new TypeError(`Unsupported invoice effect protocol: ${request.protocol}`);
  }
  const payloads = request.arguments.filter(binding => binding.name === "payload");
  const [payload] = payloads;
  if (payloads.length !== 1 || payload === undefined || payload.value.kind !== VariableValueKind.String) {
    throw new TypeError("Invoice handler requires one string payload");
  }
  return payload.value.value;
}

/**
 * Implements the mixed-task business Error example's two independent review stages.
 * The example's request statuses select REVIEW_REQUIRED; Activity attempts and workflow identity never select business outcomes.
 */
export function createInvoiceRecoveryEffectActivities(): EffectActivityImplementations {
  return {
    executeBpmnEffect: async request => {
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
        return { kind: EffectExecutionResultKind.BpmnError, code: "REVIEW_REQUIRED",
          message: "Invoice requires correction",
          localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "correct" } }] };
      }
      return { kind: EffectExecutionResultKind.Success,
        localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "valid" } }] };
    },
  };
}
