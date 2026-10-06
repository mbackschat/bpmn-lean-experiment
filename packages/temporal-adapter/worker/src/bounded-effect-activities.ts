import { ApplicationFailure, CancelledFailure } from "@temporalio/common";
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
          try {
            return boundEffectActivityResult(
              await activities.executeBpmnEffect(request),
              limits,
            );
          } catch (error) {
            throw boundImplementationFailure(error);
          }
        default:
          return assertNever(requestPreflight);
      }
    },
  };
}

function boundImplementationFailure(error: unknown): Error {
  let failure: Error;
  try {
    failure = normalizeImplementationFailure(error);
  } catch {
    // Rejected values are caller-owned: a throwing accessor must not escape the same capacity boundary.
    failure = ApplicationFailure.retryable("Effect implementation failed", "Error");
  }
  // SDK 1.21.0 DefaultFailureConverter reuses TemporalFailure.failure verbatim and recursively
  // serializes cause/details. Fresh instances prevent those fields bypassing the History reserve.
  failure.stack = "";
  return failure;
}

function normalizeImplementationFailure(error: unknown): Error {
  const message = boundedDiagnostic(
    () => error instanceof Error ? error.message : error,
    "Effect implementation failed",
  );
  let failure: Error;
  if (error instanceof CancelledFailure) {
    failure = new CancelledFailure(message);
  } else if (error instanceof ApplicationFailure) {
    failure = new ApplicationFailure(
      message,
      boundedDiagnostic(() => error.type, "Error"),
      error.nonRetryable,
      undefined,
      undefined,
      error.nextRetryDelay,
      error.category,
    );
  } else if (error instanceof Error && error.name === "AbortError") {
    // SDK 1.21.0 Activity.run recognizes AbortError by name when cancellation was requested.
    failure = new Error(message);
    failure.name = "AbortError";
  } else {
    failure = ApplicationFailure.create({
      message,
      type: boundedDiagnostic(() => error instanceof Error ? error.constructor.name : undefined, "Error"),
      nonRetryable: false,
    });
  }
  return failure;
}

function boundedDiagnostic(read: () => unknown, fallback: string): string {
  let value: unknown;
  try {
    value = read();
  } catch {
    // Diagnostic accessors cannot change readable retry controls or SDK cancellation classification.
    return fallback;
  }
  if (typeof value !== "string") return fallback;
  let result = "";
  let bytes = 0;
  for (const character of value.slice(0, 256).toWellFormed()) {
    bytes += Buffer.byteLength(character, "utf8");
    if (bytes > 256) break;
    result += character;
  }
  return result;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported effect-capacity preflight: ${String(value)}`);
}
