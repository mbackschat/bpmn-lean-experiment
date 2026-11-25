module

public import Kernel.Laws.State.Frames

/-! # Laws of the step function: the queued triggers

What the closure reads of the compensation triggers and resumes its queue carries, beside the preservation contract
(`Kernel.Laws.Step.Contract`), and the signals that carry no trigger (`Laws.State.Untriggered`). Nothing executable
imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel

/-! ## Queued triggers

What the closure reads of the compensation triggers its queue carries: a queued compensation's trigger, and a queued
Cancel raise's origin, whose thrower the compensation its catch queues takes as trigger
(`Feature.Propagation.leaveOccurrence`). An invariant that keeps the keys of compensation runs apart reads them. -/

/-- The triggers of the queued compensations of `signals` and the origins of its queued Cancel raises, in queue order;
a raise is read by `Raised.isCancel`, its owner's query. -/
def triggersOf (signals : List Signal) : List (OccurrenceName ⊕ Origin) :=
  signals.filterMap fun
    | .compensate _ _ trigger _ _ => some (.inl trigger)
    | .raise event origin => if event.isCancel then some (.inr origin) else none
    | .arm _ _ _ | .armScope _ | .armGateway _ _ _ | .begin _ | .complete _ _ _ _ | .write _ _ _ | .remove _ _
    | .occur _ _ _ _ _ | .cancel _ | .fire _ _ | .endInstance _ _ | .compensationFailed _ _ _ _ | .compensationReady _ _ => none

/-- An empty queue carries no trigger. -/
theorem triggersOf_nil : triggersOf [] = [] := rfl

/-- Queuing signals adds the triggers they carry to the queued ones. -/
theorem triggersOf_append (signals more : List Signal) :
    triggersOf (signals ++ more) = triggersOf signals ++ triggersOf more :=
  List.filterMap_append

/-- A queued compensation carries its trigger. -/
theorem triggersOf_compensate (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceName)
    (leave : Option OccurrenceId) (resume : Option Resume) :
    triggersOf [.compensate scope activity trigger leave resume] = [.inl trigger] := rfl

/-- A queued Cancel raise carries its origin, and any other raise nothing. -/
theorem triggersOf_raise (event : Raised) (origin : Origin) :
    triggersOf [.raise event origin] = if event.isCancel then [.inr origin] else [] := by
  cases cancels : event.isCancel <;> simp [triggersOf, cancels]

/-- The resumes of the queued compensations of `signals`, in queue order: what an invariant that reads how a queued
compensation ends reads, which `triggersOf` drops. -/
def resumesOf (signals : List Signal) : List (Option Resume) :=
  signals.filterMap fun
    | .compensate _ _ _ _ resume => some resume
    | .raise _ _ | .arm _ _ _ | .armScope _ | .armGateway _ _ _ | .begin _ | .complete _ _ _ _ | .write _ _ _
    | .remove _ _ | .occur _ _ _ _ _ | .cancel _ | .fire _ _ | .endInstance _ _ | .compensationFailed _ _ _ _ | .compensationReady _ _ => none

/-- Queuing signals adds the resumes they carry to the queued ones. -/
theorem resumesOf_append (signals more : List Signal) :
    resumesOf (signals ++ more) = resumesOf signals ++ resumesOf more :=
  List.filterMap_append

/-- A sublist of a queue carries a sublist of its triggers. -/
theorem triggersOf_sublist {signals more : List Signal} (fewer : signals.Sublist more) :
    (triggersOf signals).Sublist (triggersOf more) :=
  fewer.filterMap _

/-- A sublist of a queue carries a sublist of its resumes. -/
theorem resumesOf_sublist {signals more : List Signal} (fewer : signals.Sublist more) :
    (resumesOf signals).Sublist (resumesOf more) :=
  fewer.filterMap _

theorem triggersOf_fewer {signals more : List Signal} (fewer : Laws.State.Fewer signals more) :
    Laws.State.Fewer (triggersOf signals) (triggersOf more) :=
  fewer.filterMap _

/-- A queue in another order carries its triggers in another order. -/
theorem triggersOf_perm {signals more : List Signal} (same : signals.Perm more) :
    (triggersOf signals).Perm (triggersOf more) :=
  same.filterMap _

/-- The triggers of a queue whose signals are among another's are among that one's. -/
theorem triggersOf_subset {signals more : List Signal} (among : ∀ signal ∈ signals, signal ∈ more) :
    ∀ trigger ∈ triggersOf signals, trigger ∈ triggersOf more := fun _ inside =>
  have ⟨signal, member, carries⟩ := List.mem_filterMap.mp inside
  List.mem_filterMap.mpr ⟨signal, among _ member, carries⟩

theorem resumesOf_fewer {signals more : List Signal} (fewer : Laws.State.Fewer signals more) :
    Laws.State.Fewer (resumesOf signals) (resumesOf more) :=
  fewer.filterMap _

/-- A resume is queued exactly when a queued compensation carries it. -/
theorem mem_resumesOf {signals : List Signal} {resume : Option Resume} :
    resume ∈ resumesOf signals ↔
      ∃ scope activity trigger leave, Signal.compensate scope activity trigger leave resume ∈ signals := by
  unfold resumesOf
  constructor
  · intro member
    obtain ⟨signal, inside, carried⟩ := List.mem_filterMap.mp member
    cases signal with
    | compensate scope activity trigger leave carriedResume =>
      cases carried
      exact ⟨scope, activity, trigger, leave, inside⟩
    | raise | arm | armScope | armGateway | begin | complete | write | remove | occur | cancel | fire | endInstance | compensationFailed
    | compensationReady => cases carried
  · intro queued
    obtain ⟨scope, activity, trigger, rest⟩ := queued
    obtain ⟨leave, inside⟩ := rest
    exact List.mem_filterMap.mpr ⟨_, inside, rfl⟩

/-- Signals that carry no trigger (`Laws.State.Untriggered`) carry no resume. -/
theorem resumesOf_untriggered {signals : List Signal} (quiet : ∀ signal ∈ signals, Laws.State.Untriggered signal) :
    resumesOf signals = [] := by
  refine List.filterMap_eq_nil_iff.mpr fun signal inside => ?_
  cases signal with
  | compensate scope activity trigger leave resume => exact absurd rfl ((quiet _ inside).1 scope activity trigger leave resume)
  | raise | arm | armScope | armGateway | begin | complete | write | remove | occur | cancel | fire | endInstance
  | compensationFailed | compensationReady => rfl

/-- Signals that carry no trigger (`Laws.State.Untriggered`) queue none. -/
theorem triggersOf_untriggered {signals : List Signal} (quiet : ∀ signal ∈ signals, Laws.State.Untriggered signal) :
    triggersOf signals = [] := by
  refine List.filterMap_eq_nil_iff.mpr fun signal inside => ?_
  obtain ⟨uncompensated, uncancelled⟩ := quiet signal inside
  cases signal with
  | compensate scope activity trigger leave resume => exact absurd rfl (uncompensated scope activity trigger leave resume)
  | raise event origin => simp [uncancelled event origin rfl]
  | arm | armScope | armGateway | begin | complete | write | remove | occur | cancel | fire | endInstance
  | compensationFailed | compensationReady => rfl

/-- The signals a compensation run's begin and end queue, and an instance's end, carry no trigger: a handler's begin,
a cancellation, a completion and an occurrence. -/
theorem untriggered_begin (request : BeginRequest) : Laws.State.Untriggered (.begin request) :=
  ⟨fun _ _ _ _ _ => nofun, fun _ _ => nofun⟩

theorem untriggered_cancel (occurrence : OccurrenceId) : Laws.State.Untriggered (.cancel occurrence) :=
  ⟨fun _ _ _ _ _ => nofun, fun _ _ => nofun⟩

theorem untriggered_complete (occurrence : OccurrenceId) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.Untriggered (.complete occurrence leave writes rule) := ⟨fun _ _ _ _ _ => nofun, fun _ _ => nofun⟩

theorem untriggered_occur (element : ElementId) (scope : ScopeOccurrenceId) (leave : Leave)
    (writes : List (String × Value)) (rule : WriteRule) : Laws.State.Untriggered (.occur element scope leave writes rule) :=
  ⟨fun _ _ _ _ _ => nofun, fun _ _ => nofun⟩

theorem untriggered_endInstance (status : InstanceStatus) (failure : Option InstanceFailure) :
    Laws.State.Untriggered (.endInstance status failure) := ⟨fun _ _ _ _ _ => nofun, fun _ _ => nofun⟩

end Kernel.Laws.Step
