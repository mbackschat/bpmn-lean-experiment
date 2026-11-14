module

public import Kernel.Hooks

/-! # Step: queued work whose target is gone

What a queued signal does, the scope occurrences and occurrences it names, and the refusal of one an interruption
removed a target of before it ran (`stale`). `Kernel.Step` builds each signal's work in its one match on `Signal`;
none matches a guarded type here.
-/

public section

namespace Kernel.Step

/-- An occurrence begins only in a scope occurrence that stands: a begin into one that is gone is an invariant failure,
never a silent begin, since whatever removes a scope occurrence also drops what would begin in it (a run an
interrupting catcher removes, `Compensation.dropWithin`; a queued signal, `stale`). -/
def requireScope (state : State) (scope : ScopeOccurrenceId) : Except Failure Unit :=
  if state.scopes.any (·.id == scope) then .ok () else .error (.semanticFailure "begin-into-missing-scope")

/-- What a queued signal does, the scope occurrences and occurrences it does it in or on (`stale`), and the scope
occurrences it acts from (`gone`). -/
structure SignalWork where
  scopes : List ScopeOccurrenceId := []
  occurrences : List Nat := []
  requires : List ScopeOccurrenceId := []
  run : State → Outcome

/-- Whether `work` names a scope occurrence or an occurrence that was issued and has since been removed. Signals run
first in, first out, and an interruption removes in two steps: its firing withdraws the open items at once, its queued
cancellation or interrupting Event Sub-Process begin removes the occurrences and scope occurrences later. A signal a
micro-step between the two enqueued runs after the removal: the begin of what an earlier firing or the entry of a scope
occurrence queued, the arming of what such a begin started, or the arrival of a token it moved. Only a begin, an
arming and an `occur` name targets. `nextIssue` counts every identity the state issues, of whatever kind, so a target
below it is only known to have been issued: one of the wrong kind, a kernel defect, reads as removed, and only one at
or above it fails as never issued (`requireScope`). A completion and a cancellation do nothing to an occurrence that is
gone; a firing finds no item (`Signal.fire`); a `raise` names its origin only as provenance and runs at the head of a
queue a token emptied; a write, a removal, a compensation and a compensation's failure name the scope occurrence they act
from (`gone`); `endInstance` names nothing. -/
def stale (state : State) (work : SignalWork) : Bool :=
  work.scopes.any (fun scope => scope.value < state.nextIssue && !state.scopes.any (·.id == scope)) ||
    work.occurrences.any fun id => id < state.nextIssue && (state.occurrence? id).isNone

/-- Whether a scope occurrence `work` acts from is absent. A write, a removal, a compensation and a compensation's
failure are queued in the micro-step that queues their scope occurrence's removal, or in one before it, so the closure
order runs each before that removal (#121), as CIB writes an output before it destroys the execution
(`ExecutionEntity.java:518-528`). One that runs after it, or names a scope occurrence never issued, is a kernel defect:
never a write that lands at the instance root or in a variable set of a removed scope occurrence, never dropped, which
would commit without a write CIB makes, and never `unsupported`, which would claim CIB-LIM-0055. -/
def gone (state : State) (work : SignalWork) : Bool :=
  work.requires.any fun scope => !state.scopes.any (·.id == scope)

/-- Run a queued signal's work, unless an interruption removed what it names first (`stale`): then work an earlier
firing of the input started never reaches its first wait, where CIB runs it there before the interruption
(CIB-LIM-0055), so the input is `unsupported` rather than committed without that work. Work whose scope occurrence is
absent is an invariant failure (`gone`). -/
def SignalWork.perform (work : SignalWork) (state : State) : Outcome :=
  -- dynamic-only: whether an interruption overtakes queued work depends on the run's data and order
  if stale state work then .error (.unsupported "interrupted-before-wait")
  else if gone state work then .error (.semanticFailure "queued-work-scope-gone")
  else work.run state

end Kernel.Step
