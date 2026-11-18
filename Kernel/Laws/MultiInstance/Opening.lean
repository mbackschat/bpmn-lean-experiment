module

public import Kernel.Feature.MultiInstance.Opening
import all Kernel.Feature.MultiInstance.Opening

/-! # Laws of Multi-Instance Activities: the instances to begin

What `Kernel.Feature.MultiInstance.Opening` names, read from its body: the waiting slots in index order, all of them for
a parallel body (`opening_parallel`) and for a sequential one none while an instance runs (`opening_running`), else the
first (`opening_idle`). `Kernel.Laws.MultiInstance` re-exports these facts. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.MultiInstance

open Kernel

/-- The slots of `instances` whose index the waiting-slot list `MultiInstance.opening` picks from lists are the waiting
ones. -/
theorem waiting_mem {instances : List Iteration} {index : Nat} :
    index ∈ (instances.zipIdx.filterMap fun (slot, index) =>
      match slot with
      | .waiting => some index
      | .active _ => none
      | .completed _ => none) ↔ instances[index]? = some .waiting := by
  constructor
  · intro member
    obtain ⟨⟨slot, at_⟩, inside, picked⟩ := List.mem_filterMap.mp member
    have found := List.mem_zipIdx_iff_getElem?.mp inside
    cases slot <;> simp at picked
    subst picked
    exact found
  · intro found
    exact List.mem_filterMap.mpr ⟨(.waiting, index), List.mem_zipIdx_iff_getElem?.mpr found, rfl⟩

/-- The waiting-slot list `MultiInstance.opening` picks from is in increasing index order. -/
theorem waiting_ordered (instances : List Iteration) :
    (instances.zipIdx.filterMap fun (slot, index) =>
      match slot with
      | .waiting => some index
      | .active _ => none
      | .completed _ => none).Pairwise (· < ·) := by
  refine List.Pairwise.filterMap (R := fun a b : Iteration × Nat => a.2 < b.2) _ ?_ ?_
  · intro first second lower one picked two picked'
    obtain ⟨slot, at_⟩ := first
    obtain ⟨slot', at'⟩ := second
    cases slot <;> cases slot' <;> simp at picked picked'
    subst picked picked'
    exact lower
  · have := List.pairwise_map (R := (· < ·)) (f := Prod.snd) (l := instances.zipIdx) |>.mp
    apply this
    rw [List.zipIdx_map_snd]
    exact List.pairwise_lt_range'

/-- The first member of a list in increasing order is its member no smaller member precedes. -/
theorem take_one_ordered {l : List Nat} (ordered : l.Pairwise (· < ·)) {x : Nat} :
    x ∈ l.take 1 ↔ x ∈ l ∧ ∀ y < x, y ∉ l := by
  cases l with
  | nil => simp
  | cons first rest =>
    have later := (List.pairwise_cons.mp ordered).1
    rw [List.take_succ_cons, List.take_zero, List.mem_singleton]
    constructor
    · rintro rfl
      refine ⟨List.mem_cons_self .., fun y lower member => ?_⟩
      rcases List.mem_cons.mp member with rfl | inside
      · exact Nat.lt_irrefl _ lower
      · exact Nat.lt_asymm lower (later y inside)
    · rintro ⟨member, least⟩
      rcases List.mem_cons.mp member with same | inside
      · exact same
      · exact absurd (List.mem_cons_self ..) (least first (later x inside))

/-! ### Opening instances

`MultiInstance.opening` names the waiting slots in index order, all of them for a parallel body (`opening_parallel`)
and for a sequential one none while an instance runs (`opening_running`), else the first (`opening_idle`). -/

/-- The instances `MultiInstance.opening` names, in increasing index order. -/
theorem opening_ordered (mode : MultiInstanceMode) (instances : List Iteration) :
    (Feature.MultiInstance.opening mode instances).Pairwise (· < ·) := by
  unfold Feature.MultiInstance.opening
  cases mode with
  | parallel => exact waiting_ordered instances
  | sequential =>
    dsimp only
    split
    · exact List.Pairwise.nil
    · exact (waiting_ordered instances).sublist (List.take_sublist _ _)

/-- `MultiInstance.opening` names each slot once. -/
theorem opening_nodup (mode : MultiInstanceMode) (instances : List Iteration) :
    (Feature.MultiInstance.opening mode instances).Nodup :=
  (opening_ordered mode instances).imp Nat.ne_of_lt

/-- The instances `MultiInstance.opening` names wait. -/
theorem opening_waiting {mode : MultiInstanceMode} {instances : List Iteration} {index : Nat}
    (named : index ∈ Feature.MultiInstance.opening mode instances) : instances[index]? = some .waiting := by
  unfold Feature.MultiInstance.opening at named
  cases mode with
  | parallel => exact waiting_mem.mp named
  | sequential =>
    dsimp only at named
    split at named
    · simp at named
    · exact waiting_mem.mp (List.mem_of_mem_take named)

/-- A parallel body opens every waiting slot. -/
theorem opening_parallel {instances : List Iteration} {index : Nat} :
    index ∈ Feature.MultiInstance.opening .parallel instances ↔ instances[index]? = some .waiting := by
  unfold Feature.MultiInstance.opening
  exact waiting_mem

/-- A sequential body opens no slot while an instance runs. -/
theorem opening_running {instances : List Iteration} (running : ∃ scope, Iteration.active scope ∈ instances) :
    Feature.MultiInstance.opening .sequential instances = [] := by
  obtain ⟨scope, active⟩ := running
  unfold Feature.MultiInstance.opening
  dsimp only
  split
  · rfl
  · rename_i quiet
    exact absurd (List.any_eq_true.mpr ⟨_, active, rfl⟩) quiet

/-- A body that opens a slot runs in parallel or has no running instance. -/
theorem opening_quiet {mode : MultiInstanceMode} {instances : List Iteration}
    (opened : Feature.MultiInstance.opening mode instances ≠ []) :
    mode = .parallel ∨ ∀ scope, Iteration.active scope ∉ instances := by
  cases mode with
  | parallel => exact .inl rfl
  | sequential => exact .inr fun scope active => opened (opening_running ⟨scope, active⟩)

/-- A sequential body with no running instance opens its first waiting slot. -/
theorem opening_idle {instances : List Iteration} (idle : ∀ scope, Iteration.active scope ∉ instances) {index : Nat} :
    index ∈ Feature.MultiInstance.opening .sequential instances ↔
      instances[index]? = some .waiting ∧ ∀ earlier < index, instances[earlier]? ≠ some .waiting := by
  unfold Feature.MultiInstance.opening
  dsimp only
  split
  · rename_i running
    obtain ⟨slot, inside, picked⟩ := List.any_eq_true.mp running
    cases slot with
    | active scope => exact absurd inside (idle scope)
    | waiting => simp at picked
    | completed _ => simp at picked
  · exact (take_one_ordered (waiting_ordered instances)).trans
      (and_congr waiting_mem (forall_congr' fun _ => imp_congr_right fun _ => not_congr waiting_mem))

end Kernel.Laws.MultiInstance
