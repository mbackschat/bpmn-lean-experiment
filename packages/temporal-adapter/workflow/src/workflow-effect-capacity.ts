import {
  ApplicationFailure,
} from "@temporalio/workflow";
import {
  EffectActivityCapacityPreflightKind,
  isEffectActivityCapacityExceeded,
  preflightEffectActivityRequest,
  preflightEffectActivityResult,
  projectEffectActivityFailure,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectActivityCapacityBound,
  EffectActivityImplementationResult,
  EffectActivityResult,
  EffectRequest,
} from "@bpmn-lean/temporal-protocol";

/** Owns both byte checks around the durable Activity scheduling boundary. */
export async function executeEffectWithinCapacity(
  request: EffectRequest,
  executeEffect: (request: EffectRequest) => Promise<EffectActivityResult>,
  failCapacity: (failure: EffectActivityCapacityBound) => never,
): Promise<EffectActivityImplementationResult> {
  const requestPreflight = preflightEffectActivityRequest(request);
  switch (requestPreflight.kind) {
    case EffectActivityCapacityPreflightKind.CapacityExceeded:
      return failCapacity(requestPreflight.failure);
    case EffectActivityCapacityPreflightKind.WithinCapacity:
      break;
    default:
      return assertNever(requestPreflight);
  }

  const result = await executeEffect(request);
  if (isEffectActivityCapacityExceeded(result)) {
    return failCapacity({
      budget: result.budget,
      configuredBound: result.configuredBound,
      observedValue: result.observedValue,
    });
  }
  const resultPreflight = preflightEffectActivityResult(result);
  switch (resultPreflight.kind) {
    case EffectActivityCapacityPreflightKind.CapacityExceeded:
      return failCapacity(resultPreflight.failure);
    case EffectActivityCapacityPreflightKind.WithinCapacity:
      return result;
    default:
      return assertNever(resultPreflight);
  }
}

/** Converts exhausted Activity execution to one fixed projection with no original cause. */
export function effectActivityExhaustionFailure(
  error: unknown,
): ApplicationFailure {
  const projection = projectEffectActivityFailure(error);
  return ApplicationFailure.nonRetryable(
    projection.message,
    projection.failureType,
    projection,
  );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported effect-capacity preflight: ${String(value)}`);
}
