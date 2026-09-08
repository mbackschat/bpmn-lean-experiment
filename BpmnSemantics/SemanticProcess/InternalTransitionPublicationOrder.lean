import BpmnSemantics.SemanticProcess.InternalTransitionPublication

/-! Complete mixed templates sort before lifecycle numbering under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem sortInsert_eq_canonical (before : α → α → Bool) (inserted : α) (values : List α) :
    sortInsertBy before inserted values = canonicalInsertBy before inserted values := by
  induction values with
  | nil => rfl
  | cons current rest ih => simp only [sortInsertBy, canonicalInsertBy, ih]

private theorem key_insert_commutes (key : α → String) (left right : α)
    (different : key left ≠ key right) (values : List α) :
    sortInsertBy (fun a b => key a < key b) left
        (sortInsertBy (fun a b => key a < key b) right values) =
      sortInsertBy (fun a b => key a < key b) right
        (sortInsertBy (fun a b => key a < key b) left values) := by
  simp only [sortInsert_eq_canonical]
  apply canonicalInsertBy_commutes_of_strict_order
  · intro first second ordered
    simpa using String.lt_asymm (of_decide_eq_true ordered)
  · intro first middle last firstBefore middleBefore
    exact decide_eq_true (String.lt_trans (of_decide_eq_true firstBefore)
      (of_decide_eq_true middleBefore))
  · by_cases before : key left < key right
    · exact Or.inl (decide_eq_true before)
    · exact Or.inr (decide_eq_true
        (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different)))

private theorem key_sort_perm (key : α → String) (left right : List α)
    (distinct : left.Pairwise (fun a b => key a ≠ key b)) (permutation : left.Perm right) :
    sortBy (fun a b => key a < key b) left = sortBy (fun a b => key a < key b) right := by
  induction permutation with
  | nil => rfl
  | cons head permutation ih =>
      simp only [sortBy]
      rw [ih (List.pairwise_cons.mp distinct).2]
  | swap first second tail =>
      simp only [sortBy]
      exact key_insert_commutes key second first ((List.pairwise_cons.mp distinct).1 first (by simp)) _
  | trans first second ihFirst ihSecond =>
      exact (ihFirst distinct).trans (ihSecond (distinct.perm first Ne.symm))

theorem canonicalTransitionPublicationTemplates_perm (left right : List InternalTransitionPublicationTemplate)
    (distinct : left.Pairwise (fun a b => a.record.operationId ≠ b.record.operationId))
    (permutation : left.Perm right) :
    canonicalTransitionPublicationTemplates left = canonicalTransitionPublicationTemplates right := by
  apply key_sort_perm (fun template => template.record.operationId.value) left right _ permutation
  exact distinct.imp (fun different same => different (congrArg OperationId.mk same))

theorem instantiateTransitionPublicationBatch_perm (commandId : SemanticId) (first : Nat)
    (left right : List InternalTransitionPublicationTemplate)
    (distinct : left.Pairwise (fun a b => a.record.operationId ≠ b.record.operationId))
    (permutation : left.Perm right) :
    instantiateTransitionPublicationBatch commandId first left =
      instantiateTransitionPublicationBatch commandId first right := by
  unfold instantiateTransitionPublicationBatch
  rw [canonicalTransitionPublicationTemplates_perm left right distinct permutation]

theorem internalTransitionPublicationIndex_perm (first : Nat)
    (left right : List InternalTransitionPublicationTemplate) (operationId : OperationId)
    (distinct : left.Pairwise (fun a b => a.record.operationId ≠ b.record.operationId))
    (permutation : left.Perm right) :
    internalTransitionPublicationIndex first left operationId =
      internalTransitionPublicationIndex first right operationId := by
  unfold internalTransitionPublicationIndex
  rw [canonicalTransitionPublicationTemplates_perm left right distinct permutation]

private theorem sortInsert_map (before : α → α → Bool) (after : β → β → Bool) (f : α → β)
    (preserves : ∀ a b, after (f a) (f b) = before a b) (inserted : α) (values : List α) :
    sortInsertBy after (f inserted) (values.map f) = (sortInsertBy before inserted values).map f := by
  induction values with
  | nil => rfl
  | cons current rest ih =>
      simp only [List.map_cons, sortInsertBy, preserves]
      split <;> simp_all

private theorem sort_map (before : α → α → Bool) (after : β → β → Bool) (f : α → β)
    (preserves : ∀ a b, after (f a) (f b) = before a b) (values : List α) :
    sortBy after (values.map f) = (sortBy before values).map f := by
  induction values with
  | nil => rfl
  | cons current rest ih =>
      simp only [List.map_cons, sortBy, ih, sortInsert_map before after f preserves]

theorem canonicalInstantiatedTransitionPublications_map (commandId : SemanticId)
    (indexFor : OperationId → Nat) (templates : List InternalTransitionPublicationTemplate) :
    canonicalInstantiatedTransitionPublications
        (templates.map (fun template => template.instantiate commandId (indexFor template.record.operationId))) =
      (canonicalTransitionPublicationTemplates templates).map
        (fun template => template.instantiate commandId (indexFor template.record.operationId)) := by
  exact sort_map _ _ _ (fun _ _ => rfl) templates

private theorem sortInsert_permutation (before : α → α → Bool) (inserted : α) (values : List α) :
    (sortInsertBy before inserted values).Perm (inserted :: values) := by
  induction values with
  | nil => exact List.Perm.refl _
  | cons current rest ih =>
      simp only [sortInsertBy]
      split
      · exact List.Perm.refl _
      · exact (ih.cons current).trans (List.Perm.swap inserted current rest)

private theorem sort_permutation (before : α → α → Bool) (values : List α) :
    (sortBy before values).Perm values := by
  induction values with
  | nil => exact List.Perm.refl _
  | cons current rest ih => exact (sortInsert_permutation before current _).trans (ih.cons current)

theorem canonicalTransitionPublicationTemplates_permutation (templates : List InternalTransitionPublicationTemplate) :
    (canonicalTransitionPublicationTemplates templates).Perm templates :=
  sort_permutation _ templates

theorem internalTransitionPublicationIndex_present (first : Nat)
    (templates : List InternalTransitionPublicationTemplate) (template : InternalTransitionPublicationTemplate)
    (present : template ∈ templates) :
    first ≤ internalTransitionPublicationIndex first templates template.record.operationId ∧
      internalTransitionPublicationIndex first templates template.record.operationId < first + templates.length := by
  have sortedPresent : template ∈ canonicalTransitionPublicationTemplates templates :=
    (mem_sortBy _ template templates).mpr present
  have bounded := List.findIdx_lt_length_of_exists
    (p := fun value : InternalTransitionPublicationTemplate => value.record.operationId == template.record.operationId)
    ⟨template, sortedPresent, by simp⟩
  rw [(canonicalTransitionPublicationTemplates_permutation templates).length_eq] at bounded
  unfold internalTransitionPublicationIndex
  omega

private theorem rank_numbering (commandId : SemanticId) (first : Nat)
    (templates : List InternalTransitionPublicationTemplate)
    (distinct : templates.Pairwise (fun a b => a.record.operationId ≠ b.record.operationId)) :
    templates.map (fun template => template.instantiate commandId
        (first + templates.findIdx (fun value => value.record.operationId == template.record.operationId))) =
      numberTransitionPublicationTemplates commandId first templates := by
  induction templates generalizing first with
  | nil => rfl
  | cons current rest ih =>
      obtain ⟨headDistinct, tailDistinct⟩ := List.pairwise_cons.mp distinct
      simp only [List.map_cons, List.findIdx_cons, beq_self_eq_true, cond_true, Nat.add_zero,
        numberTransitionPublicationTemplates]
      congr 1
      rw [← ih (first + 1) tailDistinct]
      apply List.map_congr_left
      intro template present
      have different := headDistinct template present
      have mismatch : (current.record.operationId == template.record.operationId) = false := by
        exact decide_eq_false different
      simp [mismatch, Nat.add_assoc, Nat.add_comm]

theorem internalTransitionPublicationIndex_numbering (commandId : SemanticId) (first : Nat)
    (templates : List InternalTransitionPublicationTemplate)
    (distinct : templates.Pairwise (fun a b => a.record.operationId ≠ b.record.operationId)) :
    (canonicalTransitionPublicationTemplates templates).map (fun template =>
        template.instantiate commandId (internalTransitionPublicationIndex first templates template.record.operationId)) =
      instantiateTransitionPublicationBatch commandId first templates := by
  exact rank_numbering commandId first _
    (distinct.perm (canonicalTransitionPublicationTemplates_permutation templates).symm Ne.symm)

theorem canonicalInstantiatedTransitionPublications_numbering (commandId : SemanticId) (first : Nat)
    (templates : List InternalTransitionPublicationTemplate)
    (distinct : templates.Pairwise (fun a b => a.record.operationId ≠ b.record.operationId)) :
    canonicalInstantiatedTransitionPublications (templates.map (fun template =>
        template.instantiate commandId (internalTransitionPublicationIndex first templates template.record.operationId))) =
      instantiateTransitionPublicationBatch commandId first templates := by
  rw [canonicalInstantiatedTransitionPublications_map,
    internalTransitionPublicationIndex_numbering commandId first templates distinct]

end BpmnSemantics.SemanticProcess.InternalCommutation
