import BpmnSemantics.SemanticProcess.InternalBoundedScopePreparationFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationLocalControlCommutation

/-! Bounded entry reuses child/local-control separation. Its joined deadline and Activity touch
no additional local-control reads, including the nonchosen selected-join populations.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalBoundedScope_after_local_control
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (localSelection : InternalLocalControlSelection)
    (localInstance : SemanticId)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (independent : regionalStateFootprintsIndependent prepared.footprint
      (liftRegionalStateFootprint localSelection.owner
        (internalLocalControlStateFootprint state localSelection localInstance)) = true) :
    prepareInternalBoundedScope? program (localSelection.apply state) contract = some prepared := by
  obtain ⟨selected, instanceId, owner, definition, start, delta,
    selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have separated := boundedScope_child_independent selected instanceId owner localSelection.owner _ independent
  have untouched := local_scope_input_untouched state selected.creation localSelection
    instanceId localInstance owner separated
  have bucket (scopeOwner : ScopeOccurrenceId) (place : ControlPlaceId)
      (read : .controlToken scopeOwner place ∈
        (internalScopeCreationStateFootprint selected.creation instanceId owner).reads) :=
    local_scope_bucket_frame state selected.creation localSelection instanceId localInstance owner
      separated scopeOwner place read
  have inputFrame := bucket selected.creation.owner selected.creation.input
    (scopeCreation_token_read selected.creation instanceId owner
      { placeId := selected.creation.input, owner := selected.creation.owner } (by simp))
  have entryFrame := bucket selected.creation.created.id selected.creation.entry
    (scopeCreation_token_read selected.creation instanceId owner
      { placeId := selected.creation.entry, owner := selected.creation.created.id } (by simp))
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have selectedAfter : selectInternalScopeCreation? (localSelection.apply state)
      contract.entryOperation = some entry := by
    apply selectInternalScopeCreation_read_frame state (localSelection.apply state)
      contract.entryOperation entry entryFound rfl
      (localSelection.tokens.owner_census_frame state entry.input
        (fun member => untouched (List.mem_append_left _ member))
        (fun member => untouched (List.mem_append_right _ member))) inputFrame rfl
    · intro child
      exact ⟨rfl, rfl⟩
    · intro record called
      simp [child] at called
  have boundedAfter := selectInternalBoundedScope_read_frame state (localSelection.apply state)
    contract _ selection (selectedAfter.trans entryFound.symm) rfl rfl rfl
  apply prepareInternalBoundedScope_read_frame program state (localSelection.apply state)
    contract _ found boundedAfter rfl rfl rfl inputFrame entryFrame
  · exact scopeCreation_counter_read_frame state (localSelection.apply state) _
      (by intro _; rfl) (by intro _ _; rfl)
  · rfl

theorem prepareInternalLocalControl_after_bounded_scope
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (operation : SemanticOperation)
    (localPrepared : PreparedInternalLocalControl)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (localFound : prepareInternalLocalControl? program state operation = some localPrepared)
    (independent : regionalStateFootprintsIndependent prepared.footprint
      (liftRegionalStateFootprint localPrepared.selection.owner localPrepared.footprint) = true) :
    prepareInternalLocalControl? program (prepared.selection.apply state) operation = some localPrepared := by
  obtain ⟨selected, instanceId, owner, definition, start, delta,
    _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have separated := boundedScope_child_independent selected instanceId owner
    localPrepared.selection.owner _ independent
  have childPrepared := prepareInternalLocalControl_after_scope_patch program state selected.creation
    instanceId owner operation localPrepared localFound separated
  apply prepareInternalLocalControl_read_frame program (selected.creation.apply state)
    (selected.apply state) operation _ childPrepared
  all_goals first
    | rfl
    | intro _ _; rfl
    | intro _ _ _ _ _ _ _; rfl

theorem prepared_bounded_scope_local_control_pair
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (operation : SemanticOperation)
    (localPrepared : PreparedInternalLocalControl)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (localFound : prepareInternalLocalControl? program state operation = some localPrepared)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent prepared.footprint
      (liftRegionalStateFootprint localPrepared.selection.owner localPrepared.footprint) = true) :
    prepareInternalBoundedScope? program (localPrepared.selection.apply state) contract = some prepared ∧
      prepareInternalLocalControl? program (prepared.selection.apply state) operation = some localPrepared ∧
      localPrepared.selection.apply (prepared.selection.apply state) =
        prepared.selection.apply (localPrepared.selection.apply state) := by
  have reverse := prepareInternalLocalControl_after_bounded_scope program state contract prepared
    operation localPrepared found localFound independent
  obtain ⟨localSelection, origin, localInstance, identity, delta,
    _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state operation localPrepared localFound
  refine ⟨prepareInternalBoundedScope_after_local_control program state contract prepared
    localSelection localInstance found independent, reverse, ?_⟩
  obtain ⟨selected, instanceId, owner, definition, start, scopeDelta,
    _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have separated := boundedScope_child_independent selected instanceId owner localSelection.owner _ independent
  have equality := scope_creation_local_control_patches_commute state selected.creation localSelection
    instanceId localInstance owner canonical separated
  have tokens := congrArg RuntimeState.tokens equality
  cases kind : selected.creation.kind <;>
    simp only [makeInternalBoundedScopePreparation, makeInternalLocalControlPreparation,
      InternalBoundedScopeSelection.apply, InternalScopeCreationSelection.apply,
      InternalLocalControlSelection.apply, kind, setCallActivationCount] at tokens ⊢
  all_goals congr 1

end BpmnSemantics.SemanticProcess.InternalCommutation
