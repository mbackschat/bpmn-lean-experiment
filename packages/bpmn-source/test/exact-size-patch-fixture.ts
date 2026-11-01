/** Exact-size patches for the 16,384-byte external patch allowance shared by the nested scope-data profile's surfaces. */
import assert from "node:assert/strict";
import { VariableValueKind, canonicalNamedValueArrayUtf8ByteLength } from "@bpmn-lean/semantic-core";
import type { BusinessValue, VariableBinding } from "@bpmn-lean/semantic-core";

/** A one-binding patch of a Map whose canonical size is exactly `bytes`, built from seventeen bounded Strings. */
export function patchOfSize(name: string, bytes: number): VariableBinding[] {
  const lengths = Array.from({ length: 17 }, () => 1_000);
  const patch = (): Array<{ name: string; value: BusinessValue }> => [{ name, value: { kind: VariableValueKind.Map,
    value: lengths.map((length, index) => ({ name: `k${String(index).padStart(2, "0")}`,
      value: { kind: VariableValueKind.String, value: "p".repeat(length) } })) } }];
  for (let index = lengths.length - 1; index >= 0; index -= 1) {
    const excess = canonicalNamedValueArrayUtf8ByteLength(patch()) - bytes;
    if (excess <= 0) break;
    lengths[index] = Math.max(0, lengths[index]! - excess);
  }
  assert.equal(canonicalNamedValueArrayUtf8ByteLength(patch()), bytes);
  return patch();
}
