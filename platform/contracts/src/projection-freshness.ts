export const ProjectionFreshnessHttpHeader = {
  ObservedAfterEpochMs: "Bpmn-Projection-Observed-After-Epoch-Ms",
  MaxAgeMs: "Bpmn-Projection-Max-Age-Ms",
} as const;

export type ProjectionFreshness = Readonly<{
  observedAfterEpochMs: number;
  maxAgeMs: number;
}>;

/** Validates and formats the exact public headers for a projection-backed success. */
export function projectionFreshnessResponseHeaders(
  value: ProjectionFreshness,
): Readonly<Record<string, string>> {
  const observedAfterEpochMs = requireSafeInteger(
    value.observedAfterEpochMs,
    "projection observed-after epoch",
    0,
  );
  const maxAgeMs = requireSafeInteger(
    value.maxAgeMs,
    "projection maximum age",
    1,
  );
  return {
    [ProjectionFreshnessHttpHeader.ObservedAfterEpochMs]: String(observedAfterEpochMs),
    [ProjectionFreshnessHttpHeader.MaxAgeMs]: String(maxAgeMs),
  };
}

function requireSafeInteger(
  value: number,
  label: string,
  minimum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be a safe integer at least ${minimum}`);
  }
  return value;
}
