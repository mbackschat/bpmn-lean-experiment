import BpmnSemantics.SemanticProcess.InternalTimerTaskOrdinaryFrames

/-! Timer-task and Activity-data arming retain separate task and Activity issuers.
The complete preparations also protect both untagged wait anchors and Activity body ownership.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem timerTask_data_independent_separation (timer : InternalTimerTaskPatch)
    (contract : InternalDataArmingContract) (data : InternalDataArmingPatch)
    (taskWrite : data.arm.write.kind = .userTask)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint data.arm.owner
        (PreparedInternalArming.data contract data).stateFootprint) = true) :
    timer.arm.input ≠ data.arm.input ∧ timer.arm.write.elementId ≠ data.arm.write.elementId ∧
      (∀ anchor ∈ [timer.arm.write.occurrence, timerWaitOccurrence timer.timer],
        anchor ≠ data.arm.write.occurrence) := by
  have separated := regional_independent_write_write _ _ independent
  have dataWrite (atom : InternalStateAtom) (member : atom ∈ (footprintOfPatch data.arm).writes) :
      liftRegionalStateAtom data.arm.owner atom ∈
        (liftRegionalStateFootprint data.arm.owner
          (PreparedInternalArming.data contract data).stateFootprint).writes :=
    List.mem_map.mpr ⟨atom, ordinary_writes_subset_data_writes contract data member, rfl⟩
  have input := separated (.ordinary (.tokenOwners timer.arm.input))
    (.ordinary (.tokenOwners data.arm.input))
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    (dataWrite _ (tokenOwners_mem_footprint_writes data.arm))
  refine ⟨?_, ?_, ?_⟩
  · intro same
    simp [regionalStateAtomsConflict, same] at input
  · intro same
    have conflict := separated (.ordinary (.activation .userTask timer.arm.write.elementId))
      (.ordinary (.activation data.arm.write.kind.activationKind data.arm.write.elementId))
      (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (dataWrite (.activation data.arm.write.kind.activationKind data.arm.write.elementId)
        (by simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]))
    simp [regionalStateAtomsConflict, taskWrite, InternalWaitKind.activationKind, same] at conflict
  · intro anchor member same
    have conflict := separated (.owned (.openWaitAnchor anchor) timer.arm.owner)
      (.owned (.openWaitAnchor data.arm.write.occurrence) data.arm.owner)
      (by simp only [List.mem_cons, List.not_mem_nil, or_false] at member
          rcases member with rfl | rfl <;>
            simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (dataWrite (.openWaitAnchor data.arm.write.occurrence)
        (by simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]))
    simp [regionalStateAtomsConflict, same] at conflict

theorem makeInternalDataArmingPatch_timer_task_frame
    (program : Program) (state : RuntimeState)
    (timer : InternalTimerTaskContract) (data : InternalDataArmingContract)
    (timerOwner dataOwner : ScopeOccurrenceId) (instanceId : SemanticId) (processId : ProcessId)
    (timerOrigin dataOrigin : BpmnSequenceFlowOrigin) (source : List VariableBinding)
    (different : timer.task.id ≠ data.taskId) :
    makeInternalDataArmingPatch program (applyInternalTimerTaskPatch state
        (makeInternalTimerTaskPatch program state timer timerOwner instanceId processId timerOrigin))
        data dataOwner dataOrigin source =
      makeInternalDataArmingPatch program state data dataOwner dataOrigin source := by
  have taskFrame := activationCount_setActivationCount_other state timer.task.id data.taskId
    (activationCount state timer.task.id + 1) different.symm
  have activityFrame := activationCount_setActivationCount_other
    { state with activations := state.activityActivations } timer.task.id data.taskId
    (activityActivationCount state timer.task.id + 1) different.symm
  simp only [activationCount, activityActivationCount] at taskFrame activityFrame
  simp only [makeInternalDataArmingPatch, makeInternalTimerTaskPatch, applyInternalTimerTaskPatch,
    applyInternalArmingPatch, dataInputOutputActivityRecord, activationCount,
    activityActivationCount, taskFrame, activityFrame]

theorem makeInternalTimerTaskPatch_data_frame
    (program : Program) (state : RuntimeState)
    (timer : InternalTimerTaskContract) (data : InternalDataArmingContract)
    (timerOwner dataOwner : ScopeOccurrenceId) (instanceId : SemanticId) (processId : ProcessId)
    (timerOrigin dataOrigin : BpmnSequenceFlowOrigin) (source : List VariableBinding)
    (different : timer.task.id ≠ data.taskId) :
    makeInternalTimerTaskPatch program (applyInternalDataArmingPatch state
        (makeInternalDataArmingPatch program state data dataOwner dataOrigin source))
        timer timerOwner instanceId processId timerOrigin =
      makeInternalTimerTaskPatch program state timer timerOwner instanceId processId timerOrigin := by
  have taskFrame := activationCount_setActivationCount_other state data.taskId timer.task.id
    (activationCount state data.taskId + 1) different
  have activityFrame := activationCount_setActivationCount_other
    { state with activations := state.activityActivations } data.taskId timer.task.id
    (activityActivationCount state data.taskId + 1) different
  simp only [activationCount, activityActivationCount] at taskFrame activityFrame
  simp only [makeInternalDataArmingPatch, makeInternalTimerTaskPatch, applyInternalDataArmingPatch,
    applyInternalArmingPatch, dataInputOutputActivityRecord, activationCount,
    activityActivationCount, timerActivationCount, taskFrame, activityFrame]

theorem prepareInternalDataArmingContract_timer_task_preserved
    (program : Program) (state : RuntimeState)
    (timerContract : InternalTimerTaskContract) (timer : InternalTimerTaskPatch)
    (dataContract : InternalDataArmingContract) (data : InternalDataArmingPatch)
    (timerPrepared : prepareInternalTimerTaskContract? program state timerContract = some timer)
    (dataPrepared : prepareInternalDataArmingContract? program state dataContract = some data)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint data.arm.owner
        (PreparedInternalArming.data dataContract data).stateFootprint) = true) :
    prepareInternalDataArmingContract? program (applyInternalTimerTaskPatch state timer)
      dataContract = some data := by
  obtain ⟨_, timerOwner, instanceId, timerOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state timerContract timer timerPrepared
  obtain ⟨dataOwner, dataOrigin, source, owned, running, selected, live, originFound,
    sourceFound, unique, anchorAbsent, scopeAbsent, recordAbsent, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state dataContract data dataPrepared
  let timer := makeInternalTimerTaskPatch program state timerContract timerOwner instanceId processId timerOrigin
  let data := makeInternalDataArmingPatch program state dataContract dataOwner dataOrigin source
  let after := applyInternalTimerTaskPatch state timer
  obtain ⟨inputs, tasks, anchors⟩ := timerTask_data_independent_separation timer dataContract data rfl independent
  have different : timerContract.task.id ≠ dataContract.taskId := by
    intro same
    apply tasks
    simp [timer, data, makeInternalTimerTaskPatch, makeInternalDataArmingPatch,
      InternalArmingWrite.elementId, same]
  have valuesDifferent : timerContract.task.id.value ≠ dataContract.taskId.value :=
    fun same => different (taskDefinitionId_eq_of_value_eq _ _ same)
  have ownerFrame : onlyTokenOwner? after dataContract.input = some dataOwner := by
    change onlyTokenOwner? (applyInternalArmingPatch state timer.arm) dataContract.input = _
    rw [armingOwnerRead_frame state timer.arm dataContract.input inputs]
    exact owned
  have patchFrame : makeInternalDataArmingPatch program after dataContract dataOwner
      dataOrigin source = data :=
    makeInternalDataArmingPatch_timer_task_frame program state timerContract dataContract
      timerOwner dataOwner instanceId processId timerOrigin dataOrigin source different
  have anchorFrame : openWaitAnchorAbsent after data.arm.write.occurrence = true := by
    rw [timerTaskOpenAnchorRead_frame state timer _ rfl _
      (anchors _ (by simp [timer])) (anchors _ (by simp [timer]))]
    exact anchorAbsent
  have bodies : activityBodyClaimsDisjoint timer.record data.record = true := by
    apply activityBodyClaimsDisjoint_userTask_of_not_mem timer.record data.record _
    simp only [data, makeInternalDataArmingPatch, dataInputOutputActivityRecord,
      activityBodyTaskClaims, List.mem_singleton]
    intro same
    exact valuesDifferent (congrArg (fun occurrence => occurrence.elementId.value) same)
  have identities : sameActivityOccurrence timer.record data.record = false := by
    simp only [sameActivityOccurrence, Bool.and_eq_false_iff]
    exact Or.inl (Or.inr (by
      apply Bool.eq_false_iff.mpr
      intro same
      exact valuesDifferent (congrArg (fun id => id.value) (eq_of_beq same))))
  have recordFrame : after.activityOccurrences.any (fun record =>
      sameActivityOccurrence record data.record || !activityBodyClaimsDisjoint record data.record) = false := by
    apply List.any_eq_false.mpr
    intro record member
    change record ∈ insertActivityOccurrence timer.record state.activityOccurrences at member
    rw [insertActivityOccurrence_eq_canonicalInsertBy, mem_canonicalInsertBy] at member
    rcases member with rfl | member
    · simp [identities, bodies]
    · exact List.any_eq_false.mp recordAbsent record member
  have runningFrame : after.control = .running dataOwner.processInstanceId := running
  have liveFrame : exactLiveOccurrence after dataOwner = true := live
  have sourceFrame : dataArmingBindings? after dataContract.data = some source := sourceFound
  have scopeFrame : after.variables.activities.any
      (activityOccurrenceScopeMatches (activityOwnerForRecord data.record)) = false := scopeAbsent
  change prepareInternalDataArmingContract? program after dataContract = some data
  simp [prepareInternalDataArmingContract?, ownerFrame, runningFrame, selected, liveFrame,
    originFound, sourceFrame, patchFrame, unique, anchorFrame]
  simpa using And.intro scopeFrame recordFrame

theorem prepareInternalTimerTaskContract_data_preserved
    (program : Program) (state : RuntimeState)
    (timerContract : InternalTimerTaskContract) (timer : InternalTimerTaskPatch)
    (dataContract : InternalDataArmingContract) (data : InternalDataArmingPatch)
    (timerPrepared : prepareInternalTimerTaskContract? program state timerContract = some timer)
    (dataPrepared : prepareInternalDataArmingContract? program state dataContract = some data)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint data.arm.owner
        (PreparedInternalArming.data dataContract data).stateFootprint) = true) :
    prepareInternalTimerTaskContract? program (applyInternalDataArmingPatch state data)
      timerContract = some timer := by
  obtain ⟨dataOwner, dataOrigin, source, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state dataContract data dataPrepared
  obtain ⟨snapshots, timerOwner, instanceId, timerOrigin, processId, owned, running, selected,
    live, originFound, processFound, uniqueTask, uniqueTimer, taskAbsent, timerAbsent, recordAbsent, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state timerContract timer timerPrepared
  let timer := makeInternalTimerTaskPatch program state timerContract timerOwner instanceId processId timerOrigin
  let data := makeInternalDataArmingPatch program state dataContract dataOwner dataOrigin source
  let after := applyInternalDataArmingPatch state data
  obtain ⟨inputs, tasks, anchors⟩ := timerTask_data_independent_separation timer dataContract data rfl independent
  have different : timerContract.task.id ≠ dataContract.taskId := by
    intro same
    apply tasks
    simp [timer, data, makeInternalTimerTaskPatch, makeInternalDataArmingPatch,
      InternalArmingWrite.elementId, same]
  have valuesDifferent : dataContract.taskId.value ≠ timerContract.task.id.value :=
    fun same => different (taskDefinitionId_eq_of_value_eq _ _ same.symm)
  have ownerFrame : onlyTokenOwner? after timerContract.input = some timerOwner := by
    change onlyTokenOwner? (applyInternalArmingPatch state data.arm) timerContract.input = _
    rw [armingOwnerRead_frame state data.arm timerContract.input inputs.symm]
    exact owned
  have patchFrame : makeInternalTimerTaskPatch program after timerContract timerOwner instanceId
      processId timerOrigin = timer :=
    makeInternalTimerTaskPatch_data_frame program state timerContract dataContract
      timerOwner dataOwner instanceId processId timerOrigin dataOrigin source different
  have taskAnchorFrame : openWaitAnchorAbsent after timer.arm.write.occurrence = true := by
    change openWaitAnchorAbsent (applyInternalArmingPatch state data.arm) timer.arm.write.occurrence = true
    rw [armingOpenAnchorRead_frame state data.arm _ (anchors _ (by simp [timer])).symm]
    exact taskAbsent
  have timerAnchorFrame : openWaitAnchorAbsent after (timerWaitOccurrence timer.timer) = true := by
    change openWaitAnchorAbsent (applyInternalArmingPatch state data.arm) (timerWaitOccurrence timer.timer) = true
    rw [armingOpenAnchorRead_frame state data.arm _ (anchors _ (by simp [timer])).symm]
    exact timerAbsent
  have associations : regionalActivityAssociationsConflict data.record timer.record = false := by
    simp [data, timer, makeInternalDataArmingPatch, makeInternalTimerTaskPatch,
      dataInputOutputActivityRecord, regionalActivityAssociationsConflict,
      regionalActivityBodyTasks, sameActivityOccurrence, beq_iff_eq, valuesDifferent]
  have recordFrame : after.activityOccurrences.any
      (regionalActivityAssociationsConflict · timer.record) = false := by
    apply List.any_eq_false.mpr
    intro record member
    change record ∈ insertActivityOccurrence data.record state.activityOccurrences at member
    rw [insertActivityOccurrence_eq_canonicalInsertBy, mem_canonicalInsertBy] at member
    rcases member with rfl | member
    · exact Bool.eq_false_iff.mp associations
    · exact List.any_eq_false.mp recordAbsent record member
  have runningFrame : runningInstance? after = some instanceId := running
  have liveFrame : exactLiveOccurrence after timerOwner = true := live
  change prepareInternalTimerTaskContract? program after timerContract = some timer
  simp [prepareInternalTimerTaskContract?, snapshots, ownerFrame, runningFrame, selected,
    liveFrame, originFound, processFound, patchFrame, uniqueTask, uniqueTimer,
    taskAnchorFrame, timerAnchorFrame]
  intro record member
  exact Bool.eq_false_iff.mpr (List.any_eq_false.mp recordFrame record member)

theorem prepared_timer_task_data_pair_commutes
    (program : Program) (state : RuntimeState)
    (timerContract : InternalTimerTaskContract) (timer : InternalTimerTaskPatch)
    (dataContract : InternalDataArmingContract) (data : InternalDataArmingPatch)
    (timerPrepared : prepareInternalTimerTaskContract? program state timerContract = some timer)
    (dataPrepared : prepareInternalDataArmingContract? program state dataContract = some data)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint data.arm.owner
        (PreparedInternalArming.data dataContract data).stateFootprint) = true) :
    prepareInternalTimerTaskContract? program (applyInternalDataArmingPatch state data)
        timerContract = some timer ∧
      prepareInternalDataArmingContract? program (applyInternalTimerTaskPatch state timer)
        dataContract = some data ∧
      applyInternalDataArmingPatch (applyInternalTimerTaskPatch state timer) data =
        applyInternalTimerTaskPatch (applyInternalDataArmingPatch state data) timer := by
  refine ⟨prepareInternalTimerTaskContract_data_preserved program state timerContract timer
    dataContract data timerPrepared dataPrepared independent,
    prepareInternalDataArmingContract_timer_task_preserved program state timerContract timer
      dataContract data timerPrepared dataPrepared independent, ?_⟩
  obtain ⟨_, timerOwner, instanceId, timerOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state timerContract timer timerPrepared
  obtain ⟨dataOwner, dataOrigin, source, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state dataContract data dataPrepared
  have separated := timerTask_data_independent_separation _ dataContract _ rfl independent
  have different : timerContract.task.id ≠ dataContract.taskId := by
    intro same
    apply separated.2.1
    simp [makeInternalTimerTaskPatch, makeInternalDataArmingPatch, InternalArmingWrite.elementId, same]
  have valuesDifferent : timerContract.task.id.value ≠ dataContract.taskId.value :=
    fun same => different (taskDefinitionId_eq_of_value_eq _ _ same)
  have taskOrder : orderedBy activationBefore state.activations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have activityOrder : orderedBy activationBefore state.activityActivations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  simp only [applyInternalDataArmingPatch, applyInternalTimerTaskPatch,
    makeInternalDataArmingPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch]
  congr 1
  · exact removeToken_commutes state.tokens timerContract.input dataContract.input timerOwner dataOwner
  · exact insertUserTaskWait_commutes _ _ different.symm state.waits
  · exact insertActivityOccurrence_commutes_of_distinct_element _ _
      valuesDifferent.symm state.activityOccurrences
  · exact setActivationCount_commutes_of_ordered _ _ _ _ different _ taskOrder
  · exact setActivationCount_commutes_of_ordered _ _ _ _ different _ activityOrder

end BpmnSemantics.SemanticProcess.InternalCommutation
