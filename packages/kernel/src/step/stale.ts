/**
 * What a queued signal does, the scope occurrences and occurrences it names, and the refusal of one an interruption
 * removed a target of before it ran (`stale`), transcribed from `Kernel/Step/Stale.lean`. `step.ts` builds each
 * signal's work in its one switch on `SignalTag`.
 */
import { FailureTag, SemanticCause, failed, semanticFailure, type Outcome, type ScopeOccurrenceId, type State } from "../state.js";

/**
 * An occurrence begins only in a scope occurrence that stands: a begin into one that is gone is an invariant failure,
 * never a silent begin, since whatever removes a scope occurrence also drops what would begin in it (a run an
 * interrupting catcher removes, `Compensation.dropWithin`; a queued signal, `stale`). `null` when it stands.
 */
export function requireScope(state: State, scope: ScopeOccurrenceId): Outcome | null {
  return state.scopes.some((entry) => entry.id === scope) ? null : semanticFailure(SemanticCause.Invariant, "begin-into-missing-scope");
}

/**
 * A signal's transition, whether it is a completion, the one kind `absorb` runs inside the micro-step, the scope
 * occurrences and occurrences it works in or on (`stale`), and the scope occurrences it acts from and the occurrences it
 * acts on (`gone`): Lean's `SignalWork`.
 */
export type SignalRun = Readonly<{
  completion: boolean; run: (state: State) => Outcome; scopes: readonly ScopeOccurrenceId[]; occurrences: readonly number[];
  requires: readonly ScopeOccurrenceId[]; acts: readonly number[];
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
