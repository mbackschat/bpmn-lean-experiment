/**
 * Scope occurrence keys, transcribed from `Kernel/State/Key.lean`: a scope occurrence's structural identity (KD1), the
 * key of the scope occurrence it was entered in, the element it was entered for and an ordinal counted per (parent,
 * element) by `State.scopeOrdinals`. A key is held as its canonical text, so keys compare by value, never by object
 * reference, and serve as set members and map keys as they are. Modules that read keys import it; `state.ts` re-exports
 * only the key type.
 */
import { assertNever, compareStrings, type ElementId } from "../il/types.js";

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

/**
 * The order of Lean's `Ord ScopeOccurrenceId`: the segments outermost first, lexicographically, so an ancestor comes
 * before its descendants and a subtree is one range of keys.
 */
export function compareScopeOccurrenceId(left: ScopeOccurrenceId, right: ScopeOccurrenceId): number {
  if (left === right) return 0;
  const a = scopeSegments(left);
  const b = scopeSegments(right);
  for (let index = 1; index <= Math.min(a.length, b.length); index += 1) {
    const order = compareSegment(a[a.length - index] as ScopeSegment, b[b.length - index] as ScopeSegment);
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

declare const occurrenceKeyBrand: unique symbol;

/**
 * Lean's `OccurrenceId` as canonical text: an occurrence's structural key (KD1), the scope occurrence it was issued in,
 * its element and an ordinal counted per (scope occurrence, element) by `State.occurrenceOrdinals`, written
 * `<length>:<element>#<ordinal>@<scope>`, the element's length in UTF-16 code units and `<scope>` the scope key's text.
 * Keys compare by value, never by object reference. The text never leaves the kernel.
 */
export type OccurrenceId = string & { readonly [occurrenceKeyBrand]: true };

/** The key of the `ordinal`th occurrence of `element` issued in `scope`. */
export function occurrenceId(scope: ScopeOccurrenceId, element: ElementId, ordinal: number): OccurrenceId {
  return `${element.length}:${element}#${ordinal}@${scope}` as OccurrenceId;
}

/** The scope occurrence, element and ordinal of `id`. */
export function occurrenceIdParts(id: OccurrenceId): Readonly<{ scope: ScopeOccurrenceId; element: ElementId; ordinal: number }> {
  const colon = id.indexOf(":");
  const start = colon + 1;
  const length = Number(id.slice(0, colon));
  const element = id.slice(start, start + length);
  const at = id.indexOf("@", start + length);
  return { scope: id.slice(at + 1) as ScopeOccurrenceId, element, ordinal: Number(id.slice(start + length + 1, at)) };
}

/** Whether the scope occurrence `outer` is `inner` or encloses it: Lean's test that `outer`'s segments end `inner`'s. */
export function scopeEncloses(outer: ScopeOccurrenceId, inner: ScopeOccurrenceId): boolean {
  for (let key: ScopeOccurrenceId | null = inner; key !== null && key.length >= outer.length; key = scopeParent(key)) {
    if (key === outer) return true;
  }
  return false;
}

/** The order of Lean's `Ord OccurrenceId`: the scope occurrence's key, then the element, then the ordinal. */
export function compareOccurrenceId(left: OccurrenceId, right: OccurrenceId): number {
  if (left === right) return 0;
  const a = occurrenceIdParts(left);
  const b = occurrenceIdParts(right);
  return compareScopeOccurrenceId(a.scope, b.scope) || compareStrings(a.element, b.element) || a.ordinal - b.ordinal;
}

/** Lean's `UnitStep`: one step down a closure's unit chain, the `index`th signal or token the unit above queued. */
export enum UnitStepTag { Signal = "signal", Token = "token" }
export type UnitStep = Readonly<{ tag: UnitStepTag; index: number }>;

/** Lean's `UnitStep.rank`: signals before tokens, each by index. */
function unitStepRank(step: UnitStep): number {
  switch (step.tag) {
    case UnitStepTag.Signal:
      return 0;
    case UnitStepTag.Token:
      return 1;
  }
  return assertNever(step.tag);
}

function compareUnitStep(left: UnitStep, right: UnitStep): number {
  return unitStepRank(left) - unitStepRank(right) || left.index - right.index;
}

/** Lean's `UnitRoot`: where a closure's unit chain starts (DC4), a structured root no element can take the name of. */
export enum UnitRootTag { Seed = "seed", Input = "input", Idle = "idle", Offer = "offer" }
export type UnitRoot =
  | Readonly<{ tag: UnitRootTag.Seed }>
  | Readonly<{ tag: UnitRootTag.Input }>
  | Readonly<{ tag: UnitRootTag.Idle; scope: ScopeOccurrenceId }>
  | Readonly<{ tag: UnitRootTag.Offer; occurrence: OccurrenceId; round: number }>;

/** Lean's `Ord UnitRoot`: the seed, the input, then idle completions by scope key and offers by occurrence key and round. */
function compareUnitRoot(left: UnitRoot, right: UnitRoot): number {
  switch (left.tag) {
    case UnitRootTag.Seed:
      return right.tag === UnitRootTag.Seed ? 0 : -1;
    case UnitRootTag.Input:
      return right.tag === UnitRootTag.Seed ? 1 : right.tag === UnitRootTag.Input ? 0 : -1;
    case UnitRootTag.Idle:
      return right.tag === UnitRootTag.Idle ? compareScopeOccurrenceId(left.scope, right.scope) : right.tag === UnitRootTag.Offer ? -1 : 1;
    case UnitRootTag.Offer:
      return right.tag === UnitRootTag.Offer ? compareOccurrenceId(left.occurrence, right.occurrence) || left.round - right.round : 1;
  }
  return assertNever(left);
}

/**
 * Lean's `UnitKey` (DC4, DC20): a unit of a closure's work as one immutable node of its spine, holding its root, its
 * own step (`null` at the root), the unit that queued it, its depth, its 64-bit fingerprint, bit for bit Lean's, and a
 * skew-binary jump pointer to an ancestor (Myers 1983), so two keys meet in O(log depth). Built only by `unitRoot` and
 * `pushUnit`; compared only by `compareUnitKey`, `sameUnitKey` and `breadthUnitKey`, never by `===` on structure, since
 * two equal keys need not be one object. Never a wire value: a unit key never outlives its closure.
 */
export interface UnitKey {
  readonly root: UnitRoot;
  readonly step: UnitStep | null;
  readonly parent: UnitKey | null;
  readonly jump: UnitKey | null;
  readonly depth: number;
  readonly fingerprint: bigint;
}

/** Lean's `UnitKey.ofRoot`: the key of a root unit. */
export function unitRoot(root: UnitRoot): UnitKey {
  return { root, step: null, parent: null, jump: null, depth: 0, fingerprint: 0n };
}

/** Lean's `Spine.jump`, with the root its own jump as Lean's `.root` is. */
const jumpOf = (key: UnitKey): UnitKey => key.jump ?? key;

/** Lean's `Spine.fingerprintStep` over `SpineStep UnitStep`'s code `2 * index + rank`: xor, then the odd factor mod 2^64. */
function fingerprintStep(fingerprint: bigint, step: UnitStep): bigint {
  return BigInt.asUintN(64, (fingerprint ^ BigInt(2 * step.index + unitStepRank(step))) * 0x9E3779B97F4A7C15n);
}

/** Lean's `UnitKey.push` (`Spine.push`): the key of the unit `step` names below `parent`, its jump chosen by depth alone. */
export function pushUnit(parent: UnitKey, step: UnitStep): UnitKey {
  const jump = parent.step === null ? parent
    : parent.depth - jumpOf(parent).depth === jumpOf(parent).depth - jumpOf(jumpOf(parent)).depth ? jumpOf(jumpOf(parent)) : parent;
  return { root: parent.root, step, parent, jump, depth: parent.depth + 1, fingerprint: fingerprintStep(parent.fingerprint, step) };
}

/** Lean's `UnitKey.signal`. */
export const signalUnit = (parent: UnitKey, index: number): UnitKey => pushUnit(parent, { tag: UnitStepTag.Signal, index });

/** Lean's `UnitKey.token`. */
export const tokenUnit = (parent: UnitKey, index: number): UnitKey => pushUnit(parent, { tag: UnitStepTag.Token, index });

/** The order of two paths of one depth, innermost step first (Lean's `List` order), a shared tail at once. */
function comparePath(left: UnitKey, right: UnitKey): number {
  for (let a: UnitKey | null = left, b: UnitKey | null = right; a !== b && a !== null && b !== null; a = a.parent, b = b.parent) {
    const order = a.step === null || b.step === null ? 0 : compareUnitStep(a.step, b.step);
    if (order !== 0) return order;
  }
  return 0;
}

/**
 * Lean's `Ord UnitKey` (DC20): depth, fingerprint, root, then the full path, so a map operation compares the fixed-size
 * cached fields first and the path decides last.
 */
export function compareUnitKey(left: UnitKey, right: UnitKey): number {
  if (left.depth !== right.depth) return left.depth - right.depth;
  if (left.fingerprint !== right.fingerprint) return left.fingerprint < right.fingerprint ? -1 : 1;
  return compareUnitRoot(left.root, right.root) || comparePath(left, right);
}

/** Lean's `DecidableEq UnitKey`: depth and fingerprint reject at once, then the root, then the path, a shared one at once. */
export function sameUnitKey(left: UnitKey, right: UnitKey): boolean {
  return left === right || compareUnitKey(left, right) === 0;
}

/** Lean's `Spine.sameNode` on two keys of one root: depth and fingerprint first, then the path. */
function sameNode(left: UnitKey, right: UnitKey): boolean {
  return left.depth === right.depth && left.fingerprint === right.fingerprint && comparePath(left, right) === 0;
}

/**
 * Lean's `Spine.meet`: the two nodes just below the meeting point of two distinct nodes of one depth and one root,
 * climbing in lockstep by jump where the jumps differ, else by parent, until the parents are one.
 */
function meet(left: UnitKey, right: UnitKey): readonly [UnitKey, UnitKey] {
  let [a, b] = [left, right];
  while (a.parent !== null && b.parent !== null && !sameNode(a.parent, b.parent)) {
    const [ja, jb] = [jumpOf(a), jumpOf(b)];
    [a, b] = ja.depth === jb.depth && !sameNode(ja, jb) ? [ja, jb] : [a.parent, b.parent];
  }
  return [a, b];
}

/**
 * Lean's `UnitKey.breadth` (DC4): breadth-first order, the order the closure runs queued signals in: fewer steps first,
 * then the root, then the path read outermost first, decided where the two keys meet in O(log depth).
 */
export function breadthUnitKey(left: UnitKey, right: UnitKey): number {
  if (left.depth !== right.depth) return left.depth - right.depth;
  const roots = compareUnitRoot(left.root, right.root);
  if (roots !== 0 || sameNode(left, right)) return roots;
  const [a, b] = meet(left, right);
  return a.step === null || b.step === null ? 0 : compareUnitStep(a.step, b.step);
}
