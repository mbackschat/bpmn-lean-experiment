module

public import Kernel.State.Slots
import all Kernel.State.Slots

/-! # Laws of the kernel state: the feature slots

What `Kernel.State.Slots`' operations do, read from their bodies; this is the one module that sees them. Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- `Variables.ofBindings` inserts the bindings in order, so a name bound twice keeps the value bound last. -/
theorem ofBindings_eq (bindings : List (String × Value)) :
    Variables.ofBindings bindings = bindings.foldl (fun set binding => set.insert binding.1 binding.2) ∅ := by
  simp only [Variables.ofBindings]

/-- `Variables.ofBindings` binds a name no later binding repeats to that binding's value (#147). -/
theorem ofBindings_getElem?_last (earlier : List (String × Value)) {binding : String × Value}
    {later : List (String × Value)} (last : ∀ other ∈ later, other.1 ≠ binding.1) :
    (Variables.ofBindings (earlier ++ binding :: later))[binding.1]? = some binding.2 := by
  rw [ofBindings_eq, List.foldl_append, List.foldl_cons]
  suffices kept : ∀ (m : Variables), (later.foldl (fun set b => set.insert b.1 b.2) m)[binding.1]? = m[binding.1]? by
    rw [kept, Std.ExtTreeMap.getElem?_insert_self]
  intro m
  induction later generalizing m with
  | nil => rfl
  | cons other rest ih =>
    rw [List.foldl_cons, ih (fun o h => last o (List.mem_cons_of_mem _ h)) _, Std.ExtTreeMap.getElem?_insert,
      ite_eq_right (fun e => absurd (Std.LawfulEqCmp.eq_of_compare e) (last other List.mem_cons_self))]

/-- `FeatureSlots.clear` filters each slot by the scope occurrences it removes: what `Kernel.Laws.State.Removal` reads
of the slots when it clears a scope occurrence. -/
theorem featureSlotsClear_eq (slots : FeatureSlots) (inside nested : List ScopeOccurrenceId) :
    slots.clear inside nested = {
      parked := slots.parked.filter (!inside.contains ·.scope)
      held := slots.held.filter (!inside.contains ·.scope)
      multiInstances := slots.multiInstances.filter (!inside.contains ·.scope)
      compensation := {
        retained := slots.compensation.retained.filter (!nested.contains ·.scope)
        runs := slots.compensation.runs.filter (!inside.contains ·.scope) }
      instances := slots.instances.filter (!nested.contains ·.root) } := by
  simp only [FeatureSlots.clear]

/-- A held occurrence is suspended, leaving by its outgoing flows. -/
theorem held_suspended {slots : FeatureSlots} {held : Held} (mem : held ∈ slots.held) :
    { element := held.occurrence.element, scope := held.scope, leave := .outgoing : Suspended } ∈ slots.suspended :=
  List.mem_append_left _ (List.mem_map.mpr ⟨held, mem, rfl⟩)

/-- A compensation run that completes an existing occurrence once its handlers end, as a waiting Compensation throw's
does, holds that occurrence suspended. -/
theorem resume_suspended {slots : FeatureSlots} {run : CompensationRun} {occurrence : OccurrenceId} {leave : Leave}
    (mem : run ∈ slots.compensation.runs) (resume : run.resume = some (.complete occurrence leave)) :
    { element := occurrence.element, scope := occurrence.scope, leave : Suspended } ∈ slots.suspended :=
  List.mem_append_right _ (List.mem_filterMap.mpr ⟨run, mem, by simp [resume]⟩)

/-- `Parked.leastBy` picks one of the arrivals, under any order. -/
theorem leastBy_mem {le : Issue → Issue → Bool} {entries : List Parked} {least : Parked}
    (found : Parked.leastBy le entries = some least) : least ∈ entries := by
  unfold Parked.leastBy at found
  suffices ∀ (acc : Option Parked), (∀ best, acc = some best → best ∈ entries) → ∀ rest : List Parked, rest ⊆ entries →
      rest.foldl (fun found waiting => match found with
        | some best => if le best.occurrence.ordinal waiting.occurrence.ordinal then found else some waiting
        | none => some waiting) acc = some least → least ∈ entries from
    this none (by simp) entries (List.Subset.refl _) found
  intro acc kept rest
  induction rest generalizing acc with
  | nil => intro _ ended; exact kept _ ended
  | cons head tail ih =>
    intro sub ran
    have headIn : head ∈ entries := sub List.mem_cons_self
    refine ih _ ?_ (fun x member => sub (List.mem_cons_of_mem _ member)) ran
    intro best picked
    cases acc with
    | none => simp only [Option.some.injEq] at picked; exact picked ▸ headIn
    | some prior =>
      simp only at picked
      split at picked
      · exact kept _ picked
      · simp only [Option.some.injEq] at picked; exact picked ▸ headIn

end Kernel.Laws.State
