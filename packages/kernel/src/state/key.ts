/**
 * Scope occurrence keys, transcribed from `Kernel/State/Key.lean`: a scope occurrence's structural identity (KD1), the
 * key of the scope occurrence it was entered in, the element it was entered for and its issue (`Issue`), once committed
 * an ordinal counted per (parent, element) by `State.scopeOrdinals`. Inside a closure every identity is issued as the
 * running unit's key and its index among the unit's issues, and the commit renames it to its committed ordinal (DC12,
 * `step/commit.ts#compact`; the committed forms and the issue slots are `state/issue.ts`'s). A key is held as its
 * canonical text, so keys compare by value, never by object reference, and serve as set members and map keys as they
 * are. Modules that read keys import it; `state.ts` re-exports only the key type.
 */
import { assertNever, compareStrings, type ElementId } from "../il/types.js";
import { keyOrderOpposite } from "./key-order.js";
import { UnitRootTag, UnitStepTag, compareUnitStep, rootRank, unitStepCode, type UnitStep } from "./root.js";

export { UnitRootTag, UnitStepTag, type UnitStep };

declare const issuerBrand: unique symbol;

/**
 * The text a fresh issue names its unit by (`issuerText`): the unit key's depth, its fingerprint as 16 hexadecimal digits,
 * the unit's run ordinal in its closure and its root's text, `<depth>.<fingerprint>.<run>.<root>`. Lean's fresh issue
 * holds the unit key itself, whose full path a text would repeat at every issue: as a key's text it made a deep closure's
 * keys quadratic in its depth (the differential suite ran out of its 4 GiB heap, 2026-11-20). A closure runs a unit once
 * (`microStep`), so the run ordinal tells its units apart exactly; the depth, fingerprint and root are Lean's order's
 * leading fields, and the ordinal decides only between two distinct units of one closure that agree on all three.
 */
export type IssuerText = string & { readonly [issuerBrand]: true };

/** A fresh issue (Lean's `Issue.fresh`): the `index`th issue of the unit `issuer` names, in the closure in progress. */
export type FreshIssue = Readonly<{ issuer: IssuerText; index: number }>;

/**
 * Lean's `Issue` (DC12): committed, its slot's ordinal itself, as Lean reads a numeral as a committed issue, so a
 * committed state holds every key part as it did before DC12; or fresh. As key text a committed issue is its ordinal's
 * digits and a fresh one `~<index>.<length>:<issuer>`, self-delimiting wherever it stands.
 */
export type Issue = number | FreshIssue;

/** The fresh issue `issue` is, `null` for a committed one: with `committedOrdinal`, the one reading of an issue's form. */
export function freshIssue(issue: Issue): FreshIssue | null {
  return typeof issue === "number" ? null : issue;
}

/** The ordinal of the committed issue `issue` is, `null` for a fresh one. */
export function committedOrdinal(issue: Issue): number | null {
  return typeof issue === "number" ? issue : null;
}

/** An issue's key text. */
export function issueText(issue: Issue): string {
  const fresh = freshIssue(issue);
  return fresh === null ? String(issue) : `~${fresh.index}.${fresh.issuer.length}:${fresh.issuer}`;
}

/** The issue whose text starts at `at` in `text`, and where its text ends. */
function readIssue(text: string, at: number): readonly [Issue, number] {
  if (text.charCodeAt(at) !== 0x7e) {
    let end = at;
    while (end < text.length && text.charCodeAt(end) >= 0x30 && text.charCodeAt(end) <= 0x39) end += 1;
    return [Number(text.slice(at, end)), end];
  }
  const dot = text.indexOf(".", at);
  const colon = text.indexOf(":", dot);
  const end = colon + 1 + Number(text.slice(dot + 1, colon));
  return [{ index: Number(text.slice(at + 1, dot)), issuer: text.slice(colon + 1, end) as IssuerText }, end];
}

/** Lean's `Issue.number`: a committed issue's ordinal, a fresh one's index in its unit. */
export function issueNumber(issue: Issue): number {
  return committedOrdinal(issue) ?? (issue as FreshIssue).index;
}

/**
 * Lean's `Ord Issue`: committed issues first, by ordinal; fresh ones by index, then unit (`compareIssuer`), so two
 * issues of one unit compare without reading its key.
 */
export function compareIssue(left: Issue, right: Issue): number {
  const [a, b] = [freshIssue(left), freshIssue(right)];
  if (a === null || b === null) return (a === null ? 0 : 1) - (b === null ? 0 : 1) || issueNumber(left) - issueNumber(right);
  return a.index - b.index || compareIssuer(a.issuer, b.issuer);
}

/** One step down the scope tree: an element and its issue among that element's entries in the same parent. */
export interface ScopeSegment { readonly element: ElementId; readonly ordinal: Issue; }

declare const scopeKeyBrand: unique symbol;

/**
 * Lean's `ScopeOccurrenceId` as canonical text: its segments innermost first, each `<length>:<element>#<issue>/`,
 * the element's length in UTF-16 code units and `<issue>` its issue's text (`issueText`), so the text of a key's parent
 * is its text after the first segment. The text never leaves the kernel.
 */
export type ScopeOccurrenceId = string & { readonly [scopeKeyBrand]: true };

/** The process instance's root scope occurrence: no segment. */
export const rootScope = "" as ScopeOccurrenceId;

/** The key of the scope occurrence of `element` entered in `parent` as the issue `ordinal`. */
export function childScope(parent: ScopeOccurrenceId, element: ElementId, ordinal: Issue): ScopeOccurrenceId {
  return `${element.length}:${element}#${issueText(ordinal)}/${parent}` as ScopeOccurrenceId;
}

/** The first segment of `scope` and the key of its parent, `null` for the root. */
export function scopeHead(scope: ScopeOccurrenceId): readonly [ScopeSegment, ScopeOccurrenceId] | null {
  if (scope === "") return null;
  const colon = scope.indexOf(":");
  const start = colon + 1;
  const length = Number(scope.slice(0, colon));
  const element = scope.slice(start, start + length);
  const [ordinal, end] = readIssue(scope, start + length + 1);
  return [{ element, ordinal }, scope.slice(end + 1) as ScopeOccurrenceId];
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

/** Lean's `Ord ScopeSegment`: the element, then the issue. */
function compareSegment(left: ScopeSegment, right: ScopeSegment): number {
  return compareStrings(left.element, right.element) || compareIssue(left.ordinal, right.ordinal);
}

/**
 * Lean's `orientKeyOrder`: `order` as the scope-led key orders give it, or its opposite in the opposite-key-order test
 * build (`key-order.ts`). Every scope-led key's order reads its scope-led head through an oriented order and orients the
 * rest of its comparison, so that build reverses the whole order of every map keyed by such a key.
 */
export function orientKeyOrder(order: number): number {
  return keyOrderOpposite && order !== 0 ? -order : order;
}

/**
 * The order of Lean's `Ord ScopeOccurrenceId`: the segments outermost first, lexicographically, so an ancestor comes
 * before its descendants and a subtree is one range of keys; oriented (`orientKeyOrder`).
 */
export function compareScopeOccurrenceId(left: ScopeOccurrenceId, right: ScopeOccurrenceId): number {
  if (left === right) return 0;
  const a = scopeSegments(left);
  const b = scopeSegments(right);
  for (let index = 1; index <= Math.min(a.length, b.length); index += 1) {
    const order = compareSegment(a[a.length - index] as ScopeSegment, b[b.length - index] as ScopeSegment);
    if (order !== 0) return orientKeyOrder(order);
  }
  return orientKeyOrder(a.length - b.length);
}

/**
 * Lean's order of a committed path, `List CommittedSegment`'s: the segments innermost first, lexicographically, a
 * prefix first. A unit root names a committed scope occurrence by it (`UnitRoot.idle`, `UnitRoot.offer`).
 */
function compareCommittedPath(left: ScopeOccurrenceId, right: ScopeOccurrenceId): number {
  if (left === right) return 0;
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

/** The order of Lean's `Ord ScopeSlot`: the parent's key, then the element, oriented (`orientKeyOrder`). */
export function compareScopeSlot(left: ScopeSlot, right: ScopeSlot): number {
  return compareScopeOccurrenceId(left.parent, right.parent) || orientKeyOrder(compareStrings(left.element, right.element));
}

declare const occurrenceKeyBrand: unique symbol;

/**
 * Lean's `OccurrenceId` as canonical text: an occurrence's structural key (KD1), the scope occurrence it was issued in,
 * its element and its issue, once committed an ordinal counted per (scope occurrence, element) by
 * `State.occurrenceOrdinals`, written `<length>:<element>#<issue>@<scope>`, the element's length in UTF-16 code units,
 * `<issue>` its issue's text and `<scope>` the scope key's text. Keys compare by value, never by object reference. The
 * text never leaves the kernel.
 */
export type OccurrenceId = string & { readonly [occurrenceKeyBrand]: true };

/** The key of the occurrence of `element` issued in `scope` as the issue `ordinal`. */
export function occurrenceId(scope: ScopeOccurrenceId, element: ElementId, ordinal: Issue): OccurrenceId {
  return `${element.length}:${element}#${issueText(ordinal)}@${scope}` as OccurrenceId;
}

/** The scope occurrence, element and issue of `id`. */
export function occurrenceIdParts(id: OccurrenceId): Readonly<{ scope: ScopeOccurrenceId; element: ElementId; ordinal: Issue }> {
  const colon = id.indexOf(":");
  const start = colon + 1;
  const length = Number(id.slice(0, colon));
  const element = id.slice(start, start + length);
  const [ordinal, end] = readIssue(id, start + length + 1);
  return { scope: id.slice(end + 1) as ScopeOccurrenceId, element, ordinal };
}

/** Whether the scope occurrence `outer` is `inner` or encloses it: Lean's test that `outer`'s segments end `inner`'s. */
export function scopeEncloses(outer: ScopeOccurrenceId, inner: ScopeOccurrenceId): boolean {
  for (let key: ScopeOccurrenceId | null = inner; key !== null && key.length >= outer.length; key = scopeParent(key)) {
    if (key === outer) return true;
  }
  return false;
}

/**
 * The order of Lean's `Ord OccurrenceId`: the scope occurrence's key, then the element, then the issue, oriented
 * (`orientKeyOrder`).
 */
export function compareOccurrenceId(left: OccurrenceId, right: OccurrenceId): number {
  if (left === right) return 0;
  const a = occurrenceIdParts(left);
  const b = occurrenceIdParts(right);
  return compareScopeOccurrenceId(a.scope, b.scope) ||
    orientKeyOrder(compareStrings(a.element, b.element) || compareIssue(a.ordinal, b.ordinal));
}

/** Lean's `UnitRoot` (`root.ts`), whose committed identities are held as their key text. */
export type UnitRoot =
  | Readonly<{ tag: UnitRootTag.Seed }>
  | Readonly<{ tag: UnitRootTag.Input }>
  | Readonly<{ tag: UnitRootTag.Idle; scope: ScopeOccurrenceId }>
  | Readonly<{ tag: UnitRootTag.Offer; occurrence: OccurrenceId; round: number }>
  | Readonly<{ tag: UnitRootTag.Finish; scope: ScopeOccurrenceId; element: ElementId; ordinal: number }>;

/** Lean's `Ord CommittedOccurrence`: the committed path of its scope occurrence, then the element, then the ordinal. */
function compareCommittedOccurrence(left: OccurrenceId, right: OccurrenceId): number {
  const a = occurrenceIdParts(left);
  const b = occurrenceIdParts(right);
  return compareCommittedPath(a.scope, b.scope) || compareStrings(a.element, b.element) || compareIssue(a.ordinal, b.ordinal);
}

/**
 * Lean's `Ord UnitRoot`: the seed, the input, then idle completions by their committed path, offers by their committed
 * occurrence and round, and finishes by their committed path, element and ordinal.
 */
function compareUnitRoot(left: UnitRoot, right: UnitRoot): number {
  if (left.tag !== right.tag) return rootRank(left) - rootRank(right);
  switch (left.tag) {
    case UnitRootTag.Seed:
    case UnitRootTag.Input:
      return 0;
    case UnitRootTag.Idle:
      return right.tag === UnitRootTag.Idle ? compareCommittedPath(left.scope, right.scope) : 0;
    case UnitRootTag.Offer:
      return right.tag === UnitRootTag.Offer ? compareCommittedOccurrence(left.occurrence, right.occurrence) || left.round - right.round : 0;
    case UnitRootTag.Finish:
      return right.tag === UnitRootTag.Finish
        ? compareCommittedPath(left.scope, right.scope) || compareStrings(left.element, right.element) || left.ordinal - right.ordinal
        : 0;
  }
  return assertNever(left);
}

/** A root's text in an issuer's text (`issuerText`): a letter, and a committed key behind its length. */
function rootText(root: UnitRoot): string {
  switch (root.tag) {
    case UnitRootTag.Seed:
      return "S";
    case UnitRootTag.Input:
      return "I";
    case UnitRootTag.Idle:
      return `D${root.scope.length}:${root.scope}`;
    case UnitRootTag.Offer:
      return `O${root.round},${root.occurrence.length}:${root.occurrence}`;
    case UnitRootTag.Finish:
      return `F${root.ordinal},${root.element.length}:${root.element}${root.scope}`;
  }
  return assertNever(root);
}

/**
 * Lean's `UnitKey` (DC4, DC20): a unit of a closure's work as one immutable node of its spine, holding its root, its
 * own step (`null` at the root), the unit that queued it, its depth, its 64-bit fingerprint, bit for bit Lean's, a
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

/** Lean's `Spine.fingerprintStep` over `SpineStep UnitStep`'s code (`unitStepCode` mod 2^64): xor, then the odd factor mod 2^64. */
function fingerprintStep(fingerprint: bigint, step: UnitStep): bigint {
  return BigInt.asUintN(64, (fingerprint ^ BigInt.asUintN(64, unitStepCode(step))) * 0x9E3779B97F4A7C15n);
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

/** The text a fresh issue of the unit `unit`, the `run`th unit its closure ran, names it by (`IssuerText`). */
export function issuerText(unit: UnitKey, run: number): IssuerText {
  return `${unit.depth}.${unit.fingerprint.toString(16).padStart(16, "0")}.${run}.${rootText(unit.root)}` as IssuerText;
}

/** The root whose text (`rootText`) is `text`. */
function rootOfText(text: string): UnitRoot {
  const kind = text.charAt(0);
  if (kind === "S") return { tag: UnitRootTag.Seed };
  if (kind === "I") return { tag: UnitRootTag.Input };
  if (kind === "D") return { tag: UnitRootTag.Idle, scope: text.slice(text.indexOf(":") + 1) as ScopeOccurrenceId };
  const comma = text.indexOf(",");
  if (kind === "F") {
    const colon = text.indexOf(":", comma);
    const end = colon + 1 + Number(text.slice(comma + 1, colon));
    return { tag: UnitRootTag.Finish, ordinal: Number(text.slice(1, comma)), element: text.slice(colon + 1, end), scope: text.slice(end) as ScopeOccurrenceId };
  }
  return { tag: UnitRootTag.Offer, round: Number(text.slice(1, comma)), occurrence: text.slice(text.indexOf(":", comma) + 1) as OccurrenceId };
}


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

/**
 * `compareUnitKey` over two issuers' texts (`IssuerText`): the depth, the fingerprint and the root, then, between two
 * distinct units of one closure that agree on all three, the order they ran in.
 */
function compareIssuer(left: IssuerText, right: IssuerText): number {
  if (left === right) return 0;
  // The depth's digits (no leading zero) and the fingerprint's 16 lowercase hexadecimal digits compare as text exactly as
  // their numbers do, the shorter depth first, so the leading fields compare without slicing; every map operation on the
  // issue table compares issues, and slicing here made the commit's issue order most of a long closure's time
  // (`automatic-loop-tail-at-closure-bound`, 2026-11-24).
  const [leftDot, rightDot] = [left.indexOf("."), right.indexOf(".")];
  if (leftDot !== rightDot) return leftDot - rightDot;
  for (let at = 0; at < leftDot + 17; at += 1) {
    const order = left.charCodeAt(at) - right.charCodeAt(at);
    if (order !== 0) return order;
  }
  const fields = (text: IssuerText): readonly [number, string, number, string] => {
    const depthEnd = text.indexOf(".");
    const runEnd = text.indexOf(".", depthEnd + 18);
    return [Number(text.slice(0, depthEnd)), text.slice(depthEnd + 1, depthEnd + 17), Number(text.slice(depthEnd + 18, runEnd)), text.slice(runEnd + 1)];
  };
  const [a, b] = [fields(left), fields(right)];
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return compareUnitRoot(rootOfText(a[3]), rootOfText(b[3])) || a[2] - b[2];
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

/**
 * Which counter numbers an occurrence: a Multi-Instance body and its instances number apart, as CIB gives the body an
 * activity id of its own (`BpmnParse:185`).
 */
export enum ActivationRole { Element = "element", MultiInstanceBody = "multiInstanceBody" }

/**
 * An occurrence's public key, which the journal and the observation publish, unlike its structural `OccurrenceId`: its
 * process instance, element, activation and the counter that numbered it.
 */
export interface OccurrenceKey {
  readonly processInstanceId: string;
  readonly element: ElementId;
  readonly activation: number;
  readonly role: ActivationRole;
}
