/**
 * Evaluation-only host simulation for exercising the existing effect retry and incident path.
 *
 * The first Activity invocation for each exact transport idempotency key reports a technical
 * failure. Later invocations for that key return a successful empty local patch. This state is
 * process-local demonstration state, not BPMN meaning or a production integration contract.
 */
import { EffectExecutionResultKind } from "@bpmn-lean/semantic-core";
import {
  EffectActivityResultKind,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectActivities,
  EffectRequest,
} from "@bpmn-lean/temporal-protocol";

export function createEvaluationEffectActivities(): EffectActivities {
  const invokedKeys = new Set<string>();
  return {
    executeBpmnEffect: async (request: EffectRequest) => {
      const key = snapshotKey(request.idempotencyKey);
      if (!invokedKeys.has(key)) {
        invokedKeys.add(key);
        return { kind: EffectActivityResultKind.TechnicalFailure };
      }
      return {
        kind: EffectExecutionResultKind.Success,
        localPatch: [],
      };
    },
  };
}

function snapshotKey(value: string): string {
  if (value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(
      "Effect idempotency key must be an exact well-formed nonempty string",
    );
  }
  return value;
}
