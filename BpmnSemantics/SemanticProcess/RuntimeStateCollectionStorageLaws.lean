import BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.InternalArmingOrder

/-! The stricter committed-storage subset supplies the existing weak-order and unique-key facts. -/

namespace BpmnSemantics.SemanticProcess

/-- The committed subset retains the established weak-order contract. -/
theorem committedStateCollectionAdmitted_canonicalOrder (state : RuntimeState)
    (admitted : committedStateCollectionAdmitted state = true) :
    canonicalCollectionOrder state = true := by
  unfold committedStateCollectionAdmitted committedStateCollectionDefects at admitted
  split at admitted
  · rename_i ordered
    exact (Bool.and_eq_true_iff.mp ordered).1
  · simp at admitted

theorem committedStateCollectionAdmitted_uniqueKeys (state : RuntimeState)
    (admitted : committedStateCollectionAdmitted state = true) :
    uniqueCollectionKeys state = true := by
  unfold committedStateCollectionAdmitted committedStateCollectionDefects at admitted
  split at admitted
  · rename_i ordered
    exact (Bool.and_eq_true_iff.mp ordered).2
  · simp at admitted

/-- Replacement removes every old row of the inserted key, preserving both counter storage facts. -/
theorem orderedBy_uniqueKeys_replace {α β : Type} (key : α → β) (before : α → α → Bool)
    (asymmetric : ∀ left right, before left right = true → before right left = false)
    (compose : ∀ a b c, before b a = false → before c b = false → before c a = false)
    (inserted : α) (keep : α → Bool) (values : List α)
    (ordered : orderedBy before values = true) (unique : (values.map key).Nodup)
    (fresh : ∀ value, keep value = true → key value ≠ key inserted) :
    orderedBy before (canonicalInsertBy before inserted (values.filter keep)) = true ∧
      ((canonicalInsertBy before inserted (values.filter keep)).map key).Nodup := by
  refine ⟨orderedBy_canonicalInsertBy before asymmetric inserted _
    (orderedBy_filter compose keep values ordered), ?_⟩
  have retainedUnique : ((values.filter keep).map key).Nodup :=
    (List.filter_sublist.map key).nodup unique
  have absent : key inserted ∉ (values.filter keep).map key := by
    intro member
    obtain ⟨value, present, equal⟩ := List.mem_map.mp member
    exact fresh value (List.mem_filter.mp present).2 equal
  have permutation : (canonicalInsertBy before inserted (values.filter keep)).Perm
      (inserted :: values.filter keep) := by
    have allKept (rows : List α) : rows.filter (fun _ => true) = rows :=
      List.filter_eq_self.mpr (fun _ _ => rfl)
    simpa only [allKept] using
      filter_canonicalInsertBy_perm before (fun _ => true) inserted (values.filter keep) rfl
  exact (permutation.map key).nodup_iff.mpr (List.nodup_cons.mpr ⟨absent, retainedUnique⟩)

end BpmnSemantics.SemanticProcess
