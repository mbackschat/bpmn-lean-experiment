import BpmnSemantics.SemanticProcess.InternalEndCommutation

/-! End/local-control commutation reuses token-patch algebra. Selected-join preparation also
protects every competing record's readiness bucket, beyond the selected owner's input. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- End consumes one token and increments the independent relative counter. Local control's
existing complete read frame also covers competing selected-join buckets and variable reads. -/
theorem prepared_end_local_control_pair_commutes (program : Program) (state : RuntimeState)
    (endOperation localOperation : SemanticOperation) (ending : PreparedInternalEnd)
    (control : PreparedInternalLocalControl)
    (endFound : prepareInternalEnd? program state endOperation = some ending)
    (localFound : prepareInternalLocalControl? program state localOperation = some control)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent ending.footprint
      (liftRegionalStateFootprint control.selection.owner control.footprint) = true) :
    prepareInternalEnd? program (control.selection.apply state) endOperation = some ending ∧
      prepareInternalLocalControl? program (ending.selection.apply state) localOperation = some control ∧
      control.selection.apply (ending.selection.apply state) = ending.selection.apply (control.selection.apply state) := by
  obtain ⟨_, selected, endOrigin, endInstance, endIdentity, endDelta, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program state endOperation ending endFound
  obtain ⟨patch, origin, hosting, identity, delta, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state localOperation control localFound
  have endRead : .ordinary (.tokenOwners selected.input) ∈
      (internalEndStateFootprint selected endInstance).reads := by
    simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem]
  have untouched := regional_localControl_census_untouched state
    (internalEndStateFootprint selected endInstance) patch hosting selected.input endRead independent
  have endWrite : .ordinary (.tokenOwners selected.input) ∈
      (internalEndStateFootprint selected endInstance).writes := by
    simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem]
  have tokenWrite : .ordinary (.controlToken selected.owner selected.input) ∈
      (internalEndStateFootprint selected endInstance).writes := by
    simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem]
  have census (place : ControlPlaceId) (member : place ∈ patch.censusReads) :
      tokenOwners (selected.apply state) place = tokenOwners state place := by
    have read := localControl_tokenOwners_read state patch hosting place member
    have conflict := regional_independent_read_write _ _ independent _ _ endWrite
      (List.mem_map.mpr ⟨_, read, rfl⟩)
    have different : place ≠ selected.input := by
      intro same
      simp [liftRegionalStateAtom, regionalStateAtomsConflict, same] at conflict
    exact selected.tokens.owner_census_frame state place
      (by simpa [InternalEndSelection.tokens] using different) (by simp [InternalEndSelection.tokens])
  have bucket (owner : ScopeOccurrenceId) (place : ControlPlaceId)
      (read : .controlToken owner place ∈ (internalLocalControlStateFootprint state patch hosting).reads) :
      (selected.apply state).tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) =
        state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) := by
    have conflict := regional_independent_read_write _ _ independent _ _ tokenWrite
      (List.mem_map.mpr ⟨_, read, rfl⟩)
    apply selected.tokens.filter_untouched
    · intro input member
      have inputEq : input = selected.input := List.mem_singleton.mp member
      subst input
      apply Bool.eq_false_iff.mpr
      intro matched
      simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
      have ownerSame : selected.owner = owner := matched.2
      simp [liftRegionalStateAtom, regionalStateAtomsConflict, matched.1, ownerSame] at conflict
    · simp [InternalEndSelection.tokens]
  refine ⟨?_, ?_, ?_⟩
  · apply prepareInternalEnd_read_frame program state (patch.apply state) endOperation _ endFound rfl rfl rfl
    apply patch.tokens.filter_untouched
    all_goals
      intro place member
      apply Bool.eq_false_iff.mpr
      intro same
      have placeEq : place = selected.input := of_decide_eq_true same
      subst place
    · exact untouched (List.mem_append_left _ member)
    · exact untouched (List.mem_append_right _ member)
  · apply prepareInternalLocalControl_read_frame program state (selected.apply state) localOperation _ localFound
      rfl rfl rfl census
    · intro place member
      exact bucket patch.owner place (localControl_token_read state patch hosting place member)
    · intro _ _
      rfl
    · intro _ _
      rfl
    · intro chosen branch record present key place member
      exact bucket record.owner place (localControl_selectedJoin_bucket_read state patch hosting chosen record place
        (localControl_selectedJoin_patch state localOperation patch selection chosen branch) present key member)
  · have tokens := selected.tokens.commutes state.tokens patch.tokens
      (canonicalCollectionOrder_tokens state canonical) (by simp [InternalEndSelection.tokens])
      (by
        intro produced producedMember consumed consumedMember same
        have input : consumed = selected.input := List.mem_singleton.mp consumedMember
        have place : produced = consumed := congrArg ControlToken.placeId same
        exact untouched (List.mem_append_right _ ((place.trans input) ▸ producedMember)))
    change patch.apply (selected.apply state) = selected.apply (patch.apply state)
    simp only [InternalEndSelection.apply, InternalLocalControlSelection.apply, tokens]

end BpmnSemantics.SemanticProcess.InternalCommutation
