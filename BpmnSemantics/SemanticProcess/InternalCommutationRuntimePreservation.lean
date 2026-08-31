import BpmnSemantics.SemanticProcess.InternalCommutationStateFrames

/-! # Internal commutation runtime preservation

Proves family-specific non-interference and preservation of admitted runtime state, open occurrence projection, and exact single-arm execution for prepared internal arms.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace InternalCommutation

theorem activityRecords_insertUserTaskWait (state : RuntimeState)
    (inserted : UserTaskWait)
    (next : inserted.activation = activationCount state inserted.task.id + 1)
    (bounds : runtimeStateIdentityBound state = true)
    (records : activityRecordsOwnLiveWork state = true) :
    activityRecordsOwnLiveWork { state with waits := insertUserTaskWait inserted state.waits } = true := by
  simp only [runtimeStateIdentityBound, Bool.and_eq_true, List.all_eq_true,
    decide_eq_true_eq] at bounds
  simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true] at records ⊢
  intro record member
  have prior := records record member
  refine ⟨⟨?_, prior.1.2⟩, prior.2⟩
  · have taskBodyPreserved (body : OccurrenceId)
        (priorCount : (state.waits.filter fun wait =>
          decide (wait.processInstanceId = body.processInstanceId) &&
            decide (wait.task.id.value = body.elementId.value) &&
            decide (wait.activation = body.activation)).length = 1) :
        ((insertUserTaskWait inserted state.waits).filter fun wait =>
          decide (wait.processInstanceId = body.processInstanceId) &&
            decide (wait.task.id.value = body.elementId.value) &&
            decide (wait.activation = body.activation)).length = 1 := by
      have noMatch : (decide (inserted.processInstanceId = body.processInstanceId) &&
          decide (inserted.task.id.value = body.elementId.value) &&
          decide (inserted.activation = body.activation)) = false := by
        apply Bool.eq_false_iff.mpr
        intro matched
        simp only [Bool.and_eq_true, decide_eq_true_eq] at matched
        obtain ⟨old, oldMember⟩ := List.exists_mem_of_ne_nil _
          (List.length_pos_iff.mp (by omega : 0 < (state.waits.filter fun wait =>
            decide (wait.processInstanceId = body.processInstanceId) &&
              decide (wait.task.id.value = body.elementId.value) &&
              decide (wait.activation = body.activation)).length))
        obtain ⟨oldRaw, oldMatches⟩ := List.mem_filter.mp oldMember
        simp only [Bool.and_eq_true, decide_eq_true_eq] at oldMatches
        have oldBound := bounds.1.1 old oldRaw
        have taskEq : old.task.id = inserted.task.id := taskDefinitionId_eq_of_value_eq _ _
          (oldMatches.1.2.trans matched.1.2.symm)
        rw [taskEq, oldMatches.2.trans matched.2.symm, next] at oldBound
        omega
      rw [length_filter_insertUserTaskWait, noMatch]
      simpa using priorCount
    cases bodyEq : record.body with
    | childScope scope =>
        simp only [activityBodyLive, bodyEq]
        change exactLiveOccurrence state scope = true
        simpa [activityBodyLive, bodyEq] using prior.1.1
    | userTask body =>
        simp only [activityBodyLive, bodyEq]
        simpa only [decide_eq_true_eq] using taskBodyPreserved body (by
          simpa [activityBodyLive, bodyEq] using prior.1.1)
    | parallelUserTasks first rest =>
        simp only [activityBodyLive, bodyEq, List.all_eq_true] at prior ⊢
        intro body bodyMember
        have preserved := taskBodyPreserved body (by
          simpa only [decide_eq_true_eq] using prior.1.1 body bodyMember)
        simpa only [decide_eq_true_eq] using preserved

theorem activityRecords_insertMessageWait (state : RuntimeState) (inserted : MessageWait)
    (records : activityRecordsOwnLiveWork state = true) :
    activityRecordsOwnLiveWork
      { state with messageWaits := insertMessageWait inserted state.messageWaits } = true := by
  simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true] at records ⊢
  intro record member
  obtain ⟨bodyTimers, messages⟩ := records record member
  refine ⟨by simpa [activityBodyLive, exactLiveOccurrence] using bodyTimers, ?_⟩
  intro message attached
  simp only [List.any_eq_true] at messages ⊢
  obtain ⟨old, oldMember, named⟩ := messages message attached
  exact ⟨old, (mem_canonicalInsertBy _ _ _ _).2 (Or.inr oldMember), named⟩

theorem sole_user_task_declarer_excludes_smi (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (task : UserTaskDefinition)
    (declarer : userTaskWaitDeclarers program task.id =
      [.awaitUserTask id origin input output task]) :
    ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ candidate _ _ _ _ =>
          candidate.id ≠ task.id
      | _ => True := by
  intro operation member
  cases operation <;> try trivial
  rename_i candidateId candidateOrigin candidateInput candidate candidateData
    candidateOutput candidateTimer candidateLimits
  intro same
  have candidateMember : SemanticOperation.awaitSequentialMultiInstanceUserTask
      candidateId candidateOrigin candidateInput candidate candidateData candidateOutput
        candidateTimer candidateLimits ∈ userTaskWaitDeclarers program task.id := by
    simp [userTaskWaitDeclarers, member, same]
  rw [declarer] at candidateMember
  simp at candidateMember

theorem sole_user_task_declarer_excludes_parallel (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (task : UserTaskDefinition)
    (declarer : userTaskWaitDeclarers program task.id =
      [.awaitUserTask id origin input output task]) :
    ∀ operation ∈ program.operations,
      match operation with
      | .awaitParallelMultiInstanceUserTask _ _ _ candidateTaskId _ _ _ _ _ _ =>
          candidateTaskId ≠ task.id
      | _ => True := by
  intro operation member
  cases operation <;> try trivial
  rename_i candidateId candidateOrigin candidateInput candidateTaskId candidateName
    candidateData candidateOutput candidateTimer candidateCompletion candidateLimits
  intro same
  subst candidateTaskId
  have candidateMember : SemanticOperation.awaitParallelMultiInstanceUserTask
      candidateId candidateOrigin candidateInput task.id candidateName candidateData
        candidateOutput candidateTimer candidateCompletion candidateLimits ∈
          userTaskWaitDeclarers program task.id := by
    simp [userTaskWaitDeclarers, member]
  rw [declarer] at candidateMember
  simp at candidateMember

theorem prepared_userTask_excludes_multiInstance (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch) (inserted : UserTaskWait)
    (prepared : prepareInternalArm? program state operation = some patch)
    (writeEq : patch.write = .userTask inserted) :
    ∀ candidate ∈ program.operations,
      match candidate with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
          task.id ≠ inserted.task.id
      | .awaitParallelMultiInstanceUserTask _ _ _ taskId _ _ _ _ _ _ =>
          taskId ≠ inserted.task.id
      | _ => True := by
  have facts := prepared_arm_selection_unique program state operation patch prepared
  have patchOperationEq := prepared_operation_eq program state operation patch prepared
  rw [writeEq] at facts
  have declarer : userTaskWaitDeclarers program inserted.task.id = [operation] := by
    simpa [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
      InternalArmingWrite.elementId, patchOperationEq] using facts.2.1
  intro candidate member
  cases candidate <;> try trivial
  · rename_i id origin input task data output boundaryTimer limits
    intro same
    have candidateMember : SemanticOperation.awaitSequentialMultiInstanceUserTask id origin input
        task data output boundaryTimer limits ∈ userTaskWaitDeclarers program inserted.task.id := by
      simp [userTaskWaitDeclarers, member, same]
    rw [declarer] at candidateMember
    have candidateEq : SemanticOperation.awaitSequentialMultiInstanceUserTask id origin input task
        data output boundaryTimer limits = operation := by simpa using candidateMember
    have operationEq : operation = .awaitSequentialMultiInstanceUserTask id origin input task data
        output boundaryTimer limits := candidateEq.symm
    rw [operationEq] at prepared
    simp [prepareInternalArm?, internalArmInput?] at prepared
  · rename_i id origin input taskId taskName data output boundaryTimer completion limits
    intro same
    subst taskId
    have candidateMember : SemanticOperation.awaitParallelMultiInstanceUserTask id origin input
        inserted.task.id taskName data output boundaryTimer completion limits ∈
          userTaskWaitDeclarers program inserted.task.id := by
      simp [userTaskWaitDeclarers, member]
    rw [declarer] at candidateMember
    have candidateEq : SemanticOperation.awaitParallelMultiInstanceUserTask id origin input
        inserted.task.id taskName data output boundaryTimer completion limits = operation := by
      simpa using candidateMember
    have operationEq : operation = .awaitParallelMultiInstanceUserTask id origin input
        inserted.task.id taskName data output boundaryTimer completion limits := candidateEq.symm
    rw [operationEq] at prepared
    simp [prepareInternalArm?, internalArmInput?] at prepared

theorem activityRecords_insertFreshTimerWait (state : RuntimeState) (inserted : TimerWait)
    (fresh : ∀ old ∈ state.timerWaits,
      timerWaitKeyMatches inserted old = false ∧ timerWaitKeyMatches old inserted = false)
    (records : activityRecordsOwnLiveWork state = true)
    (attachments : attachedTimersUnambiguous state = true) :
    activityRecordsOwnLiveWork
        { state with timerWaits := insertTimerWait inserted state.timerWaits } = true ∧
      attachedTimersUnambiguous
        { state with timerWaits := insertTimerWait inserted state.timerWaits } = true := by
  have unclaimed : ∀ record ∈ state.activityOccurrences,
      anyTimerIdNamesWait record.timerHandlerOccurrences inserted = false := by
    intro record recordMember
    apply Bool.eq_false_iff.mpr
    intro insertedNamed
    simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true,
      List.any_eq_true] at records
    obtain ⟨⟨_, attached⟩, _⟩ := records record recordMember
    simp only [anyTimerIdNamesWait, List.any_eq_true] at insertedNamed
    obtain ⟨timerId, timerMember, insertedMatch⟩ := insertedNamed
    obtain ⟨old, oldMember, oldMatch⟩ := attached timerId timerMember
    simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq,
      decide_eq_true_eq] at insertedMatch oldMatch
    have elementEq : inserted.elementId = old.elementId :=
      congrArg NodeId.mk (insertedMatch.1.2.symm.trans oldMatch.1.1.2)
    have keyed : timerWaitKeyMatches inserted old = true := by
      simp [timerWaitKeyMatches, insertedMatch.1.1.symm.trans oldMatch.1.1.1,
        elementEq, insertedMatch.2.symm.trans oldMatch.1.2]
    rw [(fresh old oldMember).1] at keyed
    contradiction
  constructor
  · simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true] at records ⊢
    intro record member
    obtain ⟨⟨body, attached⟩, messages⟩ := records record member
    refine ⟨⟨by simpa [activityBodyLive, exactLiveOccurrence] using body, ?_⟩, messages⟩
    intro timer timerMember
    simp only [List.any_eq_true] at attached ⊢
    obtain ⟨old, oldMember, named⟩ := attached timer timerMember
    exact ⟨old, (mem_canonicalInsertBy _ _ _ _).2 (Or.inr oldMember), named⟩
  · simp only [attachedTimersUnambiguous, insertTimerWait, all_canonicalInsertBy,
      Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq] at attachments ⊢
    refine ⟨?_, attachments⟩
    have empty : state.activityOccurrences.filter
        (fun record => anyTimerIdNamesWait record.timerHandlerOccurrences inserted) = [] :=
      List.filter_eq_nil_iff.mpr fun record member holds => by
        rw [unclaimed record member] at holds
        contradiction
    simp [empty]

theorem smiBindings_insertUserTaskWait_frame (program : Program)
    (state : RuntimeState) (inserted : UserTaskWait)
    (disjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ candidate _ _ _ _ =>
          candidate.id ≠ inserted.task.id
      | _ => True)
    (valid : sequentialMultiInstanceProgramBindingsValid program state = true) :
    sequentialMultiInstanceProgramBindingsValid program
      { state with waits := insertUserTaskWait inserted state.waits } = true := by
  simp only [sequentialMultiInstanceProgramBindingsValid,
    sequentialMultiInstanceControllerProgramBindingsValid, Bool.and_eq_true,
    List.all_eq_true] at valid ⊢
  refine ⟨?_, ?_⟩
  · intro controller member
    have prior := valid.1 controller member
    unfold sequentialMultiInstanceControllerProgramBindingValid at prior ⊢
    generalize recordsEq : state.activityOccurrences.filter
      (controllerNamesActivityOccurrence controller) = records at prior ⊢
    cases records with
    | nil => simp at prior
    | cons record rest =>
        cases rest with
        | cons next tail => simp at prior
        | nil =>
            simp only at prior ⊢
            split at *
            · rename_i candidateId candidateOrigin candidateInput candidate candidateData
                candidateOutput candidateTimer candidateLimits operationsEq
              have operationMember : SemanticOperation.awaitSequentialMultiInstanceUserTask
                  candidateId candidateOrigin candidateInput candidate candidateData candidateOutput
                    candidateTimer candidateLimits ∈ program.operations := by
                have : SemanticOperation.awaitSequentialMultiInstanceUserTask candidateId
                    candidateOrigin candidateInput candidate candidateData candidateOutput
                      candidateTimer candidateLimits ∈ program.operations.filter (fun
                    | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
                        decide (task.id.value = controller.activityElementId.value)
                    | _ => false) := operationsEq.symm ▸ (by simp)
                exact (List.mem_filter.mp this).1
              have different := disjoint (.awaitSequentialMultiInstanceUserTask
                candidateId candidateOrigin candidateInput candidate candidateData
                  candidateOutput candidateTimer candidateLimits) operationMember
              simp only at different
              cases bodyEq : activityBodyTask? record with
              | none => simp [bodyEq] at prior
              | some body =>
                  by_cases sameBody : body.elementId.value = candidate.id.value
                  · have valueDifferent : inserted.task.id.value ≠ body.elementId.value := by
                      intro same
                      apply different
                      apply taskDefinitionId_eq_of_value_eq
                      exact (same.trans sameBody).symm
                    have rejected : taskIdNamesWait body inserted = false := by
                      simp [taskIdNamesWait, Ne.symm valueDifferent]
                    have filterFrame : List.filter (taskIdNamesWait body)
                        (insertUserTaskWait inserted state.waits) =
                      List.filter (taskIdNamesWait body) state.waits := by
                      rw [insertUserTaskWait_eq_canonicalInsertBy]
                      exact filter_canonicalInsertBy_rejected _ _ _ _ rejected
                    simp only
                    rw [filterFrame]
                    simpa [bodyEq] using prior
                  · simp [bodyEq, sameBody] at prior
            · simp at prior
  · intro operation member
    have prior := valid.2 operation member
    cases operation <;> try exact prior
    rename_i candidateId candidateOrigin candidateInput candidate candidateData candidateOutput
      candidateTimer candidateLimits
    have different := disjoint (.awaitSequentialMultiInstanceUserTask candidateId candidateOrigin
      candidateInput candidate candidateData candidateOutput candidateTimer candidateLimits) member
    simp only at different
    simp only [sequentialMultiInstanceOperationBindingComplete] at prior ⊢
    have rejected : decide (inserted.task.id = candidate.id) = false := by
      simp [Ne.symm different]
    have filterFrame : List.filter (fun wait => decide (wait.task.id = candidate.id))
        (insertUserTaskWait inserted state.waits) =
      List.filter (fun wait => decide (wait.task.id = candidate.id)) state.waits := by
      rw [insertUserTaskWait_eq_canonicalInsertBy]
      exact filter_canonicalInsertBy_rejected _ _ _ _ rejected
    rw [filterFrame]
    exact prior

theorem prepared_arm_userTask_noninterference (program : Program)
    (state : RuntimeState) (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch)
    (next : match patch.write with
      | .userTask wait => wait.activation = activationCount state wait.task.id + 1
      | .timer wait => wait.activation = timerActivationCount state wait.elementId + 1
      | .message _ | .effect _ _ => True)
    (bounds : runtimeStateIdentityBound state = true)
    (records : activityRecordsOwnLiveWork state = true)
    (bindings : sequentialMultiInstanceProgramBindingsValid program state = true) :
    match patch.write with
    | .userTask wait =>
        activityRecordsOwnLiveWork
            { state with waits := insertUserTaskWait wait state.waits } = true ∧
          sequentialMultiInstanceProgramBindingsValid program
            { state with waits := insertUserTaskWait wait state.waits } = true
    | _ => True := by
  cases writeEq : patch.write with
  | message _ | timer _ | effect _ _ => simp
  | userTask inserted =>
    simp only [writeEq] at next ⊢
    have disjoint : ∀ candidate ∈ program.operations,
        match candidate with
        | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
            task.id ≠ inserted.task.id
        | _ => True := by
      intro candidate member
      have excludes := prepared_userTask_excludes_multiInstance program state operation patch
        inserted prepared writeEq candidate member
      cases candidate <;> try trivial
    exact ⟨activityRecords_insertUserTaskWait state inserted next bounds records,
      smiBindings_insertUserTaskWait_frame program state inserted disjoint bindings⟩

theorem prepared_arm_preserves_parallelBindings (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch)
    (valid : parallelMultiInstanceProgramBindingsValid program state = true) :
    parallelMultiInstanceProgramBindingsValid program
      (applyInternalArmingPatch state patch) = true := by
  cases writeEq : patch.write with
  | userTask inserted =>
      let insertedState : RuntimeState :=
        { state with
          waits := insertUserTaskWait inserted state.waits
          activations := setActivationCount state.activations inserted.task.id inserted.activation }
      have insertedValid : parallelMultiInstanceProgramBindingsValid program insertedState = true := by
        simpa [insertedState] using
          parallelMultiInstanceProgramBindingsValid_insertUserTaskWait_frame program state inserted
            (prepared_userTask_excludes_multiInstance program state operation patch inserted prepared
              writeEq)
            valid
      have frame := parallelMultiInstanceProgramBindingsValid_frame program insertedState
        (applyInternalArmingPatch state patch)
        (by simp [insertedState, applyInternalArmingPatch, writeEq])
        (by simp [insertedState, applyInternalArmingPatch, writeEq])
        (by simp [insertedState, applyInternalArmingPatch, writeEq])
        (by simp [insertedState, applyInternalArmingPatch, writeEq])
        (by simp [insertedState, applyInternalArmingPatch, writeEq])
        (by intro taskId; simp [activationCount, insertedState, applyInternalArmingPatch, writeEq])
        (by intro taskId; simp [activityActivationCount, insertedState,
          applyInternalArmingPatch, writeEq])
        (by intro timerId; simp [timerActivationCount, insertedState,
          applyInternalArmingPatch, writeEq])
      exact frame.symm.trans insertedValid
  | timer inserted =>
      have excludesSequential :=
        prepared_timer_excludes_smi program state operation patch inserted prepared writeEq
      have excludesParallel :=
        prepared_timer_excludes_parallel program state operation patch inserted prepared writeEq
      have disjoint : ∀ candidate ∈ program.operations,
          match candidate with
          | .awaitSequentialMultiInstanceUserTask _ _ _ _ _ _ boundaryTimer _ =>
              boundaryTimer.elementId ≠ inserted.elementId
          | .awaitParallelMultiInstanceUserTask _ _ _ _ _ _ _ boundaryTimer _ _ =>
              boundaryTimer.elementId ≠ inserted.elementId
          | _ => True := by
        intro candidate member
        cases candidate <;> try trivial
        · exact excludesSequential _ member
        · exact excludesParallel _ member
      have counterFrame : ∀ candidate ∈ program.operations,
          match ParallelMultiInstanceArm.ofOperation? candidate with
          | some arm =>
              timerActivationCount
                  ({ state with
                    timerWaits := insertTimerWait inserted state.timerWaits
                    timerActivations := setTimerActivationCount state.timerActivations
                      inserted.elementId inserted.activation }) arm.boundaryTimer.elementId =
                timerActivationCount state arm.boundaryTimer.elementId
          | none => True := by
        intro candidate member
        cases candidate <;> try trivial
        rename_i id origin input taskId taskName data normalOutput boundaryTimer completion limits
        have different := excludesParallel
          (.awaitParallelMultiInstanceUserTask id origin input taskId taskName data normalOutput
            boundaryTimer completion limits) member
        simp only [ParallelMultiInstanceArm.ofOperation?]
        simpa [timerActivationCount] using timerActivationCount_set_other state inserted.elementId
          boundaryTimer.elementId inserted.activation different
      let insertedState : RuntimeState :=
        { state with
          timerWaits := insertTimerWait inserted state.timerWaits
          timerActivations := setTimerActivationCount state.timerActivations
            inserted.elementId inserted.activation }
      have insertedValid : parallelMultiInstanceProgramBindingsValid program insertedState = true := by
        simpa [insertedState] using
          parallelMultiInstanceProgramBindingsValid_insertTimerWait_frame program state inserted
            disjoint counterFrame valid
      have frame := parallelMultiInstanceProgramBindingsValid_frame program insertedState
        (applyInternalArmingPatch state patch)
        (by simp [insertedState, applyInternalArmingPatch, writeEq])
        (by simp [insertedState, applyInternalArmingPatch, writeEq])
        (by simp [insertedState, applyInternalArmingPatch, writeEq])
        (by simp [insertedState, applyInternalArmingPatch, writeEq])
        (by simp [insertedState, applyInternalArmingPatch, writeEq])
        (by intro taskId; simp [activationCount, insertedState, applyInternalArmingPatch, writeEq])
        (by intro taskId; simp [activityActivationCount, insertedState,
          applyInternalArmingPatch, writeEq])
        (by intro timerId; simp [timerActivationCount, insertedState,
          applyInternalArmingPatch, writeEq])
      exact frame.symm.trans insertedValid
  | message inserted =>
      have frame := parallelMultiInstanceProgramBindingsValid_frame program state
        (applyInternalArmingPatch state patch)
        (by simp [applyInternalArmingPatch, writeEq])
        (by simp [applyInternalArmingPatch, writeEq])
        (by simp [applyInternalArmingPatch, writeEq])
        (by simp [applyInternalArmingPatch, writeEq])
        (by simp [applyInternalArmingPatch, writeEq])
        (by intro taskId; simp [activationCount, applyInternalArmingPatch, writeEq])
        (by intro taskId; simp [activityActivationCount, applyInternalArmingPatch, writeEq])
        (by intro timerId; simp [timerActivationCount, applyInternalArmingPatch, writeEq])
      exact frame.symm.trans valid
  | effect inserted bindings =>
      have frame := parallelMultiInstanceProgramBindingsValid_frame program state
        (applyInternalArmingPatch state patch)
        (by simp [applyInternalArmingPatch, writeEq])
        (by simp [applyInternalArmingPatch, writeEq])
        (by simp [applyInternalArmingPatch, writeEq])
        (by simp [applyInternalArmingPatch, writeEq])
        (by simp [applyInternalArmingPatch, writeEq])
        (by intro taskId; simp [activationCount, applyInternalArmingPatch, writeEq])
        (by intro taskId; simp [activityActivationCount, applyInternalArmingPatch, writeEq])
        (by intro timerId; simp [timerActivationCount, applyInternalArmingPatch, writeEq])
      exact frame.symm.trans valid

theorem eventRaces_insertMessageWait (state : RuntimeState) (inserted : MessageWait)
    (fresh : ∀ old ∈ state.messageWaits,
      messageWaitKeyMatches inserted old = false ∧
        messageWaitKeyMatches old inserted = false)
    (valid : eventRaceAssociationsValid state = true) :
    eventRaceAssociationsValid
      { state with messageWaits := insertMessageWait inserted state.messageWaits } = true := by
  simp only [eventRaceAssociationsValid, List.all_eq_true, Bool.and_eq_true,
    decide_eq_true_eq] at valid ⊢
  intro race member
  obtain ⟨⟨⟨⟨messages, timers⟩, identities⟩, messageIdentities⟩, timerIdentities⟩ :=
    valid race member
  refine ⟨⟨⟨⟨?_, timers⟩, identities⟩, messageIdentities⟩, timerIdentities⟩
  rw [length_filter_insertMessageWait]
  have rejected : eventRaceHasMessage race inserted = false := by
    apply Bool.eq_false_iff.mpr
    intro insertedMatch
    simp only [eventRaceHasMessage, Bool.and_eq_true, decide_eq_true_eq] at insertedMatch
    obtain ⟨old, oldMember, oldMatch⟩ : ∃ old ∈ state.messageWaits,
        eventRaceHasMessage race old = true := by
      have positive : 0 < (state.messageWaits.filter (eventRaceHasMessage race)).length := by
        omega
      obtain ⟨old, filtered⟩ := List.exists_mem_of_ne_nil _ (List.length_pos_iff.mp positive)
      exact ⟨old, (List.mem_filter.mp filtered).1, (List.mem_filter.mp filtered).2⟩
    simp only [eventRaceHasMessage, Bool.and_eq_true, decide_eq_true_eq] at oldMatch
    have processEq : inserted.processInstanceId = old.processInstanceId :=
      insertedMatch.1.1.1.symm.trans oldMatch.1.1.1
    have valueEq : inserted.elementId.value = old.elementId.value :=
      insertedMatch.1.1.2.symm.trans oldMatch.1.1.2
    have activationEq : inserted.activation = old.activation :=
      insertedMatch.1.2.symm.trans oldMatch.1.2
    have elementEq : inserted.elementId = old.elementId := congrArg NodeId.mk valueEq
    have keyed : messageWaitKeyMatches inserted old = true := by
      simp [messageWaitKeyMatches, processEq, elementEq, activationEq]
    rw [(fresh old oldMember).1] at keyed
    contradiction
  simp [rejected, messages]

theorem eventRaces_insertTimerWait (state : RuntimeState) (inserted : TimerWait)
    (fresh : ∀ old ∈ state.timerWaits,
      timerWaitKeyMatches inserted old = false ∧
        timerWaitKeyMatches old inserted = false)
    (valid : eventRaceAssociationsValid state = true) :
    eventRaceAssociationsValid
      { state with timerWaits := insertTimerWait inserted state.timerWaits } = true := by
  simp only [eventRaceAssociationsValid, List.all_eq_true, Bool.and_eq_true,
    decide_eq_true_eq] at valid ⊢
  intro race member
  obtain ⟨⟨⟨⟨messages, timers⟩, identities⟩, messageIdentities⟩, timerIdentities⟩ :=
    valid race member
  refine ⟨⟨⟨⟨messages, ?_⟩, identities⟩, messageIdentities⟩, timerIdentities⟩
  rw [length_filter_insertTimerWait]
  have rejected : eventRaceHasTimer race inserted = false := by
    apply Bool.eq_false_iff.mpr
    intro insertedMatch
    simp only [eventRaceHasTimer, Bool.and_eq_true, decide_eq_true_eq] at insertedMatch
    obtain ⟨old, oldMember, oldMatch⟩ : ∃ old ∈ state.timerWaits,
        eventRaceHasTimer race old = true := by
      have positive : 0 < (state.timerWaits.filter (eventRaceHasTimer race)).length := by
        omega
      obtain ⟨old, filtered⟩ := List.exists_mem_of_ne_nil _ (List.length_pos_iff.mp positive)
      exact ⟨old, (List.mem_filter.mp filtered).1, (List.mem_filter.mp filtered).2⟩
    simp only [eventRaceHasTimer, Bool.and_eq_true, decide_eq_true_eq] at oldMatch
    have processEq : inserted.processInstanceId = old.processInstanceId :=
      insertedMatch.1.1.1.symm.trans oldMatch.1.1.1
    have valueEq : inserted.elementId.value = old.elementId.value :=
      insertedMatch.1.1.2.symm.trans oldMatch.1.1.2
    have activationEq : inserted.activation = old.activation :=
      insertedMatch.1.2.symm.trans oldMatch.1.2
    have elementEq : inserted.elementId = old.elementId := congrArg NodeId.mk valueEq
    have keyed : timerWaitKeyMatches inserted old = true := by
      simp [timerWaitKeyMatches, processEq, elementEq, activationEq]
    rw [(fresh old oldMember).1] at keyed
    contradiction
  simp [rejected, timers]

theorem prepared_arm_preserves_runtime (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch) (expectedInstanceId : SemanticId)
    (stateAdmitted : runtimeStateWellFormed program expectedInstanceId state = true)
    (prepared : prepareInternalArm? program state operation = some patch) :
    runtimeStateWellFormed program expectedInstanceId (applyInternalArmingPatch state patch) = true := by
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at stateAdmitted
  obtain ⟨existing, claims⟩ := stateAdmitted
  obtain ⟨h17, terminal⟩ := existing
  obtain ⟨h16, exhausted⟩ := h17
  obtain ⟨h15, controllerIdentities⟩ := h16
  obtain ⟨h14, parallelControllerBindings⟩ := h15
  obtain ⟨h13, controllerBindings⟩ := h14
  obtain ⟨h12, controllers⟩ := h13
  obtain ⟨h11, activityIdentities⟩ := h12
  obtain ⟨h10, messagesUnambiguous⟩ := h11
  obtain ⟨h9, timers⟩ := h10
  obtain ⟨h8, records⟩ := h9
  obtain ⟨h7, order⟩ := h8
  obtain ⟨h6, hidden⟩ := h7
  obtain ⟨h5, declarations⟩ := h6
  obtain ⟨h4, bounds⟩ := h5
  obtain ⟨h3, identities⟩ := h4
  obtain ⟨h2, owners⟩ := h3
  obtain ⟨h1, incidents⟩ := h2
  obtain ⟨positionBefore, eventRaces⟩ := h1
  have positionAfter := applyInternalArmingPatch_preserves_runtimePosition program
    expectedInstanceId state patch positionBefore
    (prepared_owner_lookup program state operation patch prepared)
  have keyFresh := prepared_arm_key_fresh program state operation patch prepared
  have boundsAfter := applyInternalArmingPatch_preserves_identityBound state patch
    (prepared_arm_activation_next program state operation patch prepared) bounds
  have orderAfter := applyInternalArmingPatch_preserves_order state patch order
  have declaredAfter := prepared_arm_declared program state operation patch prepared
  have userTaskNoninterference := prepared_arm_userTask_noninterference program state operation
    patch prepared (prepared_arm_activation_next program state operation patch prepared) bounds
      records controllerBindings
  have parallelBindingsPreserved := prepared_arm_preserves_parallelBindings program state operation
    patch prepared parallelControllerBindings
  have semanticAfter :
      eventRaceAssociationsValid (applyInternalArmingPatch state patch) = true ∧
        effectIncidentAssociationsValid (applyInternalArmingPatch state patch) = true ∧
        activityRecordsOwnLiveWork (applyInternalArmingPatch state patch) = true ∧
        attachedTimersUnambiguous (applyInternalArmingPatch state patch) = true ∧
        attachedMessagesUnambiguous (applyInternalArmingPatch state patch) = true ∧
        sequentialMultiInstanceProgramBindingsValid program
          (applyInternalArmingPatch state patch) = true ∧
        parallelMultiInstanceProgramBindingsValid program
          (applyInternalArmingPatch state patch) = true := by
    cases writeEq : patch.write with
    | userTask inserted =>
        simp only [writeEq] at userTaskNoninterference
        refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
        · simpa [applyInternalArmingPatch, writeEq, eventRaceAssociationsValid] using eventRaces
        · simpa [applyInternalArmingPatch, writeEq, effectIncidentAssociationsValid,
            effectIncidentAssociationValid, effectWaitOwnerAssociationValid] using incidents
        · simpa [applyInternalArmingPatch, writeEq, activityRecordsOwnLiveWork,
            activityBodyLive, exactLiveOccurrence] using userTaskNoninterference.1
        · simpa [applyInternalArmingPatch, writeEq, attachedTimersUnambiguous] using timers
        · simpa [applyInternalArmingPatch, writeEq, attachedMessagesUnambiguous] using messagesUnambiguous
        · simpa [applyInternalArmingPatch, writeEq,
            sequentialMultiInstanceProgramBindingsValid,
            sequentialMultiInstanceControllerProgramBindingsValid,
            sequentialMultiInstanceControllerProgramBindingValid,
            sequentialMultiInstanceOperationBindingComplete] using userTaskNoninterference.2
        · exact parallelBindingsPreserved
    | message inserted =>
        simp only [writeEq] at keyFresh
        refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
        · simpa [applyInternalArmingPatch, writeEq, eventRaceAssociationsValid] using
            eventRaces_insertMessageWait state inserted keyFresh eventRaces
        · simpa [applyInternalArmingPatch, writeEq, effectIncidentAssociationsValid,
            effectIncidentAssociationValid, effectWaitOwnerAssociationValid] using incidents
        · simpa [applyInternalArmingPatch, writeEq, activityRecordsOwnLiveWork,
            activityBodyLive, exactLiveOccurrence] using
            activityRecords_insertMessageWait state inserted records
        · simpa [applyInternalArmingPatch, writeEq, attachedTimersUnambiguous] using timers
        · simpa [applyInternalArmingPatch, writeEq, attachedMessagesUnambiguous] using messagesUnambiguous
        · simpa [applyInternalArmingPatch, writeEq,
            sequentialMultiInstanceProgramBindingsValid,
            sequentialMultiInstanceControllerProgramBindingsValid,
            sequentialMultiInstanceControllerProgramBindingValid,
            sequentialMultiInstanceOperationBindingComplete] using controllerBindings
        · exact parallelBindingsPreserved
    | timer inserted =>
        simp only [writeEq] at keyFresh
        have timerFacts := activityRecords_insertFreshTimerWait state inserted keyFresh records timers
        refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
        · simpa [applyInternalArmingPatch, writeEq, eventRaceAssociationsValid] using
            eventRaces_insertTimerWait state inserted keyFresh eventRaces
        · simpa [applyInternalArmingPatch, writeEq, effectIncidentAssociationsValid,
            effectIncidentAssociationValid, effectWaitOwnerAssociationValid] using incidents
        · simpa [applyInternalArmingPatch, writeEq, activityRecordsOwnLiveWork,
            activityBodyLive, exactLiveOccurrence] using timerFacts.1
        · simpa [applyInternalArmingPatch, writeEq, attachedTimersUnambiguous] using timerFacts.2
        · simpa [applyInternalArmingPatch, writeEq, attachedMessagesUnambiguous] using messagesUnambiguous
        · let timerState : RuntimeState :=
            { state with timerWaits := insertTimerWait inserted state.timerWaits }
          have timerBindings : sequentialMultiInstanceProgramBindingsValid program
              timerState = true := by
            simpa [timerState] using
              smiBindings_insertTimerWait_frame program state inserted
                (prepared_timer_excludes_smi program state operation patch inserted prepared writeEq)
                controllerBindings
          have frame := sequentialMultiInstanceProgramBindingsValid_frame program timerState
            (applyInternalArmingPatch state patch)
            (by simp [timerState, applyInternalArmingPatch, writeEq])
            (by simp [timerState, applyInternalArmingPatch, writeEq])
            (by simp [timerState, applyInternalArmingPatch, writeEq])
            (by simp [timerState, applyInternalArmingPatch, writeEq])
          rw [frame]
          exact timerBindings
        · exact parallelBindingsPreserved
    | effect inserted bindings =>
        refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
        · simpa [applyInternalArmingPatch, writeEq, eventRaceAssociationsValid] using eventRaces
        · obtain ⟨_, anchorAbsent⟩ :=
            prepared_arm_anchor_shape program state operation patch prepared
          have missing : patch.write.occurrence ∉ openWaitAnchors state := by
            simpa [openWaitAnchorAbsent, List.contains_eq_mem] using anchorAbsent
          have occurrenceEq : patch.write.occurrence = effectWaitOccurrence inserted := by
            simp [writeEq, InternalArmingWrite.occurrence]
          have incidentFresh : ∀ incident ∈ state.effectIncidents,
              effectWaitOccurrenceId inserted ≠ effectWaitOccurrenceId incident.wait := by
            intro incident member same
            apply missing
            rw [occurrenceEq]
            simp only [openWaitAnchors, List.mem_append, List.mem_map, or_assoc]
            exact Or.inr (Or.inr (Or.inr (Or.inr ⟨incident, member, by
              simpa [effectWaitOccurrence, effectWaitOccurrenceId] using same.symm⟩)))
          let effectState : RuntimeState :=
            { state with
              effectWaits := insertEffectWait inserted state.effectWaits
              variables := addActivityVariableScope state.variables
                (effectWaitOccurrenceId inserted) bindings }
          have effectIncidents : effectIncidentAssociationsValid effectState = true := by
            simpa [effectState] using
              effectIncidentAssociationsValid_insertEffectFrame state inserted bindings
                incidentFresh incidents
          have frame := effectIncidentAssociationsValid_frame effectState
            (applyInternalArmingPatch state patch)
            (by simp [effectState, applyInternalArmingPatch, writeEq])
            (by simp [effectState, applyInternalArmingPatch, writeEq])
            (by simp [effectState, applyInternalArmingPatch, writeEq])
            (by simp [effectState, applyInternalArmingPatch, writeEq,
              addActivityVariableScope, effectWaitOccurrenceId, effectWaitOccurrence])
            (by simp [effectState, applyInternalArmingPatch, writeEq])
          rw [frame]
          exact effectIncidents
        · simpa [applyInternalArmingPatch, writeEq, activityRecordsOwnLiveWork,
            activityBodyLive, exactLiveOccurrence] using records
        · simpa [applyInternalArmingPatch, writeEq, attachedTimersUnambiguous] using timers
        · simpa [applyInternalArmingPatch, writeEq, attachedMessagesUnambiguous] using messagesUnambiguous
        · simpa [applyInternalArmingPatch, writeEq,
            sequentialMultiInstanceProgramBindingsValid,
            sequentialMultiInstanceControllerProgramBindingsValid,
            sequentialMultiInstanceControllerProgramBindingValid,
            sequentialMultiInstanceOperationBindingComplete] using controllerBindings
        · exact parallelBindingsPreserved
  obtain ⟨eventAfter, incidentAfter, recordsAfter, timersAfter, messagesAfter, bindingsAfter,
    parallelBindingsAfter⟩ := semanticAfter
  have liveRunning := prepared_arm_live_running program state operation patch prepared
  have writeOwner := (prepared_arm_selection_unique program state operation patch prepared).2.2
  have ownersAfter : waitOwnersLive (applyInternalArmingPatch state patch) = true := by
    cases patch with | mk _ _ _ _ _ _ _ _ _ write =>
      cases write <;> simp_all [applyInternalArmingPatch, waitOwnersLive,
        exactLiveOccurrence, all_insertUserTaskWait, insertMessageWait, insertTimerWait,
        insertEffectWait, all_canonicalInsertBy,
        InternalArmingWrite.owner]
  have identitiesAfter : waitIdentitiesUnique (applyInternalArmingPatch state patch) = true := by
    cases patch with | mk _ _ _ _ _ _ _ _ _ write =>
      cases write with
      | userTask inserted =>
          simp only [applyInternalArmingPatch, waitIdentitiesUnique,
            Bool.and_eq_true] at identities ⊢
          obtain ⟨⟨⟨userTasks, messages⟩, timers⟩, effects⟩ := identities
          rw [insertUserTaskWait_eq_canonicalInsertBy]
          exact ⟨⟨⟨occurrenceKeysUnique_canonicalInsertBy userTaskWaitBefore
            userTaskWaitKeyMatches inserted state.waits userTasks keyFresh (by
              simp [userTaskWaitKeyMatches]), messages⟩, timers⟩, effects⟩
      | message inserted =>
          simp only [applyInternalArmingPatch, waitIdentitiesUnique,
            Bool.and_eq_true] at identities ⊢
          obtain ⟨⟨⟨userTasks, messages⟩, timers⟩, effects⟩ := identities
          exact ⟨⟨⟨userTasks, occurrenceKeysUnique_canonicalInsertBy messageWaitBefore
            messageWaitKeyMatches inserted state.messageWaits messages keyFresh (by
              simp [messageWaitKeyMatches])⟩, timers⟩, effects⟩
      | timer inserted =>
          simp only [applyInternalArmingPatch, waitIdentitiesUnique,
            Bool.and_eq_true] at identities ⊢
          obtain ⟨⟨⟨userTasks, messages⟩, timers⟩, effects⟩ := identities
          exact ⟨⟨⟨userTasks, messages⟩, occurrenceKeysUnique_canonicalInsertBy timerWaitBefore
            timerWaitKeyMatches inserted state.timerWaits timers keyFresh (by
              simp [timerWaitKeyMatches])⟩, effects⟩
      | effect inserted _ =>
          simp only [applyInternalArmingPatch, waitIdentitiesUnique,
            Bool.and_eq_true] at identities ⊢
          obtain ⟨⟨⟨userTasks, messages⟩, timers⟩, effects⟩ := identities
          exact ⟨⟨⟨userTasks, messages⟩, timers⟩,
            occurrenceKeysUnique_canonicalInsertBy effectWaitBefore effectWaitKeyMatches
              inserted state.effectWaits effects keyFresh (by simp [effectWaitKeyMatches])⟩
  have declarationsAfter : waitDeclarationsValid program expectedInstanceId
      (applyInternalArmingPatch state patch) = true := by
    cases patch with | mk _ _ _ _ _ _ _ _ _ write =>
      cases write <;> simp_all [applyInternalArmingPatch, waitDeclarationsValid,
        all_insertUserTaskWait, insertMessageWait, insertTimerWait, insertEffectWait,
        all_canonicalInsertBy]
  have unchangedAfter :
      hiddenRecordDeclarationsValid program (applyInternalArmingPatch state patch) = true ∧
        activityIdentitiesUnique (applyInternalArmingPatch state patch) = true ∧
        controllersOwnLiveActivity (applyInternalArmingPatch state patch) = true ∧
        controllerIdentitiesUnique (applyInternalArmingPatch state patch) = true ∧
        controllersNotExhausted (applyInternalArmingPatch state patch) = true := by
    cases patch with | mk _ _ _ _ _ _ _ _ _ write =>
      cases write <;> exact ⟨hidden, activityIdentities, controllers,
        controllerIdentities, exhausted⟩
  obtain ⟨runningInstanceId, running⟩ := liveRunning.2
  have terminalAfter :
      (match (applyInternalArmingPatch state patch).control with
       | .notStarted => notStartedStateEmpty (applyInternalArmingPatch state patch)
       | _ => true) = true := by
    have controlFrame : (applyInternalArmingPatch state patch).control = state.control := by
      cases patch with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl
    rw [controlFrame, running]
  have claimsAfter : activityBodyClaimsUnique
      (applyInternalArmingPatch state patch).activityOccurrences = true := by
    have recordsFrame :
        (applyInternalArmingPatch state patch).activityOccurrences =
          state.activityOccurrences := by
      cases patch with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl
    rw [recordsFrame]
    exact claims
  have after2 := And.intro positionAfter eventAfter
  have after3 := And.intro after2 incidentAfter
  have after4 := And.intro after3 ownersAfter
  have after5 := And.intro after4 identitiesAfter
  have after6 := And.intro after5 boundsAfter
  have after7 := And.intro after6 declarationsAfter
  have after8 := And.intro after7 unchangedAfter.1
  have after9 := And.intro after8 orderAfter
  have after10 := And.intro after9 recordsAfter
  have after11 := And.intro after10 timersAfter
  have after12 := And.intro after11 messagesAfter
  have after13 := And.intro after12 unchangedAfter.2.1
  have after14 := And.intro after13 unchangedAfter.2.2.1
  have after15 := And.intro after14 bindingsAfter
  have after16 := And.intro after15 parallelBindingsAfter
  have after17 := And.intro after16 unchangedAfter.2.2.2.1
  have after18 := And.intro after17 unchangedAfter.2.2.2.2
  simp only [runtimeStateWellFormed, Bool.and_eq_true]
  exact ⟨⟨after18, terminalAfter⟩, claimsAfter⟩

end InternalCommutation

end BpmnSemantics.SemanticProcess
