import type { DeepReadonly } from "./deep-readonly.js";
import { utf8ByteLength } from "./wire.js";

/** Inclusive runtime collection bounds of a Multi-Instance activity, sequential and parallel alike. */
export type MultiInstanceLimits = DeepReadonly<{
  maximumItems: 16;
  maximumItemUtf8Bytes: 512;
  maximumCanonicalCollectionUtf8Bytes: 8192;
}>;

/**
 * The one set of bounds every Multi-Instance profile registers: the largest the retained maximal-topology Temporal
 * payload measurement admits (`retainedParallelMultiInstanceHistoryMeasurement` in the Temporal workflow package).
 * Lowering emits it, and Program admission accepts no other.
 */
export const multiInstanceLimits: MultiInstanceLimits = Object.freeze({
  maximumItems: 16,
  maximumItemUtf8Bytes: 512,
  maximumCanonicalCollectionUtf8Bytes: 8_192,
});

/** Whether one ordered collection fits every bound: its item count, each item's bytes and its JSON array's bytes. */
export function multiInstanceCollectionWithinLimits(
  limits: MultiInstanceLimits,
  collection: ReadonlyArray<string>,
): boolean {
  return collection.length <= limits.maximumItems &&
    collection.every((item) => utf8ByteLength(item) <= limits.maximumItemUtf8Bytes) &&
    utf8ByteLength(JSON.stringify(collection)) <= limits.maximumCanonicalCollectionUtf8Bytes;
}
