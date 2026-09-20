import BpmnSemantics.SemanticProcess.InternalRegionalActivityRemoval
import BpmnSemantics.SemanticProcess.CollectionOrder

/-! # Regional removal validity

Scope cancellation filters live work while retaining issuance counters and immutable Program
bindings. These laws preserve the corresponding runtime conjuncts and exact surviving-owner
censuses, independently of the selected scope's retain/remove disposition.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The entire owner census survives cancellation, including empty and duplicate censuses. -/
theorem cancelScopeSubtree_uncancelled_owner_census (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (owner : ScopeOccurrenceId)
    (outside : (occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) = false) :
    (cancelScopeSubtree state root disposition).scopeOccurrences.filter
      (fun occurrence => decide (occurrence.id = owner)) =
      state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = owner)) := by
  cases disposition with
  | retain =>
      change (state.scopeOccurrences.filter fun occurrence => decide (occurrence.id = root) ||
        !(occurrenceInSubtree state.scopeOccurrences root occurrence.id ||
          (calledInstanceClosure state root).contains occurrence.id.processInstanceId)).filter _ = _
      rw [List.filter_filter]
      apply List.filter_congr
      intro occurrence _
      by_cases same : occurrence.id = owner <;> simp_all
  | remove =>
      change (state.scopeOccurrences.filter fun occurrence =>
        !(occurrenceInSubtree state.scopeOccurrences root occurrence.id ||
          (calledInstanceClosure state root).contains occurrence.id.processInstanceId)).filter _ = _
      rw [List.filter_filter]
      apply List.filter_congr
      intro occurrence _
      by_cases same : occurrence.id = owner <;> simp_all

/-- Filtering other scopes preserves the complete singleton census of an uncancelled owner. -/
theorem cancelScopeSubtree_preserves_uncancelled_owner (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (owner : ScopeOccurrenceId)
    (live : exactLiveOccurrence state owner = true)
    (outside : (occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) = false) :
    exactLiveOccurrence (cancelScopeSubtree state root disposition) owner = true := by
  simpa only [exactLiveOccurrence, cancelScopeSubtree_uncancelled_owner_census state root disposition owner outside] using live

private theorem filtered_owners_live {α : Type} (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (values : List α) (owner : α → ScopeOccurrenceId)
    (keep : α → Bool)
    (live : values.all (fun value => exactLiveOccurrence state (owner value)) = true)
    (outside : ∀ value ∈ values, keep value = true →
      (occurrenceInSubtree state.scopeOccurrences root (owner value) ||
        (calledInstanceClosure state root).contains (owner value).processInstanceId) = false) :
    (values.filter keep).all
      (fun value => exactLiveOccurrence (cancelScopeSubtree state root disposition) (owner value)) =
      true := by
  apply List.all_eq_true.mpr
  intro value member
  obtain ⟨prior, kept⟩ := List.mem_filter.mp member
  exact cancelScopeSubtree_preserves_uncancelled_owner state root disposition (owner value)
    (List.all_eq_true.mp live value prior) (outside value prior kept)

/-- RSI-OWN-01 survives both cancellation dispositions: every retained work record excludes a
cancelled owner, and filtering scopes preserves that owner's exact singleton census. -/
theorem cancelScopeSubtree_preserves_wait_owners (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (valid : waitOwnersLive state = true) :
    waitOwnersLive (cancelScopeSubtree state root disposition) = true := by
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at valid ⊢
  refine ⟨filtered_owners_live state root disposition state.waits (·.owner) _ valid.1 ?_,
    filtered_owners_live state root disposition state.messageWaits (·.owner) _ valid.2.1 ?_,
    filtered_owners_live state root disposition state.timerWaits (·.owner) _ valid.2.2.1 ?_,
    filtered_owners_live state root disposition state.effectWaits (·.owner) _ valid.2.2.2.1 ?_,
    filtered_owners_live state root disposition state.effectIncidents (·.wait.owner) _
      valid.2.2.2.2.1 ?_,
    filtered_owners_live state root disposition state.selectedBranchSets (·.owner) _
      valid.2.2.2.2.2.1 ?_,
    filtered_owners_live state root disposition state.eventRaces (·.owner) _
      valid.2.2.2.2.2.2.1 ?_,
    filtered_owners_live state root disposition state.calledProcessOccurrences (·.caller) _
      valid.2.2.2.2.2.2.2.1 ?_,
    filtered_owners_live state root disposition state.activityOccurrences (·.owner) _
      valid.2.2.2.2.2.2.2.2 ?_⟩
  all_goals
    intro value _ kept
    simp only [Bool.and_eq_true, Bool.not_eq_true', recordInRegion,
      Bool.or_eq_false_iff] at kept ⊢
    first | exact kept | exact kept.1

/-- RSI-BOUND-01 survives cancellation because it filters live work and retains every issuing
counter, including counters whose final occurrence has disappeared. -/
theorem cancelScopeSubtree_preserves_identity_bound (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (valid : runtimeStateIdentityBound state = true) :
    runtimeStateIdentityBound (cancelScopeSubtree state root disposition) = true := by
  simp only [runtimeStateIdentityBound, Bool.and_eq_true] at valid ⊢
  exact ⟨⟨all_filter _ _ _ valid.1.1, all_filter _ _ _ valid.1.2⟩,
    all_filter _ _ _ valid.2⟩

private theorem declarations_filter {α : Type} (values : List α)
    (inInstance keep declaration : α → Bool)
    (valid : (values.filter inInstance).all declaration = true) :
    ((values.filter keep).filter inInstance).all declaration = true := by
  apply List.all_eq_true.mpr
  intro value member
  obtain ⟨kept, instanceMember⟩ := List.mem_filter.mp member
  exact List.all_eq_true.mp valid value
    (List.mem_filter.mpr ⟨(List.mem_filter.mp kept).1, instanceMember⟩)

/-- RSI-BIND-04 reads immutable Program declarations and retained wait payloads, so removing
other waits cannot change a surviving wait's unique declarer or definition owner. -/
theorem cancelScopeSubtree_preserves_wait_declarations (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (valid : waitDeclarationsValid program instanceId state = true) :
    waitDeclarationsValid program instanceId (cancelScopeSubtree state root disposition) = true := by
  simp only [waitDeclarationsValid, Bool.and_eq_true, and_assoc] at valid ⊢
  exact ⟨declarations_filter _ _ _ _ valid.1,
    declarations_filter _ _ _ _ valid.2.1,
    declarations_filter _ _ _ _ valid.2.2.1,
    declarations_filter _ _ _ _ valid.2.2.2.1,
    declarations_filter _ _ _ _ valid.2.2.2.2⟩

/-- The implemented RSI-BIND-05 clauses depend on each retained record and immutable Program
operations, so arbitrary cancellation preserves both declaring censuses. -/
theorem cancelScopeSubtree_preserves_hidden_declarations (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (valid : hiddenRecordDeclarationsValid program state = true) :
    hiddenRecordDeclarationsValid program (cancelScopeSubtree state root disposition) = true := by
  simp only [hiddenRecordDeclarationsValid, Bool.and_eq_true] at valid ⊢
  exact ⟨all_filter _ _ _ valid.1, all_filter _ _ _ valid.2⟩

end BpmnSemantics.SemanticProcess
