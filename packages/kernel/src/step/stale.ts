/**
 * What a queued signal does, the scope occurrences and occurrences it names, and what becomes of it when an interruption
 * removed one of them before it ran (`stale`), transcribed from `Kernel/Step/Stale.lean`. `step.ts` builds each
 * signal's work in its one switch on `SignalTag`.
 */
import { FailureTag, committed, failed, type Outcome, type ScopeOccurrenceId, type State } from "../state.js";

/**
 * An occurrence begins only in a scope occurrence that stands: a begin into one that is gone is an invariant failure,
 * never a silent begin, since whatever removes a scope occurrence also drops what would begin in it (a run an
 * interrupting catcher removes, `Compensation.dropWithin`; a queued signal, `stale`). `null` when it stands.
 */
export function requireScope(state: State, scope: ScopeOccurrenceId): Outcome | null {
  return state.scopes.some((entry) => entry.id === scope) ? null : failed(FailureTag.SemanticFailure, "begin-into-missing-scope");
}

/**
 * A signal's transition, whether it is a completion, the one kind `absorb` runs inside the micro-step, and the scope
 * occurrences and occurrences it works in or on (`stale`): Lean's `SignalWork`.
 */
export type SignalRun = Readonly<{
  completion: boolean; run: (state: State) => Outcome; scopes: readonly ScopeOccurrenceId[]; occurrences: readonly number[];
}>;

/**
 * `Kernel.Step.stale`: whether a queued signal names a scope occurrence or an occurrence issued and since removed, which
 * an interruption's queued cancellation or interrupting begin removed after a micro-step enqueued the signal.
 */
function stale(state: State, work: SignalRun): boolean {
  return work.scopes.some((scope) => scope < state.nextIssue && !state.scopes.some((entry) => entry.id === scope)) ||
    work.occurrences.some((id) => id < state.nextIssue && !state.occurrences.some((occurrence) => occurrence.id === id));
}

/** `Kernel.Step.SignalWork.perform`: run a queued signal's work, unless what it names is gone (`stale`). */
export function perform(work: SignalRun, state: State): Outcome {
  return stale(state, work) ? committed(state) : work.run(state);
}
