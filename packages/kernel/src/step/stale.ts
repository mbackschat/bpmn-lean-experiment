/**
 * What a queued signal does, the scope occurrences and occurrences it names, and the refusal of one an interruption
 * removed a target of before it ran (`stale`), transcribed from `Kernel/Step/Stale.lean`. `step.ts` builds each
 * signal's work in its one switch on `SignalTag`.
 */
import { FailureTag, failed, type Outcome, type ScopeOccurrenceId, type State } from "../state.js";

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
 * an interruption's queued cancellation or interrupting begin removed after a micro-step enqueued the signal. Only a
 * begin, an arming and an `occur` name targets. `nextIssue` counts every identity of whatever kind, so a target below it
 * is only known to have been issued: one of the wrong kind reads as removed, and only one at or above it fails as never
 * issued (`requireScope`).
 */
function stale(state: State, work: SignalRun): boolean {
  return work.scopes.some((scope) => scope < state.nextIssue && !state.scopes.some((entry) => entry.id === scope)) ||
    work.occurrences.some((id) => id < state.nextIssue && !state.occurrences.some((occurrence) => occurrence.id === id));
}

/**
 * `Kernel.Step.SignalWork.perform`: run a queued signal's work, unless an interruption removed what it names first
 * (`stale`): then work an earlier firing of the input started never reaches its first wait, where CIB runs it there
 * before the interruption (CIB-LIM-0055), so the input is `unsupported` rather than committed without that work.
 */
export function perform(work: SignalRun, state: State): Outcome {
  // dynamic-only: whether an interruption overtakes queued work depends on the run's data and order
  return stale(state, work) ? failed(FailureTag.Unsupported, "interrupted-before-wait") : work.run(state);
}
