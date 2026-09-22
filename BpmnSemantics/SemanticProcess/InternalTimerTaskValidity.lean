import BpmnSemantics.SemanticProcess.InternalTimerTaskPreparation
import BpmnSemantics.SemanticProcess.InternalCommutationActivityOwnership

/-! Timer-task validity derives the inserted task's declaration from complete predecessor
preparation; the shared User Task insertion law keeps the family census in its existing owner.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_timer_task_timer_keys_fresh
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    ∀ old ∈ state.timerWaits,
      timerWaitKeyMatches patch.timer old = false ∧ timerWaitKeyMatches old patch.timer = false := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, absent, _, _⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  exact armingPatch_key_fresh_of_anchor_absent state
    { patch.arm with write := .timer patch.timer } absent

theorem prepared_timer_task_preserves_userTask_program_validity
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (prior : flowNodeOccurrenceUserTaskProgramValidity program state = true)
    (ownerProcess : !patch.arm.owner.processInstanceId.value.isEmpty = true)
    (taskId : !contract.task.id.value.isEmpty = true) :
    flowNodeOccurrenceUserTaskProgramValidity program
      (applyInternalTimerTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, selected, live, _, _,
    taskDeclarer, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId
      owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  have declaration : UserTaskWaitDeclaration wait contract.operation := by
    cases kind : contract.kind
    · simpa [InternalTimerTaskContract.operation, kind, wait] using
        UserTaskWaitDeclaration.bounded (wait := wait) contract.operationId contract.origin
          contract.input contract.timer rfl rfl
    · simpa [InternalTimerTaskContract.operation, kind, wait] using
        UserTaskWaitDeclaration.monitored (wait := wait) contract.operationId contract.origin
          contract.input contract.timer rfl rfl
  have declarers : userTaskWaitDeclarers program contract.task.id = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using taskDeclarer
  have declared := declaredByExactlyOneOwnedOperation_of_exactSelection program
    contract.operation owner _ declarers selected
  have ownerLive : flowNodeOccurrenceOwnerLiveUnique state owner = true := by
    simpa [flowNodeOccurrenceOwnerLiveUnique, exactLiveOccurrence] using live
  change flowNodeOccurrenceUserTaskProgramValidity program
    { state with waits := insertUserTaskWait wait state.waits } = true
  exact flowNodeOccurrenceUserTaskProgramValidity_insertUserTask program state contract.operation
    wait declaration prior declarers declared ownerLive ownerProcess taskId (by dsimp [wait]; omega) rfl

/-- Task insertion preserves existing body claims, and the atomic pair supplies the new record's
task and Timer. Neither intermediate aggregate validity nor equal task/Timer counters is assumed. -/
theorem prepared_timer_task_preserves_activity_work
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (bounds : runtimeStateIdentityBound state = true)
    (records : activityRecordsOwnLiveWork state = true)
    (attachments : attachedTimersUnambiguous state = true) :
    activityRecordsOwnLiveWork (applyInternalTimerTaskPatch state patch) = true := by
  have timerFresh := prepared_timer_task_timer_keys_fresh program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _,
    taskAbsent, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let selected := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId
      owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  let taskState : RuntimeState := { state with waits := insertUserTaskWait wait state.waits }
  let after := applyInternalTimerTaskPatch state selected
  have taskFresh : ∀ old ∈ state.waits,
      userTaskWaitKeyMatches wait old = false ∧ userTaskWaitKeyMatches old wait = false :=
    armingPatch_key_fresh_of_anchor_absent state selected.arm taskAbsent
  have taskRecords := activityRecords_insertUserTaskWait state wait rfl bounds records
  have timerRecords := (activityRecords_insertFreshTimerWait taskState selected.timer
    timerFresh taskRecords attachments).1
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
      simp only [activityTaskBodyOwnersAgree, selected, makeInternalTimerTaskPatch,
        List.all_eq_true, decide_eq_true_eq]
      intro candidate matching
      obtain ⟨present, names⟩ := List.mem_filter.mp matching
      change candidate ∈ insertUserTaskWait wait state.waits at present
      rw [insertUserTaskWait_eq_canonicalInsertBy, mem_canonicalInsertBy] at present
      rcases present with same | old
      · subst candidate; rfl
      · have keyed : userTaskWaitKeyMatches wait candidate = true := by
          simpa [taskIdNamesWait, userTaskWaitKeyMatches, wait,
            taskEquality] using names
        rw [(taskFresh candidate old).1] at keyed
        contradiction
    refine ⟨⟨⟨?_, owners⟩, ?_⟩, ?_⟩
    · simp only [activityBodyLive, selected, makeInternalTimerTaskPatch, decide_eq_true_eq]
      change ((insertUserTaskWait wait state.waits).filter fun candidate =>
        decide (candidate.processInstanceId = owner.processInstanceId) &&
          decide (candidate.task.id.value = contract.task.id.value) &&
          decide (candidate.activation = activationCount state contract.task.id + 1)).length = 1
      have keyFrame : userTaskWaitKeyMatches wait = (fun candidate =>
          decide (candidate.processInstanceId = owner.processInstanceId) &&
            decide (candidate.task.id.value = contract.task.id.value) &&
            decide (candidate.activation = activationCount state contract.task.id + 1)) := by
        funext candidate
        simp [userTaskWaitKeyMatches, wait, taskEquality, eq_comm]
      rw [← keyFrame]
      exact selectedCount
    · simp only [selected, makeInternalTimerTaskPatch, ActivityOccurrence.timerHandlerOccurrences,
        List.filterMap_cons, List.filterMap_nil, List.mem_singleton]
      intro timer same
      subst timer
      apply List.any_eq_true.mpr
      refine ⟨selected.timer, ?_, ?_⟩
      · change selected.timer ∈ insertTimerWait selected.timer state.timerWaits
        exact (mem_canonicalInsertBy _ _ _ _).mpr (Or.inl rfl)
      · simp [selected, makeInternalTimerTaskPatch, timerIdNamesWait]
    · simp [selected, makeInternalTimerTaskPatch, ActivityOccurrence.messageHandlerOccurrences]
  · have prior := List.all_eq_true.mp timerRecords candidate old
    simpa [after, selected, taskState, wait, applyInternalTimerTaskPatch, makeInternalTimerTaskPatch,
      applyInternalArmingPatch, activityBodyLive, activityTaskBodyOwnersAgree, exactLiveOccurrence]
      using prior

/-- The fresh Timer was unclaimed in the predecessor; the new record cannot claim any older Timer. -/
theorem prepared_timer_task_preserves_timer_attachments
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (records : activityRecordsOwnLiveWork state = true)
    (attachments : attachedTimersUnambiguous state = true) :
    attachedTimersUnambiguous (applyInternalTimerTaskPatch state patch) = true := by
  have timerFresh := prepared_timer_task_timer_keys_fresh program state contract patch prepared
  have unclaimed := activityRecords_do_not_claim_fresh_timer state patch.timer
    (fun old member => (timerFresh old member).1) records
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let selected := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  have nodeEquality (left right : NodeId) : left = right ↔ left.value = right.value := by
    cases left; cases right; simp
  change (insertTimerWait selected.timer state.timerWaits).all (fun timer =>
    decide (((insertActivityOccurrence selected.record state.activityOccurrences).filter
      (fun record => anyTimerIdNamesWait record.timerHandlerOccurrences timer)).length ≤ 1)) = true
  simp only [insertTimerWait, all_canonicalInsertBy, Bool.and_eq_true, List.all_eq_true,
    decide_eq_true_eq]
  constructor
  · rw [insertActivityOccurrence_eq_canonicalInsertBy, length_filter_canonicalInsertBy]
    have empty : state.activityOccurrences.filter
        (fun record => anyTimerIdNamesWait record.timerHandlerOccurrences selected.timer) = [] :=
      List.filter_eq_nil_iff.mpr fun record member => by
        change ¬ anyTimerIdNamesWait record.timerHandlerOccurrences
          (makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin).timer = true
        rw [unclaimed record member]
        simp
    rw [empty]
    simp [selected, makeInternalTimerTaskPatch, anyTimerIdNamesWait,
      ActivityOccurrence.timerHandlerOccurrences, timerIdNamesWait]
  · intro timer member
    have prior := List.all_eq_true.mp attachments timer member
    rw [insertActivityOccurrence_eq_canonicalInsertBy, length_filter_canonicalInsertBy]
    have rejected : anyTimerIdNamesWait selected.record.timerHandlerOccurrences timer = false := by
      simpa [selected, makeInternalTimerTaskPatch, anyTimerIdNamesWait,
        ActivityOccurrence.timerHandlerOccurrences, timerIdNamesWait, timerWaitKeyMatches,
        nodeEquality] using (timerFresh timer member).1
    simpa [rejected] using prior

private theorem boundaryTimerOperationMatches_insert_disjoint_task_record
    (program : Program) (state : RuntimeState) (wait : UserTaskWait)
    (record : ActivityOccurrence) (timer : TimerWait) (operation : SemanticOperation)
    (bodyFresh : ∀ old ∈ state.activityOccurrences, recordBodyNamesWait wait old = false)
    (unattached : recordAttaches record (timerWaitOccurrence timer) = false) :
    FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches program
      { state with
        waits := insertUserTaskWait wait state.waits
        activityOccurrences := insertActivityOccurrence record state.activityOccurrences }
      timer operation =
    FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches program state
      timer operation := by
  have taskFrame (task : BoundedTaskArm) :
      (state.activityOccurrences.filter fun old =>
        old.owner = timer.owner && recordAttaches old (timerWaitOccurrence timer) &&
          ((insertUserTaskWait wait state.waits).filter fun host =>
            decide (host.owner = timer.owner && host.task.id = task.id) &&
              recordBodyNamesWait host old).length = 1) =
      (state.activityOccurrences.filter fun old =>
        old.owner = timer.owner && recordAttaches old (timerWaitOccurrence timer) &&
          (state.waits.filter fun host =>
            decide (host.owner = timer.owner && host.task.id = task.id) &&
              recordBodyNamesWait host old).length = 1) := by
    apply List.filter_congr
    intro old member
    rw [insertUserTaskWait_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ (by simp [bodyFresh old member])]
  cases operation <;> try rfl
  all_goals
    simp only [FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches]
    rw [insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _
        (by change (_ && recordAttaches record (timerWaitOccurrence timer) && _) = false
            simp only [unattached, Bool.and_false, Bool.false_and])]
  all_goals first | rfl | (rw (config := { transparency := .default }) [taskFrame]; rfl)

theorem prepared_timer_task_old_records_reject_new_task
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (wait : UserTaskWait) (written : patch.arm.write = .userTask wait) :
    ∀ old ∈ state.activityOccurrences, recordBodyNamesWait wait old = false := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, disjoint, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  simp only [makeInternalTimerTaskPatch, InternalArmingWrite.userTask.injEq] at written
  subst wait
  intro old member
  apply Bool.eq_false_iff.mpr
  intro names
  cases body : old.body <;> simp [recordBodyNamesWait, activityBodyTask?, body] at names
  rename_i task
  have same := taskIdNamesWait_injective names (by
    simp [taskIdNamesWait] : taskIdNamesWait
      { processInstanceId := owner.processInstanceId
        elementId := ⟨contract.task.id.value⟩
        activation := activationCount state contract.task.id + 1 }
      { processInstanceId := owner.processInstanceId, owner
        task := { id := contract.task.id, name := contract.task.name }
        activation := activationCount state contract.task.id + 1
        output := contract.task.output } = true)
  have conflict : regionalActivityAssociationsConflict old
      (makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin).record = true := by
    simp [regionalActivityAssociationsConflict, body, same, makeInternalTimerTaskPatch,
      regionalActivityBodyTasks]
  have present : state.activityOccurrences.any (regionalActivityAssociationsConflict ·
      (makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin).record) = true :=
    List.any_eq_true.mpr ⟨old, member, conflict⟩
  rw [disjoint] at present
  contradiction

theorem prepared_timer_task_preserves_existing_timer_match
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (timer : TimerWait) (member : timer ∈ state.timerWaits) (operation : SemanticOperation) :
    FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches program
        (applyInternalTimerTaskPatch state patch) timer operation =
      FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches program state timer operation := by
  have fresh := (prepared_timer_task_timer_keys_fresh program state contract patch prepared timer member).1
  have bodies := prepared_timer_task_old_records_reject_new_task program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let selected := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  have unattached : recordAttaches selected.record (timerWaitOccurrence timer) = false := by
    apply Bool.eq_false_iff.mpr
    intro matched
    simp only [recordAttaches, selected, makeInternalTimerTaskPatch,
      ActivityOccurrence.timerHandlerOccurrences, List.filterMap_cons, List.filterMap_nil,
      List.contains_cons, List.contains_nil, Bool.or_false, beq_iff_eq] at matched
    have process := congrArg OccurrenceId.processInstanceId matched
    have element := congrArg (fun id : OccurrenceId => id.elementId.value) matched
    have activation := congrArg OccurrenceId.activation matched
    have keyed : timerWaitKeyMatches selected.timer timer = true := by
      have node : contract.timer.elementId = timer.elementId := by
        cases h : contract.timer.elementId
        cases k : timer.elementId
        simp_all [timerWaitOccurrence]
      simp_all [timerWaitKeyMatches, timerWaitOccurrence, selected, makeInternalTimerTaskPatch]
    rw [fresh] at keyed
    contradiction
  exact boundaryTimerOperationMatches_insert_disjoint_task_record program state wait selected.record
    timer operation (bodies wait rfl) unattached

theorem prepared_timer_task_preserves_existing_timer_binding
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (timer : TimerWait) (member : timer ∈ state.timerWaits) :
    flowNodeOccurrenceBoundaryTimerBound program (applyInternalTimerTaskPatch state patch) timer =
      flowNodeOccurrenceBoundaryTimerBound program state timer := by
  unfold flowNodeOccurrenceBoundaryTimerBound
  congr 3
  apply List.filter_congr
  intro operation _
  exact prepared_timer_task_preserves_existing_timer_match program state contract patch prepared
    timer member operation

private theorem recordAttaches_timer_eq_names (record : ActivityOccurrence) (timer : TimerWait) :
    recordAttaches record (timerWaitOccurrence timer) =
      anyTimerIdNamesWait record.timerHandlerOccurrences timer := by
  simp only [recordAttaches, List.contains_eq_any_beq, anyTimerIdNamesWait]
  congr 1
  funext id
  apply Bool.eq_iff_iff.mpr
  simp only [beq_iff_eq, timerIdNamesWait, Bool.and_eq_true]
  cases id with
  | mk process element activation =>
    cases element
    simp [timerWaitOccurrence, eq_comm, and_assoc, and_left_comm]

theorem prepared_timer_task_new_timer_binding
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (records : activityRecordsOwnLiveWork state = true) :
    flowNodeOccurrenceBoundaryTimerBound program (applyInternalTimerTaskPatch state patch)
      patch.timer = true := by
  have timerFresh := prepared_timer_task_timer_keys_fresh program state contract patch prepared
  have unclaimed := activityRecords_do_not_claim_fresh_timer state patch.timer
    (fun old member => (timerFresh old member).1) records
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, selectedOperation, _, _, _,
    _, timerDeclarer, taskAbsent, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let selected := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  have taskFresh := armingPatch_key_fresh_of_anchor_absent state selected.arm taskAbsent
  have taskCount : ((insertUserTaskWait wait state.waits).filter fun host =>
      decide (host.owner = owner && host.task.id = contract.task.id) &&
        recordBodyNamesWait host selected.record).length = 1 := by
    rw [length_filter_insertUserTaskWait]
    have empty : (state.waits.filter fun host =>
        decide (host.owner = owner && host.task.id = contract.task.id) &&
          recordBodyNamesWait host selected.record) = [] := by
      apply List.filter_eq_nil_iff.mpr
      intro old member matching
      simp only [Bool.and_eq_true, decide_eq_true_eq] at matching
      have named := matching.2
      simp only [recordBodyNamesWait, activityBodyTask?, selected, makeInternalTimerTaskPatch,
        taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at named
      have keyed : userTaskWaitKeyMatches wait old = true := by
        simp [userTaskWaitKeyMatches, wait, matching.1, named]
      have absent := (taskFresh old member).1
      change userTaskWaitKeyMatches wait old = false at absent
      rw [absent] at keyed
      contradiction
    rw [empty]
    simp [recordBodyNamesWait, activityBodyTask?, selected, makeInternalTimerTaskPatch,
      taskIdNamesWait, wait]
  have owned := FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy_of_exact_declaration
    program contract.operation owner _ (by simpa [uniqueFamilyDeclarer?] using timerDeclarer)
    (declaredByExactlyOneOwnedOperation_of_exactSelection program contract.operation owner _
      (by simpa [uniqueFamilyDeclarer?] using timerDeclarer) selectedOperation)
  have oldRejected (old : ActivityOccurrence) (member : old ∈ state.activityOccurrences) :
      recordAttaches old (timerWaitOccurrence selected.timer) = false := by
    rw [recordAttaches_timer_eq_names]
    exact unclaimed old member
  have matched : FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches program
      (applyInternalTimerTaskPatch state selected) selected.timer contract.operation = true := by
    have ownerEq : selected.timer.owner = owner := rfl
    cases kind : contract.kind <;>
      simp only [InternalTimerTaskContract.operation, kind] at owned ⊢
    all_goals
      simp only [FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches, ownerEq, owned,
        Bool.not_true, Bool.false_eq_true, ↓reduceIte]
      change (_ && _ && decide (((insertActivityOccurrence selected.record state.activityOccurrences).filter
        (fun record => record.owner = owner && recordAttaches record (timerWaitOccurrence selected.timer) &&
          ((insertUserTaskWait wait state.waits).filter fun host =>
            decide (host.owner = owner && host.task.id = contract.task.id) &&
              recordBodyNamesWait host record).length = 1)).length = 1)) = true
      rw [insertActivityOccurrence_eq_canonicalInsertBy, length_filter_canonicalInsertBy]
      have empty : (state.activityOccurrences.filter (fun record =>
          record.owner = owner && recordAttaches record (timerWaitOccurrence selected.timer) &&
            ((insertUserTaskWait wait state.waits).filter fun host =>
              decide (host.owner = owner && host.task.id = contract.task.id) &&
                recordBodyNamesWait host record).length = 1)) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro old member
        simp only [oldRejected old member, Bool.and_false, Bool.false_and, Bool.false_eq_true, not_false_eq_true]
      rw [empty, taskCount]
      simp [recordAttaches, selected, makeInternalTimerTaskPatch,
        ActivityOccurrence.timerHandlerOccurrences, timerWaitOccurrence]
  have declarers : timerWaitDeclarers program selected.timer.elementId = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?, selected, makeInternalTimerTaskPatch] using timerDeclarer
  unfold flowNodeOccurrenceBoundaryTimerBound
  have exactFilter : program.operations.filter
      (FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches program
        (applyInternalTimerTaskPatch state selected) selected.timer) =
      timerWaitDeclarers program selected.timer.elementId := by
    unfold timerWaitDeclarers
    apply List.filter_congr
    intro operation member
    by_cases same : operation = contract.operation
    · subst operation
      have declared : contract.operation ∈ timerWaitDeclarers program selected.timer.elementId := by
        rw [declarers]; simp
      rw [matched]
      exact (List.mem_filter.mp declared).2.symm
    · have absent : operation ∉ timerWaitDeclarers program selected.timer.elementId := by
        rw [declarers]; simp [same]
      cases operation <;> simp [timerWaitDeclarers, member] at absent
      all_goals simp [FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches, absent]
  change decide ((program.operations.filter
      (FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches program
        (applyInternalTimerTaskPatch state selected) selected.timer)).length = 1) = true
  rw [exactFilter, declarers]
  rfl

theorem prepared_timer_task_preserves_wait_program_validity
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (records : activityRecordsOwnLiveWork state = true)
    (ownerProcess : !patch.arm.owner.processInstanceId.value.isEmpty = true)
    (taskId : !contract.task.id.value.isEmpty = true)
    (timerId : !contract.timer.elementId.value.isEmpty = true) :
    flowNodeOccurrenceWaitProgramValidity program (applyInternalTimerTaskPatch state patch) = true := by
  have newBound := prepared_timer_task_new_timer_binding program state contract patch prepared records
  have timerFrame := prepared_timer_task_preserves_existing_timer_match program state contract patch prepared
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior ⊢
  have users := prepared_timer_task_preserves_userTask_program_validity program state contract patch
    prepared prior.1.1.1 ownerProcess taskId
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, live, _, _, _,
    timerDeclarer, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let selected := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  let after := applyInternalTimerTaskPatch state selected
  have processNonempty : owner.processInstanceId.value.isEmpty = false := by
    simpa [makeInternalTimerTaskPatch] using ownerProcess
  have timerNonempty : contract.timer.elementId.value.isEmpty = false := by
    simpa using timerId
  refine ⟨⟨⟨users, ?_⟩, ?_⟩, ?_⟩
  · exact prior.1.1.2
  · change (insertTimerWait selected.timer state.timerWaits).all _ = true
    rw [insertTimerWait, all_canonicalInsertBy]
    apply Bool.and_eq_true_iff.mpr
    constructor
    · change (FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid after
        selected.timer.processInstanceId selected.timer.owner selected.timer.elementId
        selected.timer.activation && _) = true
      apply Bool.and_eq_true_iff.mpr
      constructor
      · simpa [FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid,
          flowNodeOccurrenceOwnerLiveUnique, exactLiveOccurrence, selected,
          makeInternalTimerTaskPatch, after, applyInternalTimerTaskPatch, applyInternalArmingPatch,
          processNonempty, timerNonempty] using live
      · unfold flowNodeOccurrenceBoundaryTimerBound at newBound
        refine Eq.trans ?_ newBound
        congr 3
        apply List.filter_congr
        intro operation member
        have declarers : timerWaitDeclarers program selected.timer.elementId = [contract.operation] := by
          simpa [uniqueFamilyDeclarer?, selected, makeInternalTimerTaskPatch] using timerDeclarer
        have only : operation ∈ timerWaitDeclarers program selected.timer.elementId ↔
            operation = contract.operation := by rw [declarers]; simp
        cases operation <;> try rfl
        case awaitTimer id origin input output timer =>
          have different : timer.elementId ≠ selected.timer.elementId := by
            intro equal
            have same := only.mp (by simp [timerWaitDeclarers, member, equal])
            cases kind : contract.kind <;> simp [InternalTimerTaskContract.operation, kind] at same
          simp [FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches, different]
        case awaitEventRace id origin input message timer =>
          have different : timer.elementId ≠ selected.timer.elementId := by
            intro equal
            have same := only.mp (by simp [timerWaitDeclarers, member, equal])
            cases kind : contract.kind <;> simp [InternalTimerTaskContract.operation, kind] at same
          simp [FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches, different]
        all_goals
          simp only [FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches]
          split <;> rfl
    · apply List.all_eq_true.mpr
      intro timer member
      have valid := List.all_eq_true.mp prior.1.2 timer member
      change (FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid after
        timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true
      change (FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid state
        timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true at valid
      apply Bool.and_eq_true_iff.mpr
      obtain ⟨validOwner, validCount⟩ := Bool.and_eq_true_iff.mp valid
      refine ⟨validOwner, ?_⟩
      refine Eq.trans ?_ validCount
      congr 3
      apply List.filter_congr
      intro operation _
      cases operation <;> try rfl
      all_goals
        first
        | (simp only [timerFrame timer member]; rfl)
        | (split <;> first | rfl | exact timerFrame timer member _)
  · exact (flowNodeOccurrenceEffectProgramValidity_frame program state after rfl rfl rfl rfl).symm.trans prior.2

end BpmnSemantics.SemanticProcess.InternalCommutation
