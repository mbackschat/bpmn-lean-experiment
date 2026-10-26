module

public import BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.CallActivity
import Std.Data.DTreeMap.Internal.Operations

/-! # Bounded Called-Process reachability

These laws reason about the executable Call closure used by association validity. Duplicate-free
seeds justify its equal-length stopping condition; record sorting and extension preserve reachable
instances without assuming successor validity or changing the evaluator's fuel policy.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem insertCallRecord_perm (record : CalledProcessOccurrence)
    (records : List CalledProcessOccurrence) :
    (insertCallRecord record records).Perm (record :: records) := by
  induction records with
  | nil => exact List.Perm.refl _
  | cons head tail ih =>
      simp only [insertCallRecord]
      split
      · exact List.Perm.refl _
      · exact (ih.cons head).trans (List.Perm.swap _ _ _)

theorem sortCallRecords_perm (records : List CalledProcessOccurrence) :
    (sortCallRecords records).Perm records := by
  induction records with
  | nil => exact List.Perm.refl _
  | cons record rest ih =>
      exact (insertCallRecord_perm record _).trans (ih.cons record)

/-- Inserting and sorting a Call association preserves old bounded reachability at the
evaluator's record-count fuel and reaches the newly called instance from its reachable caller, a
seed or a nested caller already called from one. -/
theorem processInstanceClosureWithin_sorted_extension (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (record : CalledProcessOccurrence) (unique : seed.Nodup)
    (caller : record.caller.processInstanceId ∈
      processInstanceClosureWithin records seed (records.length + 1)) :
    processInstanceClosureWithin records seed (records.length + 1) ⊆
      processInstanceClosureWithin (sortCallRecords (record :: records)) seed
        ((sortCallRecords (record :: records)).length + 1) ∧
    record.calledRoot.processInstanceId ∈
      processInstanceClosureWithin (sortCallRecords (record :: records)) seed
        ((sortCallRecords (record :: records)).length + 1) := by
  have permutation := sortCallRecords_perm (record :: records)
  have included : records ⊆ sortCallRecords (record :: records) := by
    intro candidate member
    exact permutation.symm.subset (List.mem_cons_of_mem record member)
  have preserved : processInstanceClosureWithin records seed (records.length + 1) ⊆
      processInstanceClosureWithin (sortCallRecords (record :: records)) seed
        ((sortCallRecords (record :: records)).length + 1) :=
    (processInstanceClosureWithin_mono _ _ _ _ _ included (List.Subset.refl _) unique).trans
      (processInstanceClosureWithin_fuel_mono _ _ _ _ (by
        rw [permutation.length_eq]
        simp))
  exact ⟨preserved, processInstanceClosureWithin_closed _ _ unique record
    (permutation.symm.subset (by simp)) (preserved caller)⟩

end BpmnSemantics.SemanticProcess
