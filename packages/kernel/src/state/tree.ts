/**
 * The scope tree, transcribed from `Kernel/State/Tree.lean`: what lies inside a scope occurrence, read from the
 * structural keys (KD1), a key lying below another when that one is a proper tail of it. `inside` is the set the
 * membership readers ask; `subtree` the same scope occurrences in the order a clearing journals them, by their order
 * positions (DC25). Part of the State layer, above `state.ts`; `hooks.ts` re-exports it to the features.
 */
import { type Issue, root, type ScopeOccurrenceId, scopeParent, type State } from "../state.js";

/** Whether the key `inner` lies strictly below the key `outer`: `outer` is a proper tail of it. */
export function below(outer: ScopeOccurrenceId, inner: ScopeOccurrenceId): boolean {
  for (let current = scopeParent(inner); current !== null; current = scopeParent(current)) if (current === outer) return true;
  return false;
}

/**
 * The scope occurrences inside `scope`, transitively, including `scope`, in no order a reader may rely on: the readers
 * that only ask whether a scope occurrence lies inside read this.
 */
export function inside(state: State, scope: ScopeOccurrenceId): readonly ScopeOccurrenceId[] {
  return [scope, ...state.scopes.filter((entry) => below(scope, entry.id)).map((entry) => entry.id)];
}

/**
 * The order positions of the scope occurrences on `inner`'s key below the key `outer`, outermost first. A key no
 * standing scope occurrence holds ranks as the root does; in a well-formed state every key between two standing ones
 * stands.
 */
export function ranks(state: State, outer: ScopeOccurrenceId, inner: ScopeOccurrenceId): readonly Issue[] {
  const positions: Issue[] = [];
  for (let current = inner; current !== outer && current !== root; current = scopeParent(current) ?? root) {
    positions.unshift(state.scopes.find((entry) => entry.id === current)?.position ?? 0);
  }
  return positions;
}

/**
 * Lean's `ranksNotAfter`: whether the ranks `left` come no later than the ranks `right` of the same length under the
 * position order `le`, position by position, the first that differs deciding.
 */
function ranksNotAfter(le: (left: Issue, right: Issue) => boolean, left: readonly Issue[], right: readonly Issue[]): boolean {
  for (let index = 0; index < left.length; index += 1) {
    if (index >= right.length) return false;
    const [a, b] = [left[index] as Issue, right[index] as Issue];
    if (!le(a, b)) return false;
    if (!le(b, a)) return true;
  }
  return true;
}

/**
 * The scope occurrences inside `scope`, transitively, including `scope`, the deepest last: breadth first, each level in
 * the order of its parents and then of its own order positions under `le` (`ranks`), shorter first. The journal of a
 * clearing reads this order (`clearInside`). Lean's `mergeSort` is stable, as `Array.prototype.sort` is.
 */
export function subtree(state: State, le: (left: Issue, right: Issue) => boolean, scope: ScopeOccurrenceId): readonly ScopeOccurrenceId[] {
  const nested = state.scopes.filter((entry) => below(scope, entry.id))
    .map((entry) => [ranks(state, scope, entry.id), entry.id] as const);
  const notAfter = (a: readonly Issue[], b: readonly Issue[]): boolean =>
    a.length < b.length || (a.length === b.length && ranksNotAfter(le, a, b));
  return [scope, ...nested.sort((left, right) => notAfter(left[0], right[0]) ? (notAfter(right[0], left[0]) ? 0 : -1) : 1)
    .map(([, id]) => id)];
}
