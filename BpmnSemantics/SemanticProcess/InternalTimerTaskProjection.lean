import BpmnSemantics.SemanticProcess.InternalTimerTaskRuntimePreservation
import BpmnSemantics.SemanticProcess.InternalCommutationOpenProjection

/-! Timer-task arming adds one public task anchor. Its new Timer is private through the exact
Activity association, while every predecessor Timer retains its publication classification.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem timerTaskWaitStart_frame (program : Program) (state : RuntimeState)
    (patch : InternalTimerTaskPatch) (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat) :
    waitStart? program (applyInternalTimerTaskPatch state patch) owner element activation =
      waitStart? program state owner element activation :=
  armingWaitStart_frame program state patch.arm owner element activation

theorem timerTaskScopeStart_frame (program : Program) (state : RuntimeState)
    (patch : InternalTimerTaskPatch) (occurrence : RuntimeScopeOccurrence) :
    scopeStart? program (applyInternalTimerTaskPatch state patch) occurrence = scopeStart? program state occurrence :=
  armingScopeStart_frame program state patch.arm occurrence

theorem timerTaskCallStart_frame (program : Program) (state : RuntimeState)
    (patch : InternalTimerTaskPatch) (record : CalledProcessOccurrence) :
    callStart? program (applyInternalTimerTaskPatch state patch) record = callStart? program state record :=
  armingCallStart_frame program state patch.arm record

private theorem timer_task_elements_nonempty (program : Program) (contract : InternalTimerTaskContract)
    (valid : programWellFormed program = true) (member : contract.operation ∈ program.operations) :
    (!contract.task.id.value.isEmpty) = true ∧ (!contract.timer.elementId.value.isEmpty) = true := by
  have operationValid := List.all_eq_true.mp (programWellFormed_operations program valid) contract.operation member
  cases kind : contract.kind <;>
    simp only [InternalTimerTaskContract.operation, kind] at operationValid
  all_goals
    change (_ && _ && !contract.task.id.value.isEmpty && !contract.timer.elementId.value.isEmpty &&
      _ && _ && _ && _ && _ && _ && _) = true at operationValid
    simp_all only [Bool.and_eq_true, and_self]

theorem prepared_timer_task_preserves_occurrence_program_validity
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (programValid : programWellFormed program = true)
    (valid : flowNodeOccurrenceProgramValidity program state = true)
    (records : activityRecordsOwnLiveWork state = true) :
    flowNodeOccurrenceProgramValidity program (applyInternalTimerTaskPatch state patch) = true := by
  have parts := valid
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
  have facts := prepareInternalTimerTaskContract_facts program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, live, _, _, tasks, _, _, _, _, patchEq⟩ := facts
  have member : contract.operation ∈ program.operations := by
    have declarers : userTaskWaitDeclarers program contract.task.id = [contract.operation] := by
      simpa [uniqueFamilyDeclarer?] using tasks
    exact (List.mem_filter.mp (show contract.operation ∈ userTaskWaitDeclarers program contract.task.id from
      by rw [declarers]; simp)).1
  have elements := timer_task_elements_nonempty program contract programValid member
  have process := flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty program state owner parts.1.1.1 live
  have waits := prepared_timer_task_preserves_wait_program_validity program state contract patch prepared
    parts.1.1.2 records (by simpa [patchEq, makeInternalTimerTaskPatch] using process)
    (by simpa using elements.1) (by simpa using elements.2)
  apply flowNodeOccurrenceProgramValidity_of_wait_frame program state _ valid waits
  all_goals cases patchEq; rfl

theorem prepared_timer_task_projectWaits_insert
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (records : activityRecordsOwnLiveWork state = true)
    (newStart : OpenSemanticFlowNodeOccurrence)
    (started : waitStart? program state patch.arm.owner patch.arm.write.elementId
      patch.arm.write.occurrence.activation = some newStart) :
    ∀ beforeWaits, projectWaits? program state = some beforeWaits →
      ∃ afterWaits, projectWaits? program (applyInternalTimerTaskPatch state patch) = some afterWaits ∧
        afterWaits.Perm (newStart :: beforeWaits) := by
  have boundary := prepared_timer_task_preserves_existing_timer_binding program state contract patch prepared
  have newBound := prepared_timer_task_new_timer_binding program state contract patch prepared records
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let selected := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  let after := applyInternalTimerTaskPatch state selected
  intro beforeWaits beforeProjected
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
    effectsEq, incidentsEq, rfl⟩ := (projectWaits_eq_some_iff program state beforeWaits).mp beforeProjected
  have newMapped : waitStart? program after wait.owner ⟨wait.task.id.value⟩ wait.activation = some newStart := by
    simpa [after, selected, wait, makeInternalTimerTaskPatch, InternalArmingWrite.elementId,
      InternalArmingWrite.occurrence, userTaskWaitOccurrence, timerTaskWaitStart_frame] using started
  obtain ⟨afterTasks, afterTasksEq, taskPerm⟩ := mapM_canonicalInsertBy_some userTaskWaitBefore
    (fun current => waitStart? program after current.owner ⟨current.task.id.value⟩ current.activation)
    wait newStart state.waits tasks newMapped tasksEq
  have timersFrame : (after.timerWaits.filter fun current =>
      !flowNodeOccurrenceBoundaryTimerBound program after current) =
      (state.timerWaits.filter fun current => !flowNodeOccurrenceBoundaryTimerBound program state current) := by
    change (insertTimerWait selected.timer state.timerWaits).filter _ = _
    have rejected : (!flowNodeOccurrenceBoundaryTimerBound program after selected.timer) = false := by
      change (!flowNodeOccurrenceBoundaryTimerBound program
        (applyInternalTimerTaskPatch state selected) selected.timer) = false
      rw [newBound]
      rfl
    rw [insertTimerWait, filter_canonicalInsertBy_rejected timerWaitBefore
      (fun current => !flowNodeOccurrenceBoundaryTimerBound program after current)
      selected.timer state.timerWaits rejected]
    apply List.filter_congr
    intro timer member
    rw [boundary timer member]
  refine ⟨afterTasks ++ (messages ++ (timers ++ (effects ++ incidents))), ?_, ?_⟩
  · apply (projectWaits_eq_some_iff _ _ _).mpr
    refine ⟨afterTasks, messages, timers, effects, incidents, ?_, messagesEq, ?_, effectsEq, incidentsEq, rfl⟩
    · simpa [after, selected, applyInternalTimerTaskPatch, applyInternalArmingPatch,
        makeInternalTimerTaskPatch, wait, insertUserTaskWait_eq_canonicalInsertBy] using afterTasksEq
    · change (after.timerWaits.filter fun current =>
        !flowNodeOccurrenceBoundaryTimerBound program after current).mapM
          (fun current => waitStart? program after current.owner current.elementId current.activation) = some timers
      rw [timersFrame]
      exact timersEq
  · simpa using taskPerm.append (List.Perm.refl (messages ++ (timers ++ (effects ++ incidents))))

theorem prepared_timer_task_preserves_messageBoundedProjectionValid
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (valid : messageBoundedProjectionValid program state = true)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    messageBoundedProjectionValid program (applyInternalTimerTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, unique, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  have declarers : userTaskWaitDeclarers program contract.task.id = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using unique
  let selected := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  unfold messageBoundedProjectionValid at valid ⊢
  simp only [List.all_eq_true] at valid ⊢
  intro candidate member
  have prior := valid candidate member
  cases candidate <;> try exact prior
  rename_i candidateId candidateOrigin candidateInput boundedTask boundaryMessage
  let boundedOperation := SemanticOperation.awaitMessageBoundedUserTask candidateId
    candidateOrigin candidateInput boundedTask boundaryMessage
  have different : contract.task.id ≠ boundedTask.id := by
    intro same
    have boundedMember : boundedOperation ∈ userTaskWaitDeclarers program contract.task.id := by
      simp [boundedOperation, userTaskWaitDeclarers, member, same]
    rw [declarers] at boundedMember
    cases kind : contract.kind <;>
      simp [boundedOperation, InternalTimerTaskContract.operation, kind] at boundedMember
  have valuesDifferent : contract.task.id.value ≠ boundedTask.id.value :=
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
  have recordsFrame : (insertActivityOccurrence selected.record state.activityOccurrences).filter
      recordFilter = state.activityOccurrences.filter recordFilter := by
    rw [BpmnSemantics.SemanticProcess.insertActivityOccurrence_eq_canonicalInsertBy]
    apply filter_canonicalInsertBy_rejected
    simp [recordFilter, selected, makeInternalTimerTaskPatch, valuesDifferent]
  simp only [selected, makeInternalTimerTaskPatch] at recordsFrame
  simpa [boundedOperation, messageBoundedOperationProjectionValid,
    applyInternalTimerTaskPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch,
    owned, taskFilter, recordFilter, wait, selected, tasksFrame, recordsFrame] using prior

theorem prepared_timer_task_preserves_runtime_and_open_projection_exact
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch) (expectedInstanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program expectedInstanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    ∃ current newStart next,
      projectOpenFlowNodeOccurrences? program state = some current ∧
      waitStart? program state patch.arm.owner patch.arm.write.elementId
        patch.arm.write.occurrence.activation = some newStart ∧
      projectOpenFlowNodeOccurrences? program (applyInternalTimerTaskPatch state patch) = some next ∧
      next = sortFlowNodeOccurrenceStarts (newStart :: current) ∧
      runtimeStateWellFormed program expectedInstanceId (applyInternalTimerTaskPatch state patch) = true := by
  have wellAfter := prepared_timer_task_preserves_runtime program state contract patch
    expectedInstanceId prepared stateValid
  have records : activityRecordsOwnLiveWork state = true := by
    have parts := stateValid
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at parts
    simp_all only
  obtain ⟨_, owner, instanceId, inputOrigin, definitionProcessId, _, runningInstance,
    _, live, _, _, _, _, absent, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let patch := makeInternalTimerTaskPatch program state contract owner instanceId definitionProcessId inputOrigin
  let after := applyInternalTimerTaskPatch state patch
  have running : state.control = .running instanceId := by
    cases control : state.control <;> simp_all [runningInstance?]
  cases projected : projectOpenFlowNodeOccurrences? program state with
  | none => simp [projected] at openBefore
  | some current =>
      have validities := projectOpenFlowNodeOccurrences_validities program state current
        instanceId running projected
      have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
        have parts := validities.1
        simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
        exact parts.1.1.1
      have processSome := processIdForOwner_isSome_of_open_projection program state owner
        current instanceId running structural validities.2.1 live projected
      cases processEq : processIdForOwner? program state owner with
      | none => simp [processEq] at processSome
      | some processId =>
          cases started : waitStart? program state patch.arm.owner patch.arm.write.elementId
              patch.arm.write.occurrence.activation with
          | none => simp [waitStart?, patch, makeInternalTimerTaskPatch, processEq] at started
          | some newStart =>
              have waitInsertion := prepared_timer_task_projectWaits_insert program state contract
                patch prepared records newStart started
              have freshWaits := absent_wait_anchor_projectWaits_fresh program state
                patch.arm.owner patch.arm.write.elementId patch.arm.write.occurrence.activation
                absent validities.1 newStart started
              have scopesFrame :
                  (after.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
                    (scopeStart? program after) =
                  (state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
                    (scopeStart? program state) := by
                apply mapM_eq_of_pointwise
                intro occurrence
                exact timerTaskScopeStart_frame program state patch occurrence
              have callsFrame : after.calledProcessOccurrences.mapM (callStart? program after) =
                  state.calledProcessOccurrences.mapM (callStart? program state) := by
                apply mapM_eq_of_pointwise
                intro record
                exact timerTaskCallStart_frame program state patch record
              have occurrencesAfter := prepared_timer_task_preserves_occurrence_program_validity
                program state contract patch prepared programValid validities.1 records
              have callsAfter : calledProcessAssociationsValid after = true := by
                rw [calledProcessAssociationsValid_frame state after rfl rfl rfl]
                exact validities.2.1
              have associations := runtimeStateWellFormed_associationValidities program
                expectedInstanceId after wellAfter
              have messagePairsAfter := prepared_timer_task_preserves_messageBoundedProjectionValid
                program state contract patch validities.2.2.2.2 prepared
              have newAnchor : ∃ occurrence, newStart.anchor = .wait occurrence :=
                ⟨_, waitStart_anchor_of_eq program state _ _ _ newStart started⟩
              obtain ⟨next, afterProjected, nextEq⟩ := one_wait_insert_open_projection_exact
                program state after newStart current running running projected waitInsertion
                scopesFrame callsFrame newAnchor freshWaits programValid occurrencesAfter
                associations.1 callsAfter associations.2 messagePairsAfter
              exact ⟨current, newStart, next, rfl, rfl, afterProjected, nextEq, wellAfter⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
