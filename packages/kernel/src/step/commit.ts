/**
 * How a micro-step's effects become the input's journal, transcribed from `Kernel/Step/Commit.lean`: `journalDraft`
 * turns the draft into one `Transition` of the closure, keyed by the unit that ran it, and `orderJournal` commits a
 * settled closure: its transitions and intents in run order, read from the run log (`runPosition`), every family keyed by
 * a unit key emptied, so no unit key outlives its closure (DC4), and every identity the closure issued renamed to its
 * committed ordinal (`compact`, DC12). `step.ts#conclude` applies the first before it tells the features what the
 * micro-step removed and wrote, since only `step.ts` calls those hooks (guard 17). The renaming itself writes the state,
 * so it is `state/rename.ts`'s, which takes the continuation renaming from here: `continuationRekey` and
 * `continuationBody` are `step.ts`'s matches on `Continuation`.
 */
import { assertNever, type BranchSchedule, type ElementId } from "../il/types.js";
import {
  committed, type Continuation, ContinuationTag, compareUnitKey, emptyDraft, type OccurrenceId, orderedAny,
  orderedEntries, orderedGet, orderedInsert, type OrderedMap, type Outcome, sameUnitKey, seedUnit, semanticFailure,
  failed, FailureTag, issuerText, type Issued, type IssueTable, SemanticCause, type BroadcastIntent, type Cause,
  type InstanceName, type ScopeOccurrenceId, type State, type Transition, type TreeMap, type UnitKey, compareIssue, compareOccurrenceId,
  compareScopeSlot, type FreshIssue, freshIssue, type Issue, compareIssuePlace, type ClaimSlot, ClaimSlotTag, compareClaimSlot,
  occurrenceFresh, positionOutsideIssueTable, scopeFresh,
} from "../state.js";
import { treeMapGetD, treeMapInsert } from "../state/map.js";
import { renameId, type Rename, renameScope, renameState } from "../state/rename.js";
import { issuerOrder, runPosition, type RunLog } from "./order.js";

/** The draft as the transition of the unit `unit`, the draft and the write log emptied. */
export function journalDraft(unit: UnitKey, cause: Cause, element: ElementId | null, owner: ScopeOccurrenceId, state: State): State {
  const { draft } = state;
  const transition: Transition = { cause, element, owner, started: draft.started, ended: draft.ended, ready: draft.ready };
  return { ...state, transitions: orderedInsert(state.transitions, unit, transition, compareUnitKey), draft: emptyDraft, writes: [] };
}

/** Lean's `byRun`: the entries of a unit-keyed family in run order, by position, then by key. */
function byRun<T>(log: RunLog, entries: OrderedMap<UnitKey, T>): T[] {
  return orderedEntries(entries).map(([unit, value]) => [runPosition(log, unit), unit, value] as const)
    .sort((a, b) => a[0] - b[0] || compareUnitKey(a[1], b[1])).map(([, , value]) => value);
}

// Compaction at commit (DC12)

/** Lean's `Continuation.body?`: the Multi-Instance body occurrence an instance's occurrence completes into, else `null`. */
export function continuationBody(continuation: Continuation): OccurrenceId | null {
  switch (continuation.tag) {
    case ContinuationTag.MultiInstance:
      return continuation.body;
    case ContinuationTag.Flow:
    case ContinuationTag.Compensation:
      return null;
  }
  return assertNever(continuation);
}

/** Lean's `Continuation.rekey`: a continuation with its identities renamed. */
function continuationRekey(
  occurrence: (id: OccurrenceId) => OccurrenceId, scope: (key: ScopeOccurrenceId) => ScopeOccurrenceId, continuation: Continuation,
): Continuation {
  switch (continuation.tag) {
    case ContinuationTag.Flow:
      return continuation;
    case ContinuationTag.MultiInstance:
      return { ...continuation, body: occurrence(continuation.body) };
    case ContinuationTag.Compensation:
      return { ...continuation, run: scope(continuation.run) };
  }
  return assertNever(continuation);
}

/** An issue's committed ordinal (`assign`) and, for an occurrence's issue, its committed order position (`positionsOf`). */
type Assigned = readonly [ordinal: number, position: number | null];

/**
 * Lean's `renameBy` over `assign`'s ordinals or `positionsOf`'s positions, as `pick` reads them: an assigned fresh
 * issue's committed number, every other issue itself. One map holds both, so the commit inserts each issue once.
 */
function renameBy(assigned: OrderedMap<Issue, Assigned>, pick: (entry: Assigned) => number | null): Rename {
  return (issue) => {
    if (freshIssue(issue) === null) return issue;
    const entry = orderedGet(assigned, issue, compareIssue);
    return entry === undefined ? issue : pick(entry) ?? issue;
  };
}

/**
 * Lean's `slotBase`: a slot's first ordinal for the closure's issues, its counter in `state`, the closure's starting
 * state (`compact`), or 0 for a slot whose owner the closure issued, which has no counter yet.
 */
function slotBase(state: State, claim: ClaimSlot): number {
  switch (claim.tag) {
    case ClaimSlotTag.Scope:
      return scopeFresh(claim.slot.parent) ? 0 : treeMapGetD(state.scopeOrdinals, claim.slot, compareScopeSlot, 0);
    case ClaimSlotTag.Occurrence:
      return scopeFresh(claim.slot.parent) ? 0 : treeMapGetD(state.occurrenceOrdinals, claim.slot, compareScopeSlot, 0);
    case ClaimSlotTag.Item:
      return occurrenceFresh(claim.occurrence) ? 0 : treeMapGetD(state.itemOrdinals, claim.occurrence, compareOccurrenceId, 0);
    case ClaimSlotTag.Position:
      return state.nextOrder;
  }
  return assertNever(claim);
}

/**
 * Lean's `issueOrder`: the closure's issues in the closure's position order under `schedule` (`issuerOrder`, DC13), by
 * their units, then by their index in the unit, from the issue table's key order by a stable sort. So the commit numbers
 * positions in the order the closure's bodies compared them, and under `orderInvariant` every slot's numbering is a
 * function of the end state (KD1).
 */
function issueOrder(schedule: BranchSchedule, log: RunLog, state: State): (readonly [Issue, ClaimSlot])[] {
  const units = issuerOrder(schedule, log);
  const entries = orderedEntries(state.issued);
  // Each entry holds its issue's unit, read here by the key itself: searching the table at every comparison
  // (`issueNotAfter`) made this sort most of a long closure's commit (`automatic-loop-tail-at-closure-bound`, 2026-11-24).
  const unitOf = new Map<Issue, UnitKey>(entries.map(([issue, { unit }]) => [issue, unit]));
  const unit = (issue: FreshIssue): UnitKey => unitOf.get(issue) ?? positionOutsideIssueTable();
  return entries.map(([issue, { slot }]) => [issue, slot] as const)
    .sort(([a], [b]) => compareIssuePlace(units, unit, a, b));
}

const positionSlot: ClaimSlot = { tag: ClaimSlotTag.Position };

/**
 * Lean's `assign`: every issue's committed ordinal, per slot in issue order above the slot's base, and each advanced
 * slot's next ordinal, keyed by the slot as issued; an occurrence's issue also counts the position slot (`assignStep`).
 * Lean's `positionsOf` beside it: the order position each occurrence issue commits to, the position counter where the
 * same pass counts it, so one walk of the issue order gives both.
 */
function assign(
  schedule: BranchSchedule, start: State, log: RunLog, state: State,
): readonly [OrderedMap<Issue, Assigned>, TreeMap<ClaimSlot, number>] {
  let assigned: OrderedMap<Issue, Assigned> = null;
  let next: TreeMap<ClaimSlot, number> = [];
  for (const [issue, slot] of issueOrder(schedule, log, state)) {
    const taken = treeMapGetD(next, slot, compareClaimSlot, slotBase(start, slot));
    next = treeMapInsert(next, slot, taken + 1, compareClaimSlot);
    let position: number | null = null;
    if (slot.tag === ClaimSlotTag.Occurrence) {
      position = treeMapGetD(next, positionSlot, compareClaimSlot, slotBase(start, positionSlot));
      next = treeMapInsert(next, positionSlot, position + 1, compareClaimSlot);
    }
    assigned = orderedInsert(assigned, issue, [taken, position] as const, compareIssue);
  }
  return [assigned, next];
}

/** Lean's `raiseCounter`: a counter never decreases, so an advanced slot's next ordinal replaces it only upward. */
function raiseCounter<K>(counters: TreeMap<K, number>, slot: K, ordinal: number, compare: (left: K, right: K) => number): TreeMap<K, number> {
  return treeMapInsert(counters, slot, Math.max(ordinal, treeMapGetD(counters, slot, compare, 0)), compare);
}

/** One advanced slot's next ordinal raised into its renamed counter, where its renamed owner stands in `renamed`. */
function advanceSlot(rename: Rename, renamed: State, state: State, claim: ClaimSlot, ordinal: number): State {
  switch (claim.tag) {
    case ClaimSlotTag.Scope:
    case ClaimSlotTag.Occurrence: {
      const slot = { ...claim.slot, parent: renameScope(rename, claim.slot.parent) };
      if (!renamed.scopes.some((scope) => scope.id === slot.parent)) return state;
      return claim.tag === ClaimSlotTag.Scope
        ? { ...state, scopeOrdinals: raiseCounter(state.scopeOrdinals, slot, ordinal, compareScopeSlot) }
        : { ...state, occurrenceOrdinals: raiseCounter(state.occurrenceOrdinals, slot, ordinal, compareScopeSlot) };
    }
    case ClaimSlotTag.Item: {
      const occurrence = renameId(rename, claim.occurrence);
      return renamed.occurrences.some((entry) => entry.id === occurrence)
        ? { ...state, itemOrdinals: raiseCounter(state.itemOrdinals, occurrence, ordinal, compareOccurrenceId) } : state;
    }
    case ClaimSlotTag.Position:
      return { ...state, nextOrder: Math.max(ordinal, state.nextOrder) };
  }
  return assertNever(claim);
}

/**
 * Lean's `advance`, renamed since `advance` names `feature/compensation.ts`'s (guard 8): the counters after the commit,
 * each advanced slot's next ordinal under its renamed slot, where its renamed owner stands; a counter whose owner the
 * closure removed goes, as it went with its owner.
 */
function advanceCounters(rename: Rename, next: TreeMap<ClaimSlot, number>, renamed: State): State {
  return next.reduce((state, [claim, ordinal]) => advanceSlot(rename, renamed, state, claim, ordinal), renamed);
}

/** Lean's `sameIssuerName`: whether two fresh issues share their index and their units agree on depth, fingerprint and root. */
function sameIssuerName(left: readonly [Issue, Issued], right: readonly [Issue, Issued]): boolean {
  const [a, b] = [freshIssue(left[0]), freshIssue(right[0])];
  return a !== null && b !== null && a.index === b.index && issuerText(left[1].unit, 0) === issuerText(right[1].unit, 0);
}

/**
 * Lean's `issuerCollision`: whether two distinct units of the closure issued at a common index and agree on depth,
 * fingerprint and root, which a fresh issue's text (`IssuerText`) orders by the order they ran in where Lean orders by
 * path. Distinct steps have distinct fingerprint codes (`unitStepCode`), so only a 64-bit fingerprint collision makes
 * such a pair. One pass in the table's order, which runs the fresh issues by index, then by depth, fingerprint and root, so such
 * a pair has a neighbouring pair of the same kind, and the table's keys are distinct, so the neighbours' units differ.
 */
function issuerCollision(issued: IssueTable): boolean {
  let previous: readonly [Issue, Issued] | null = null;
  let collides = false;
  for (const entry of orderedEntries(issued)) {
    collides ||= previous !== null && sameIssuerName(previous, entry);
    previous = entry;
  }
  return collides;
}

/**
 * Lean's `compact`: rename every identity the closure issued to its committed form (DC12). In issue order, every issue
 * takes its slot's next ordinal above the slot's counter in `start`, the closure's starting state, so the committed keys
 * are the ones a counter at issue gave, even for a slot whose owner the closure removed, which prunes its counters
 * (`leaveScope`); the counters of owners that stand advance past them; the issue table empties. An issue no unit made (issued between
 * micro-steps) is an invariant failure. A closure that issued nothing commits its state as it is, so only an issuing
 * commit renames the whole state, linear in its size.
 */
export function compact(schedule: BranchSchedule, start: State, log: RunLog, state: State): Outcome {
  if (state.issued === null) return committed(state);
  if (orderedAny(state.issued, (_, { unit }) => sameUnitKey(unit, seedUnit))) {
    return semanticFailure(SemanticCause.Invariant, "issue-outside-unit");
  }
  // dynamic-only: a 64-bit fingerprint collision between two units of one closure, which no model property predicts
  if (issuerCollision(state.issued)) return failed(FailureTag.Unsupported, "unit-fingerprint-collision");
  const [assigned, next] = assign(schedule, start, log, state);
  const rename = renameBy(assigned, ([ordinal]) => ordinal);
  const continuation = (kept: Continuation): Continuation =>
    continuationRekey((id) => renameId(rename, id), (key) => renameScope(rename, key), kept);
  const renamed = advanceCounters(rename, next, renameState(rename, renameBy(assigned, ([, position]) => position), continuation, state));
  return committed({ ...renamed, issued: null, issuing: null, issueNext: 0 });
}

/**
 * The process instances Lean's `countLive` keeps the activation counters of: the process instance itself, every one a
 * standing scope occurrence calls, and the thrower's of every compensation run in progress, which in an admitted model
 * is the run's own instance and so adds none. A counter's instance is committed, so only committed names can be its: a
 * pending name equals no committed one (Lean's `InstanceName` equality), and the set holds identifiers.
 */
function liveInstances(state: State): ReadonlySet<string> {
  const live = new Set<string>([state.instanceId]);
  const add = (name: InstanceName | null): void => { if (typeof name === "string") live.add(name); };
  for (const scope of state.scopes) add(scope.calledInstance);
  for (const run of state.slots.compensation.runs) add(run.trigger.processInstanceId);
  return live;
}

/**
 * Lean's `orderJournal`: commit a settled closure, its transitions as the journal and its batches' intents as the input's
 * intents, each in the order its units ran, every family keyed by a unit key emptied, and every identity it issued
 * compacted (`compact`) against the counters of `start`, the state the closure began from. Queued work an instance that ended mid-closure left behind is dropped with them: no input runs
 * on an ended instance. The activation counters of every called instance the closure left go (DC24), and the draft goes
 * with the transitions.
 */
export function orderJournal(schedule: BranchSchedule, start: State, state: State, log: RunLog): Outcome {
  const live = liveInstances(state);
  return compact(schedule, start, log, {
    ...state, journal: byRun(log, state.transitions), intents: byRun<readonly BroadcastIntent[]>(log, state.outboxes).flat(),
    transitions: null, outboxes: null, queuedTokens: null, queuedSignals: null, draft: emptyDraft,
    activations: state.activations.filter((count) => typeof count.processInstance === "string" && live.has(count.processInstance)),
  });
}
