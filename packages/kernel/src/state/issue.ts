/**
 * Committed key forms and in-closure issue slots, transcribed from `Kernel/State/Issue.lean`: what the closure in
 * progress issues (DC12) reads of a key: whether it holds only committed issues (`committedScope`), whether it names an
 * issue of the closure in progress (`scopeFresh`, `occurrenceFresh`), the unit keys of the idle check, the offer, the
 * finish and the readiness it owns (`idleUnit`, `offerUnit`, `finishUnit`, `readyUnit`), and the slot an issue takes its committed ordinal in at commit (`ClaimSlot`), the issue
 * table's value (`State.issued`), beside the issuing unit's key, which a fresh issue's text names only by its digest
 * (`IssuerText`). Part of `state.ts`, which re-exports it.
 */
import { assertNever, type ElementId } from "../il/types.js";
import {
  compareIssue, compareOccurrenceId, compareScopeSlot, type FreshIssue, freshIssue, type Issue, occurrenceIdParts, type OccurrenceId, pushUnit,
  type IssuerText, rootScope, sameUnitKey, scopeHead, type ScopeOccurrenceId, type ScopeSlot, type UnitKey, unitRoot, UnitRootTag,
  UnitStepTag,
} from "./key.js";
import { orderedGet, type OrderedMap } from "./map.js";

/**
 * Lean's `ScopeOccurrenceId.committed?`: `scope` itself, the text of its committed path, when every segment is
 * committed; `null` when one was issued in the closure in progress.
 */
export function committedScope(scope: ScopeOccurrenceId): ScopeOccurrenceId | null {
  for (let head = scopeHead(scope); head !== null; head = scopeHead(head[1])) {
    if (freshIssue(head[0].ordinal) !== null) return null;
  }
  return scope;
}

/**
 * Lean's `ScopeOccurrenceId.fresh`: whether the scope occurrence was entered in the closure in progress, its innermost
 * segment fresh, since a scope occurrence entered in a closure is entered in one that stands.
 */
export function scopeFresh(scope: ScopeOccurrenceId): boolean {
  const head = scopeHead(scope);
  return head !== null && freshIssue(head[0].ordinal) !== null;
}

/** Lean's `OccurrenceId.fresh`: whether the key names an issue of the closure in progress, its own or its scope's. */
export function occurrenceFresh(id: OccurrenceId): boolean {
  const { scope, ordinal } = occurrenceIdParts(id);
  return freshIssue(ordinal) !== null || scopeFresh(scope);
}

/** The key of the unit that issued the fresh issue `issue`, read from the issue table, `null` for one it does not hold. */
function issuerOf(issued: IssueTable, issue: Issue): UnitKey | null {
  return orderedGet(issued, issue, compareIssue)?.unit ?? null;
}

/**
 * Lean's `UnitKey.idleUnit?`: the unit key of the idle check of `scope` (DC12), a root naming it when it is committed, a
 * step below the unit that issued it when it was issued in the closure, read from the issue table `issued`; `null` for a
 * committed segment above a fresh one, which no issue makes, or a fresh one the table does not hold.
 */
export function idleUnit(issued: IssueTable, scope: ScopeOccurrenceId): UnitKey | null {
  const head = scopeHead(scope);
  if (head === null) return unitRoot({ tag: UnitRootTag.Idle, scope: rootScope });
  const fresh = freshIssue(head[0].ordinal);
  if (fresh === null) {
    const path = committedScope(scope);
    return path === null ? null : unitRoot({ tag: UnitRootTag.Idle, scope: path });
  }
  const issuer = issuerOf(issued, fresh);
  return issuer === null ? null : pushUnit(issuer, { tag: UnitStepTag.Idle, index: fresh.index });
}

/**
 * Lean's `UnitKey.offerUnit?`: the unit key of the `round`th offer of the parked occurrence `occurrence` (DC12), as
 * `idleUnit` keys an idle check.
 */
export function offerUnit(issued: IssueTable, occurrence: OccurrenceId, round: number): UnitKey | null {
  const { scope, ordinal } = occurrenceIdParts(occurrence);
  const fresh = freshIssue(ordinal);
  if (fresh === null) return committedScope(scope) === null ? null : unitRoot({ tag: UnitRootTag.Offer, occurrence, round });
  const issuer = issuerOf(issued, fresh);
  return issuer === null ? null : pushUnit(issuer, { tag: UnitStepTag.Offer, index: fresh.index, round });
}

/**
 * Lean's `UnitKey.finishUnit?`: the unit key of the `ordinal`th finish of the Multi-Instance body of `element` whose
 * instances `scope` holds (DC30), as `idleUnit` keys an idle check; `null` for the process root, which holds no body's
 * instances, a committed segment above a fresh one, or a fresh one the table does not hold.
 */
export function finishUnit(issued: IssueTable, scope: ScopeOccurrenceId, element: ElementId, ordinal: number): UnitKey | null {
  const head = scopeHead(scope);
  if (head === null) return null;
  const fresh = freshIssue(head[0].ordinal);
  if (fresh === null) {
    const path = committedScope(scope);
    return path === null ? null : unitRoot({ tag: UnitRootTag.Finish, scope: path, element, ordinal });
  }
  const issuer = issuerOf(issued, fresh);
  return issuer === null ? null : pushUnit(issuer, { tag: UnitStepTag.Finish, index: fresh.index, ordinal });
}

/**
 * Lean's `UnitKey.readyUnit?`: the unit key of the `ordinal`th readiness of a compensation run in `scope` whose trigger's
 * occurrence is `trigger`, `null` for a group's nested run (DC30, `runAnchor`): a root naming both when they are
 * committed, a step below the unit that issued the trigger's occurrence, or a nested run's scope occurrence, when that was
 * issued in the closure; `null` for the process root without a trigger, a committed segment above a fresh one, or a fresh
 * issue the table does not hold.
 */
export function readyUnit(issued: IssueTable, scope: ScopeOccurrenceId, trigger: OccurrenceId | null, ordinal: number): UnitKey | null {
  const fresh = trigger === null ? freshScopeHead(scope) : freshIssue(occurrenceIdParts(trigger).ordinal);
  if (fresh === undefined) return null;
  if (fresh === null) {
    const path = committedScope(scope);
    if (path === null || (trigger !== null && committedScope(occurrenceIdParts(trigger).scope) === null)) return null;
    return unitRoot({ tag: UnitRootTag.Ready, scope: path, trigger, ordinal });
  }
  const issuer = issuerOf(issued, fresh);
  return issuer === null ? null : pushUnit(issuer, { tag: UnitStepTag.Ready, index: fresh.index, ordinal });
}

/** The fresh issue of `scope`'s innermost segment, `null` when it is committed, `undefined` for the process root. */
function freshScopeHead(scope: ScopeOccurrenceId): FreshIssue | null | undefined {
  const head = scopeHead(scope);
  return head === null ? undefined : freshIssue(head[0].ordinal);
}

/** Lean's `UnitKey.offers`: whether `key` is an offer of the parked occurrence `occurrence`, of any round (`offerUnit`). */
export function offersOccurrence(issued: IssueTable, occurrence: OccurrenceId, key: UnitKey): boolean {
  const { scope, ordinal } = occurrenceIdParts(occurrence);
  const fresh = freshIssue(ordinal);
  if (fresh === null) {
    return key.step === null && committedScope(scope) !== null && key.root.tag === UnitRootTag.Offer && key.root.occurrence === occurrence;
  }
  if (key.step?.tag !== UnitStepTag.Offer || key.step.index !== fresh.index || key.parent === null) return false;
  const issuer = issuerOf(issued, fresh);
  return issuer !== null && sameUnitKey(key.parent, issuer);
}

/**
 * Lean's `ClaimSlot` tags: the slot a fresh issue takes its committed ordinal in at commit (DC12), one per counter map,
 * so the commit's assignment keys exactly what each counter compares: a scope occurrence's (parent, element)
 * (`State.scopeOrdinals`), an occurrence's (scope occurrence, element) (`State.occurrenceOrdinals`), an item's
 * occurrence (`State.itemOrdinals`), and an order position's one slot (`State.nextOrder`, DC13), which has no owner;
 * an occurrence's issue counts on it too, for the order position it is (DC25, `assignStep`).
 */
export enum ClaimSlotTag { Scope = "scope", Occurrence = "occurrence", Item = "item", Position = "position" }
export type ClaimSlot =
  | Readonly<{ tag: ClaimSlotTag.Scope | ClaimSlotTag.Occurrence; slot: ScopeSlot }>
  | Readonly<{ tag: ClaimSlotTag.Item; occurrence: OccurrenceId }>
  | Readonly<{ tag: ClaimSlotTag.Position }>;

/** Lean's `ClaimSlot.rank`: the counter map a slot counts in. */
function claimRank(slot: ClaimSlot): number {
  switch (slot.tag) {
    case ClaimSlotTag.Scope:
      return 0;
    case ClaimSlotTag.Occurrence:
      return 1;
    case ClaimSlotTag.Item:
      return 2;
    case ClaimSlotTag.Position:
      return 3;
  }
  return assertNever(slot);
}

/** Lean's `ClaimSlot.scopeSlot?`. */
function claimScopeSlot(slot: ClaimSlot): ScopeSlot | null {
  switch (slot.tag) {
    case ClaimSlotTag.Scope:
    case ClaimSlotTag.Occurrence:
      return slot.slot;
    case ClaimSlotTag.Item:
    case ClaimSlotTag.Position:
      return null;
  }
  return assertNever(slot);
}

/** Lean's `ClaimSlot.item?`. */
function claimItem(slot: ClaimSlot): OccurrenceId | null {
  switch (slot.tag) {
    case ClaimSlotTag.Scope:
    case ClaimSlotTag.Occurrence:
      return null;
    case ClaimSlotTag.Item:
      return slot.occurrence;
    case ClaimSlotTag.Position:
      return null;
  }
  return assertNever(slot);
}

/** Lean's `Option` order: `none` first. */
function compareOption<T>(left: T | null, right: T | null, compare: (a: T, b: T) => number): number {
  return left === null || right === null ? (left === null ? 0 : 1) - (right === null ? 0 : 1) : compare(left, right);
}

/** Lean's `Ord ClaimSlot`: the counter map, then the scope slot, then the item's occurrence. */
export function compareClaimSlot(left: ClaimSlot, right: ClaimSlot): number {
  return claimRank(left) - claimRank(right) || compareOption(claimScopeSlot(left), claimScopeSlot(right), compareScopeSlot) ||
    compareOption(claimItem(left), claimItem(right), compareOccurrenceId);
}

/**
 * An issue table entry: the slot the issue takes its committed ordinal in (Lean's value) and the key of the unit that
 * issued it, which the issue's own text names only by its digest (`IssuerText`).
 */
export type Issued = Readonly<{ slot: ClaimSlot; unit: UnitKey }>;

/** Lean's `State.issued`: every identity issued in the closure in progress, by issue. */
export type IssueTable = OrderedMap<Issue, Issued>;

/** A running micro-step's unit (`State.issuing`), with the text its fresh issues name it by (`IssuerText`). */
export type Issuer = Readonly<{ unit: UnitKey; text: IssuerText }>;

/**
 * Lean's `Issue.notAfter`: whether the order position `left` comes no later than `right` (DC13): a committed position by
 * its number, before every pending one, which the closure in progress issued; two pending positions by their units under
 * `units`, then by their index in the unit. A pending position names its unit only by its digest, so the unit is read
 * from the issue table `issued`, which holds every issue of the closure in progress.
 */
export function issueNotAfter(units: (a: UnitKey, b: UnitKey) => number, issued: IssueTable, left: Issue, right: Issue): boolean {
  return compareIssuePlace(units, (issue) => issuerOf(issued, issue) ?? positionOutsideIssueTable(), left, right) <= 0;
}

/**
 * `issueNotAfter` as a three-way order, negative when `left` comes first, each pending position's unit read by `unitOf`:
 * a caller that holds the issue table's entries reads the unit there instead of searching the table at every comparison.
 */
export function compareIssuePlace(
  units: (a: UnitKey, b: UnitKey) => number, unitOf: (issue: FreshIssue) => UnitKey, left: Issue, right: Issue,
): number {
  const [a, b] = [freshIssue(left), freshIssue(right)];
  if (a === null || b === null) return (a === null ? 0 : 1) - (b === null ? 0 : 1) || (left as number) - (right as number);
  return units(unitOf(a), unitOf(b)) || a.index - b.index;
}

/** A pending position the issue table does not hold: an invariant failure, since the table holds every issue of the closure. */
export function positionOutsideIssueTable(): never {
  throw new Error("position-outside-issue-table");
}

/** The seed's unit key, which no micro-step runs under: the issuer between micro-steps (`State.issuing`). */
export const seedUnit: UnitKey = unitRoot({ tag: UnitRootTag.Seed });
