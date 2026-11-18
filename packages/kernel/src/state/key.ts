/**
 * Scope occurrence keys, transcribed from `Kernel/State/Key.lean`: a scope occurrence's structural identity (KD1), the
 * key of the scope occurrence it was entered in, the element it was entered for and an ordinal counted per (parent,
 * element) by `State.scopeOrdinals`. A key is held as its canonical text, so keys compare by value, never by object
 * reference, and serve as set members and map keys as they are. Modules that read keys import it; `state.ts` re-exports
 * only the key type.
 */
import { compareStrings, type ElementId } from "../il/types.js";

/** One step down the scope tree: an element and its ordinal among that element's entries in the same parent. */
export interface ScopeSegment { readonly element: ElementId; readonly ordinal: number; }

declare const scopeKeyBrand: unique symbol;

/**
 * Lean's `ScopeOccurrenceId` as canonical text: its segments innermost first, each `<length>:<element>#<ordinal>/`,
 * the element's length in UTF-16 code units, so the text of a key's parent is its text after the first segment. The
 * text never leaves the kernel.
 */
export type ScopeOccurrenceId = string & { readonly [scopeKeyBrand]: true };

/** The process instance's root scope occurrence: no segment. */
export const rootScope = "" as ScopeOccurrenceId;

/** The key of the `ordinal`th scope occurrence of `element` entered in `parent`. */
export function childScope(parent: ScopeOccurrenceId, element: ElementId, ordinal: number): ScopeOccurrenceId {
  return `${element.length}:${element}#${ordinal}/${parent}` as ScopeOccurrenceId;
}

/** The first segment of `scope` and the key of its parent, `null` for the root. */
export function scopeHead(scope: ScopeOccurrenceId): readonly [ScopeSegment, ScopeOccurrenceId] | null {
  if (scope === "") return null;
  const colon = scope.indexOf(":");
  const start = colon + 1;
  const length = Number(scope.slice(0, colon));
  const element = scope.slice(start, start + length);
  const slash = scope.indexOf("/", start + length);
  const ordinal = Number(scope.slice(start + length + 1, slash));
  return [{ element, ordinal }, scope.slice(slash + 1) as ScopeOccurrenceId];
}

/** The key of the scope occurrence `scope` was entered in, `null` for the root (Lean's `parent?`). */
export function scopeParent(scope: ScopeOccurrenceId): ScopeOccurrenceId | null {
  return scopeHead(scope)?.[1] ?? null;
}

/** The segments of `scope`, innermost first. */
export function scopeSegments(scope: ScopeOccurrenceId): readonly ScopeSegment[] {
  const segments: ScopeSegment[] = [];
  for (let head = scopeHead(scope); head !== null; head = scopeHead(head[1])) segments.push(head[0]);
  return segments;
}

function compareSegment(left: ScopeSegment, right: ScopeSegment): number {
  return compareStrings(left.element, right.element) || left.ordinal - right.ordinal;
}

/** The order of Lean's `Ord ScopeOccurrenceId`: the segments innermost first, lexicographically. */
export function compareScopeOccurrenceId(left: ScopeOccurrenceId, right: ScopeOccurrenceId): number {
  const a = scopeSegments(left);
  const b = scopeSegments(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const order = compareSegment(a[index] as ScopeSegment, b[index] as ScopeSegment);
    if (order !== 0) return order;
  }
  return a.length - b.length;
}

/** What an ordinal counter of `State.scopeOrdinals` counts: the scope occurrences of `element` entered in `parent`. */
export interface ScopeSlot { readonly parent: ScopeOccurrenceId; readonly element: ElementId; }

/** The order of Lean's `Ord ScopeSlot`: the parent's key, then the element. */
export function compareScopeSlot(left: ScopeSlot, right: ScopeSlot): number {
  return compareScopeOccurrenceId(left.parent, right.parent) || compareStrings(left.element, right.element);
}
