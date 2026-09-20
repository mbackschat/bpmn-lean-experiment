import BpmnSemantics.SemanticProcess.InternalRegionalCallRemoval

/-! Regional removal preserves occurrence uniqueness through sublists. Membership inclusion is
insufficient for RSI-UNIQ-02 because it forgets multiplicity; the symbolic duplicate witness separates
that weaker premise without assuming successor validity. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- RSI-UNIQ-02 requires multiplicity preservation: membership inclusion alone allows duplicates. -/
theorem membership_subset_does_not_preserve_occurrence_uniqueness {α : Type}
    (same : α → α → Bool) (value : α) (self : same value value = true) :
    (∀ candidate ∈ [value, value], candidate ∈ [value]) ∧
      [value].all (occursOnce same [value]) = true ∧
      [value, value].all (occursOnce same [value, value]) = false := by
  simp [occursOnce, self]

theorem occurrence_uniqueness_of_sublist {α : Type} (same : α → α → Bool)
    (self : ∀ value, same value value = true) (before after : List α)
    (retained : after.Sublist before)
    (unique : before.all (occursOnce same before) = true) :
    after.all (occursOnce same after) = true := by
  apply List.all_eq_true.mpr
  intro value member
  have original := List.all_eq_true.mp unique value (retained.subset member)
  simp only [occursOnce, decide_eq_true_eq] at original ⊢
  have upper := (retained.filter (same value)).length_le
  rw [original] at upper
  exact Nat.le_antisymm upper
    (List.length_pos_of_mem (List.mem_filter.mpr ⟨member, self value⟩))

/-- A family key's singleton census also excludes duplicate complete records. -/
theorem occurrence_uniqueness_implies_nodup {α : Type} [BEq α] [LawfulBEq α]
    (same : α → α → Bool) (self : ∀ value, same value value = true) (values : List α)
    (unique : values.all (occursOnce same values) = true) : values.Nodup := by
  apply List.nodup_iff_count.mpr
  intro value
  by_cases present : value ∈ values
  · have once := List.all_eq_true.mp unique value present
    simp only [occursOnce, decide_eq_true_eq, ← List.countP_eq_length_filter] at once
    rw [List.count_eq_countP]
    apply Nat.le_trans (List.countP_mono_left ?_) (Nat.le_of_eq once)
    intro candidate _ equal
    simpa only [eq_of_beq equal] using self value
  · simp [List.count_eq_zero_of_not_mem present]

/-- RSI-UNIQ-02 and AOO-ID-01 depend only on family-local occurrence censuses. -/
theorem runtime_identity_uniqueness_of_sublists (before after : RuntimeState)
    (tasks : after.waits.Sublist before.waits)
    (messages : after.messageWaits.Sublist before.messageWaits)
    (timers : after.timerWaits.Sublist before.timerWaits)
    (effects : after.effectWaits.Sublist before.effectWaits)
    (activities : after.activityOccurrences.Sublist before.activityOccurrences)
    (controllers : after.sequentialMultiInstanceControllers.Sublist
      before.sequentialMultiInstanceControllers)
    (waitsUnique : waitIdentitiesUnique before = true)
    (activitiesUnique : activityIdentitiesUnique before = true)
    (controllersUnique : controllerIdentitiesUnique before = true) :
    waitIdentitiesUnique after = true ∧ activityIdentitiesUnique after = true ∧
      controllerIdentitiesUnique after = true := by
  simp only [waitIdentitiesUnique, Bool.and_eq_true, and_assoc] at waitsUnique ⊢
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_⟩
  · exact occurrence_uniqueness_of_sublist userTaskWaitKeyMatches
      (by intro value; simp [userTaskWaitKeyMatches]) _ _ tasks waitsUnique.1
  · exact occurrence_uniqueness_of_sublist messageWaitKeyMatches
      (by intro value; simp [messageWaitKeyMatches]) _ _ messages waitsUnique.2.1
  · exact occurrence_uniqueness_of_sublist timerWaitKeyMatches
      (by intro value; simp [timerWaitKeyMatches]) _ _ timers waitsUnique.2.2.1
  · exact occurrence_uniqueness_of_sublist effectWaitKeyMatches
      (by intro value; simp [effectWaitKeyMatches]) _ _ effects waitsUnique.2.2.2
  · exact occurrence_uniqueness_of_sublist sameActivityOccurrence
      (by intro value; simp [sameActivityOccurrence]) _ _ activities activitiesUnique
  · exact occurrence_uniqueness_of_sublist sameSequentialMultiInstanceController
      (by intro value; simp [sameSequentialMultiInstanceController]) _ _
      controllers controllersUnique

theorem cancelScopeSubtree_preserves_identity_uniqueness (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (waitsUnique : waitIdentitiesUnique state = true)
    (activitiesUnique : activityIdentitiesUnique state = true)
    (controllersUnique : controllerIdentitiesUnique state = true) :
    waitIdentitiesUnique (cancelScopeSubtree state root disposition) = true ∧
      activityIdentitiesUnique (cancelScopeSubtree state root disposition) = true ∧
      controllerIdentitiesUnique (cancelScopeSubtree state root disposition) = true := by
  apply runtime_identity_uniqueness_of_sublists state _
    (waitsUnique := waitsUnique) (activitiesUnique := activitiesUnique)
    (controllersUnique := controllersUnique)
  all_goals exact List.filter_sublist

theorem removeCalledProcessTree_preserves_identity_uniqueness (state : RuntimeState)
    (record : CalledProcessOccurrence)
    (waitsUnique : waitIdentitiesUnique state = true)
    (activitiesUnique : activityIdentitiesUnique state = true)
    (controllersUnique : controllerIdentitiesUnique state = true) :
    waitIdentitiesUnique (removeCalledProcessTree state record) = true ∧
      activityIdentitiesUnique (removeCalledProcessTree state record) = true ∧
      controllerIdentitiesUnique (removeCalledProcessTree state record) = true := by
  apply runtime_identity_uniqueness_of_sublists state _
    (waitsUnique := waitsUnique) (activitiesUnique := activitiesUnique)
    (controllersUnique := controllersUnique)
  all_goals exact List.filter_sublist

end BpmnSemantics.SemanticProcess
