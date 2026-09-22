import BpmnSemantics.SemanticProcess.InternalEndCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationFootprintFrames

/-! End commutes with child-scope creation and Call invocation when both consumed and created
token places are separate. Existing scope-selection laws retain issuance and owner freshness. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalScopeCreation_after_end (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation) (ending : InternalEndSelection)
    (found : prepareInternalScopeCreation? program state operation = some prepared)
    (input : prepared.selection.input ≠ ending.input) (entry : prepared.selection.entry ≠ ending.input) :
    prepareInternalScopeCreation? program (ending.apply state) operation = some prepared := by
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta, selection, running,
    _, _, _, _, _, _, _, _, rfl⟩ := prepareInternalScopeCreation_facts program state operation prepared found
  dsimp only [makeInternalScopeCreationPreparation] at input entry
  have bucket (place : ControlPlaceId) (owner : ScopeOccurrenceId) (different : place ≠ ending.input) :
      (ending.apply state).tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) =
        state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) :=
    filter_removeToken_of_rejected state.tokens ending.input ending.owner _ (by simp [Ne.symm different])
  have census := ending.tokens.owner_census_frame state selected.input
    (by simpa [InternalEndSelection.tokens] using input) (by simp [InternalEndSelection.tokens])
  have selectionAfter := selectInternalScopeCreation_read_frame state (ending.apply state) operation selected
    selection rfl census (bucket selected.input selected.owner input) rfl
    (fun _ => ⟨rfl, rfl⟩) (by
      intro record kind
      have facts := scopeCreation_selection_call_facts state operation selected record hosting running selection kind
      exact ⟨scopeCreation_selection_call_associations state operation selected record selection kind,
        rfl, facts.2.2.2.2.2.1, facts.2.2.2.2.2.2.1, facts.2.2.2.2.2.2.2⟩)
  apply prepareInternalScopeCreation_read_frame program state (ending.apply state) operation _ found
    selectionAfter rfl rfl rfl (bucket selected.input selected.owner input)
    (bucket selected.entry selected.created.id entry)
  change internalScopeCreationCounterSafe (ending.apply state) selected = internalScopeCreationCounterSafe state selected
  cases kind : selected.kind <;> rfl

theorem InternalEndSelection.scope_creation_commutes (state : RuntimeState)
    (ending : InternalEndSelection) (creation : InternalScopeCreationSelection)
    (canonical : canonicalCollectionOrder state = true) (different : creation.entry ≠ ending.input) :
    ending.apply (creation.apply state) = creation.apply (ending.apply state) := by
  have tokens : removeToken
      (addToken (removeToken state.tokens creation.input creation.owner) creation.entry creation.created.id)
      ending.input ending.owner =
    addToken (removeToken (removeToken state.tokens ending.input ending.owner) creation.input creation.owner)
      creation.entry creation.created.id := by
    rw [addToken_removeToken_commute _ _ _ _ _
      (orderedBy_removeToken _ _ _ (canonicalCollectionOrder_tokens state canonical))
      (fun same => different (congrArg ControlToken.placeId same)), removeToken_commutes]
  cases kind : creation.kind <;>
    simp [InternalScopeCreationSelection.apply, kind, InternalEndSelection.apply,
      InternalEndSelection.tokens, TokenPatch.apply, removeTokens, addTokens, tokens, setCallActivationCount]

theorem prepared_end_scope_creation_pair_commutes (program : Program) (state : RuntimeState)
    (endOperation scopeOperation : SemanticOperation) (ending : PreparedInternalEnd)
    (scope : PreparedInternalScopeCreation)
    (endFound : prepareInternalEnd? program state endOperation = some ending)
    (scopeFound : prepareInternalScopeCreation? program state scopeOperation = some scope)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent ending.footprint
      (liftRegionalStateFootprint scope.selection.owner scope.footprint) = true) :
    prepareInternalEnd? program (scope.selection.apply state) endOperation = some ending ∧
      prepareInternalScopeCreation? program (ending.selection.apply state) scopeOperation = some scope ∧
      scope.selection.apply (ending.selection.apply state) = ending.selection.apply (scope.selection.apply state) := by
  obtain ⟨_, selected, _, endInstance, _, _, _, _, _, live, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program state endOperation ending endFound
  obtain ⟨creation, hosting, ownerRecord, origin, definition, start, delta, selection,
    _, _, _, _, _, _, _, _, _, rfl⟩ := prepareInternalScopeCreation_facts program state scopeOperation scope scopeFound
  have endRead : .ordinary (.tokenOwners selected.input) ∈
      (internalEndStateFootprint selected endInstance).reads := by
    simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem]
  have different (place : ControlPlaceId) (member : place ∈ [creation.input, creation.entry]) :
      place ≠ selected.input := by
    have conflict := regional_independent_write_read _ _ independent _ (.ordinary (.tokenOwners selected.input))
      (List.mem_map.mpr ⟨_, scopeCreation_census_write creation hosting ownerRecord place member, rfl⟩)
      endRead
    intro same
    simp [liftRegionalStateAtom, regionalStateAtomsConflict, same] at conflict
  have input := different creation.input (by simp)
  have entry := different creation.entry (by simp)
  refine ⟨?_, prepareInternalScopeCreation_after_end program state scopeOperation _ selected scopeFound input entry,
    (selected.scope_creation_commutes state creation canonical entry).symm⟩
  have liveAfter := selectInternalScopeCreation_preserves_live state scopeOperation creation selected.owner selection live
  apply prepareInternalEnd_read_frame program state (creation.apply state) endOperation _ endFound
    (scopeCreation_apply_control state creation) (liveAfter.trans live.symm) (scopeCreation_apply_time state creation)
  change (creation.apply state).tokens.filter (fun token => decide (token.placeId = selected.input)) = _
  exact scopeCreation_apply_token_filter state creation _ (by simpa using input) (by simpa using entry)

end BpmnSemantics.SemanticProcess.InternalCommutation
