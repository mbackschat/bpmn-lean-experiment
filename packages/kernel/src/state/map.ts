/**
 * Kernel maps, transcribed from `Kernel/State/Map.lean`: Lean's `TreeMap`, an ordered map, as its entries in key
 * order, one per key. Part of `state.ts`, which re-exports it.
 */

/** Lean's `TreeMap α β cmp`: the entries in `cmp`'s key order, one per key. */
export type TreeMap<K, V> = readonly (readonly [K, V])[];

/**
 * The index of the first entry of `map` whose key is not below `key` in `cmp`'s order, by binary search: a scan or a sort
 * at every lookup made a closure that opens an item at every pass, whose keys compare by their parsed text, take
 * seconds (`closure-work-bound.test.ts`, measured 2026-11-18).
 */
function lowerBound<K, V>(map: TreeMap<K, V>, key: K, cmp: (left: K, right: K) => number): number {
  let low = 0;
  let high = map.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cmp(map[middle]![0], key) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Lean's `TreeMap.getD`: the value under `key` in `cmp`'s order, `fallback` when there is none. */
export function treeMapGetD<K, V>(map: TreeMap<K, V>, key: K, cmp: (left: K, right: K) => number, fallback: V): V {
  const index = lowerBound(map, key, cmp);
  return index < map.length && cmp(map[index]![0], key) === 0 ? map[index]![1] : fallback;
}

/** Lean's `TreeMap.insert`: `map` with `value` under `key`, replacing the value there, kept in `cmp`'s key order. */
export function treeMapInsert<K, V>(map: TreeMap<K, V>, key: K, value: V, cmp: (left: K, right: K) => number): TreeMap<K, V> {
  const index = lowerBound(map, key, cmp);
  const replaces = index < map.length && cmp(map[index]![0], key) === 0;
  return [...map.slice(0, index), [key, value] as const, ...map.slice(replaces ? index + 1 : index)];
}
