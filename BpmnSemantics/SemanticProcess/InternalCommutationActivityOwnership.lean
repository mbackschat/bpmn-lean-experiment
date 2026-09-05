import BpmnSemantics.SemanticProcess.InternalCommutationStateFrames

/-! # Internal commutation Activity ownership preservation -/

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
  have taskBodyFresh (body : OccurrenceId)
        (priorCount : (state.waits.filter fun wait =>
          decide (wait.processInstanceId = body.processInstanceId) &&
            decide (wait.task.id.value = body.elementId.value) &&
            decide (wait.activation = body.activation)).length = 1) :
        (decide (inserted.processInstanceId = body.processInstanceId) &&
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
  have taskBodyPreserved (body : OccurrenceId)
      (priorCount : (state.waits.filter fun wait =>
        decide (wait.processInstanceId = body.processInstanceId) &&
          decide (wait.task.id.value = body.elementId.value) &&
          decide (wait.activation = body.activation)).length = 1) :
      ((insertUserTaskWait inserted state.waits).filter fun wait =>
        decide (wait.processInstanceId = body.processInstanceId) &&
          decide (wait.task.id.value = body.elementId.value) &&
          decide (wait.activation = body.activation)).length = 1 := by
    rw [length_filter_insertUserTaskWait, taskBodyFresh body priorCount]
    simpa using priorCount
  have taskOwnersPreserved (body : OccurrenceId)
      (priorCount : (state.waits.filter fun wait =>
        decide (wait.processInstanceId = body.processInstanceId) &&
          decide (wait.task.id.value = body.elementId.value) &&
          decide (wait.activation = body.activation)).length = 1) :
      (insertUserTaskWait inserted state.waits).filter (taskIdNamesWait body) =
        state.waits.filter (taskIdNamesWait body) := by
    have rejected : taskIdNamesWait body inserted = false := by
      apply Bool.eq_false_iff.mpr
      intro matched
      have fresh := taskBodyFresh body priorCount
      simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at matched
      simp [matched.1.1, matched.1.2, matched.2] at fresh
    rw [insertUserTaskWait_eq_canonicalInsertBy]
    exact filter_canonicalInsertBy_rejected _ _ _ _ rejected
  refine ⟨⟨⟨?_, ?_⟩, prior.1.2⟩, prior.2⟩
  ·
    cases bodyEq : record.body with
    | childScope scope =>
        simp only [activityBodyLive, bodyEq]
        change exactLiveOccurrence state scope = true
        simpa [activityBodyLive, bodyEq] using prior.1.1.1
    | userTask body =>
        simp only [activityBodyLive, bodyEq]
        simpa only [decide_eq_true_eq] using taskBodyPreserved body (by
          simpa [activityBodyLive, bodyEq] using prior.1.1.1)
    | parallelUserTasks first rest =>
        simp only [activityBodyLive, bodyEq, List.all_eq_true] at prior ⊢
        intro body bodyMember
        have preserved := taskBodyPreserved body (by
          simpa only [decide_eq_true_eq] using prior.1.1.1 body bodyMember)
        simpa only [decide_eq_true_eq] using preserved
  · cases bodyEq : record.body with
    | childScope scope => simp [activityTaskBodyOwnersAgree, bodyEq]
    | userTask body =>
        simp only [activityTaskBodyOwnersAgree, bodyEq]
        rw [taskOwnersPreserved body (by
          simpa [activityBodyLive, bodyEq] using prior.1.1.1)]
        simpa [activityTaskBodyOwnersAgree, bodyEq] using prior.1.1.2
    | parallelUserTasks first rest =>
        simp only [activityTaskBodyOwnersAgree, bodyEq, List.all_eq_true] at prior ⊢
        intro body bodyMember
        rw [taskOwnersPreserved body (by
          have live := prior.1.1.1
          simp only [activityBodyLive, bodyEq, List.all_eq_true] at live
          simpa only [decide_eq_true_eq] using live body bodyMember)]
        exact prior.1.1.2 body bodyMember

theorem activityRecords_insertMessageWait (state : RuntimeState) (inserted : MessageWait)
    (records : activityRecordsOwnLiveWork state = true) :
    activityRecordsOwnLiveWork
      { state with messageWaits := insertMessageWait inserted state.messageWaits } = true := by
  simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true] at records ⊢
  intro record member
  obtain ⟨bodyTimers, messages⟩ := records record member
  refine ⟨by simpa [activityBodyLive, activityTaskBodyOwnersAgree, exactLiveOccurrence]
    using bodyTimers, ?_⟩
  intro message attached
  simp only [List.any_eq_true] at messages ⊢
  obtain ⟨old, oldMember, named⟩ := messages message attached
  exact ⟨old, (mem_canonicalInsertBy _ _ _ _).2 (Or.inr oldMember), named⟩

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
    obtain ⟨⟨⟨body, taskOwners⟩, attached⟩, messages⟩ := records record member
    refine ⟨⟨⟨by simpa [activityBodyLive, exactLiveOccurrence] using body,
      by simpa [activityTaskBodyOwnersAgree] using taskOwners⟩, ?_⟩, messages⟩
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

end InternalCommutation

end BpmnSemantics.SemanticProcess
