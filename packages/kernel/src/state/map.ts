/**
 * Kernel maps, transcribed from `Kernel/State/Map.lean`: Lean's `TreeMap`, an ordered map, as its entries in key
 * order, one per key. Part of `state.ts`, which re-exports it.
 */

/** Lean's `TreeMap α β cmp`: the entries in `cmp`'s key order, one per key. */
export type TreeMap<K, V> = readonly (readonly [K, V])[];
