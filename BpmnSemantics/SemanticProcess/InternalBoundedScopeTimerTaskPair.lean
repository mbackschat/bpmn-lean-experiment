import BpmnSemantics.SemanticProcess.InternalBoundedScopeDataPair
import BpmnSemantics.SemanticProcess.InternalTimerTaskScopeFrames

/-! Joint Timer and Activity reads are separated before either operation executes, as required by
the [bounded outcome](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#bounded-sub-process-arming-outcome).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem boundedScope_timerTask_separation (selected : InternalBoundedScopeSelection)
    (instanceId : SemanticId) (owner : RuntimeScopeOccurrence) (task : InternalTimerTaskPatch)
    (independent : regionalStateFootprintsIndependent (boundedScopeStateFootprint selected instanceId owner)
      (timerTaskStateFootprint task) = true) :
    selected.creation.input ≠ task.arm.input ∧ selected.creation.entry ≠ task.arm.input ∧
      selected.timer.elementId ≠ task.timer.elementId ∧
      selected.record.activityElementId.value ≠ task.record.activityElementId.value ∧
      (∀ anchor ∈ [task.arm.write.occurrence, timerWaitOccurrence task.timer],
        timerWaitOccurrence selected.timer ≠ anchor) ∧
      regionalActivityAssociationsConflict selected.record task.record = false ∧
      regionalActivityAssociationsConflict task.record selected.record = false := by
  have inputs := timerTask_scope_inputs_untouched task selected.creation instanceId owner
    (boundedScope_other_child_independent _ selected instanceId owner
      (regionalStateFootprintsIndependent_symmetric _ _ independent))
  have separated := regional_independent_write_write _ _ independent
  have timer := separated (.ordinary (.activation .timer selected.timer.elementId))
    (.ordinary (.activation .timer task.timer.elementId))
    (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
  have activity := separated (.ordinary (.activation .activity selected.record.activityElementId))
    (.ordinary (.activation .activity task.record.activityElementId))
    (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
  refine ⟨inputs.1, inputs.2, ?_, ?_, ?_, ?_, ?_⟩
  · intro same; simp [regionalStateAtomsConflict, same] at timer
  · intro same
    have keys : selected.record.activityElementId = task.record.activityElementId := congrArg NodeId.mk same
    simp [regionalStateAtomsConflict, keys] at activity
  · intro anchor member same
    have conflict := separated (.owned (.openWaitAnchor (timerWaitOccurrence selected.timer)) selected.creation.owner)
      (.owned (.openWaitAnchor anchor) task.arm.owner)
      (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
      (by simp only [List.mem_cons, List.not_mem_nil, or_false] at member
          rcases member with rfl | rfl <;> simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    simp [regionalStateAtomsConflict, same] at conflict
  · exact separated (.activityAssociation selected.record) (.activityAssociation task.record)
      (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
      (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
  · exact regional_independent_write_write _ _ (regionalStateFootprintsIndependent_symmetric _ _ independent)
      (.activityAssociation task.record) (.activityAssociation selected.record)
      (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])

theorem prepareInternalBoundedScope_after_timer_task
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (taskContract : InternalTimerTaskContract) (task : InternalTimerTaskPatch)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (taskFound : prepareInternalTimerTaskContract? program state taskContract = some task)
    (independent : regionalStateFootprintsIndependent bounded.footprint (timerTaskStateFootprint task) = true) :
    prepareInternalBoundedScope? program (applyInternalTimerTaskPatch state task) contract = some bounded := by
  obtain ⟨_, taskOwner, taskInstance, taskOrigin, taskProcess, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state taskContract task taskFound
  let task := makeInternalTimerTaskPatch program state taskContract taskOwner taskInstance taskProcess taskOrigin
  obtain ⟨selected, instanceId, owner, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨inputs, entries, timers, activities, anchors, _, associations⟩ :=
    boundedScope_timerTask_separation selected instanceId owner task independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  let after := applyInternalTimerTaskPatch state task
  have ownerFrame : onlyTokenOwner? after contract.input = onlyTokenOwner? state contract.input :=
    armingOwnerRead_frame state task.arm contract.input (by simpa only [makeInternalBoundedScopeSelection, fields.1] using inputs.symm)
  have entryFrame : selectInternalScopeCreation? after contract.entryOperation =
      selectInternalScopeCreation? state contract.entryOperation := by
    have controlFrame : after.control = state.control := rfl
    have scopesFrame : after.scopeOccurrences = state.scopeOccurrences := rfl
    have countsFrame : after.scopeActivations = state.scopeActivations := rfl
    simp only [selectInternalScopeCreation?, InternalBoundedScopeContract.entryOperation, controlFrame,
      ownerFrame, scopesFrame, scopeActivationCount, countsFrame]
  have activityKeys : (⟨contract.origin.elementId.value⟩ : TaskDefinitionId) ≠ taskContract.task.id :=
    fun same => activities (congrArg TaskDefinitionId.value same)
  have timerFrame := timerActivationCount_set_other state taskContract.timer.elementId contract.timer.elementId
    (timerActivationCount state taskContract.timer.elementId + 1) timers
  have activityFrame := activityActivationCount_set_other state taskContract.task.id
    ⟨contract.origin.elementId.value⟩ (activityActivationCount state taskContract.task.id + 1) activityKeys
  have selectedAfter := selectInternalBoundedScope_read_frame state after contract _ selection entryFrame rfl
    (by simpa only [after, task, applyInternalTimerTaskPatch, makeInternalTimerTaskPatch,
      applyInternalArmingPatch, timerActivationCount] using timerFrame)
    (by simpa only [after, task, applyInternalTimerTaskPatch, makeInternalTimerTaskPatch,
      applyInternalArmingPatch, activityActivationCount] using activityFrame)
  have bucket (place : ControlPlaceId) (owner : ScopeOccurrenceId) (different : place ≠ task.arm.input) :
      after.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) =
        state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) :=
    filter_removeToken_of_rejected state.tokens task.arm.input task.arm.owner _ (by simp [Ne.symm different])
  apply prepareInternalBoundedScope_read_frame program state after contract _ found selectedAfter
    rfl rfl rfl (bucket _ _ inputs) (bucket _ _ entries)
  · exact scopeCreation_counter_read_frame state after _ (by intro _; rfl) (by intro _ _; rfl)
  · have anchorFrame : openWaitAnchorAbsent after
        (timerWaitOccurrence (makeInternalBoundedScopeSelection state contract entry).timer) =
        openWaitAnchorAbsent state (timerWaitOccurrence (makeInternalBoundedScopeSelection state contract entry).timer) :=
      timerTaskOpenAnchorRead_frame state task _ rfl _
        (anchors _ (by simp)).symm (anchors _ (by simp)).symm
    have recordFrame : after.activityOccurrences.any (regionalActivityAssociationsConflict ·
        (makeInternalBoundedScopeSelection state contract entry).record) =
        state.activityOccurrences.any (regionalActivityAssociationsConflict ·
          (makeInternalBoundedScopeSelection state contract entry).record) := by
      change (insertActivityOccurrence task.record state.activityOccurrences).any _ = _
      simp only [insertActivityOccurrence_eq_canonicalInsertBy, List.any_eq_not_all_not, all_canonicalInsertBy,
        associations, Bool.not_false, Bool.true_and]
    simp only [makeInternalBoundedScopePreparation, boundedScopeJointResourcesAvailable, anchorFrame, recordFrame]

theorem prepareInternalTimerTaskContract_after_bounded_scope
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (taskContract : InternalTimerTaskContract) (task : InternalTimerTaskPatch)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (taskFound : prepareInternalTimerTaskContract? program state taskContract = some task)
    (independent : regionalStateFootprintsIndependent bounded.footprint (timerTaskStateFootprint task) = true) :
    prepareInternalTimerTaskContract? program (bounded.selection.apply state) taskContract = some task := by
  obtain ⟨selected, instanceId, owner, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨snapshots, taskOwner, taskInstance, taskOrigin, taskProcess, owned, running, declared, live,
    originFound, processFound, uniqueTask, uniqueTimer, taskAbsent, timerAbsent, recordAbsent, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state taskContract task taskFound
  let task := makeInternalTimerTaskPatch program state taskContract taskOwner taskInstance taskProcess taskOrigin
  obtain ⟨inputs, entries, timers, activities, anchors, associations, _⟩ :=
    boundedScope_timerTask_separation selected instanceId owner task independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  let bounded := makeInternalBoundedScopeSelection state contract entry
  let after := bounded.apply state
  have ownerFrame : onlyTokenOwner? after taskContract.input = some taskOwner := by
    change onlyTokenOwner? (entry.apply state) taskContract.input = _
    simpa only [onlyTokenOwner?, scopeCreation_apply_census state entry taskContract.input inputs entries] using owned
  have liveFrame : exactLiveOccurrence after taskOwner = true := by
    change exactLiveOccurrence (entry.apply state) taskOwner = true
    exact selectInternalScopeCreation_preserves_live state contract.entryOperation entry taskOwner entryFound live
  have keys : taskContract.task.id ≠ (⟨contract.origin.elementId.value⟩ : TaskDefinitionId) :=
    fun same => activities (congrArg TaskDefinitionId.value same).symm
  have activityFrame := activityActivationCount_set_other state ⟨contract.origin.elementId.value⟩
    taskContract.task.id (activityActivationCount state ⟨contract.origin.elementId.value⟩ + 1) keys
  have timerFrame := timerActivationCount_set_other state contract.timer.elementId taskContract.timer.elementId
    (timerActivationCount state contract.timer.elementId + 1) timers.symm
  have patchFrame : makeInternalTimerTaskPatch program after taskContract taskOwner taskInstance taskProcess taskOrigin = task := by
    simp only [activityActivationCount] at activityFrame
    simp only [timerActivationCount] at timerFrame
    simp only [makeInternalTimerTaskPatch, after, bounded, InternalBoundedScopeSelection.apply,
      makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, fields.2.2,
      activationCount, activityActivationCount, timerActivationCount, activityFrame, timerFrame, task]
  have anchorFrame (anchor : OccurrenceId) (member : anchor ∈ [task.arm.write.occurrence, timerWaitOccurrence task.timer]) :
      openWaitAnchorAbsent after anchor = openWaitAnchorAbsent state anchor := by
    have frame := armingOpenAnchorRead_frame state { task.arm with write := .timer bounded.timer }
      anchor (anchors anchor member)
    simpa only [after, bounded, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2, applyInternalArmingPatch,
      openWaitAnchorAbsent, openWaitAnchors] using frame
  have taskAnchor : openWaitAnchorAbsent after task.arm.write.occurrence = true :=
    (anchorFrame _ (by simp)).trans taskAbsent
  have timerAnchor : openWaitAnchorAbsent after (timerWaitOccurrence task.timer) = true :=
    (anchorFrame _ (by simp)).trans timerAbsent
  have recordFrame : after.activityOccurrences.any (regionalActivityAssociationsConflict · task.record) = false := by
    apply List.any_eq_false.mpr
    intro record member
    change record ∈ insertActivityOccurrence bounded.record state.activityOccurrences at member
    rw [insertActivityOccurrence_eq_canonicalInsertBy, mem_canonicalInsertBy] at member
    rcases member with rfl | member
    · exact Bool.eq_false_iff.mp associations
    · exact List.any_eq_false.mp recordAbsent record member
  have runningFrame : runningInstance? after = some taskInstance := by
    simpa only [after, bounded, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2, runningInstance?] using running
  change prepareInternalTimerTaskContract? program after taskContract = some task
  simp [prepareInternalTimerTaskContract?, snapshots, ownerFrame, runningFrame, declared, liveFrame,
    originFound, processFound, patchFrame, uniqueTask, uniqueTimer, taskAnchor, timerAnchor]
  intro record member
  exact Bool.eq_false_iff.mpr (List.any_eq_false.mp recordFrame record member)

theorem prepared_bounded_scope_timer_task_pair
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (taskContract : InternalTimerTaskContract) (task : InternalTimerTaskPatch)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (taskFound : prepareInternalTimerTaskContract? program state taskContract = some task)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent bounded.footprint (timerTaskStateFootprint task) = true) :
    prepareInternalBoundedScope? program (applyInternalTimerTaskPatch state task) contract = some bounded ∧
      prepareInternalTimerTaskContract? program (bounded.selection.apply state) taskContract = some task ∧
      applyInternalTimerTaskPatch (bounded.selection.apply state) task =
        bounded.selection.apply (applyInternalTimerTaskPatch state task) := by
  refine ⟨prepareInternalBoundedScope_after_timer_task program state contract bounded taskContract task found taskFound independent,
    prepareInternalTimerTaskContract_after_bounded_scope program state contract bounded taskContract task found taskFound independent, ?_⟩
  obtain ⟨selected, instanceId, owner, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨_, taskOwner, taskInstance, taskOrigin, taskProcess, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state taskContract task taskFound
  obtain ⟨_, entries, timers, activities, _, _, _⟩ := boundedScope_timerTask_separation selected instanceId owner _ independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  have tokens := congrArg RuntimeState.tokens (scope_creation_timer_task_patches_commute state entry
    (makeInternalTimerTaskPatch program state taskContract taskOwner taskInstance taskProcess taskOrigin) canonical entries)
  have timerOrder : orderedBy timerActivationBefore state.timerActivations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have activityOrder : orderedBy activationBefore state.activityActivations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have different : (⟨contract.origin.elementId.value⟩ : TaskDefinitionId) ≠ taskContract.task.id :=
    fun same => activities (congrArg TaskDefinitionId.value same)
  simp only [InternalScopeCreationSelection.apply, fields.2.2,
    applyInternalTimerTaskPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch] at tokens
  simp only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
    makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, fields.2.2,
    applyInternalTimerTaskPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch]
  congr 1
  · exact insertTimerWait_commutes _ _ timers.symm state.timerWaits
  · exact insertActivityOccurrence_commutes_of_distinct_element _ _ activities.symm state.activityOccurrences
  · exact (setTimerActivationCount_commutes_of_ordered _ _ _ _ timers.symm _ timerOrder).symm
  · exact setActivationCount_commutes_of_ordered _ _ _ _ different _ activityOrder

end BpmnSemantics.SemanticProcess.InternalCommutation
