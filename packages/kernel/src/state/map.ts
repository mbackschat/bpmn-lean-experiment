/**
 * Kernel maps, transcribed from `Kernel/State/Map.lean`: Lean's `TreeMap`, an ordered map, as its entries in key
 * order, one per key. Part of `state.ts`, which re-exports it.
 */

/** Lean's `TreeMap α β cmp`: the entries in `cmp`'s key order, one per key. */
export type TreeMap<K, V> = readonly (readonly [K, V])[];

/**
 * The index of the first of `entries` whose key is not below `key` in `cmp`'s order, by binary search: a scan or a sort
 * at every lookup made a closure that opens an item at every pass, whose keys compare by their parsed text, take
 * seconds (`closure-work-bound.test.ts`, measured 2026-11-18).
 */
function lowerBound<E, K>(entries: readonly E[], keyOf: (entry: E) => K, key: K, cmp: (left: K, right: K) => number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cmp(keyOf(entries[middle]!), key) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

const entryKey = <K, V>(entry: readonly [K, V]): K => entry[0];

/** Lean's `TreeMap.getD`: the value under `key` in `cmp`'s order, `fallback` when there is none. */
export function treeMapGetD<K, V>(map: TreeMap<K, V>, key: K, cmp: (left: K, right: K) => number, fallback: V): V {
  const index = lowerBound(map, entryKey, key, cmp);
  return index < map.length && cmp(map[index]![0], key) === 0 ? map[index]![1] : fallback;
}

/** Lean's `TreeMap.insert`: `map` with `value` under `key`, replacing the value there, kept in `cmp`'s key order. */
export function treeMapInsert<K, V>(map: TreeMap<K, V>, key: K, value: V, cmp: (left: K, right: K) => number): TreeMap<K, V> {
  const index = lowerBound(map, entryKey, key, cmp);
  const replaces = index < map.length && cmp(map[index]![0], key) === 0;
  return [...map.slice(0, index), [key, value] as const, ...map.slice(replaces ? index + 1 : index)];
}

/**
 * Lean's `TreeMap.insert` on a map whose every value carries its own key (KD1), written as its values in key order (its
 * list view): `value` under `keyOf(value)`, replacing the value there.
 */
export function keyedInsert<K, V>(values: readonly V[], value: V, keyOf: (value: V) => K, cmp: (left: K, right: K) => number): readonly V[] {
  const key = keyOf(value);
  const index = lowerBound(values, keyOf, key, cmp);
  const replaces = index < values.length && cmp(keyOf(values[index]!), key) === 0;
  return [...values.slice(0, index), value, ...values.slice(replaces ? index + 1 : index)];
}

/** Lean's `TreeMap.get?` on a map written as its values in key order (`keyedInsert`): the value carrying `key`. */
export function keyedGet<K, V>(values: readonly V[], key: K, keyOf: (value: V) => K, cmp: (left: K, right: K) => number): V | null {
  const index = lowerBound(values, keyOf, key, cmp);
  return index < values.length && cmp(keyOf(values[index]!), key) === 0 ? values[index]! : null;
}

/**
 * Lean's `TreeMap.insertIfNew` on a map written as its values in key order (`keyedInsert`): `values` unchanged when one
 * carries `keyOf(value)` already.
 */
export function keyedInsertIfNew<K, V>(
  values: readonly V[], value: V, keyOf: (value: V) => K, cmp: (left: K, right: K) => number,
): readonly V[] {
  const key = keyOf(value);
  const index = lowerBound(values, keyOf, key, cmp);
  if (index < values.length && cmp(keyOf(values[index]!), key) === 0) return values;
  return [...values.slice(0, index), value, ...values.slice(index)];
}

/**
 * Lean's `TreeMap` for a closure's unit-keyed content (DC4), a persistent balanced (AVL) tree: a closure inserts one
 * transition and one run-log entry per micro-step, and the sorted array above copies itself on every insert, which made
 * a 50,000-entry map take 6.3 s (spike T60, 2026-11-18). These maps never leave a closure, so they need no wire form.
 * `orderedEntries` lists the entries in key order; a reader that takes order from it is a named reader of the guard that
 * no body reads a unit-keyed map's iteration order (KD7).
 */
export type OrderedMap<K, V> = OrderedNode<K, V> | null;
type OrderedNode<K, V> = Readonly<{ key: K; value: V; left: OrderedMap<K, V>; right: OrderedMap<K, V>; height: number; size: number }>;

const heightOf = <K, V>(map: OrderedMap<K, V>): number => map?.height ?? 0;

/** Lean's `TreeMap.size`. */
export const orderedSize = <K, V>(map: OrderedMap<K, V>): number => map?.size ?? 0;

function orderedNode<K, V>(key: K, value: V, left: OrderedMap<K, V>, right: OrderedMap<K, V>): OrderedNode<K, V> {
  return { key, value, left, right, height: Math.max(heightOf(left), heightOf(right)) + 1, size: orderedSize(left) + orderedSize(right) + 1 };
}

/** `orderedNode`, rotated back into balance after one insert or erase below it. */
function balanced<K, V>(key: K, value: V, left: OrderedMap<K, V>, right: OrderedMap<K, V>): OrderedNode<K, V> {
  if (heightOf(left) > heightOf(right) + 1 && left !== null) {
    const inner = heightOf(left.right) > heightOf(left.left) && left.right !== null
      ? orderedNode(left.right.key, left.right.value, orderedNode(left.key, left.value, left.left, left.right.left), left.right.right) : left;
    return orderedNode(inner.key, inner.value, inner.left, orderedNode(key, value, inner.right, right));
  }
  if (heightOf(right) > heightOf(left) + 1 && right !== null) {
    const inner = heightOf(right.left) > heightOf(right.right) && right.left !== null
      ? orderedNode(right.left.key, right.left.value, right.left.left, orderedNode(right.key, right.value, right.left.right, right.right)) : right;
    return orderedNode(inner.key, inner.value, orderedNode(key, value, left, inner.left), inner.right);
  }
  return orderedNode(key, value, left, right);
}

/** Lean's `TreeMap.insert`: `map` with `value` under `key`, replacing the value there. */
export function orderedInsert<K, V>(map: OrderedMap<K, V>, key: K, value: V, cmp: (left: K, right: K) => number): OrderedNode<K, V> {
  if (map === null) return orderedNode(key, value, null, null);
  const order = cmp(key, map.key);
  if (order === 0) return orderedNode(key, value, map.left, map.right);
  return order < 0
    ? balanced(map.key, map.value, orderedInsert(map.left, key, value, cmp), map.right)
    : balanced(map.key, map.value, map.left, orderedInsert(map.right, key, value, cmp));
}

/** Lean's `TreeMap.get?`: the value under `key`, `undefined` when there is none. */
export function orderedGet<K, V>(map: OrderedMap<K, V>, key: K, cmp: (left: K, right: K) => number): V | undefined {
  for (let at = map; at !== null;) {
    const order = cmp(key, at.key);
    if (order === 0) return at.value;
    at = order < 0 ? at.left : at.right;
  }
  return undefined;
}

/** Lean's `TreeMap.contains`. */
export function orderedHas<K, V>(map: OrderedMap<K, V>, key: K, cmp: (left: K, right: K) => number): boolean {
  for (let at = map; at !== null;) {
    const order = cmp(key, at.key);
    if (order === 0) return true;
    at = order < 0 ? at.left : at.right;
  }
  return false;
}

/** The least entry of a nonempty map, and the map without it. */
function withoutLeast<K, V>(map: OrderedNode<K, V>): readonly [OrderedNode<K, V>, OrderedMap<K, V>] {
  if (map.left === null) return [map, map.right];
  const [least, rest] = withoutLeast(map.left);
  return [least, balanced(map.key, map.value, rest, map.right)];
}

/** Lean's `TreeMap.erase`: `map` without `key`. */
export function orderedErase<K, V>(map: OrderedMap<K, V>, key: K, cmp: (left: K, right: K) => number): OrderedMap<K, V> {
  if (map === null) return null;
  const order = cmp(key, map.key);
  if (order < 0) return balanced(map.key, map.value, orderedErase(map.left, key, cmp), map.right);
  if (order > 0) return balanced(map.key, map.value, map.left, orderedErase(map.right, key, cmp));
  if (map.right === null) return map.left;
  const [least, rest] = withoutLeast(map.right);
  return balanced(least.key, least.value, map.left, rest);
}

/** Lean's `TreeMap.any`: whether some entry satisfies `test`, whatever the order. */
export function orderedAny<K, V>(map: OrderedMap<K, V>, test: (key: K, value: V) => boolean): boolean {
  return map !== null && (test(map.key, map.value) || orderedAny(map.left, test) || orderedAny(map.right, test));
}

/** Lean's `(TreeMap.filter test).size`: how many entries satisfy `test`, whatever the order. */
export function orderedCount<K, V>(map: OrderedMap<K, V>, test: (key: K, value: V) => boolean): number {
  return map === null ? 0 : (test(map.key, map.value) ? 1 : 0) + orderedCount(map.left, test) + orderedCount(map.right, test);
}

/** Lean's `TreeMap.toList`: the entries in key order. */
export function orderedEntries<K, V>(map: OrderedMap<K, V>): (readonly [K, V])[] {
  const entries: (readonly [K, V])[] = [];
  const visit = (at: OrderedMap<K, V>): void => {
    if (at === null) return;
    visit(at.left);
    entries.push([at.key, at.value]);
    visit(at.right);
  };
  visit(map);
  return entries;
}

/** Lean's `TreeMap.filter`: the entries whose value satisfies `keep`, rebuilt from the kept entries in key order. */
export function orderedFilter<K, V>(map: OrderedMap<K, V>, keep: (value: V) => boolean): OrderedMap<K, V> {
  const kept = orderedEntries(map).filter(([, value]) => keep(value));
  const build = (from: number, to: number): OrderedMap<K, V> => {
    if (from >= to) return null;
    const middle = (from + to) >> 1;
    const [key, value] = kept[middle]!;
    return orderedNode(key, value, build(from, middle), build(middle + 1, to));
  };
  return kept.length === orderedSize(map) ? map : build(0, kept.length);
}
