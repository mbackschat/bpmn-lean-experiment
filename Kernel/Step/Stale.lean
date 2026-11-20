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
  if state.scopes.any (·.id == scope) then .ok () else .error (.semanticFailure .invariant "begin-into-missing-scope")

/-- Whether the scope occurrence key `scope` was issued, as far as the counters that remain can tell: the ordinal
below its deepest standing ancestor is below that ancestor's counter for its element. A counter goes with its scope
occurrence, so of a key below a removed subtree only this is known (KD1, `stale`). -/
def scopeIssued (state : State) (scope : ScopeOccurrenceId) : Bool :=
  let rec go : (segments : List ScopeSegment) → (scope : ScopeOccurrenceId) → scope.segments = segments → Bool
    | [], _, _ => true
    | segment :: rest, scope, segments =>
      let parent := scope.up segments
      if state.scopes.any (·.id == parent) then
        segment.ordinal < state.scopeOrdinals.getD { parent, element := segment.element } 0
      else go rest parent rfl
  go scope.segments scope rfl

/-- Whether the occurrence key `id` was issued, as far as the counters that remain can tell: its scope occurrence key was
issued (`scopeIssued`) and, while that scope occurrence stands, its ordinal is below the scope occurrence's counter for
its element. A counter goes with its scope occurrence, so of a key issued in a removed one only that is known (KD1). -/
def occurrenceIssued (state : State) (id : OccurrenceId) : Bool :=
  scopeIssued state id.scope && (!state.scopes.any (·.id == id.scope) ||
    decide (id.ordinal < state.occurrenceOrdinals.getD { parent := id.scope, element := id.element } 0))

/-- What a queued signal does, whether it is a completion, the one kind `absorb` runs inside the micro-step, the scope
occurrences and occurrences it does it in or on (`stale`), and the scope occurrences it acts from and the occurrences it
acts on (`gone`). -/
structure SignalWork where
  completion : Bool := false
  scopes : List ScopeOccurrenceId := []
  occurrences : List OccurrenceId := []
  requires : List ScopeOccurrenceId := []
  acts : List OccurrenceId := []
  /-- What else the signal keeps busy while it is queued (DC5): a firing its item's scope occurrence, a raise its
  origin's, the instance's end every one. -/
  holds : State → List ScopeOccurrenceId := fun _ => []
  run : State → Outcome

/-- The scope occurrences a queued signal names, each of which stays busy, with every scope occurrence enclosing it,
while the signal is queued (DC5, `Step.idleScope?`). -/
def SignalWork.names (work : SignalWork) (state : State) : List ScopeOccurrenceId :=
  work.scopes ++ work.requires ++ (work.occurrences ++ work.acts).map (·.scope) ++ work.holds state

/-- Whether `work` names a scope occurrence or an occurrence that was issued and has since been removed. Signals run
first in, first out, and an interruption removes in two steps: its firing withdraws the open items at once, its queued
cancellation or interrupting Event Sub-Process begin removes the occurrences and scope occurrences later. A signal a
micro-step between the two enqueued runs after the removal: the begin of what an earlier firing or the entry of a scope
occurrence queued, the arming of what such a begin started, or the arrival of a token it moved. Only a begin, an
arming and an `occur` name targets. A scope occurrence key reads as issued by the counter of its deepest standing
ancestor (`scopeIssued`), and an occurrence key by its scope occurrence's (`occurrenceIssued`), so a key below a removed
subtree is only known to lie below an issued one, and reads as removed (KD1); only a key its standing counter has not
reached fails as never issued (`gone`, `requireScope`). A completion and a cancellation name the occurrence they act on, a
write, a removal, a compensation and a compensation's failure the scope occurrence they act from (`gone`); a firing finds
no item (`Signal.fire`); a `raise` names its origin only as provenance and runs at the head of a queue a token emptied;
`endInstance` names nothing. -/
def stale (state : State) (work : SignalWork) : Bool :=
  work.scopes.any (fun scope => scopeIssued state scope && !state.scopes.any (·.id == scope)) ||
    work.occurrences.any fun id => occurrenceIssued state id && (state.occurrence? id).isNone

/-- The invariant failure's code when a target `work` acts from or on is absent: a scope occurrence it acts from
(`queued-work-scope-gone`), else an occurrence it acts on (`queued-work-occurrence-gone`). A write, a removal, a
compensation and a compensation's failure are queued in the micro-step that queues their scope occurrence's removal, or
in one before it, so the closure order runs each before that removal (#121), as CIB writes an output before it destroys
the execution (`ExecutionEntity.java:518-528`). A completion is queued by its occurrence's own micro-step, and an
interrupting firing withdraws what it ends at once and queues the removal behind what is queued, so a completion and a
cancellation run while their occurrence stands (#151). One that runs after its target's removal, or names one never
issued, is a kernel defect: never a write that lands at the instance root or in a variable set of a removed scope
occurrence, never dropped, which would commit without a write or a continuation CIB makes, and never `unsupported`,
which would claim CIB-LIM-0055. -/
def gone (state : State) (work : SignalWork) : Option String :=
  if work.requires.any (fun scope => !state.scopes.any (·.id == scope)) then some "queued-work-scope-gone"
  else if work.acts.any (fun id => (state.occurrence? id).isNone) then some "queued-work-occurrence-gone"
  else none

/-- Run a queued signal's work, unless an interruption removed what it names first (`stale`): then work an earlier
firing of the input started never reaches its first wait, where CIB runs it there before the interruption
(CIB-LIM-0055), so the input is `unsupported` rather than committed without that work. Work a target of which is absent
is an invariant failure (`gone`). -/
def SignalWork.perform (work : SignalWork) (state : State) : Outcome :=
  -- dynamic-only: whether an interruption overtakes queued work depends on the run's data and order
  if stale state work then .error (.unsupported "interrupted-before-wait")
  else match gone state work with
    | some code => .error (.semanticFailure .invariant code)
    | none => work.run state

end Kernel.Step
