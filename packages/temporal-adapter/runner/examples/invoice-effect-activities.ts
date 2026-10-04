import { EffectExecutionResultKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { EffectActivityImplementations } from "@bpmn-lean/temporal-protocol";

/**
 * Caller-supplied invoice handlers for the serial business-task proposal's Activity contract.
 * These pure business rules have no external effects, so retries need no deduplication store.
 * An integration that writes externally must honor the request's idempotency key at that boundary.
 */
export function createInvoiceEffectActivities(): EffectActivityImplementations {
  return {
    executeBpmnEffect: async (request) => {
      if (request.protocol !== "urn:bpmn-lean:effect-protocol:activity-v1") {
        throw new TypeError(`Unsupported invoice effect protocol: ${request.protocol}`);
      }
      const payloads = request.arguments.filter(binding => binding.name === "payload");
      const [payload] = payloads;
      if (payloads.length !== 1 || payload === undefined
        || payload.value.kind !== VariableValueKind.String) {
        throw new TypeError("Invoice handler requires one string payload");
      }
      let value: string;
      switch (request.operation) {
        case "invoiceValidator":
          value = /^INV-[0-9]+$/u.test(payload.value.value) ? "valid" : "rework";
          break;
        case "invoiceClassifier":
          if (payload.value.value !== "valid") throw new TypeError("Classification requires a validated invoice");
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
