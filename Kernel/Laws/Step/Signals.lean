module

public import Kernel.Laws.Step.Contract

/-! # Laws of the step function: which signals differ

The constructor disequalities of `Signal` that modules outside its owners need, and the queued begins of begin signals
and tokens, here because only `Kernel.Step`'s `Laws` and `Proofs` modules may decide one (guard 1). It imports no
feature, so a witness module can read it without entering a feature's rebuild cone. Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel

/-- A queued reservation is no begin. -/
theorem occur_ne_begin {element : ElementId} {scope : ScopeOccurrenceId} {leave : Leave}
    {writes : List (String × Value)} {rule : WriteRule} {request : BeginRequest} :
    Signal.occur element scope leave writes rule ≠ .begin request := nofun

/-- A queued compensation is no begin. -/
theorem compensate_ne_begin {scope : ScopeOccurrenceId} {activity : Option ElementId} {trigger : OccurrenceRef}
    {leave : Option Nat} {resume : Option Resume} {request : BeginRequest} :
    Signal.compensate scope activity trigger leave resume ≠ .begin request := nofun

/-- Queued begins of one request are one request. -/
theorem begin_inj {request other : BeginRequest} (same : Signal.begin request = .begin other) : request = other :=
  Signal.begin.inj same

/-- A queued completion is no begin, reservation or compensation. -/
theorem complete_apart {id : Nat} {leave : Leave} {writes : List (String × Value)} {rule : WriteRule} :
    (∀ request, Signal.begin request ≠ .complete id leave writes rule) ∧
      (∀ element scope leave' writes' rule', Signal.occur element scope leave' writes' rule' ≠ .complete id leave writes rule) ∧
      ∀ scope activity trigger leave' resume, Signal.compensate scope activity trigger leave' resume ≠ .complete id leave writes rule :=
  ⟨fun _ => nofun, fun _ _ _ _ _ => nofun, fun _ _ _ _ _ => nofun⟩

/-- A queued variable write is no begin, reservation or compensation. -/
theorem write_apart {scope : ScopeOccurrenceId} {writes : List (String × Value)} {rule : WriteRule} :
    (∀ request, Signal.begin request ≠ .write scope writes rule) ∧
      (∀ element scope' leave writes' rule', Signal.occur element scope' leave writes' rule' ≠ .write scope writes rule) ∧
      ∀ scope' activity trigger leave resume, Signal.compensate scope' activity trigger leave resume ≠ .write scope writes rule :=
  ⟨fun _ => nofun, fun _ _ _ _ _ => nofun, fun _ _ _ _ _ => nofun⟩

/-- A queued arming is no begin, reservation or compensation. -/
theorem arm_apart {host : Nat} {element : ElementId} {scope : ScopeOccurrenceId} :
    (∀ request, Signal.begin request ≠ .arm host element scope) ∧
      (∀ element' scope' leave writes rule, Signal.occur element' scope' leave writes rule ≠ .arm host element scope) ∧
      ∀ scope' activity trigger leave resume, Signal.compensate scope' activity trigger leave resume ≠ .arm host element scope :=
  ⟨fun _ => nofun, fun _ _ _ _ _ => nofun, fun _ _ _ _ _ => nofun⟩

/-- The begins of the requests' begin signals are the requests. -/
theorem beginsOf_map (requests : List BeginRequest) : beginsOf (requests.map Signal.begin) = requests := by
  simp [beginsOf, List.filterMap_map, Function.comp_def]

/-- The deferred begins of the requests' begin tokens are the requests. -/
theorem deferredOf_map (requests : List BeginRequest) : deferredOf (requests.map Token.begin) = requests := by
  simp [deferredOf, List.filterMap_map, Function.comp_def]

end Kernel.Laws.Step
