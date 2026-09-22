import BpmnSemantics.SemanticProcess.InternalBoundedScopeOrdinaryFrames
import BpmnSemantics.SemanticProcess.InternalBoundedScopeRuntimeValidity
import BpmnSemantics.SemanticProcess.InternalDataArmingCommutation

/-! Activity-data arming and bounded child entry preserve separate issuers, body claims, and
complete preparation under the [bounded outcome](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#bounded-sub-process-arming-outcome).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem boundedScope_data_separation (selected : InternalBoundedScopeSelection)
    (instanceId : SemanticId) (owner : RuntimeScopeOccurrence)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (independent : regionalStateFootprintsIndependent (boundedScopeStateFootprint selected instanceId owner)
      (liftRegionalStateFootprint patch.arm.owner (PreparedInternalArming.data contract patch).stateFootprint) = true) :
    selected.creation.input ≠ patch.arm.input ∧ selected.creation.entry ≠ patch.arm.input ∧
      selected.record.activityElementId.value ≠ patch.record.activityElementId.value ∧
      timerWaitOccurrence selected.timer ≠ patch.arm.write.occurrence := by
  have inputs := scopeArming_untouched_input selected.creation instanceId owner (.data contract patch)
    (boundedScope_child_independent selected instanceId owner patch.arm.owner _ independent)
  have separated := regional_independent_write_write _ _ independent
  have activity := separated (.ordinary (.activation .activity selected.record.activityElementId))
    (.ordinary (.activation .activity patch.record.activityElementId))
    (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
    (List.mem_map.mpr ⟨_, data_arming_writes_activity_counter contract patch, rfl⟩)
  have anchor := separated (.owned (.openWaitAnchor (timerWaitOccurrence selected.timer)) selected.creation.owner)
    (.owned (.openWaitAnchor patch.arm.write.occurrence) patch.arm.owner)
    (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
    (List.mem_map.mpr ⟨.openWaitAnchor patch.arm.write.occurrence, ordinary_writes_subset_data_writes contract patch
      (by simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]), rfl⟩)
  refine ⟨inputs.1, inputs.2, ?_, ?_⟩
  · intro same
    have keys : selected.record.activityElementId = patch.record.activityElementId := congrArg NodeId.mk same
    simp [regionalStateAtomsConflict, keys] at activity
  · intro same
    simp [regionalStateAtomsConflict, same] at anchor

theorem prepareInternalBoundedScope_after_data
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (dataContract : InternalDataArmingContract) (data : InternalDataArmingPatch)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (dataFound : prepareInternalDataArmingContract? program state dataContract = some data)
    (independent : regionalStateFootprintsIndependent bounded.footprint
      (liftRegionalStateFootprint data.arm.owner (PreparedInternalArming.data dataContract data).stateFootprint) = true) :
    prepareInternalBoundedScope? program (applyInternalDataArmingPatch state data) contract = some bounded := by
  obtain ⟨dataOwner, dataOrigin, source, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state dataContract data dataFound
  let data := makeInternalDataArmingPatch program state dataContract dataOwner dataOrigin source
  obtain ⟨selected, instanceId, owner, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨inputs, entries, activities, anchors⟩ :=
    boundedScope_data_separation selected instanceId owner dataContract data independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  let after := applyInternalDataArmingPatch state data
  have projections := scopeArming_scope_read_projections state (.data dataContract data)
  dsimp only [PreparedInternalArming.apply, PreparedInternalArming.scopeFramePatch] at projections
  have ownerFrame := armingOwnerRead_frame state data.arm contract.input
    (by simpa only [makeInternalBoundedScopeSelection, fields.1] using inputs.symm)
  have entryFrame : selectInternalScopeCreation? after contract.entryOperation =
      selectInternalScopeCreation? state contract.entryOperation := by
    simp only [selectInternalScopeCreation?, InternalBoundedScopeContract.entryOperation,
      after, projections.1, projections.2.2.1, scopeActivationCount, projections.2.2.2.2.1]
    have owners : onlyTokenOwner? after contract.input = onlyTokenOwner? state contract.input := ownerFrame
    rw [owners]
  have activityKeys : (⟨contract.origin.elementId.value⟩ : TaskDefinitionId) ≠ dataContract.taskId := by
    intro same
    exact activities (congrArg TaskDefinitionId.value same)
  have activityFrame := activityActivationCount_set_other state dataContract.taskId
    ⟨contract.origin.elementId.value⟩ (activityActivationCount state dataContract.taskId + 1) activityKeys
  have selectedAfter := selectInternalBoundedScope_read_frame state after contract _ selection entryFrame rfl rfl
    (by simpa only [after, applyInternalDataArmingPatch, data, makeInternalDataArmingPatch,
      dataInputOutputActivityRecord, applyInternalArmingPatch, activityActivationCount] using activityFrame)
  have bucket (place : ControlPlaceId) (owner : ScopeOccurrenceId) (different : place ≠ data.arm.input) :
      after.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) =
        state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) :=
    filter_removeToken_of_rejected state.tokens data.arm.input data.arm.owner _ (by simp [Ne.symm different])
  apply prepareInternalBoundedScope_read_frame program state after contract _ found selectedAfter
    rfl rfl rfl (bucket _ _ inputs) (bucket _ _ entries)
  · exact scopeCreation_counter_read_frame state after _ (by intro _; rfl) (by intro _ _; rfl)
  · have anchorFrame : openWaitAnchorAbsent after (timerWaitOccurrence
        (makeInternalBoundedScopeSelection state contract entry).timer) =
        openWaitAnchorAbsent state (timerWaitOccurrence
          (makeInternalBoundedScopeSelection state contract entry).timer) :=
      armingOpenAnchorRead_frame state data.arm _ anchors.symm
    have recordsApart : regionalActivityAssociationsConflict data.record
        (makeInternalBoundedScopeSelection state contract entry).record = false := by
      have different : dataContract.taskId.value ≠ contract.origin.elementId.value := activities.symm
      simp [data, makeInternalDataArmingPatch, dataInputOutputActivityRecord, makeInternalBoundedScopeSelection,
        regionalActivityAssociationsConflict, regionalActivityBodyTasks, sameActivityOccurrence,
        beq_iff_eq, different]
    have recordFrame : after.activityOccurrences.any (regionalActivityAssociationsConflict ·
        (makeInternalBoundedScopeSelection state contract entry).record) =
        state.activityOccurrences.any (regionalActivityAssociationsConflict ·
          (makeInternalBoundedScopeSelection state contract entry).record) := by
      change (insertActivityOccurrence data.record state.activityOccurrences).any _ = _
      simp only [insertActivityOccurrence_eq_canonicalInsertBy, List.any_eq_not_all_not, all_canonicalInsertBy,
        recordsApart, Bool.not_false, Bool.true_and]
    simp only [makeInternalBoundedScopePreparation, boundedScopeJointResourcesAvailable, anchorFrame, recordFrame]

theorem prepareInternalDataArmingContract_after_bounded_scope
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (dataContract : InternalDataArmingContract) (data : InternalDataArmingPatch)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (dataFound : prepareInternalDataArmingContract? program state dataContract = some data)
    (independent : regionalStateFootprintsIndependent bounded.footprint
      (liftRegionalStateFootprint data.arm.owner (PreparedInternalArming.data dataContract data).stateFootprint) = true) :
    prepareInternalDataArmingContract? program (bounded.selection.apply state) dataContract = some data := by
  obtain ⟨selected, instanceId, owner, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨dataOwner, dataOrigin, source, owned, running, declared, live, originFound,
    sourceFound, unique, anchorAbsent, scopeAbsent, recordAbsent, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state dataContract data dataFound
  let data := makeInternalDataArmingPatch program state dataContract dataOwner dataOrigin source
  obtain ⟨inputs, entries, activities, anchors⟩ :=
    boundedScope_data_separation selected instanceId owner dataContract data independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  let bounded := makeInternalBoundedScopeSelection state contract entry
  let after := bounded.apply state
  have ownerFrame : onlyTokenOwner? after dataContract.input = some dataOwner := by
    change onlyTokenOwner? (entry.apply state) dataContract.input = _
    simpa only [onlyTokenOwner?, scopeCreation_apply_census state entry dataContract.input inputs entries]
      using owned
  have liveFrame : exactLiveOccurrence after dataOwner = true := by
    change exactLiveOccurrence (entry.apply state) dataOwner = true
    exact selectInternalScopeCreation_preserves_live state contract.entryOperation entry dataOwner entryFound live
  have keys : dataContract.taskId ≠ (⟨contract.origin.elementId.value⟩ : TaskDefinitionId) := by
    intro same
    exact activities (congrArg TaskDefinitionId.value same).symm
  have counter := activityActivationCount_set_other state ⟨contract.origin.elementId.value⟩
    dataContract.taskId (activityActivationCount state ⟨contract.origin.elementId.value⟩ + 1) keys
  have patchFrame : makeInternalDataArmingPatch program after dataContract dataOwner dataOrigin source = data := by
    simp only [activityActivationCount] at counter
    simp only [makeInternalDataArmingPatch, after, bounded, InternalBoundedScopeSelection.apply,
      makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, fields.2.2,
      dataInputOutputActivityRecord, activationCount, activityActivationCount, counter, data]
  have anchorFrame : openWaitAnchorAbsent after data.arm.write.occurrence = true := by
    have frame := armingOpenAnchorRead_frame state
      { data.arm with write := .timer bounded.timer } data.arm.write.occurrence anchors
    have same : openWaitAnchorAbsent after data.arm.write.occurrence =
        openWaitAnchorAbsent state data.arm.write.occurrence := by
      simpa only [after, bounded, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
        InternalScopeCreationSelection.apply, fields.2.2, applyInternalArmingPatch,
        openWaitAnchorAbsent, openWaitAnchors] using frame
    exact same.trans anchorAbsent
  have bodies : activityBodyClaimsDisjoint bounded.record data.record = true := by
    rw [activityBodyClaimsDisjoint_comm]
    apply activityBodyClaimsDisjoint_userTask_of_not_mem data.record bounded.record _
    simp [bounded, makeInternalBoundedScopeSelection, activityBodyTaskClaims]
  have identities : sameActivityOccurrence bounded.record data.record = false := by
    have different : contract.origin.elementId.value ≠ dataContract.taskId.value := activities
    simp [bounded, data, makeInternalBoundedScopeSelection, makeInternalDataArmingPatch,
      dataInputOutputActivityRecord, sameActivityOccurrence, beq_iff_eq, different]
  have recordFrame : after.activityOccurrences.any (fun record =>
      sameActivityOccurrence record data.record || !activityBodyClaimsDisjoint record data.record) = false := by
    apply List.any_eq_false.mpr
    intro record member
    change record ∈ insertActivityOccurrence bounded.record state.activityOccurrences at member
    rw [insertActivityOccurrence_eq_canonicalInsertBy, mem_canonicalInsertBy] at member
    rcases member with rfl | member
    · simp [identities, bodies]
    · exact List.any_eq_false.mp recordAbsent record member
  have runningFrame : after.control = .running dataOwner.processInstanceId := by
    simpa only [after, bounded, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2] using running
  have sourceFrame : dataArmingBindings? after dataContract.data = some source := by
    simpa only [after, bounded, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2, dataArmingBindings?, dataInputOutputSourceBinding?,
      dataInputSourceBinding?] using sourceFound
  have scopeFrame : after.variables.activities.any
      (activityOccurrenceScopeMatches (activityOwnerForRecord data.record)) = false := by
    simpa only [after, bounded, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2] using scopeAbsent
  change prepareInternalDataArmingContract? program after dataContract = some data
  simp [prepareInternalDataArmingContract?, ownerFrame, runningFrame, declared, liveFrame,
    originFound, sourceFrame, patchFrame, unique, anchorFrame]
  simpa using And.intro scopeFrame recordFrame

theorem prepared_bounded_scope_data_pair
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (dataContract : InternalDataArmingContract) (data : InternalDataArmingPatch)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (dataFound : prepareInternalDataArmingContract? program state dataContract = some data)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent bounded.footprint
      (liftRegionalStateFootprint data.arm.owner (PreparedInternalArming.data dataContract data).stateFootprint) = true) :
    prepareInternalBoundedScope? program (applyInternalDataArmingPatch state data) contract = some bounded ∧
      prepareInternalDataArmingContract? program (bounded.selection.apply state) dataContract = some data ∧
      applyInternalDataArmingPatch (bounded.selection.apply state) data =
        bounded.selection.apply (applyInternalDataArmingPatch state data) := by
  refine ⟨prepareInternalBoundedScope_after_data program state contract bounded dataContract data found dataFound independent,
    prepareInternalDataArmingContract_after_bounded_scope program state contract bounded dataContract data found dataFound independent, ?_⟩
  obtain ⟨selected, instanceId, owner, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨dataOwner, dataOrigin, source, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state dataContract data dataFound
  obtain ⟨_, entries, activities, _⟩ := boundedScope_data_separation selected instanceId owner dataContract _ independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  have tokens := congrArg RuntimeState.tokens (scope_creation_data_arm_patches_commute state entry
    (makeInternalDataArmingPatch program state dataContract dataOwner dataOrigin source) canonical entries)
  have activityOrder : orderedBy activationBefore state.activityActivations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have different : (⟨contract.origin.elementId.value⟩ : TaskDefinitionId) ≠ dataContract.taskId :=
    fun same => activities (congrArg TaskDefinitionId.value same)
  simp only [InternalScopeCreationSelection.apply, fields.2.2,
    applyInternalDataArmingPatch, makeInternalDataArmingPatch, applyInternalArmingPatch] at tokens
  simp only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
    makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, fields.2.2,
    applyInternalDataArmingPatch, makeInternalDataArmingPatch, applyInternalArmingPatch]
  congr 1
  · exact insertActivityOccurrence_commutes_of_distinct_element _ _ activities.symm state.activityOccurrences
  · exact setActivationCount_commutes_of_ordered _ _ _ _ different _ activityOrder

end BpmnSemantics.SemanticProcess.InternalCommutation
