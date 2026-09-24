import BpmnSemantics.SemanticProcess.InternalMessageTaskOrdinaryFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingCommutation

/-! Scope creation frames use complete input-place censuses, including the newly produced token.
An already-live Message-task owner remains live after the fresh scope insertion.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem messageTask_scope_inputs_untouched (message : InternalMessageTaskPatch)
    (selected : InternalScopeCreationSelection) (instanceId : SemanticId)
    (owner : RuntimeScopeOccurrence)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint selected.owner
        (internalScopeCreationStateFootprint selected instanceId owner)) = true) :
    selected.input ≠ message.arm.input ∧ selected.entry ≠ message.arm.input := by
  have separated := regional_independent_write_write _ _ independent
  have different (place : ControlPlaceId) (member : place ∈ [selected.input, selected.entry]) :
      place ≠ message.arm.input := by
    have conflict := separated (.ordinary (.tokenOwners message.arm.input))
      (.ordinary (.tokenOwners place))
      (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (List.mem_map.mpr ⟨.tokenOwners place,
        scopeCreation_census_write selected instanceId owner place member, rfl⟩)
    intro same
    simp [regionalStateAtomsConflict, same] at conflict
  exact ⟨different _ (by simp), different _ (by simp)⟩

theorem prepareInternalMessageTaskContract_after_scope_creation
    (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (message : InternalMessageTaskPatch)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (prepared : prepareInternalMessageTaskContract? program state contract = some message)
    (scopeFound : selectInternalScopeCreation? state operation = some selected)
    (input : selected.input ≠ contract.input) (entry : selected.entry ≠ contract.input) :
    prepareInternalMessageTaskContract? program (selected.apply state) contract = some message := by
  obtain ⟨_, owner, instanceId, origin, processId, owned, _, _, live, _⟩ :=
    prepareInternalMessageTaskContract_facts program state contract message prepared
  have liveAfter := selectInternalScopeCreation_preserves_live state operation selected owner scopeFound live
  have ownerAfter : onlyTokenOwner? (selected.apply state) contract.input = some owner := by
    simpa only [onlyTokenOwner?, scopeCreation_apply_census state selected contract.input input entry]
      using owned
  simp only [prepareInternalMessageTaskContract?, owned, ownerAfter, bind, Option.bind,
    live, liveAfter] at prepared ⊢
  cases kind : selected.kind <;>
    simpa only [InternalScopeCreationSelection.apply, kind, runningInstance?,
      makeInternalMessageTaskPatch, activationCount, activityActivationCount, messageActivationCount,
      openWaitAnchorAbsent, openWaitAnchors] using prepared

theorem prepareInternalScopeCreation_after_message_task
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (scope : PreparedInternalScopeCreation) (message : InternalMessageTaskPatch)
    (found : prepareInternalScopeCreation? program state operation = some scope)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint scope.selection.owner scope.footprint) = true) :
    prepareInternalScopeCreation? program (applyInternalMessageTaskPatch state message)
      operation = some scope := by
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    selection, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation scope found
  have untouched := messageTask_scope_inputs_untouched message selected instanceId ownerRecord independent
  let after := applyInternalMessageTaskPatch state message
  have projections := scopeArming_scope_read_projections state
    (.ordinary message.arm.operation message.arm)
  have controlFrame : after.control = state.control := projections.1
  have timeFrame : after.logicalTimeMs = state.logicalTimeMs := projections.2.1
  have scopesFrame : after.scopeOccurrences = state.scopeOccurrences := projections.2.2.1
  have callsFrame : after.calledProcessOccurrences = state.calledProcessOccurrences := projections.2.2.2.1
  have scopeCountsFrame : after.scopeActivations = state.scopeActivations := projections.2.2.2.2.1
  have callCountsFrame : after.callActivations = state.callActivations := projections.2.2.2.2.2.1
  have tokensFrame : after.tokens = removeToken state.tokens message.arm.input message.arm.owner :=
    projections.2.2.2.2.2.2
  have census : tokenOwners after selected.input = tokenOwners state selected.input := by
    unfold tokenOwners
    rw [tokensFrame, filterTokens_removeToken_other _ _ _ _ untouched.1.symm]
  have bucket (place : ControlPlaceId) (owner : ScopeOccurrenceId) (different : place ≠ message.arm.input) :
      after.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) =
        state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) := by
    rw [tokensFrame]
    apply filter_removeToken_of_rejected
    simp [Ne.symm different]
  have inputFrame := bucket selected.input selected.owner untouched.1
  have entryFrame := bucket selected.entry selected.created.id untouched.2
  have ownerFrame : after.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = selected.owner)) =
      state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = selected.owner)) := by
    rw [scopesFrame]
  have selectedAfter : selectInternalScopeCreation? after operation = some selected := by
    apply selectInternalScopeCreation_read_frame state after operation selected selection
      controlFrame census inputFrame ownerFrame
    · intro child
      simp only [scopesFrame, scopeActivationCount, scopeCountsFrame, and_self]
    · intro record called
      have facts := scopeCreation_selection_call_facts state operation selected record instanceId
        running selection called
      refine ⟨?_, ?_, ?_, ?_, ?_⟩
      · rw [calledProcessAssociationsValid_frame state after controlFrame scopesFrame callsFrame]
        exact scopeCreation_selection_call_associations state operation selected record selection called
      · simp only [callActivationCount, callCountsFrame]
      · simpa only [callsFrame] using facts.2.2.2.2.2.1
      · simpa only [scopesFrame] using facts.2.2.2.2.2.2.1
      · simpa only [callsFrame] using facts.2.2.2.2.2.2.2
  apply prepareInternalScopeCreation_read_frame program state after operation _ found selectedAfter
    controlFrame timeFrame ownerFrame inputFrame entryFrame
  apply scopeCreation_counter_read_frame
  · intro child
    rw [scopeCountsFrame]
  · intro record called
    rw [callCountsFrame]

theorem scope_creation_message_task_patches_commute (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (message : InternalMessageTaskPatch)
    (canonical : canonicalCollectionOrder state = true)
    (untouched : selected.entry ≠ message.arm.input) :
    applyInternalMessageTaskPatch (selected.apply state) message =
      selected.apply (applyInternalMessageTaskPatch state message) := by
  have arm := scope_creation_arm_patches_commute state selected message.arm canonical untouched
  unfold applyInternalMessageTaskPatch
  rw [arm]
  cases kind : selected.kind <;> cases write : message.arm.write <;>
    simp only [InternalScopeCreationSelection.apply, kind, applyInternalArmingPatch, write,
      setCallActivationCount]

theorem prepared_message_task_scope_creation_pair
    (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (message : InternalMessageTaskPatch)
    (operation : SemanticOperation) (scope : PreparedInternalScopeCreation)
    (messagePrepared : prepareInternalMessageTaskContract? program state contract = some message)
    (scopePrepared : prepareInternalScopeCreation? program state operation = some scope)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint scope.selection.owner scope.footprint) = true) :
    prepareInternalMessageTaskContract? program (scope.selection.apply state) contract = some message ∧
      prepareInternalScopeCreation? program (applyInternalMessageTaskPatch state message) operation = some scope ∧
      applyInternalMessageTaskPatch (scope.selection.apply state) message =
        scope.selection.apply (applyInternalMessageTaskPatch state message) := by
  have reverse := prepareInternalScopeCreation_after_message_task program state operation scope message
    scopePrepared independent
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation scope scopePrepared
  have untouched := messageTask_scope_inputs_untouched message selected instanceId ownerRecord independent
  have input : contract.input = message.arm.input := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalMessageTaskContract_facts program state contract message messagePrepared
    rfl
  exact ⟨prepareInternalMessageTaskContract_after_scope_creation program state contract message operation
    selected messagePrepared selection (input ▸ untouched.1) (input ▸ untouched.2), reverse,
    scope_creation_message_task_patches_commute state selected message canonical untouched.2⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
