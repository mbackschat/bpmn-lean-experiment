import { isWellFormedWireString } from "@bpmn-lean/semantic-core";

export type CanonicalTupleValue =
  | boolean
  | string
  | number
  | ReadonlyArray<CanonicalTupleValue>;

/**
 * Encodes domain-separated typed tuples without depending on host object-key ordering.
 *
 * Callers own the tuple shape and domain tag. This function owns the shared wire scalar domain:
 * Booleans, exact Unicode scalar strings, and non-negative JavaScript-safe integers.
 */
export function canonicalTypedTupleEncoding(
  value: ReadonlyArray<CanonicalTupleValue>,
): string {
  requireCanonicalTupleValue(value);
  return JSON.stringify(value);
}

function requireCanonicalTupleValue(
  value: unknown,
): asserts value is CanonicalTupleValue {
  if (typeof value === "boolean") {
    return;
  }
  if (isWellFormedWireString(value)) {
    return;
  }
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return;
  }
  if (Array.isArray(value)) {
    for (const member of value) {
      requireCanonicalTupleValue(member);
    }
    return;
  }
  throw new TypeError(
    "Expected a canonical typed-tuple value: nested arrays of Booleans, exact strings, and non-negative safe integers",
  );
}
