import BpmnSemantics.SemanticProcess.InternalDataArmingFrames

/-! # Accepted data-arming publication

The prepared wait's exact candidate must pass the existing lifecycle acceptance boundary; a
successful projection alone does not establish the committed delta.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_data_arm_candidate_singleton
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) (commandId : SemanticId) (transitionIndex : Nat)
    (newStart : OpenSemanticFlowNodeOccurrence)
    (programValid : programWellFormed program = true)
    (occurrencesValid : flowNodeOccurrenceProgramValidity program state = true)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch)
    (started : waitStart? program state patch.arm.owner patch.arm.write.elementId
      patch.arm.write.occurrence.activation = some newStart) :
    candidateFlowNodeOccurrenceDeltaForOperation? program state
      (applyInternalDataArmingPatch state patch) contract.operation commandId transitionIndex =
      some (canonicalFlowNodeOccurrenceDelta [newStart] []) := by
  obtain ⟨owner, inputOrigin, source, owned, running, selected, live, _, _, _, absent, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner,
      task := { id := contract.taskId, name := contract.taskName },
      activation := activationCount state contract.taskId + 1, output := contract.output }
  have missing : userTaskWaitOccurrence wait ∉ openWaitAnchors state := by
    simpa [openWaitAnchorAbsent, List.contains_eq_mem, makeInternalDataArmingPatch,
      InternalArmingWrite.occurrence, wait] using absent
  have fresh : ∀ old ∈ state.waits, userTaskWaitKeyMatches wait old = false := by
    intro old member
    apply Bool.eq_false_iff.mpr
    intro keyed
    simp only [userTaskWaitKeyMatches, Bool.and_eq_true, decide_eq_true_eq] at keyed
    obtain ⟨⟨process, element⟩, activation⟩ := keyed
    apply missing
    simp only [openWaitAnchors, List.mem_append, List.mem_map, or_assoc]
    refine Or.inl ⟨old, member, ?_⟩
    simp only [userTaskWaitOccurrence]
    rw [process, congrArg (fun value : TaskDefinitionId => value.value) element, activation]
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    have parts := occurrencesValid
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
    exact parts.1.1.1
  have ownerIds := flowNodeOccurrenceProgramValidity_wait_owner_ids program state occurrencesValid
  have startEq : waitStart? program state owner ⟨contract.taskId.value⟩
      (activationCount state contract.taskId + 1) = some newStart := started
  unfold waitStart? at startEq
  obtain ⟨runtimeProcess, runtimeProcessEq, newStartEq⟩ := Option.bind_eq_some_iff.mp startEq
  have newStartExact := Option.some.inj newStartEq
  subst newStart
  have processAligned := candidateProcessIdForDefinitionScope_eq_processIdForOwner
    program state owner runtimeProcess owner.processInstanceId programValid running structural live
      runtimeProcessEq
  obtain ⟨binding, operationSelection, scopeSelection, scopeMatches⟩ :=
    exactProgramSelection_parts program contract.operation owner programValid selected
  have filtered : (insertUserTaskWait wait state.waits).filter (fun old =>
      decide (old.owner = owner) && decide (old.task.id = contract.taskId) &&
        decide (old.activation = activationForTask state contract.taskId + 1)) = [wait] := by
    simpa [wait, activationForTask_eq_activationCount] using
      filter_insertUserTaskWait_eq_singleton wait state.waits rfl ownerIds.1 fresh
  cases dataEq : contract.data
  all_goals
    simp only [InternalDataArmingContract.operation, dataEq, candidateFlowNodeOccurrenceDeltaForOperation?,
      flowNodeSelectedOperationOwner?, owned, Option.bind_eq_bind, Option.bind_some,
      applyInternalDataArmingPatch, makeInternalDataArmingPatch, applyInternalArmingPatch,
      Bool.decide_coe]
    dsimp [wait] at filtered
    rw [filtered]
    have candidate := candidateWaitStart_of_exact_selection program contract.operation owner
      owner.processInstanceId ⟨contract.taskId.value⟩ (activationCount state contract.taskId + 1)
      runtimeProcess binding operationSelection scopeSelection scopeMatches processAligned rfl (by omega)
    simp only [InternalDataArmingContract.operation, dataEq] at candidate
    simp [candidateUserTaskStart?, candidate]
    rfl

theorem prepared_data_arm_lifecycle_singleton
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) (expectedInstanceId commandId : SemanticId)
    (transitionIndex : Nat)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program expectedInstanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    ∃ newStart,
      waitStart? program state patch.arm.owner patch.arm.write.elementId
        patch.arm.write.occurrence.activation = some newStart ∧
      flowNodeOccurrenceDeltaForOperation? program state (applyInternalDataArmingPatch state patch)
        contract.operation commandId transitionIndex =
        some (canonicalFlowNodeOccurrenceDelta [newStart] []) := by
  obtain ⟨current, newStart, next, beforeEq, started, afterEq, nextEq, _⟩ :=
    prepared_data_arm_preserves_runtime_and_open_projection_exact program state contract patch
      expectedInstanceId programValid stateValid
      openBefore prepared
  obtain ⟨owner, _, _, _, running, _, _, _, _, _, _, _, _, _⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  have validities := projectOpenFlowNodeOccurrences_validities program state current
    owner.processInstanceId running beforeEq
  have candidate := prepared_data_arm_candidate_singleton program state contract patch commandId
    transitionIndex newStart programValid validities.1 prepared started
  refine ⟨newStart, started, single_start_candidate_accepted program state _ contract.operation
    commandId transitionIndex current newStart next beforeEq afterEq nextEq candidate ?_⟩
  rw [waitStart_anchor_of_eq program state _ _ _ _ started]
  rfl

end BpmnSemantics.SemanticProcess.InternalCommutation
