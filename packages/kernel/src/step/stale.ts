/**
 * What a queued signal does, the scope occurrences and occurrences it names, and the refusal of one an interruption
 * removed a target of before it ran (`stale`), transcribed from `Kernel/Step/Stale.lean`. `step.ts` builds each
 * signal's work in its one switch on `SignalTag`.
 */
import {
  FailureTag, SemanticCause, failed, semanticFailure, stands, type Outcome, type ScopeOccurrenceId, type State,
  committedOrdinal, compareIssue, compareScopeSlot, occurrenceIdParts, type OccurrenceId, scopeHead,
} from "../state.js";
import { orderedHas, treeMapGetD } from "../state/map.js";

/**
 * An occurrence begins only in a scope occurrence that stands: a begin into one that is gone is an invariant failure,
 * never a silent begin, since whatever removes a scope occurrence also drops what would begin in it (a run an
 * interrupting catcher removes, `Compensation.dropWithin`; a queued signal, `stale`). `null` when it stands.
 */
export function requireScope(state: State, scope: ScopeOccurrenceId): Outcome | null {
  return state.scopes.some((entry) => entry.id === scope) ? null : semanticFailure(SemanticCause.Invariant, "begin-into-missing-scope");
}

/**
 * Whether the scope occurrence key `scope` was issued, as far as the counters that remain can tell: the ordinal below
 * its deepest standing ancestor is below that ancestor's counter for its element. A counter goes with its scope
 * occurrence, so of a key below a removed subtree only this is known (KD1, `stale`). A segment issued in the closure in
 * progress was issued exactly when the issue table holds it, since nothing the closure issues leaves it before the commit
 * (DC12).
 */
function scopeIssued(state: State, scope: ScopeOccurrenceId): boolean {
  for (let head = scopeHead(scope); head !== null; head = scopeHead(head[1])) {
    const [{ element, ordinal }, parent] = head;
    const committed = committedOrdinal(ordinal);
    if (committed === null) return orderedHas(state.issued, ordinal, compareIssue);
    if (stands(state, parent)) return committed < treeMapGetD(state.scopeOrdinals, { parent, element }, compareScopeSlot, 0);
  }
  return true;
}

/**
 * Whether the occurrence key `id` was issued, as far as the counters that remain can tell: its scope occurrence key was
 * issued (`scopeIssued`) and, while that scope occurrence stands, its ordinal is below the scope occurrence's counter for
 * its element. A counter goes with its scope occurrence, so of a key issued in a removed one only that is known (KD1).
 * One issued in the closure in progress was issued exactly when the issue table holds it (DC12).
 */
function occurrenceIssued(state: State, id: OccurrenceId): boolean {
  const { scope, element, ordinal } = occurrenceIdParts(id);
  if (!scopeIssued(state, scope)) return false;
  const committed = committedOrdinal(ordinal);
  if (committed === null) return orderedHas(state.issued, ordinal, compareIssue);
  return !stands(state, scope) || committed < treeMapGetD(state.occurrenceOrdinals, { parent: scope, element }, compareScopeSlot, 0);
}

/**
 * A signal's transition, whether it is a completion, the one kind `absorb` runs inside the micro-step, the scope
 * occurrences and occurrences it works in or on (`stale`), and the scope occurrences it acts from and the occurrences it
 * acts on (`gone`): Lean's `SignalWork`.
 */
export type SignalRun = Readonly<{
  completion: boolean; run: (state: State) => Outcome; scopes: readonly ScopeOccurrenceId[]; occurrences: readonly OccurrenceId[];
  requires: readonly ScopeOccurrenceId[]; acts: readonly OccurrenceId[];
  /** What else the signal keeps busy while it is queued (DC5): a firing its item's scope, a raise its origin's, the end all. */
  holds: (state: State) => readonly ScopeOccurrenceId[];
  /** The scope occurrence of the compensation run whose readiness work the signal is and the context releasing it (DC30). */
  ready: readonly [ScopeOccurrenceId, ScopeOccurrenceId] | null;
}>;

/** Lean's `SignalWork.names`: the scope occurrences a queued signal names, each busy, with every enclosing one (DC5). */
export function queuedNames(work: SignalRun, state: State): readonly ScopeOccurrenceId[] {
  return [...work.scopes, ...work.requires, ...[...work.occurrences, ...work.acts].map((id) => occurrenceIdParts(id).scope), ...work.holds(state)];
}

/**
 * `Kernel.Step.stale`: whether a queued signal names a scope occurrence or an occurrence issued and since removed, which
 * an interruption's queued cancellation or interrupting begin removed after a micro-step enqueued the signal. Only a
 * begin, an arming and an `occur` name targets. A scope occurrence key reads as issued by the counter of its deepest
 * standing ancestor (`scopeIssued`), and an occurrence key by its scope occurrence's (`occurrenceIssued`), so a key below
 * a removed subtree is only known to lie below an issued one, and reads as removed (KD1); only a key its standing counter
 * has not reached fails as never issued (`gone`, `requireScope`).
 */
function stale(state: State, work: SignalRun): boolean {
  return work.scopes.some((scope) => scopeIssued(state, scope) && !state.scopes.some((entry) => entry.id === scope)) ||
    work.occurrences.some((id) => occurrenceIssued(state, id) && !state.occurrences.some((occurrence) => occurrence.id === id));
}

/**
 * `Kernel.Step.gone`: the invariant failure's code when a target the work acts from or on is absent: a scope occurrence
 * a write, a removal, a compensation or a compensation's failure acts from (`queued-work-scope-gone`), else the
 * occurrence a completion or a cancellation acts on (`queued-work-occurrence-gone`). The closure order runs each while its
 * target stands (#121, #151), as CIB writes an output before it destroys the execution (`ExecutionEntity.java:518-528`),
 * so one that runs after its target's removal, or names one never issued, is a kernel defect: never a write at the
 * instance root or in a removed scope occurrence's variable set, never dropped, and never `unsupported`, which would
 * claim CIB-LIM-0055. `null` when every target stands.
 */
function gone(state: State, work: SignalRun): string | null {
  if (work.requires.some((scope) => !state.scopes.some((entry) => entry.id === scope))) return "queued-work-scope-gone";
  return work.acts.some((id) => !state.occurrences.some((occurrence) => occurrence.id === id)) ? "queued-work-occurrence-gone" : null;
}

/**
 * `Kernel.Step.SignalWork.perform`: run a queued signal's work, unless an interruption removed what it names first
 * (`stale`): then work an earlier firing of the input started never reaches its first wait, where CIB runs it there
 * before the interruption (CIB-LIM-0055), so the input is `unsupported` rather than committed without that work. Work
 * a target of which is absent is an invariant failure (`gone`).
 */
export function perform(work: SignalRun, state: State): Outcome {
  // dynamic-only: whether an interruption overtakes queued work depends on the run's data and order
  if (stale(state, work)) return failed(FailureTag.Unsupported, "interrupted-before-wait");
  const absent = gone(state, work);
  return absent !== null ? semanticFailure(SemanticCause.Invariant, absent) : work.run(state);
}
