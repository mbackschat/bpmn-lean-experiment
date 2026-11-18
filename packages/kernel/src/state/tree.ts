/**
 * The scope tree, transcribed from `Kernel/State/Tree.lean`: what lies inside a scope occurrence (`subtree`), read from
 * the structural keys (KD1), a key lying below another when that one is a proper tail of it. Part of the State layer,
 * above `state.ts`; `hooks.ts` re-exports it to the features.
 */
import { root, type ScopeOccurrenceId, type State } from "../state.js";
import { scopeParent } from "./key.js";

/** Whether the key `inner` lies strictly below the key `outer`: `outer` is a proper tail of it. */
export function below(outer: ScopeOccurrenceId, inner: ScopeOccurrenceId): boolean {
  for (let current = scopeParent(inner); current !== null; current = scopeParent(current)) if (current === outer) return true;
  return false;
}

/** The places in `state.scopes` of the scope occurrences on `inner`'s key below the key `outer`, outermost first. */
export function ranks(state: State, outer: ScopeOccurrenceId, inner: ScopeOccurrenceId): readonly number[] {
  const places: number[] = [];
  for (let current = inner; current !== outer && current !== root; current = scopeParent(current) ?? root) {
    const place = state.scopes.findIndex((entry) => entry.id === current);
    places.unshift(place === -1 ? state.scopes.length : place);
  }
  return places;
}

function compareRanks(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) return left.length - right.length;
  for (let index = 0; index < left.length; index += 1) {
    const order = (left[index] as number) - (right[index] as number);
    if (order !== 0) return order;
  }
  return 0;
}

/**
 * The scope occurrences inside `scope`, transitively, including `scope`, the deepest last: breadth first, each level in
 * the order of its parents and then of entry, which is the order of their places on the way down (`ranks`), shorter
 * first. The journal of a clearing reads this order (`clearInside`).
 */
export function subtree(state: State, scope: ScopeOccurrenceId): readonly ScopeOccurrenceId[] {
  const inside = state.scopes.filter((entry) => below(scope, entry.id))
    .map((entry) => [ranks(state, scope, entry.id), entry.id] as const);
  return [scope, ...inside.sort((left, right) => compareRanks(left[0], right[0])).map(([, id]) => id)];
}
