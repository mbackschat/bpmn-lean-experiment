import BpmnSemantics.SemanticProcess.InternalTimerTaskPreparationFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingCommutation

/-! Scope creation frames use complete input-place censuses, including the newly produced token.
An already-live Timer-task owner remains live after the fresh scope insertion.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem timerTask_scope_inputs_untouched (timer : InternalTimerTaskPatch)
    (selected : InternalScopeCreationSelection) (instanceId : SemanticId)
    (owner : RuntimeScopeOccurrence)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint selected.owner
        (internalScopeCreationStateFootprint selected instanceId owner)) = true) :
    selected.input ≠ timer.arm.input ∧ selected.entry ≠ timer.arm.input := by
  have separated := regional_independent_write_write _ _ independent
  have different (place : ControlPlaceId) (member : place ∈ [selected.input, selected.entry]) :
      place ≠ timer.arm.input := by
    have conflict := separated (.ordinary (.tokenOwners timer.arm.input))
      (.ordinary (.tokenOwners place))
      (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (List.mem_map.mpr ⟨.tokenOwners place,
        scopeCreation_census_write selected instanceId owner place member, rfl⟩)
    intro same
    simp [regionalStateAtomsConflict, same] at conflict
  exact ⟨different _ (by simp), different _ (by simp)⟩

theorem prepareInternalTimerTaskContract_after_scope_creation
    (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (timer : InternalTimerTaskPatch)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (prepared : prepareInternalTimerTaskContract? program state contract = some timer)
    (scopeFound : selectInternalScopeCreation? state operation = some selected)
    (input : selected.input ≠ contract.input) (entry : selected.entry ≠ contract.input) :
    prepareInternalTimerTaskContract? program (selected.apply state) contract = some timer := by
  obtain ⟨_, owner, instanceId, origin, processId, owned, _, _, live, _⟩ :=
    prepareInternalTimerTaskContract_facts program state contract timer prepared
  have liveAfter := selectInternalScopeCreation_preserves_live state operation selected owner scopeFound live
  have ownerAfter : onlyTokenOwner? (selected.apply state) contract.input = some owner := by
    simpa only [onlyTokenOwner?, scopeCreation_apply_census state selected contract.input input entry]
      using owned
  simp only [prepareInternalTimerTaskContract?, owned, ownerAfter, bind, Option.bind,
    live, liveAfter] at prepared ⊢
  cases kind : selected.kind <;>
    simpa only [InternalScopeCreationSelection.apply, kind, runningInstance?,
      makeInternalTimerTaskPatch, activationCount, activityActivationCount, timerActivationCount,
      openWaitAnchorAbsent, openWaitAnchors] using prepared

theorem prepareInternalScopeCreation_after_timer_task
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (scope : PreparedInternalScopeCreation) (timer : InternalTimerTaskPatch)
    (found : prepareInternalScopeCreation? program state operation = some scope)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint scope.selection.owner scope.footprint) = true) :
    prepareInternalScopeCreation? program (applyInternalTimerTaskPatch state timer)
      operation = some scope := by
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    selection, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation scope found
  have untouched := timerTask_scope_inputs_untouched timer selected instanceId ownerRecord independent
  let after := applyInternalTimerTaskPatch state timer
  have projections := scopeArming_scope_read_projections state
    (.ordinary timer.arm.operation timer.arm)
  have controlFrame : after.control = state.control := projections.1
  have timeFrame : after.logicalTimeMs = state.logicalTimeMs := projections.2.1
  have scopesFrame : after.scopeOccurrences = state.scopeOccurrences := projections.2.2.1
  have callsFrame : after.calledProcessOccurrences = state.calledProcessOccurrences := projections.2.2.2.1
  have scopeCountsFrame : after.scopeActivations = state.scopeActivations := projections.2.2.2.2.1
  have callCountsFrame : after.callActivations = state.callActivations := projections.2.2.2.2.2.1
  have tokensFrame : after.tokens = removeToken state.tokens timer.arm.input timer.arm.owner :=
    projections.2.2.2.2.2.2
  have census : tokenOwners after selected.input = tokenOwners state selected.input := by
    unfold tokenOwners
    rw [tokensFrame, filterTokens_removeToken_other _ _ _ _ untouched.1.symm]
  have bucket (place : ControlPlaceId) (owner : ScopeOccurrenceId) (different : place ≠ timer.arm.input) :
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

theorem scope_creation_timer_task_patches_commute (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (timer : InternalTimerTaskPatch)
    (canonical : canonicalCollectionOrder state = true)
    (untouched : selected.entry ≠ timer.arm.input) :
    applyInternalTimerTaskPatch (selected.apply state) timer =
      selected.apply (applyInternalTimerTaskPatch state timer) := by
  have arm := scope_creation_arm_patches_commute state selected timer.arm canonical untouched
  unfold applyInternalTimerTaskPatch
  rw [arm]
  cases kind : selected.kind <;> cases write : timer.arm.write <;>
    simp only [InternalScopeCreationSelection.apply, kind, applyInternalArmingPatch, write,
      setCallActivationCount]

theorem prepared_timer_task_scope_creation_pair
    (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (timer : InternalTimerTaskPatch)
    (operation : SemanticOperation) (scope : PreparedInternalScopeCreation)
    (timerPrepared : prepareInternalTimerTaskContract? program state contract = some timer)
    (scopePrepared : prepareInternalScopeCreation? program state operation = some scope)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint scope.selection.owner scope.footprint) = true) :
    prepareInternalTimerTaskContract? program (scope.selection.apply state) contract = some timer ∧
      prepareInternalScopeCreation? program (applyInternalTimerTaskPatch state timer) operation = some scope ∧
      applyInternalTimerTaskPatch (scope.selection.apply state) timer =
        scope.selection.apply (applyInternalTimerTaskPatch state timer) := by
  have reverse := prepareInternalScopeCreation_after_timer_task program state operation scope timer
    scopePrepared independent
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation scope scopePrepared
  have untouched := timerTask_scope_inputs_untouched timer selected instanceId ownerRecord independent
  have input : contract.input = timer.arm.input := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalTimerTaskContract_facts program state contract timer timerPrepared
    rfl
  exact ⟨prepareInternalTimerTaskContract_after_scope_creation program state contract timer operation
    selected timerPrepared selection (input ▸ untouched.1) (input ▸ untouched.2), reverse,
    scope_creation_timer_task_patches_commute state selected timer canonical untouched.2⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
