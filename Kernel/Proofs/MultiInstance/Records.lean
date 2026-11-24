module

public import Kernel.Laws.MultiInstance

/-! # Proofs: what setting a body's slot record keeps

What `Kernel.Feature.MultiInstance.setRun` keeps of the slot records, read through `Laws.MultiInstance.setRun_runs`
and the list view's laws (`Laws.State.mem_multiInstanceList_insert`): the record set is held, a record of another occurrence stays, and one record per body occurrence stays. Nothing
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
  rw [Laws.State.multiInstances_eq, Laws.MultiInstance.setRun_runs, Laws.State.mem_multiInstanceList_insert] at member
  exact member.symm

/-- The record set is held. -/
theorem setRun_mem (state : State) (next : MultiInstanceRun) :
    next ∈ (Feature.MultiInstance.setRun state next).slots.multiInstances := by
  rw [Laws.State.multiInstances_eq, Laws.MultiInstance.setRun_runs, Laws.State.mem_multiInstanceList_insert]
  exact .inl rfl

/-- A record of another occurrence stays. -/
theorem setRun_keeps {state : State} {next other : MultiInstanceRun} (member : other ∈ state.slots.multiInstances)
    (differs : other.occurrence ≠ next.occurrence) :
    other ∈ (Feature.MultiInstance.setRun state next).slots.multiInstances := by
  rw [Laws.State.multiInstances_eq, Laws.MultiInstance.setRun_runs, Laws.State.mem_multiInstanceList_insert]
  exact .inr ⟨member, differs⟩

/-- Setting a body's slot record keeps one record per body occurrence. -/
theorem setRun_keyed {state : State} (_keyed : RunsKeyed state) (next : MultiInstanceRun) :
    RunsKeyed (Feature.MultiInstance.setRun state next) :=
  Laws.MultiInstance.runsKeyed _

end Kernel.Proofs.MultiInstance
