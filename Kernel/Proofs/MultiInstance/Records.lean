module

public import Kernel.Laws.MultiInstance

/-! # Proofs: what setting a body's slot record keeps

What `Kernel.Feature.MultiInstance.setRun` keeps of the slot records, read through `Laws.MultiInstance.setRun_runs`
alone: the record set is held, a record of another occurrence stays, and one record per body occurrence stays. Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.MultiInstance (RunsKeyed)

/-- A record after setting `next` is `next` or one of another occurrence held before. -/
theorem mem_setRun {state : State} {next other : MultiInstanceRun}
    (member : other ∈ (Feature.MultiInstance.setRun state next).slots.multiInstances) :
    (other ∈ state.slots.multiInstances ∧ other.occurrence ≠ next.occurrence) ∨ other = next := by
  rw [Laws.MultiInstance.setRun_runs] at member
  split at member
  · obtain ⟨found, kept, rfl⟩ := List.mem_map.mp member
    split
    · exact .inr rfl
    · rename_i differs
      exact .inl ⟨kept, fun same => differs (by simp [same])⟩
  · rename_i absent
    rcases List.mem_append.mp member with old | new
    · refine .inl ⟨old, fun same => absent ?_⟩
      exact List.any_eq_true.mpr ⟨other, old, by simp [same]⟩
    · exact .inr (List.mem_singleton.mp new)

/-- The record set is held. -/
theorem setRun_mem (state : State) (next : MultiInstanceRun) :
    next ∈ (Feature.MultiInstance.setRun state next).slots.multiInstances := by
  rw [Laws.MultiInstance.setRun_runs]
  split
  · rename_i present
    obtain ⟨found, inside, same⟩ := List.any_eq_true.mp present
    exact List.mem_map.mpr ⟨found, inside, by simp [same]⟩
  · exact List.mem_append_right _ (List.mem_singleton_self _)

/-- A record of another occurrence stays. -/
theorem setRun_keeps {state : State} {next other : MultiInstanceRun} (member : other ∈ state.slots.multiInstances)
    (differs : other.occurrence ≠ next.occurrence) :
    other ∈ (Feature.MultiInstance.setRun state next).slots.multiInstances := by
  rw [Laws.MultiInstance.setRun_runs]
  split
  · exact List.mem_map.mpr ⟨other, member, by simp [differs]⟩
  · exact List.mem_append_left _ member

/-- Setting a body's slot record keeps one record per body occurrence. -/
theorem setRun_keyed {state : State} (keyed : RunsKeyed state) (next : MultiInstanceRun) :
    RunsKeyed (Feature.MultiInstance.setRun state next) := by
  unfold RunsKeyed at *
  rw [Laws.MultiInstance.setRun_runs]
  split
  · rw [List.map_map]
    have same : ((·.occurrence) ∘ fun other : MultiInstanceRun =>
        if (other.occurrence == next.occurrence) = true then next else other) = (·.occurrence) := by
      funext other
      simp only [Function.comp]
      split
      · rename_i equal
        exact (beq_iff_eq.mp equal).symm
      · rfl
    rw [same]
    exact keyed
  · rename_i absent
    rw [List.map_append]
    refine List.nodup_append.mpr ⟨keyed, by simp, fun occurrence old added fresh same => ?_⟩
    simp only [List.map_cons, List.map_nil, List.mem_singleton] at fresh
    obtain ⟨other, inside, named⟩ := List.mem_map.mp old
    exact absent (List.any_eq_true.mpr ⟨other, inside, by simp [named, same, fresh]⟩)

end Kernel.Proofs.MultiInstance
