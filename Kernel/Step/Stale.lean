module

public import Kernel.Hooks

/-! # Step: queued work whose target is gone

What a queued signal does, the scope occurrences and occurrences it names, and what becomes of it when an interruption
removed one of them before it ran (`stale`). `Kernel.Step` builds each signal's work in its one match on `Signal`; none
matches a guarded type here.
-/

public section

namespace Kernel.Step

/-- An occurrence begins only in a scope occurrence that stands: a begin into one that is gone is an invariant failure,
never a silent begin, since whatever removes a scope occurrence also drops what would begin in it (a run an
interrupting catcher removes, `Compensation.dropWithin`; a queued signal, `stale`). -/
def requireScope (state : State) (scope : ScopeOccurrenceId) : Except Failure Unit :=
  if state.scopes.any (·.id == scope) then .ok () else .error (.semanticFailure "begin-into-missing-scope")

/-- What a queued signal does, and the scope occurrences and occurrences it does it in or on (`stale`). -/
structure SignalWork where
  scopes : List ScopeOccurrenceId := []
  occurrences : List Nat := []
  run : State → Outcome

/-- Whether `work` names a scope occurrence or an occurrence that was issued and has since been removed. Signals run
first in, first out, and an interruption removes in two steps: its firing withdraws the open items at once, its queued
cancellation or interrupting Event Sub-Process begin removes the occurrences and scope occurrences later. A signal a
micro-step between the two enqueued runs after the removal: the begin of what entering a scope occurrence queued, or the
arming of an Activity a queued begin started. Such work goes with what it names, as a firing that finds no item does
(`Signal.fire`). `nextIssue` counts every identity the state issues, of whatever kind, so a target below it is only
known to have been issued: one of the wrong kind, a kernel defect, reads as removed, and only one at or above it fails
as never issued (`requireScope`). A `raise` names its origin only as provenance and runs at the head of a queue a token
emptied; a firing names an item; a write, a removal, a compensation and its failure name none, so what their hooks do
with a scope occurrence that is gone stands (`compensation-handler-gone`); `endInstance` names nothing. -/
def stale (state : State) (work : SignalWork) : Bool :=
  work.scopes.any (fun scope => scope.value < state.nextIssue && !state.scopes.any (·.id == scope)) ||
    work.occurrences.any fun id => id < state.nextIssue && (state.occurrence? id).isNone

/-- Run a queued signal's work, unless what it names is gone (`stale`). -/
def SignalWork.perform (work : SignalWork) (state : State) : Outcome :=
  if stale state work then .ok state else work.run state

end Kernel.Step
