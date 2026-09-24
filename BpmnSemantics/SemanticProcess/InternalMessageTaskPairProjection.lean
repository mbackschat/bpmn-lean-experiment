import BpmnSemantics.SemanticProcess.InternalMessageTaskProjection

/-! Message-host publication requires exact Task/Message/Activity pairing in both states.
ESL-OWN-01 preparation's fresh anchors and tagged associations keep the inserted triple separate. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem prepared_message_task_pair_separate
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch) (wait : UserTaskWait)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (written : patch.arm.write = .userTask wait) :
    (∀ old ∈ state.activityOccurrences, ∀ message,
      messageBoundedProjectionPairMatches program contract.operation old wait message = false) ∧
    (∀ old ∈ state.waits, ∀ message,
      messageBoundedProjectionPairMatches program contract.operation patch.record old message = false) ∧
    (∀ old ∈ state.activityOccurrences, ∀ task,
      messageBoundedProjectionPairMatches program contract.operation old task patch.message = false) ∧
    (∀ old ∈ state.messageWaits, ∀ task,
      messageBoundedProjectionPairMatches program contract.operation patch.record task old = false) := by
  have bodyFresh := prepared_message_task_old_records_reject_new_task program state contract patch prepared wait written
  have messageFresh := prepared_message_task_message_keys_fresh program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, taskAbsent, _, disjoint, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let patch := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  have taskFresh := armingPatch_key_fresh_of_anchor_absent state patch.arm taskAbsent
  simp only [makeInternalMessageTaskPatch, InternalArmingWrite.userTask.injEq] at written
  subst wait
  refine ⟨?_, ?_, ?_, ?_⟩
  · intro old member message
    apply Bool.eq_false_iff.mpr
    intro matched
    have identities := messageBoundedProjectionPairMatches_identities program _ old _ message matched
    have names : recordBodyNamesWait
        { processInstanceId := instanceId, owner
          task := { id := contract.task.id, name := contract.task.name }
          activation := activationCount state contract.task.id + 1
          output := contract.task.output } old = true := by
      simp [recordBodyNamesWait, activityBodyTask?, identities.1, taskIdNamesWait]
    rw [bodyFresh old member] at names
    contradiction
  · intro old member message
    apply Bool.eq_false_iff.mpr
    intro matched
    have body := (messageBoundedProjectionPairMatches_identities program _ patch.record old message matched).1
    have identity : userTaskWaitOccurrence old = patch.arm.write.occurrence := by
      exact (ActivityBody.userTask.inj body).symm
    have keys : userTaskWaitKeyMatches
        { processInstanceId := instanceId, owner
          task := { id := contract.task.id, name := contract.task.name }
          activation := activationCount state contract.task.id + 1
          output := contract.task.output } old = true := by
      have process := congrArg OccurrenceId.processInstanceId identity
      have element := congrArg (fun id => id.elementId.value) identity
      have activation := congrArg OccurrenceId.activation identity
      change old.processInstanceId = instanceId at process
      change old.activation = activationCount state contract.task.id + 1 at activation
      have taskId : old.task.id = contract.task.id := taskDefinitionId_eq_of_value_eq _ _ element
      simp [userTaskWaitKeyMatches, taskId, process, activation]
    rw [(taskFresh old member).1] at keys
    contradiction
  · intro old member task
    apply Bool.eq_false_iff.mpr
    intro matched
    have handlers := (messageBoundedProjectionPairMatches_identities program _ old task patch.message matched).2
    have conflict : regionalActivityAssociationsConflict old patch.record = true := by
      simp [regionalActivityAssociationsConflict, handlers, patch, makeInternalMessageTaskPatch]
    exact (List.any_eq_false.mp disjoint old member) conflict
  · intro old member task
    apply Bool.eq_false_iff.mpr
    intro matched
    have handlers := (messageBoundedProjectionPairMatches_identities program _ patch.record task old matched).2
    have identity : messageWaitOccurrence old = messageWaitOccurrence patch.message := by
      have same : [ActivityHandler.message (messageWaitOccurrence patch.message)] =
          [ActivityHandler.message (messageWaitOccurrence old)] := handlers
      simpa using same.symm
    have keys : messageWaitKeyMatches patch.message old = true := by
      have process := congrArg OccurrenceId.processInstanceId identity
      have element := congrArg (fun id => id.elementId.value) identity
      have activation := congrArg OccurrenceId.activation identity
      change old.processInstanceId = patch.message.processInstanceId at process
      change old.activation = patch.message.activation at activation
      have node : old.elementId = patch.message.elementId := congrArg NodeId.mk element
      simp [messageWaitKeyMatches, node, process, activation]
    rw [(messageFresh old member).1] at keys
    contradiction

private theorem message_pair_censuses_insert
    (pair : ActivityOccurrence → UserTaskWait → MessageWait → Bool)
    (records : List ActivityOccurrence) (tasks : List UserTaskWait) (messages : List MessageWait)
    (record : ActivityOccurrence) (task : UserTaskWait) (message : MessageWait)
    (matched : pair record task message = true)
    (oldRecordTask : ∀ old ∈ records, ∀ message, pair old task message = false)
    (newRecordTask : ∀ old ∈ tasks, ∀ message, pair record old message = false)
    (oldRecordMessage : ∀ old ∈ records, ∀ task, pair old task message = false)
    (newRecordMessage : ∀ old ∈ messages, ∀ task, pair record task old = false)
    (taskCensus : ∀ task ∈ tasks,
      (records.filter fun record => decide ((messages.filter (pair record task)).length = 1)).length = 1)
    (messageCensus : ∀ message ∈ messages,
      (records.filter fun record => decide ((tasks.filter fun task => pair record task message).length = 1)).length = 1)
    (recordCensus : ∀ record ∈ records,
      (tasks.filter fun task => decide ((messages.filter (pair record task)).length = 1)).length = 1) :
    (∀ current ∈ task :: tasks,
      ((record :: records).filter fun record => decide (((message :: messages).filter (pair record current)).length = 1)).length = 1) ∧
    (∀ current ∈ message :: messages,
      ((record :: records).filter fun record => decide (((task :: tasks).filter fun task => pair record task current).length = 1)).length = 1) ∧
    (∀ current ∈ record :: records,
      ((task :: tasks).filter fun task => decide (((message :: messages).filter (pair current task)).length = 1)).length = 1) := by
  have newPairMessages : (message :: messages).filter (pair record task) = [message] := by
    rw [List.filter_cons_of_pos matched]
    have empty : messages.filter (pair record task) = [] :=
      List.filter_eq_nil_iff.mpr fun old member => by simp [newRecordMessage old member task]
    rw [empty]
  have newPairTasks : (task :: tasks).filter (fun task => pair record task message) = [task] := by
    rw [List.filter_cons_of_pos (p := fun current => pair record current message) matched]
    have empty : tasks.filter (fun task => pair record task message) = [] :=
      List.filter_eq_nil_iff.mpr fun old member => by simp [newRecordTask old member message]
    rw [empty]
  have oldRecordNewTask (old : ActivityOccurrence) (member : old ∈ records) :
      (message :: messages).filter (pair old task) = [] :=
    List.filter_eq_nil_iff.mpr fun current _ => by simp [oldRecordTask old member current]
  have newRecordOldTask (old : UserTaskWait) (member : old ∈ tasks) :
      (message :: messages).filter (pair record old) = [] :=
    List.filter_eq_nil_iff.mpr fun current _ => by simp [newRecordTask old member current]
  have oldRecordNewMessage (old : ActivityOccurrence) (member : old ∈ records) :
      (task :: tasks).filter (fun task => pair old task message) = [] :=
    List.filter_eq_nil_iff.mpr fun current _ => by simp [oldRecordMessage old member current]
  have newRecordOldMessage (old : MessageWait) (member : old ∈ messages) :
      (task :: tasks).filter (fun task => pair record task old) = [] :=
    List.filter_eq_nil_iff.mpr fun current _ => by simp [newRecordMessage old member current]
  refine ⟨?_, ?_, ?_⟩
  · intro current member
    rcases List.mem_cons.mp member with same | old
    · subst current
      have empty : records.filter (fun record =>
          decide (((message :: messages).filter (pair record task)).length = 1)) = [] :=
        List.filter_eq_nil_iff.mpr fun old member => by simp [oldRecordNewTask old member]
      simp [newPairMessages, empty]
    · rw [List.filter_cons_of_neg (by simp [newRecordOldTask current old])]
      have frame : records.filter (fun record => decide (((message :: messages).filter (pair record current)).length = 1)) =
          records.filter (fun record => decide ((messages.filter (pair record current)).length = 1)) := by
        apply List.filter_congr
        intro candidate member
        simp [oldRecordMessage candidate member current]
      rw [frame]
      exact taskCensus current old
  · intro current member
    rcases List.mem_cons.mp member with same | old
    · subst current
      have empty : records.filter (fun record =>
          decide (((task :: tasks).filter (fun task => pair record task message)).length = 1)) = [] :=
        List.filter_eq_nil_iff.mpr fun old member => by simp [oldRecordNewMessage old member]
      simp [newPairTasks, empty]
    · rw [List.filter_cons_of_neg (by simp [newRecordOldMessage current old])]
      have frame : records.filter (fun record => decide (((task :: tasks).filter (fun task => pair record task current)).length = 1)) =
          records.filter (fun record => decide ((tasks.filter (fun task => pair record task current)).length = 1)) := by
        apply List.filter_congr
        intro candidate member
        simp [oldRecordTask candidate member current]
      rw [frame]
      exact messageCensus current old
  · intro current member
    rcases List.mem_cons.mp member with same | old
    · subst current
      have empty : tasks.filter (fun task =>
          decide (((message :: messages).filter (pair record task)).length = 1)) = [] :=
        List.filter_eq_nil_iff.mpr fun old member => by simp [newRecordOldTask old member]
      simp [newPairMessages, empty]
    · rw [List.filter_cons_of_neg (by simp [oldRecordNewTask current old])]
      simp only [List.filter_cons, oldRecordMessage current old, Bool.false_eq_true, ↓reduceIte]
      exact recordCensus current old


private theorem message_pair_censuses_perm
    (pair : ActivityOccurrence → UserTaskWait → MessageWait → Bool)
    (records records' : List ActivityOccurrence) (tasks tasks' : List UserTaskWait)
    (messages messages' : List MessageWait)
    (recordPerm : records.Perm records') (taskPerm : tasks.Perm tasks')
    (messagePerm : messages.Perm messages')
    (taskCensus : ∀ task ∈ tasks',
      (records'.filter fun record => decide ((messages'.filter (pair record task)).length = 1)).length = 1)
    (messageCensus : ∀ message ∈ messages',
      (records'.filter fun record => decide ((tasks'.filter fun task => pair record task message).length = 1)).length = 1)
    (recordCensus : ∀ record ∈ records',
      (tasks'.filter fun task => decide ((messages'.filter (pair record task)).length = 1)).length = 1) :
    (∀ task ∈ tasks,
      (records.filter fun record => decide ((messages.filter (pair record task)).length = 1)).length = 1) ∧
    (∀ message ∈ messages,
      (records.filter fun record => decide ((tasks.filter fun task => pair record task message).length = 1)).length = 1) ∧
    (∀ record ∈ records,
      (tasks.filter fun task => decide ((messages.filter (pair record task)).length = 1)).length = 1) := by
  have messageCounts (record : ActivityOccurrence) (task : UserTaskWait) :=
    (messagePerm.filter (pair record task)).length_eq
  have taskCounts (record : ActivityOccurrence) (message : MessageWait) :=
    (taskPerm.filter (fun task => pair record task message)).length_eq
  refine ⟨?_, ?_, ?_⟩
  · intro task member
    have frame : records.filter (fun record => decide ((messages.filter (pair record task)).length = 1)) =
        records.filter (fun record => decide ((messages'.filter (pair record task)).length = 1)) := by
      apply List.filter_congr
      intro record _
      rw [messageCounts]
    rw [frame, (recordPerm.filter _).length_eq]
    exact taskCensus task (taskPerm.mem_iff.mp member)
  · intro message member
    have frame : records.filter (fun record => decide ((tasks.filter (fun task => pair record task message)).length = 1)) =
        records.filter (fun record => decide ((tasks'.filter (fun task => pair record task message)).length = 1)) := by
      apply List.filter_congr
      intro record _
      rw [taskCounts]
    rw [frame, (recordPerm.filter _).length_eq]
    exact messageCensus message (messagePerm.mem_iff.mp member)
  · intro record member
    have frame : tasks.filter (fun task => decide ((messages.filter (pair record task)).length = 1)) =
        tasks.filter (fun task => decide ((messages'.filter (pair record task)).length = 1)) := by
      apply List.filter_congr
      intro task _
      rw [messageCounts]
    rw [frame, (taskPerm.filter _).length_eq]
    exact recordCensus record (recordPerm.mem_iff.mp member)

/-- Atomic Message-host insertion preserves the existing three-way projection census.
The selected admission certificate excludes any second boundary operation. -/
theorem prepared_message_task_preserves_message_pairing
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (aligned : patch.arm.runtimeInstanceId = patch.arm.owner.processInstanceId)
    (valid : messageBoundedProjectionValid program state = true) :
    messageBoundedProjectionValid program (applyInternalMessageTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, selected, _, _, _, taskUnique,
    _, _, _, _, _, patchEq⟩ := prepareInternalMessageTaskContract_facts program state contract patch prepared
  let task : UserTaskWait :=
    { processInstanceId := instanceId, owner, task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1, output := contract.task.output }
  have written : patch.arm.write = .userTask task := by rw [patchEq]; rfl
  have separate := prepared_message_task_pair_separate program state contract patch task prepared written
  have declarers : userTaskWaitDeclarers program contract.task.id = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using taskUnique
  have member : contract.operation ∈ program.operations :=
    (List.mem_filter.mp (show contract.operation ∈ userTaskWaitDeclarers program contract.task.id from
      by rw [declarers]; simp)).1
  have owned := FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy_of_exact_declaration
    program contract.operation owner _ declarers
    (declaredByExactlyOneOwnedOperation_of_exactSelection program contract.operation owner _ declarers selected)
  let owns := FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program contract.operation
  let keepTask := fun wait : UserTaskWait => owns wait.owner && decide (wait.task.id = contract.task.id)
  let keepMessage := fun wait : MessageWait => owns wait.owner && decide (wait.elementId = contract.message.elementId)
  let keepRecord := fun record : ActivityOccurrence => owns record.owner && decide (record.activityElementId.value = contract.task.id.value)
  let tasks := state.waits.filter keepTask
  let messages := state.messageWaits.filter keepMessage
  let records := state.activityOccurrences.filter keepRecord
  let pair := messageBoundedProjectionPairMatches program contract.operation
  have prior := List.all_eq_true.mp valid contract.operation member
  have censuses :
      (∀ task ∈ tasks, (records.filter fun record => decide ((messages.filter (pair record task)).length = 1)).length = 1) ∧
      (∀ message ∈ messages, (records.filter fun record => decide ((tasks.filter fun task => pair record task message).length = 1)).length = 1) ∧
      (∀ record ∈ records, (tasks.filter fun task => decide ((messages.filter (pair record task)).length = 1)).length = 1) := by
    cases kind : contract.kind <;>
      simpa only [messageBoundedOperationProjectionValid, InternalMessageTaskContract.operation, kind,
        tasks, messages, records, keepTask, keepMessage, keepRecord, owns, pair,
        Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq, beq_iff_eq, and_assoc] using prior
  have matched : pair patch.record task patch.message = true := by
    have aligned' : instanceId = owner.processInstanceId := by
      simpa [patchEq, makeInternalMessageTaskPatch] using aligned
    cases kind : contract.kind <;>
      simp only [InternalMessageTaskContract.operation, kind] at owned
    all_goals
      simpa [pair, messageBoundedProjectionPairMatches, InternalMessageTaskContract.operation, kind,
        patchEq, makeInternalMessageTaskPatch, task, aligned'] using owned
  have insertedCensuses := message_pair_censuses_insert pair records tasks messages patch.record task patch.message matched
    (fun old member => separate.1 old (List.mem_filter.mp member).1)
    (fun old member => separate.2.1 old (List.mem_filter.mp member).1)
    (fun old member => separate.2.2.1 old (List.mem_filter.mp member).1)
    (fun old member => separate.2.2.2 old (List.mem_filter.mp member).1)
    censuses.1 censuses.2.1 censuses.2.2
  let after := applyInternalMessageTaskPatch state patch
  have taskPerm : (after.waits.filter keepTask).Perm (task :: tasks) := by
    have kept : keepTask task = true := by simp [keepTask, task, owns, owned]
    simpa [after, applyInternalMessageTaskPatch, applyInternalArmingPatch, written,
      insertUserTaskWait_eq_canonicalInsertBy, tasks] using
      filter_canonicalInsertBy_perm userTaskWaitBefore keepTask task state.waits kept
  have messagePerm : (after.messageWaits.filter keepMessage).Perm (patch.message :: messages) := by
    apply filter_canonicalInsertBy_perm messageWaitBefore keepMessage patch.message state.messageWaits
    simp [keepMessage, patchEq, makeInternalMessageTaskPatch, owns, owned]
  have recordPerm : (after.activityOccurrences.filter keepRecord).Perm (patch.record :: records) := by
    change ((insertActivityOccurrence patch.record state.activityOccurrences).filter keepRecord).Perm _
    rw [insertActivityOccurrence_eq_canonicalInsertBy]
    apply filter_canonicalInsertBy_perm activityOccurrenceBefore keepRecord patch.record state.activityOccurrences
    simp [keepRecord, patchEq, makeInternalMessageTaskPatch, owns, owned]
  have afterCensuses := message_pair_censuses_perm pair _ _ _ _ _ _ recordPerm taskPerm messagePerm
    insertedCensuses.1 insertedCensuses.2.1 insertedCensuses.2.2
  have selectedValid : messageBoundedOperationProjectionValid program after contract.operation = true := by
    cases kind : contract.kind <;>
      simpa only [messageBoundedOperationProjectionValid, InternalMessageTaskContract.operation, kind,
        keepTask, keepMessage, keepRecord, owns, pair, Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq, beq_iff_eq, and_assoc] using afterCensuses
  apply List.all_eq_true.mpr
  intro operation operationMember
  have boundary : repeatableSubscriptionBoundaryOperation contract.operation = true := by
    cases kind : contract.kind <;> simp [InternalMessageTaskContract.operation, kind, repeatableSubscriptionBoundaryOperation]
  have same (otherBoundary : repeatableSubscriptionBoundaryOperation operation = true) :=
    repeatableSubscriptionProgramGraph_boundary_unique program admitted operation contract.operation
      operationMember member otherBoundary boundary
  cases operation <;> try rfl
  all_goals
    have equality := same rfl
    simpa only [equality] using selectedValid

end BpmnSemantics.SemanticProcess.InternalCommutation
