/**
 * Kernel maps, transcribed from `Kernel/State/Map.lean`: Lean's `TreeMap`, an ordered map, as its entries in key
 * order, one per key. Part of `state.ts`, which re-exports it.
 */

/** Lean's `TreeMap α β cmp`: the entries in `cmp`'s key order, one per key. */
export type TreeMap<K, V> = readonly (readonly [K, V])[];

/** Lean's `TreeMap.getD`: the value under `key` in `cmp`'s order, `fallback` when there is none. */
export function treeMapGetD<K, V>(map: TreeMap<K, V>, key: K, cmp: (left: K, right: K) => number, fallback: V): V {
  return map.find(([entry]) => cmp(entry, key) === 0)?.[1] ?? fallback;
}

/** Lean's `TreeMap.insert`: `map` with `value` under `key`, replacing the value there, kept in `cmp`'s key order. */
export function treeMapInsert<K, V>(map: TreeMap<K, V>, key: K, value: V, cmp: (left: K, right: K) => number): TreeMap<K, V> {
  return [...map.filter(([entry]) => cmp(entry, key) !== 0), [key, value] as const].sort((left, right) => cmp(left[0], right[0]));
}
