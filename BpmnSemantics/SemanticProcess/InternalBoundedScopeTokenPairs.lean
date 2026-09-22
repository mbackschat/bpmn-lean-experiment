import BpmnSemantics.SemanticProcess.InternalBoundedScopeLocalControl
import BpmnSemantics.SemanticProcess.InternalMergeCommutation
import BpmnSemantics.SemanticProcess.InternalEndScopeCreationCommutation

/-! Merge and ordinary End reuse token-patch separation for bounded child entry under the
[bounded outcome](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#bounded-sub-process-arming-outcome).
Neither changes the joined Activity or deadline, so those retained reads stay exact.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_bounded_scope_merge_pair
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation)
    (alternative : InternalAlternative) (merge : PreparedInternalMerge)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (mergeFound : prepareInternalMerge? program state operation alternative = some merge)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent bounded.footprint
      (liftRegionalStateFootprint merge.selection.owner merge.footprint) = true) :
    prepareInternalBoundedScope? program (merge.selection.apply state) contract = some bounded ∧
      prepareInternalMerge? program (bounded.selection.apply state) operation alternative = some merge ∧
      merge.selection.apply (bounded.selection.apply state) =
        bounded.selection.apply (merge.selection.apply state) := by
  have view := prepareInternalMerge_patch_footprint program state operation alternative merge mergeFound
  have separated : regionalStateFootprintsIndependent bounded.footprint
      (liftRegionalStateFootprint merge.selection.owner
        (internalLocalControlStateFootprint state merge.selection.localControlPatch merge.runtimeInstanceId)) = true := by
    simpa only [view] using independent
  have boundedAfter := prepareInternalBoundedScope_after_local_control program state contract bounded
    merge.selection.localControlPatch merge.runtimeInstanceId found separated
  obtain ⟨selected, instanceId, owner, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  have childSeparated := boundedScope_child_independent selected instanceId owner
    merge.selection.owner _ separated
  refine ⟨boundedAfter, ?_, ?_⟩
  · apply prepareInternalMerge_read_frame program state (selected.apply state) operation alternative merge mergeFound
      (scopeCreation_apply_control state selected.creation) (scopeCreation_apply_time state selected.creation)
    · exact scope_local_scope_frame state selected.creation merge.selection.localControlPatch instanceId
        merge.runtimeInstanceId owner childSeparated
    · intro place member
      exact scope_local_bucket_frame state selected.creation merge.selection.localControlPatch instanceId
        merge.runtimeInstanceId owner childSeparated merge.selection.owner place
        (localControl_token_read state merge.selection.localControlPatch merge.runtimeInstanceId place member)
  · have equality := scope_creation_local_control_patches_commute state selected.creation
      merge.selection.localControlPatch instanceId merge.runtimeInstanceId owner canonical childSeparated
    have tokens := congrArg RuntimeState.tokens equality
    cases kind : selected.creation.kind <;>
      simp only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
        InternalScopeCreationSelection.apply, InternalMergeSelection.apply,
        InternalLocalControlSelection.apply, kind, setCallActivationCount] at tokens ⊢
    all_goals congr 1

theorem prepareInternalBoundedScope_after_end
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (ending : InternalEndSelection)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (input : bounded.selection.creation.input ≠ ending.input)
    (entryPlace : bounded.selection.creation.entry ≠ ending.input) :
    prepareInternalBoundedScope? program (ending.apply state) contract = some bounded := by
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  change entry.input ≠ ending.input at input
  change entry.entry ≠ ending.input at entryPlace
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have bucket (place : ControlPlaceId) (owner : ScopeOccurrenceId) (different : place ≠ ending.input) :
      (ending.apply state).tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) =
        state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) :=
    filter_removeToken_of_rejected state.tokens ending.input ending.owner _ (by simp [Ne.symm different])
  have census := ending.tokens.owner_census_frame state entry.input
    (by simpa [InternalEndSelection.tokens] using input) (by simp [InternalEndSelection.tokens])
  have selectionAfter := selectInternalScopeCreation_read_frame state (ending.apply state)
    contract.entryOperation entry entryFound rfl census (bucket entry.input entry.owner input) rfl
    (fun _ => ⟨rfl, rfl⟩) (by intro record kind; simp [child] at kind)
  have boundedAfter := selectInternalBoundedScope_read_frame state (ending.apply state) contract _ selection
    (selectionAfter.trans entryFound.symm) rfl rfl rfl
  apply prepareInternalBoundedScope_read_frame program state (ending.apply state) contract _ found
    boundedAfter rfl rfl rfl (bucket entry.input entry.owner input)
    (bucket entry.entry entry.created.id entryPlace)
  · apply scopeCreation_counter_read_frame
    · intro _; rfl
    · intro _ _; rfl
  · rfl

theorem prepared_bounded_scope_end_pair
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (ending : PreparedInternalEnd)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (endFound : prepareInternalEnd? program state operation = some ending)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent bounded.footprint ending.footprint = true) :
    prepareInternalBoundedScope? program (ending.selection.apply state) contract = some bounded ∧
      prepareInternalEnd? program (bounded.selection.apply state) operation = some ending ∧
      ending.selection.apply (bounded.selection.apply state) =
        bounded.selection.apply (ending.selection.apply state) := by
  obtain ⟨_, selectedEnd, _, endInstance, _, _, _, _, _, live, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program state operation ending endFound
  obtain ⟨selected, instanceId, owner, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  dsimp only [makeInternalBoundedScopePreparation, makeInternalEndPreparation] at independent
  have different (place : ControlPlaceId) (member : place ∈ [selected.creation.input, selected.creation.entry]) :
      place ≠ selectedEnd.input := by
    have childWrite : .ordinary (.tokenOwners place) ∈
        (boundedScopeStateFootprint selected instanceId owner).writes := by
      apply (canonicalRegionalStateAtoms_mem _ _).mpr
      exact List.mem_append_left _ (List.mem_map.mpr
        ⟨_, scopeCreation_census_write selected.creation instanceId owner place member, rfl⟩)
    have conflict := regional_independent_read_write _ _ independent _ (.ordinary (.tokenOwners selectedEnd.input))
      childWrite (by simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem])
    intro same
    simp [regionalStateAtomsConflict, same] at conflict
  have input := different selected.creation.input (by simp)
  have entryPlace := different selected.creation.entry (by simp)
  refine ⟨prepareInternalBoundedScope_after_end program state contract _ selectedEnd found input entryPlace, ?_, ?_⟩
  · obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
    have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
    have liveAfter := selectInternalScopeCreation_preserves_live state contract.entryOperation entry
      selectedEnd.owner entryFound live
    apply prepareInternalEnd_read_frame program state _ operation _ endFound
    · simp [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
        makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child]
    · change exactLiveOccurrence (entry.apply state) selectedEnd.owner = exactLiveOccurrence state selectedEnd.owner
      exact liveAfter.trans live.symm
    · simp [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
        makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child]
    · exact scopeCreation_apply_token_filter state entry _
        (by simpa [makeInternalBoundedScopeSelection, makeInternalEndPreparation] using input)
        (by simpa [makeInternalBoundedScopeSelection, makeInternalEndPreparation] using entryPlace)
  · have equality := selectedEnd.scope_creation_commutes state selected.creation canonical entryPlace
    have tokens := congrArg RuntimeState.tokens equality
    cases kind : selected.creation.kind <;>
      simp only [makeInternalBoundedScopePreparation, makeInternalEndPreparation,
        InternalBoundedScopeSelection.apply, InternalScopeCreationSelection.apply,
        InternalEndSelection.apply, kind, setCallActivationCount] at tokens ⊢
    all_goals congr 1

end BpmnSemantics.SemanticProcess.InternalCommutation
