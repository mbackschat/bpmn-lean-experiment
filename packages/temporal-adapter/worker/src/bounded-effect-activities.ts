import {
  EffectActivityCapacityPreflightKind,
  boundEffectActivityResult,
  effectActivityCapacityExceeded,
  preflightEffectActivityRequest,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectActivities,
  EffectActivityCapacityLimits,
  EffectActivityImplementations,
} from "@bpmn-lean/temporal-protocol";

/** Applies the host contract around every caller-supplied effect implementation. */
export function boundEffectActivities(
  activities: EffectActivityImplementations,
  limits?: EffectActivityCapacityLimits,
): EffectActivities {
  return {
    executeBpmnEffect: async (request) => {
      const requestPreflight = preflightEffectActivityRequest(request, limits);
      switch (requestPreflight.kind) {
        case EffectActivityCapacityPreflightKind.CapacityExceeded:
          return effectActivityCapacityExceeded(requestPreflight.failure);
        case EffectActivityCapacityPreflightKind.WithinCapacity:
          return boundEffectActivityResult(
            await activities.executeBpmnEffect(request),
            limits,
          );
        default:
          return assertNever(requestPreflight);
      }
    },
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported effect-capacity preflight: ${String(value)}`);
}
