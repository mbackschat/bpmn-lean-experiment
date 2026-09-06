import BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import BpmnSemantics.SemanticProcess.InternalCommutationOpenProjection
import BpmnSemantics.SemanticProcess.ActivityDataInputOutputActivationRuntimeStatePreservation

/-! # Composed data-arming runtime and projection frames

The predecessor's exact declaration and unattached Activity record preserve every existing wait
family, including Boundary Timer filtering and Message-boundary pairing.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_data_arm_preserves_runtime
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) (expectedInstanceId : SemanticId)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId state = true)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    runtimeStateWellFormed program expectedInstanceId
      (applyInternalDataArmingPatch state patch) = true := by
  exact dataInputOutputActivationStep_preserves_runtimeStateWellFormed_general
    program expectedInstanceId state _ wellFormed
    (prepareInternalDataArmingContract_sound program state contract patch prepared)

theorem dataArmingWaitStart_frame (program : Program) (state : RuntimeState)
    (patch : InternalDataArmingPatch) (owner : ScopeOccurrenceId) (element : NodeId)
    (activation : Nat) :
    waitStart? program (applyInternalDataArmingPatch state patch) owner element activation =
      waitStart? program state owner element activation := by
  exact armingWaitStart_frame program state patch.arm owner element activation

theorem dataArmingScopeStart_frame (program : Program) (state : RuntimeState)
    (patch : InternalDataArmingPatch) (occurrence : RuntimeScopeOccurrence) :
    scopeStart? program (applyInternalDataArmingPatch state patch) occurrence =
      scopeStart? program state occurrence := by
  exact armingScopeStart_frame program state patch.arm occurrence

theorem dataArmingCallStart_frame (program : Program) (state : RuntimeState)
    (patch : InternalDataArmingPatch) (record : CalledProcessOccurrence) :
    callStart? program (applyInternalDataArmingPatch state patch) record =
      callStart? program state record := by
  exact armingCallStart_frame program state patch.arm record

theorem prepared_data_arm_boundaryTimer_frame
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch)
    (timer : TimerWait) :
    flowNodeOccurrenceBoundaryTimerBound program (applyInternalDataArmingPatch state patch) timer =
      flowNodeOccurrenceBoundaryTimerBound program state timer := by
  obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, unique, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner,
      task := { id := contract.taskId, name := contract.taskName },
      activation := activationCount state contract.taskId + 1, output := contract.output }
  have declaration : UnboundedUserTaskWaitDeclaration wait contract.operation :=
    .dataInputOutput contract.operationId contract.origin contract.input contract.directInput
      contract.directOutput rfl rfl
  have declarers : userTaskWaitDeclarers program wait.task.id = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?, wait] using unique
  change flowNodeOccurrenceBoundaryTimerBound program
    { { state with waits := insertUserTaskWait wait state.waits } with
      activityOccurrences := insertActivityOccurrence
        (dataInputOutputActivityRecord state owner.processInstanceId owner contract.taskId)
        state.activityOccurrences } timer = _
  rw [flowNodeOccurrenceBoundaryTimerBound_insertUnattachedActivity _ _ _ rfl]
  exact flowNodeOccurrenceBoundaryTimerBound_insertUnboundedUserTask program state
    contract.operation wait declaration declarers timer

theorem prepared_data_arm_preserves_messageBoundedProjectionValid
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (valid : messageBoundedProjectionValid program state = true)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    messageBoundedProjectionValid program (applyInternalDataArmingPatch state patch) = true := by
  obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, unique, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  have declarers : userTaskWaitDeclarers program contract.taskId = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using unique
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner,
      task := { id := contract.taskId, name := contract.taskName },
      activation := activationCount state contract.taskId + 1, output := contract.output }
  let record := dataInputOutputActivityRecord state owner.processInstanceId owner contract.taskId
  unfold messageBoundedProjectionValid at valid ⊢
  simp only [List.all_eq_true] at valid ⊢
  intro candidate member
  have prior := valid candidate member
  cases candidate <;> try exact prior
  rename_i candidateId candidateOrigin candidateInput boundedTask boundaryMessage
  let boundedOperation := SemanticOperation.awaitMessageBoundedUserTask candidateId
    candidateOrigin candidateInput boundedTask boundaryMessage
  have different : contract.taskId ≠ boundedTask.id := by
    intro same
    have boundedMember : boundedOperation ∈ userTaskWaitDeclarers program contract.taskId := by
      simp [boundedOperation, userTaskWaitDeclarers, member, same]
    rw [declarers] at boundedMember
    simp [boundedOperation, InternalDataArmingContract.operation] at boundedMember
  have valuesDifferent : contract.taskId.value ≠ boundedTask.id.value :=
    fun same => different (taskDefinitionId_eq_of_value_eq _ _ same)
  let owned := FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program boundedOperation
  let taskFilter := fun current : UserTaskWait =>
    owned current.owner && decide (current.task.id = boundedTask.id)
  let recordFilter := fun current : ActivityOccurrence =>
    owned current.owner && decide (current.activityElementId.value = boundedTask.id.value)
  have tasksFrame : (insertUserTaskWait wait state.waits).filter taskFilter =
      state.waits.filter taskFilter := by
    rw [insertUserTaskWait_eq_canonicalInsertBy]
    apply filter_canonicalInsertBy_rejected
    simp [taskFilter, wait, different]
  have recordsFrame : (insertActivityOccurrence record state.activityOccurrences).filter
      recordFilter = state.activityOccurrences.filter recordFilter := by
    rw [BpmnSemantics.SemanticProcess.insertActivityOccurrence_eq_canonicalInsertBy]
    apply filter_canonicalInsertBy_rejected
    simp [recordFilter, record, dataInputOutputActivityRecord, valuesDifferent]
  simpa [boundedOperation, messageBoundedOperationProjectionValid,
    applyInternalDataArmingPatch, makeInternalDataArmingPatch, applyInternalArmingPatch,
    owned, taskFilter, recordFilter, wait, record, tasksFrame, recordsFrame] using prior

theorem prepared_data_arm_projectWaits_insert
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch)
    (newStart : OpenSemanticFlowNodeOccurrence)
    (started : waitStart? program state patch.arm.owner patch.arm.write.elementId
      patch.arm.write.occurrence.activation = some newStart) :
    ∀ beforeWaits, projectWaits? program state = some beforeWaits →
      ∃ afterWaits, projectWaits? program (applyInternalDataArmingPatch state patch) =
        some afterWaits ∧ afterWaits.Perm (newStart :: beforeWaits) := by
  have boundary := prepared_data_arm_boundaryTimer_frame program state contract patch prepared
  obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner,
      task := { id := contract.taskId, name := contract.taskName },
      activation := activationCount state contract.taskId + 1, output := contract.output }
  let after := applyInternalDataArmingPatch state
    (makeInternalDataArmingPatch program state contract owner inputOrigin source)
  intro beforeWaits beforeProjected
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
      effectsEq, incidentsEq, rfl⟩ :=
    (projectWaits_eq_some_iff program state beforeWaits).mp beforeProjected
  have newMapped : waitStart? program after wait.owner ⟨wait.task.id.value⟩ wait.activation =
      some newStart := by
    simpa [after, wait, makeInternalDataArmingPatch, InternalArmingWrite.elementId,
      InternalArmingWrite.occurrence, userTaskWaitOccurrence, dataArmingWaitStart_frame] using started
  obtain ⟨afterTasks, afterTasksEq, taskPerm⟩ := mapM_canonicalInsertBy_some userTaskWaitBefore
    (fun current => waitStart? program after current.owner ⟨current.task.id.value⟩
      current.activation) wait newStart state.waits tasks newMapped tasksEq
  have timersFrame : (state.timerWaits.filter fun current =>
      !flowNodeOccurrenceBoundaryTimerBound program after current) =
      (state.timerWaits.filter fun current =>
        !flowNodeOccurrenceBoundaryTimerBound program state current) := by
    apply List.filter_congr
    intro timer _
    rw [boundary]
  refine ⟨afterTasks ++ (messages ++ (timers ++ (effects ++ incidents))), ?_, ?_⟩
  · apply (projectWaits_eq_some_iff _ _ _).mpr
    refine ⟨afterTasks, messages, timers, effects, incidents, ?_, messagesEq, ?_,
      effectsEq, incidentsEq, rfl⟩
    · simpa [after, applyInternalDataArmingPatch, applyInternalArmingPatch,
        makeInternalDataArmingPatch, wait, insertUserTaskWait_eq_canonicalInsertBy] using afterTasksEq
    · change (state.timerWaits.filter fun current =>
        !flowNodeOccurrenceBoundaryTimerBound program after current).mapM
        (fun current => waitStart? program after current.owner current.elementId
          current.activation) = some timers
      rw [timersFrame]
      exact timersEq
  · simpa using taskPerm.append
      (List.Perm.refl (messages ++ (timers ++ (effects ++ incidents))))

theorem prepared_data_arm_preserves_flowNodeOccurrenceProgramValidity
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (programValid : programWellFormed program = true)
    (valid : flowNodeOccurrenceProgramValidity program state = true)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    flowNodeOccurrenceProgramValidity program (applyInternalDataArmingPatch state patch) = true := by
  obtain ⟨owner, inputOrigin, source, _, _, selected, live, _, _, unique, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner,
      task := { id := contract.taskId, name := contract.taskName },
      activation := activationCount state contract.taskId + 1, output := contract.output }
  let record := dataInputOutputActivityRecord state owner.processInstanceId owner contract.taskId
  let after := applyInternalDataArmingPatch state
    (makeInternalDataArmingPatch program state contract owner inputOrigin source)
  have parts := valid
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
  have declarers : userTaskWaitDeclarers program wait.task.id = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?, wait] using unique
  have operationMember : contract.operation ∈ program.operations := by
    have member : contract.operation ∈ userTaskWaitDeclarers program wait.task.id := by
      rw [declarers]
      simp
    exact (List.mem_filter.mp member).1
  have declared := declaredByExactlyOneOwnedOperation_of_exactSelection program
    contract.operation owner _ declarers selected
  have processId := flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty
    program state owner parts.1.1.1 live
  have elementId := programWellFormed_internalArm_element_nonempty program contract.operation
    programValid operationMember
  have waitValid := flowNodeOccurrenceWaitProgramValidity_insertUnboundedUserTask
    program state contract.operation wait
    (.dataInputOutput contract.operationId contract.origin contract.input contract.directInput
      contract.directOutput rfl rfl)
    parts.1.1.2 declarers declared
    (by simpa [flowNodeOccurrenceOwnerLiveUnique, exactLiveOccurrence] using live)
    processId (by simpa [InternalDataArmingContract.operation, wait] using elementId)
    (by simp [wait]) rfl
  have waitsAfter : flowNodeOccurrenceWaitProgramValidity program after = true := by
    let base : RuntimeState :=
      { state with
        waits := insertUserTaskWait wait state.waits
        tokens := removeToken state.tokens contract.input owner
        activations := setActivationCount state.activations contract.taskId wait.activation
        activityActivations := setActivationCount state.activityActivations contract.taskId
          record.activation }
    change flowNodeOccurrenceWaitProgramValidity program
      { { base with activityOccurrences := insertActivityOccurrence record state.activityOccurrences }
        with
        variables := addActivityOccurrenceVariableScope base.variables
          (activityOwnerForRecord record)
          [{ name := contract.directInput.targetDataInputId, value := source.value }] } = true
    rw [flowNodeOccurrenceWaitProgramValidity_addActivityOccurrenceVariableScope]
    rw [flowNodeOccurrenceWaitProgramValidity_insertUnattachedActivity _ _ _ rfl]
    exact waitValid
  exact flowNodeOccurrenceProgramValidity_of_wait_frame program state after valid waitsAfter
    rfl rfl rfl rfl rfl

theorem prepared_data_arm_preserves_runtime_and_open_projection_exact
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) (expectedInstanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program expectedInstanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    ∃ current newStart next,
      projectOpenFlowNodeOccurrences? program state = some current ∧
      waitStart? program state patch.arm.owner patch.arm.write.elementId
        patch.arm.write.occurrence.activation = some newStart ∧
      projectOpenFlowNodeOccurrences? program (applyInternalDataArmingPatch state patch) =
        some next ∧
      next = sortFlowNodeOccurrenceStarts (newStart :: current) ∧
      runtimeStateWellFormed program expectedInstanceId
        (applyInternalDataArmingPatch state patch) = true := by
  have wellAfter := prepared_data_arm_preserves_runtime program state contract patch
    expectedInstanceId stateValid prepared
  obtain ⟨owner, inputOrigin, source, _, running, _, live, _, _, _, absent, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  let patch := makeInternalDataArmingPatch program state contract owner inputOrigin source
  let after := applyInternalDataArmingPatch state patch
  cases projected : projectOpenFlowNodeOccurrences? program state with
  | none => simp [projected] at openBefore
  | some current =>
      have validities := projectOpenFlowNodeOccurrences_validities program state current
        owner.processInstanceId running projected
      have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
        have parts := validities.1
        simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
        exact parts.1.1.1
      have processSome := processIdForOwner_isSome_of_open_projection program state owner
        current owner.processInstanceId running structural validities.2.1 live projected
      cases processEq : processIdForOwner? program state owner with
      | none => simp [processEq] at processSome
      | some processId =>
          cases started : waitStart? program state patch.arm.owner patch.arm.write.elementId
              patch.arm.write.occurrence.activation with
          | none => simp [waitStart?, patch, makeInternalDataArmingPatch, processEq] at started
          | some newStart =>
              have waitInsertion := prepared_data_arm_projectWaits_insert program state contract
                patch prepared newStart started
              have freshWaits := absent_wait_anchor_projectWaits_fresh program state
                patch.arm.owner patch.arm.write.elementId patch.arm.write.occurrence.activation
                (by simpa [patch, makeInternalDataArmingPatch, InternalArmingWrite.occurrence,
                  InternalArmingWrite.elementId, userTaskWaitOccurrence] using absent)
                validities.1 newStart started
              have scopesFrame :
                  (after.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
                    (scopeStart? program after) =
                  (state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
                    (scopeStart? program state) := by
                apply mapM_eq_of_pointwise
                intro occurrence
                exact dataArmingScopeStart_frame program state patch occurrence
              have callsFrame : after.calledProcessOccurrences.mapM (callStart? program after) =
                  state.calledProcessOccurrences.mapM (callStart? program state) := by
                apply mapM_eq_of_pointwise
                intro record
                exact dataArmingCallStart_frame program state patch record
              have occurrencesAfter := prepared_data_arm_preserves_flowNodeOccurrenceProgramValidity
                program state contract patch programValid validities.1 prepared
              have callsAfter : calledProcessAssociationsValid after = true := by
                rw [calledProcessAssociationsValid_frame state after rfl rfl rfl]
                exact validities.2.1
              have associations := runtimeStateWellFormed_associationValidities program
                expectedInstanceId after wellAfter
              have messagePairsAfter := prepared_data_arm_preserves_messageBoundedProjectionValid
                program state contract patch validities.2.2.2.2 prepared
              have newAnchor : ∃ occurrence, newStart.anchor = .wait occurrence :=
                ⟨_, waitStart_anchor_of_eq program state _ _ _ newStart started⟩
              obtain ⟨next, afterProjected, nextEq⟩ := one_wait_insert_open_projection_exact
                program state after newStart current running running projected waitInsertion
                scopesFrame callsFrame newAnchor freshWaits programValid occurrencesAfter
                associations.1 callsAfter associations.2 messagePairsAfter
              exact ⟨current, newStart, next, rfl, rfl, afterProjected, nextEq, wellAfter⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
