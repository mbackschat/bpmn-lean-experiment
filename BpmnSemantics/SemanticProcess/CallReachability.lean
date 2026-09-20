import BpmnSemantics.SemanticProcess.CallActivity

/-! # Bounded Called-Process reachability

These laws reason about the executable Call closure used by association validity. Duplicate-free
seeds justify its equal-length stopping condition; record sorting and extension preserve reachable
instances without assuming successor validity or changing the evaluator's fuel policy.
-/

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
evaluator's record-count fuel and reaches the newly called instance from its seeded caller. -/
theorem processInstanceClosureWithin_sorted_extension (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (record : CalledProcessOccurrence)
    (unique : seed.Nodup) (caller : record.caller.processInstanceId ∈ seed) :
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
  constructor
  · exact (processInstanceClosureWithin_mono _ _ _ _ _ included (List.Subset.refl _) unique).trans
      (processInstanceClosureWithin_fuel_mono _ _ _ _ (by
        rw [permutation.length_eq]
        simp))
  · exact processInstanceClosureWithin_direct _ _ _ _
      (permutation.symm.subset (by simp)) caller

end BpmnSemantics.SemanticProcess
