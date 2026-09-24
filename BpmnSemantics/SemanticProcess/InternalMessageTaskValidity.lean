import BpmnSemantics.SemanticProcess.InternalMessageTaskPreparation
import BpmnSemantics.SemanticProcess.InternalTimerTaskValidity

/-! ESL-OWN-01 requires joint Task/Message/Activity preservation. The existing insertion and
association laws discharge each family without assuming an intermediate composite state is valid. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_message_task_message_keys_fresh
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    ∀ old ∈ state.messageWaits,
      messageWaitKeyMatches patch.message old = false ∧ messageWaitKeyMatches old patch.message = false := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, absent, _, _, _⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  exact armingPatch_key_fresh_of_anchor_absent state
    { patch.arm with write := .message patch.message } absent

theorem prepared_message_task_preserves_userTask_program_validity
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (prior : flowNodeOccurrenceUserTaskProgramValidity program state = true)
    (ownerProcess : !patch.arm.owner.processInstanceId.value.isEmpty = true)
    (ownerAligned : patch.arm.runtimeInstanceId = patch.arm.owner.processInstanceId)
    (taskId : !contract.task.id.value.isEmpty = true) :
    flowNodeOccurrenceUserTaskProgramValidity program
      (applyInternalMessageTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, selected, live, _, _,
    taskDeclarer, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let wait : UserTaskWait :=
    { processInstanceId := instanceId, owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  have declaration : UserTaskWaitDeclaration wait contract.operation := by
    cases kind : contract.kind
    · simpa [InternalMessageTaskContract.operation, kind, wait] using
        UserTaskWaitDeclaration.messageBounded (wait := wait) contract.operationId contract.origin
          contract.input contract.message rfl rfl
    · simpa [InternalMessageTaskContract.operation, kind, wait] using
        UserTaskWaitDeclaration.messageMonitored (wait := wait) contract.operationId contract.origin
          contract.input contract.message rfl rfl
  have declarers : userTaskWaitDeclarers program contract.task.id = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using taskDeclarer
  have declared := declaredByExactlyOneOwnedOperation_of_exactSelection program
    contract.operation owner _ declarers selected
  have ownerLive : flowNodeOccurrenceOwnerLiveUnique state owner = true := live
  change flowNodeOccurrenceUserTaskProgramValidity program
    { state with waits := insertUserTaskWait wait state.waits } = true
  have process : !wait.processInstanceId.value.isEmpty = true := by
    change instanceId = owner.processInstanceId at ownerAligned
    simpa [wait, ownerAligned, makeInternalMessageTaskPatch] using ownerProcess
  exact flowNodeOccurrenceUserTaskProgramValidity_insertUserTask program state contract.operation
    wait declaration prior declarers declared ownerLive process taskId (by dsimp [wait]; omega) ownerAligned

/-- ESL-OWN-01 arming creates the Task, subscription, and Activity atomically. Existing insertion
laws preserve older bodies; anchor freshness makes the new body's owner census exact. -/
theorem prepared_message_task_preserves_activity_work
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (bounds : runtimeStateIdentityBound state = true)
    (records : activityRecordsOwnLiveWork state = true) :
    activityRecordsOwnLiveWork (applyInternalMessageTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _,
    taskAbsent, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let selected := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  let wait : UserTaskWait :=
    { processInstanceId := instanceId, owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  let taskState : RuntimeState := { state with waits := insertUserTaskWait wait state.waits }
  let after := applyInternalMessageTaskPatch state selected
  have taskFresh : ∀ old ∈ state.waits,
      userTaskWaitKeyMatches wait old = false ∧ userTaskWaitKeyMatches old wait = false :=
    armingPatch_key_fresh_of_anchor_absent state selected.arm taskAbsent
  have taskRecords := activityRecords_insertUserTaskWait state wait rfl bounds records
  have messageRecords := activityRecords_insertMessageWait taskState selected.message taskRecords
  have taskEquality (left right : TaskDefinitionId) : left = right ↔ left.value = right.value :=
    ⟨congrArg TaskDefinitionId.value, taskDefinitionId_eq_of_value_eq left right⟩
  have selectedCount : ((insertUserTaskWait wait state.waits).filter
      (userTaskWaitKeyMatches wait)).length = 1 := by
    rw [length_filter_insertUserTaskWait]
    have empty : state.waits.filter (userTaskWaitKeyMatches wait) = [] :=
      List.filter_eq_nil_iff.mpr fun old member => by simp [(taskFresh old member).1]
    simp [userTaskWaitKeyMatches, empty]
  change activityRecordsOwnLiveWork after = true
  simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true]
  intro candidate member
  change candidate ∈ insertActivityOccurrence selected.record state.activityOccurrences at member
  rw [insertActivityOccurrence_eq_canonicalInsertBy, mem_canonicalInsertBy] at member
  rcases member with same | old
  · subst candidate
    have owners : activityTaskBodyOwnersAgree after selected.record = true := by
      simp only [activityTaskBodyOwnersAgree, selected, makeInternalMessageTaskPatch,
        List.all_eq_true, decide_eq_true_eq]
      intro candidate matching
      obtain ⟨present, names⟩ := List.mem_filter.mp matching
      change candidate ∈ insertUserTaskWait wait state.waits at present
      rw [insertUserTaskWait_eq_canonicalInsertBy, mem_canonicalInsertBy] at present
      rcases present with same | old
      · subst candidate; rfl
      · have keyed : userTaskWaitKeyMatches wait candidate = true := by
          simpa [taskIdNamesWait, userTaskWaitKeyMatches, wait, taskEquality] using names
        rw [(taskFresh candidate old).1] at keyed
        contradiction
    refine ⟨⟨⟨?_, owners⟩, ?_⟩, ?_⟩
    · simp only [activityBodyLive, selected, makeInternalMessageTaskPatch, decide_eq_true_eq]
      change ((insertUserTaskWait wait state.waits).filter fun candidate =>
        decide (candidate.processInstanceId = instanceId) &&
          decide (candidate.task.id.value = contract.task.id.value) &&
          decide (candidate.activation = activationCount state contract.task.id + 1)).length = 1
      have keyFrame : userTaskWaitKeyMatches wait = (fun candidate =>
          decide (candidate.processInstanceId = instanceId) &&
            decide (candidate.task.id.value = contract.task.id.value) &&
            decide (candidate.activation = activationCount state contract.task.id + 1)) := by
        funext candidate
        simp [userTaskWaitKeyMatches, wait, taskEquality, eq_comm]
      rw [← keyFrame]
      exact selectedCount
    · simp [selected, makeInternalMessageTaskPatch, ActivityOccurrence.timerHandlerOccurrences]
    · simp only [selected, makeInternalMessageTaskPatch, ActivityOccurrence.messageHandlerOccurrences,
        List.filterMap_cons, List.filterMap_nil, List.mem_singleton]
      intro message same
      subst message
      apply List.any_eq_true.mpr
      refine ⟨selected.message, ?_, ?_⟩
      · change selected.message ∈ insertMessageWait selected.message state.messageWaits
        exact (mem_canonicalInsertBy _ _ _ _).mpr (Or.inl rfl)
      · simp [selected, makeInternalMessageTaskPatch, messageIdNamesWait]
  · have prior := List.all_eq_true.mp messageRecords candidate old
    simpa [after, selected, taskState, wait, applyInternalMessageTaskPatch, makeInternalMessageTaskPatch,
      applyInternalArmingPatch, activityBodyLive, activityTaskBodyOwnersAgree, exactLiveOccurrence]
      using prior

theorem prepared_message_task_old_records_reject_new_task
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (wait : UserTaskWait) (written : patch.arm.write = .userTask wait) :
    ∀ old ∈ state.activityOccurrences, recordBodyNamesWait wait old = false := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, disjoint, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  simp only [makeInternalMessageTaskPatch, InternalArmingWrite.userTask.injEq] at written
  subst wait
  intro old member
  apply Bool.eq_false_iff.mpr
  intro names
  cases body : old.body <;> simp [recordBodyNamesWait, activityBodyTask?, body] at names
  rename_i task
  have same := taskIdNamesWait_injective names (by
    simp [taskIdNamesWait] : taskIdNamesWait
      { processInstanceId := instanceId
        elementId := ⟨contract.task.id.value⟩
        activation := activationCount state contract.task.id + 1 }
      { processInstanceId := instanceId, owner
        task := { id := contract.task.id, name := contract.task.name }
        activation := activationCount state contract.task.id + 1
        output := contract.task.output } = true)
  have conflict : regionalActivityAssociationsConflict old
      (makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin).record = true := by
    simp [regionalActivityAssociationsConflict, body, same, makeInternalMessageTaskPatch,
      regionalActivityBodyTasks]
  have present : state.activityOccurrences.any (regionalActivityAssociationsConflict ·
      (makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin).record) = true :=
    List.any_eq_true.mpr ⟨old, member, conflict⟩
  rw [disjoint] at present
  contradiction

theorem prepared_message_task_preserves_existing_timer_match
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (timer : TimerWait) (operation : SemanticOperation) :
    FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches program
        (applyInternalMessageTaskPatch state patch) timer operation =
      FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches program state timer operation := by
  have bodies := prepared_message_task_old_records_reject_new_task program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let selected := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  let wait : UserTaskWait :=
    { processInstanceId := instanceId, owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  exact boundaryTimerOperationMatches_insert_disjoint_task_record program state wait selected.record
    timer operation (bodies wait rfl) (by
      simp [selected, makeInternalMessageTaskPatch, recordAttaches, ActivityOccurrence.timerHandlerOccurrences])

theorem prepared_message_task_preserves_wait_program_validity
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (ownerProcess : !patch.arm.owner.processInstanceId.value.isEmpty = true)
    (ownerAligned : patch.arm.runtimeInstanceId = patch.arm.owner.processInstanceId)
    (taskId : !contract.task.id.value.isEmpty = true)
    (messageId : !contract.message.elementId.value.isEmpty = true) :
    flowNodeOccurrenceWaitProgramValidity program (applyInternalMessageTaskPatch state patch) = true := by
  have timerFrame := prepared_message_task_preserves_existing_timer_match program state contract patch prepared
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior ⊢
  have users := prepared_message_task_preserves_userTask_program_validity program state contract patch
    prepared prior.1.1.1 ownerProcess ownerAligned taskId
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, selected, live, _, _, _,
    messageDeclarer, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let patch := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  let after := applyInternalMessageTaskPatch state patch
  change instanceId = owner.processInstanceId at ownerAligned
  have processNonempty : !instanceId.value.isEmpty = true := by
    simpa [ownerAligned, makeInternalMessageTaskPatch] using ownerProcess
  refine ⟨⟨⟨users, ?_⟩, ?_⟩, ?_⟩
  · change (insertMessageWait patch.message state.messageWaits).all _ = true
    rw [insertMessageWait, all_canonicalInsertBy]
    apply Bool.and_eq_true_iff.mpr
    refine ⟨?_, prior.1.1.2⟩
    apply boundaryMessageWait_valid program after contract.operation contract.operationId contract.origin
      contract.input contract.task contract.message patch.message
    · cases kind : contract.kind <;> simp [InternalMessageTaskContract.operation, kind]
    · simpa [uniqueFamilyDeclarer?, patch, makeInternalMessageTaskPatch] using messageDeclarer
    · exact declaredByExactlyOneOwnedOperation_of_exactSelection program contract.operation owner _
        (by simpa [uniqueFamilyDeclarer?, patch, makeInternalMessageTaskPatch] using messageDeclarer) selected
    · exact live
    · exact processNonempty
    · exact messageId
    · dsimp [patch, makeInternalMessageTaskPatch]; omega
    · exact ownerAligned
    all_goals rfl
  · apply List.all_eq_true.mpr
    intro timer member
    have valid := List.all_eq_true.mp prior.1.2 timer member
    change (FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid after
      timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true
    change (FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid state
      timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true at valid
    obtain ⟨validOwner, validCount⟩ := Bool.and_eq_true_iff.mp valid
    apply Bool.and_eq_true_iff.mpr
    refine ⟨validOwner, Eq.trans ?_ validCount⟩
    congr 3
    apply List.filter_congr
    intro operation _
    cases operation <;> try rfl
    all_goals first
      | (simp only [timerFrame timer]; rfl)
      | (split <;> first | rfl | exact timerFrame timer _)
  · exact (flowNodeOccurrenceEffectProgramValidity_frame program state after rfl rfl rfl rfl).symm.trans prior.2

end BpmnSemantics.SemanticProcess.InternalCommutation
