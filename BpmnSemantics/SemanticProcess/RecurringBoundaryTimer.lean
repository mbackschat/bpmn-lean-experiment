import BpmnSemantics.SemanticProcess.MonitoredTask
import BpmnSemantics.WireNatural

/-! ESL-TIMER-01 shares one pure mutation between monitored Task and child-scope bodies.
The caller owns exact Program/body selection and maps capacity refusal to whole-command rollback.
No successor exists on refusal, so neither a path token nor a replacement can escape that boundary. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open BpmnSemantics.SemanticProcessJson

inductive RecurringBoundaryTimerRefusal where
  | capacity
  deriving Repr, DecidableEq

def boundaryTimerWaitIdentity (timer : TimerWait) : OccurrenceId :=
  { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩,
    activation := timer.activation }

/-- Only the exact tagged old occurrence changes; all other handlers keep their order. -/
def replaceBoundaryTimerAttachment (old : OccurrenceId) (replacement : Option OccurrenceId)
    (record : ActivityOccurrence) : ActivityOccurrence :=
  { record with attachedHandlers := record.attachedHandlers.filterMap fun handler =>
      if handler = .timer old then replacement.map ActivityHandler.timer else some handler }

def replaceSelectedBoundaryTimerAttachment (selected : ActivityOccurrence)
    (old : OccurrenceId) (replacement : Option OccurrenceId) (records : List ActivityOccurrence) :
    List ActivityOccurrence :=
  records.map fun record =>
    if sameActivityOccurrence selected record then replaceBoundaryTimerAttachment old replacement record
    else record

def recurringBoundaryTimerSuccessor (state : RuntimeState) (timer : TimerWait)
    (arm : BoundaryTimerArm) : TimerWait :=
  { timer with
    activation := timerActivationCount state timer.elementId + 1
    deadlineMs := timer.deadlineMs + arm.durationMs }

/-- Exact predecessor ownership and census supplied by the caller's family-specific selection.
The body may be a Task or child scope; independent Activity and Timer activations are not equated. -/
def NonInterruptingBoundaryTimerBinding (state : RuntimeState) (record : ActivityOccurrence)
    (timer : TimerWait) (arm : BoundaryTimerArm) : Prop :=
  state.timerWaits.filter (timerIdNamesWait (boundaryTimerWaitIdentity timer)) = [timer] ∧
  state.activityOccurrences.filter (sameActivityOccurrence record) = [record] ∧
  record.attachedHandlers.filter (fun handler => decide (handler = .timer (boundaryTimerWaitIdentity timer))) =
    [.timer (boundaryTimerWaitIdentity timer)] ∧
  timer.owner = record.owner ∧ timer.processInstanceId = record.processInstanceId ∧
  record.owner.processInstanceId = record.processInstanceId ∧
  arm.elementId = timer.elementId ∧ arm.output = timer.output ∧
  (match record.body with | .userTask _ | .childScope _ => True | .parallelUserTasks .. => False)

/-- The bound is over all predecessor waits of this Timer element, not only the consumed wait.
It establishes that the newly allocated identity cannot alias unrelated existing work. -/
def RecurringBoundaryTimerHighWater (state : RuntimeState) (timer : TimerWait) : Prop :=
  ∀ candidate ∈ state.timerWaits, candidate.elementId = timer.elementId →
    candidate.activation ≤ timerActivationCount state timer.elementId

/-- Declarative one-shot consumption and recurring replacement, with arithmetic capacity as
explicit predecessor premises. Neither constructor assumes successor validity or evaluator success. -/
inductive NonInterruptingBoundaryTimerStep : RuntimeState → ActivityOccurrence → TimerWait →
    BoundaryTimerArm → RuntimeState → Prop where
  | oneShot (before : RuntimeState) (record : ActivityOccurrence) (timer : TimerWait) (arm : BoundaryTimerArm)
      (bound : NonInterruptingBoundaryTimerBinding before record timer arm)
      (once : arm.recurrence = none) :
      NonInterruptingBoundaryTimerStep before record timer arm
        { before with
          timerWaits := before.timerWaits.erase timer
          activityOccurrences := replaceSelectedBoundaryTimerAttachment record
            (boundaryTimerWaitIdentity timer) none before.activityOccurrences
          tokens := addToken before.tokens arm.output record.owner
          logicalTimeMs := timer.deadlineMs }
  | repeating (before : RuntimeState) (record : ActivityOccurrence) (timer : TimerWait) (arm : BoundaryTimerArm)
      (bound : NonInterruptingBoundaryTimerBinding before record timer arm)
      (recurring : arm.recurrence = some .repeating)
      (activationCapacity : isSafeWireNat (timerActivationCount before timer.elementId + 1) = true)
      (deadlineCapacity : isSafeWireNat (timer.deadlineMs + arm.durationMs) = true) :
      NonInterruptingBoundaryTimerStep before record timer arm
        { before with
          timerWaits := insertTimerWait (recurringBoundaryTimerSuccessor before timer arm) (before.timerWaits.erase timer)
          activityOccurrences := replaceSelectedBoundaryTimerAttachment record (boundaryTimerWaitIdentity timer)
            (some (boundaryTimerWaitIdentity (recurringBoundaryTimerSuccessor before timer arm))) before.activityOccurrences
          timerActivations := setTimerActivationCount before.timerActivations timer.elementId
            (timerActivationCount before timer.elementId + 1)
          tokens := addToken before.tokens arm.output record.owner
          logicalTimeMs := timer.deadlineMs }

def fireNonInterruptingBoundaryTimer (state : RuntimeState) (record : ActivityOccurrence)
    (timer : TimerWait) (arm : BoundaryTimerArm) : Except RecurringBoundaryTimerRefusal RuntimeState :=
  match arm.recurrence with
  | none => .ok
      { state with
        timerWaits := state.timerWaits.erase timer
        activityOccurrences := replaceSelectedBoundaryTimerAttachment record
          (boundaryTimerWaitIdentity timer) none state.activityOccurrences
        tokens := addToken state.tokens arm.output record.owner
        logicalTimeMs := timer.deadlineMs }
  | some .repeating =>
      let activation := timerActivationCount state timer.elementId + 1
      let deadline := timer.deadlineMs + arm.durationMs
      if isSafeWireNat activation && isSafeWireNat deadline then
        let successor := recurringBoundaryTimerSuccessor state timer arm
        .ok { state with
          timerWaits := insertTimerWait successor (state.timerWaits.erase timer)
          activityOccurrences := replaceSelectedBoundaryTimerAttachment record (boundaryTimerWaitIdentity timer)
            (some (boundaryTimerWaitIdentity successor)) state.activityOccurrences
          timerActivations := setTimerActivationCount state.timerActivations timer.elementId activation
          tokens := addToken state.tokens arm.output record.owner
          logicalTimeMs := timer.deadlineMs }
      else .error .capacity

theorem fireNonInterruptingBoundaryTimer_sound (before after : RuntimeState)
    (record : ActivityOccurrence) (timer : TimerWait) (arm : BoundaryTimerArm)
    (bound : NonInterruptingBoundaryTimerBinding before record timer arm)
    (success : fireNonInterruptingBoundaryTimer before record timer arm = .ok after) :
    NonInterruptingBoundaryTimerStep before record timer arm after := by
  unfold fireNonInterruptingBoundaryTimer at success
  cases recurrence : arm.recurrence with
  | none =>
      simp only [recurrence, Except.ok.injEq] at success
      cases success
      exact .oneShot before record timer arm bound recurrence
  | some recurrenceValue =>
      cases recurrenceValue
      simp only [recurrence] at success
      split at success
      · next capacity =>
          cases success
          exact .repeating before record timer arm bound recurrence
            (Bool.and_eq_true_iff.mp capacity).1 (Bool.and_eq_true_iff.mp capacity).2
      · contradiction

end BpmnSemantics.SemanticProcess
