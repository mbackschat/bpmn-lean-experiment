import BpmnSemantics.SemanticProcess.InternalScopeCreationFootprintFrames

/-! Mixed scope creation and local control retain distinct parent and created token owners under
the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem mixed_read_write_separate
    (left right : InternalTransitionStateFootprint)
    (separated : localControlStateFootprintsNonInterfering left right = true)
    (read written : InternalStateAtom) (reads : read ∈ left.reads)
    (writes : written ∈ right.writes) : written ≠ read := by
  simp only [localControlStateFootprintsNonInterfering, Bool.and_eq_true] at separated
  intro same
  exact not_mem_right_of_listsDisjoint _ _ separated.1.2 read (same ▸ writes) reads

private theorem local_scope_input_untouched (state : RuntimeState)
    (scope : InternalScopeCreationSelection) (localSelection : InternalLocalControlSelection)
    (scopeInstance localInstance : SemanticId) (scopeOwner : RuntimeScopeOccurrence)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint scope scopeInstance scopeOwner)
      (internalLocalControlStateFootprint state localSelection localInstance) = true) :
    scope.input ∉ localSelection.tokens.consumed ++ localSelection.tokens.produced := by
  intro member
  exact mixed_read_write_separate _ _ separated _ _
    (scopeCreation_census_read scope scopeInstance scopeOwner)
    (localControl_tokenOwners_write state localSelection localInstance scope.input member) rfl

private theorem local_scope_bucket_frame (state : RuntimeState)
    (scope : InternalScopeCreationSelection) (localSelection : InternalLocalControlSelection)
    (scopeInstance localInstance : SemanticId) (scopeOwner : RuntimeScopeOccurrence)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint scope scopeInstance scopeOwner)
      (internalLocalControlStateFootprint state localSelection localInstance) = true)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (read : .controlToken owner place ∈
      (internalScopeCreationStateFootprint scope scopeInstance scopeOwner).reads) :
    (localSelection.apply state).tokens.filter (fun token =>
        decide (token.placeId = place && token.owner = owner)) =
      state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) := by
  apply localSelection.tokens.filter_untouched
  all_goals
    intro written member
    apply Bool.eq_false_iff.mpr
    intro matched
    simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
  · have writes := localControl_token_write state localSelection localInstance written
      (List.mem_append_left _ member)
    have sameOwner : localSelection.owner = owner := matched.2
    rw [matched.1, sameOwner] at writes
    exact mixed_read_write_separate _ _ separated _ _ read writes rfl
  · have writes := localControl_token_write state localSelection localInstance written
      (List.mem_append_right _ member)
    have sameOwner : localSelection.owner = owner := matched.2
    rw [matched.1, sameOwner] at writes
    exact mixed_read_write_separate _ _ separated _ _ read writes rfl

/-- The full input census rejects a local writer even when its owner differs from the scope parent. -/
theorem scope_creation_local_input_writer_conflicts (state : RuntimeState)
    (scope : InternalScopeCreationSelection) (localSelection : InternalLocalControlSelection)
    (scopeInstance localInstance : SemanticId) (scopeOwner : RuntimeScopeOccurrence)
    (written : scope.input ∈ localSelection.tokens.consumed ++ localSelection.tokens.produced) :
    localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint scope scopeInstance scopeOwner)
      (internalLocalControlStateFootprint state localSelection localInstance) = false := by
  apply Bool.eq_false_iff.mpr
  intro separated
  exact local_scope_input_untouched state scope localSelection scopeInstance localInstance
    scopeOwner separated written

/-- Readiness belongs to the entire selected-key population, including each nonchosen record. -/
theorem scope_creation_selected_join_readiness_writer_conflicts (state : RuntimeState)
    (scope : InternalScopeCreationSelection) (localSelection : InternalLocalControlSelection)
    (scopeInstance localInstance : SemanticId) (scopeOwner : RuntimeScopeOccurrence)
    (chosen record : SelectedBranchSet) (place : ControlPlaceId)
    (removed : localSelection.selectedBranch = .remove chosen)
    (present : record ∈ state.selectedBranchSets) (key : record.selectionKey = chosen.selectionKey)
    (read : place ∈ record.expectedInputs)
    (written : ({ placeId := place, owner := record.owner } : ControlToken) ∈
      [{ placeId := scope.input, owner := scope.owner },
       { placeId := scope.entry, owner := scope.created.id }]) :
    localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint scope scopeInstance scopeOwner)
      (internalLocalControlStateFootprint state localSelection localInstance) = false := by
  apply Bool.eq_false_iff.mpr
  intro separated
  exact mixed_read_write_separate _ _ (localControlStateFootprintsNonInterfering_symm _ _ separated) _ _
    (localControl_selectedJoin_bucket_read state localSelection localInstance chosen record place
      removed present key read)
    (scopeCreation_token_write scope scopeInstance scopeOwner
      { placeId := place, owner := record.owner } written) rfl

/-- Complete scope preparation survives the local patch because its parent input census and
fresh-owner entry bucket are independent reads, while issuance and Call populations are unchanged. -/
theorem prepareInternalScopeCreation_after_local_control (program : Program) (state : RuntimeState)
    (scopeOperation localOperation : SemanticOperation)
    (scopePrepared : PreparedInternalScopeCreation) (localPrepared : PreparedInternalLocalControl)
    (scopeFound : prepareInternalScopeCreation? program state scopeOperation = some scopePrepared)
    (localFound : prepareInternalLocalControl? program state localOperation = some localPrepared)
    (separated : localControlStateFootprintsNonInterfering
      scopePrepared.footprint localPrepared.footprint = true) :
    prepareInternalScopeCreation? program (localPrepared.selection.apply state) scopeOperation =
      some scopePrepared := by
  obtain ⟨scope, scopeInstance, scopeOwner, origin, definition, start, delta,
    selection, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state scopeOperation scopePrepared scopeFound
  obtain ⟨localSelection, _, localInstance, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state localOperation localPrepared localFound
  have untouched := local_scope_input_untouched state scope localSelection scopeInstance localInstance
    scopeOwner separated
  have inputFrame := local_scope_bucket_frame state scope localSelection scopeInstance localInstance
    scopeOwner separated scope.owner scope.input
    (scopeCreation_token_read scope scopeInstance scopeOwner
      { placeId := scope.input, owner := scope.owner } (by simp))
  have entryFrame := local_scope_bucket_frame state scope localSelection scopeInstance localInstance
    scopeOwner separated scope.created.id scope.entry
    (scopeCreation_token_read scope scopeInstance scopeOwner
      { placeId := scope.entry, owner := scope.created.id } (by simp))
  have selectedAfter := selectInternalScopeCreation_read_frame state (localSelection.apply state)
    scopeOperation scope selection rfl
    (localSelection.tokens.owner_census_frame state scope.input
      (fun member => untouched (List.mem_append_left _ member))
      (fun member => untouched (List.mem_append_right _ member))) inputFrame rfl
    (by intro _; exact ⟨rfl, rfl⟩)
    (by
      intro record kind
      have facts := scopeCreation_selection_call_facts state scopeOperation scope record scopeInstance
        running selection kind
      refine ⟨?_, rfl, facts.2.2.2.2.2.1, facts.2.2.2.2.2.2.1, facts.2.2.2.2.2.2.2⟩
      rw [calledProcessAssociationsValid_frame state (localSelection.apply state) rfl rfl rfl]
      exact scopeCreation_selection_call_associations state scopeOperation scope record selection kind)
  apply prepareInternalScopeCreation_read_frame program state (localSelection.apply state)
    scopeOperation _ scopeFound selectedAfter rfl rfl rfl inputFrame entryFrame
  exact scopeCreation_counter_read_frame state (localSelection.apply state) scope
    (by intro _; rfl) (by intro _ _; rfl)

private theorem scope_local_bucket_frame (state : RuntimeState)
    (scope : InternalScopeCreationSelection) (localSelection : InternalLocalControlSelection)
    (scopeInstance localInstance : SemanticId) (scopeOwner : RuntimeScopeOccurrence)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint scope scopeInstance scopeOwner)
      (internalLocalControlStateFootprint state localSelection localInstance) = true)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (read : .controlToken owner place ∈
      (internalLocalControlStateFootprint state localSelection localInstance).reads) :
    (scope.apply state).tokens.filter (fun token =>
        decide (token.placeId = place && token.owner = owner)) =
      state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) := by
  have reverse := localControlStateFootprintsNonInterfering_symm _ _ separated
  apply scopeCreation_apply_token_filter
  · apply Bool.eq_false_iff.mpr
    intro matched
    simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
    have writes := scopeCreation_token_write scope scopeInstance scopeOwner
      { placeId := scope.input, owner := scope.owner } (by simp)
    simp only [matched.1, matched.2] at writes
    exact mixed_read_write_separate _ _ reverse _ _ read writes rfl
  · apply Bool.eq_false_iff.mpr
    intro matched
    simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
    have writes := scopeCreation_token_write scope scopeInstance scopeOwner
      { placeId := scope.entry, owner := scope.created.id } (by simp)
    simp only [matched.1, matched.2] at writes
    exact mixed_read_write_separate _ _ reverse _ _ read writes rfl

/-- The scope insertion frames all same-key selected-join records and every readiness bucket,
including records that the predecessor selector did not choose. -/
theorem prepareInternalLocalControl_after_scope_creation (program : Program) (state : RuntimeState)
    (scopeOperation localOperation : SemanticOperation)
    (scopePrepared : PreparedInternalScopeCreation) (localPrepared : PreparedInternalLocalControl)
    (scopeFound : prepareInternalScopeCreation? program state scopeOperation = some scopePrepared)
    (localFound : prepareInternalLocalControl? program state localOperation = some localPrepared)
    (separated : localControlStateFootprintsNonInterfering
      scopePrepared.footprint localPrepared.footprint = true) :
    prepareInternalLocalControl? program (scopePrepared.selection.apply state) localOperation =
      some localPrepared := by
  obtain ⟨scope, scopeInstance, scopeOwner, origin, definition, start, delta,
    _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state scopeOperation scopePrepared scopeFound
  obtain ⟨localSelection, _, localInstance, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state localOperation localPrepared localFound
  have reverse := localControlStateFootprintsNonInterfering_symm _ _ separated
  apply prepareInternalLocalControl_read_frame program state (scope.apply state) localOperation _ localFound
    (scopeCreation_apply_control state scope) (scopeCreation_apply_time state scope)
  · apply scopeCreation_apply_scope_filter
    apply Bool.eq_false_iff.mpr
    intro matched
    simp only [decide_eq_true_eq] at matched
    have reads : .scopeOccurrence localSelection.owner ∈
        (internalLocalControlStateFootprint state localSelection localInstance).reads := by
      simp [internalLocalControlStateFootprint, canonicalStateAtomSet, mem_sortBy]
    have writes := scopeCreation_creation_write scope scopeInstance scopeOwner
      (.scopeOccurrence scope.created.id) (by simp [internalScopeCreationCreationAtoms])
    rw [matched] at writes
    exact mixed_read_write_separate _ _ reverse _ _ reads writes rfl
  · intro place member
    have different (written : ControlPlaceId) (writtenMember : written ∈ [scope.input, scope.entry]) :
        written ≠ place := by
      intro same
      have writes := scopeCreation_census_write scope scopeInstance scopeOwner written writtenMember
      rw [same] at writes
      exact mixed_read_write_separate _ _ reverse _ _
        (localControl_tokenOwners_read state localSelection localInstance place member) writes rfl
    exact scopeCreation_apply_census state scope place
      (different scope.input (by simp)) (different scope.entry (by simp))
  · intro place member
    exact scope_local_bucket_frame state scope localSelection scopeInstance localInstance scopeOwner
      separated localSelection.owner place
      (localControl_token_read state localSelection localInstance place member)
  · intro name member
    cases kind : scope.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  · intro key selectedKey
    cases kind : scope.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  · intro chosen branch record present key place member
    exact scope_local_bucket_frame state scope localSelection scopeInstance localInstance scopeOwner
      separated record.owner place
      (localControl_selectedJoin_bucket_read state localSelection localInstance chosen record place
        (localControl_selectedJoin_patch state localOperation localSelection selection chosen branch)
        present key member)

private theorem scope_local_tokens_commute (tokens : List ControlToken)
    (scope : InternalScopeCreationSelection) (patch : TokenPatch)
    (ordered : orderedBy controlTokenBefore tokens = true)
    (input : ∀ produced ∈ patch.produced,
      ({ placeId := produced, owner := patch.owner } : ControlToken) ≠
        { placeId := scope.input, owner := scope.owner })
    (entry : ∀ consumed ∈ patch.consumed,
      ({ placeId := scope.entry, owner := scope.created.id } : ControlToken) ≠
        { placeId := consumed, owner := patch.owner }) :
    patch.apply (addToken (removeToken tokens scope.input scope.owner) scope.entry scope.created.id) =
      addToken (removeToken (patch.apply tokens) scope.input scope.owner) scope.entry scope.created.id := by
  have entryFrame := addTokens_removeTokens_commute (removeToken tokens scope.input scope.owner)
    [scope.entry] patch.consumed scope.created.id patch.owner
    (orderedBy_removeToken tokens scope.input scope.owner ordered)
    (by intro added member consumed present; cases List.mem_singleton.mp member; exact entry consumed present)
  change removeTokens (addToken (removeToken tokens scope.input scope.owner) scope.entry scope.created.id)
      patch.consumed patch.owner =
    addToken (removeTokens (removeToken tokens scope.input scope.owner) patch.consumed patch.owner)
      scope.entry scope.created.id at entryFrame
  unfold TokenPatch.apply
  rw [entryFrame,
    addTokens_removeToken_commute _ patch.produced scope.input patch.owner scope.owner
      (orderedBy_removeTokens tokens patch.consumed patch.owner ordered) input,
    removeTokens_removeToken_commute, addTokens_addToken_commute]

theorem scope_creation_local_control_patches_commute (state : RuntimeState)
    (scope : InternalScopeCreationSelection) (localSelection : InternalLocalControlSelection)
    (scopeInstance localInstance : SemanticId) (scopeOwner : RuntimeScopeOccurrence)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint scope scopeInstance scopeOwner)
      (internalLocalControlStateFootprint state localSelection localInstance) = true) :
    localSelection.apply (scope.apply state) = scope.apply (localSelection.apply state) := by
  have reverse := localControlStateFootprintsNonInterfering_symm _ _ separated
  have tokenEquality := scope_local_tokens_commute state.tokens scope localSelection.tokens
    (canonicalCollectionOrder_tokens state canonical)
    (by
      intro produced member same
      have place : produced = scope.input := congrArg ControlToken.placeId same
      exact local_scope_input_untouched state scope localSelection scopeInstance localInstance
        scopeOwner separated (place ▸ List.mem_append_right _ member))
    (by
      intro consumed member same
      have place : scope.entry = consumed := congrArg ControlToken.placeId same
      have owner : scope.created.id = localSelection.owner := congrArg ControlToken.owner same
      have writes := scopeCreation_token_write scope scopeInstance scopeOwner
        { placeId := scope.entry, owner := scope.created.id } (by simp)
      simp only [place, owner] at writes
      exact mixed_read_write_separate _ _ reverse _ _
        (localControl_token_read state localSelection localInstance consumed
          (List.mem_append_left _ member)) writes rfl)
  cases kind : scope.kind <;>
    simp only [InternalScopeCreationSelection.apply, kind, InternalLocalControlSelection.apply,
      tokenEquality, setCallActivationCount]

theorem prepared_scope_creation_local_control_pair (program : Program) (state : RuntimeState)
    (scopeOperation localOperation : SemanticOperation)
    (scopePrepared : PreparedInternalScopeCreation) (localPrepared : PreparedInternalLocalControl)
    (scopeFound : prepareInternalScopeCreation? program state scopeOperation = some scopePrepared)
    (localFound : prepareInternalLocalControl? program state localOperation = some localPrepared)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering
      scopePrepared.footprint localPrepared.footprint = true) :
    prepareInternalLocalControl? program (scopePrepared.selection.apply state) localOperation =
        some localPrepared ∧
      prepareInternalScopeCreation? program (localPrepared.selection.apply state) scopeOperation =
        some scopePrepared ∧
      localPrepared.selection.apply (scopePrepared.selection.apply state) =
        scopePrepared.selection.apply (localPrepared.selection.apply state) := by
  refine ⟨prepareInternalLocalControl_after_scope_creation program state scopeOperation localOperation
    scopePrepared localPrepared scopeFound localFound separated,
    prepareInternalScopeCreation_after_local_control program state scopeOperation localOperation
      scopePrepared localPrepared scopeFound localFound separated, ?_⟩
  obtain ⟨scope, scopeInstance, scopeOwner, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state scopeOperation scopePrepared scopeFound
  obtain ⟨localSelection, _, localInstance, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state localOperation localPrepared localFound
  exact scope_creation_local_control_patches_commute state scope localSelection scopeInstance localInstance
    scopeOwner canonical separated

end BpmnSemantics.SemanticProcess.InternalCommutation
