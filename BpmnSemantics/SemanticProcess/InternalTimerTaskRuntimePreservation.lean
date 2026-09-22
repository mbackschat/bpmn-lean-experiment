import BpmnSemantics.SemanticProcess.InternalTimerTaskValidity
import BpmnSemantics.SemanticProcess.ActivityDataInputOutputMultiInstanceFrames
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStatePreservation
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateEntryOrder

/-! Timer-task arming preserves the three independent issuer bounds and the existing runtime
collections. The joint wait/Activity obligations come from `InternalTimerTaskValidity`.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_timer_task_preserves_identity_bounds
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (bounds : runtimeStateIdentityBound state = true) :
    runtimeStateIdentityBound (applyInternalTimerTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let selected := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  let after := applyInternalTimerTaskPatch state selected
  let taskState := applyInternalArmingPatch state selected.arm
  have taskBounds := applyInternalArmingPatch_preserves_identityBound state selected.arm rfl bounds
  have timerBounds := insertNextTimer_preserves_identityBound taskState selected.timer rfl taskBounds
  have activities (query : TaskDefinitionId) : activityActivationCount state query ≤ activityActivationCount after query := by
    change activityActivationCount state query ≤ activityActivationCount
      { state with
        activityActivations := setActivationCount state.activityActivations contract.task.id
          (activityActivationCount state contract.task.id + 1) } query
    by_cases same : query = contract.task.id
    · subst query; rw [activityActivationCount_set_self]; omega
    · rw [activityActivationCount_set_other _ _ _ _ same]
      exact Nat.le_refl _
  change runtimeStateIdentityBound after = true
  simp only [runtimeStateIdentityBound, Bool.and_eq_true] at timerBounds ⊢
  refine ⟨timerBounds.1, ?_⟩
  simp only [List.all_eq_true, decide_eq_true_eq] at timerBounds ⊢
  intro record member
  change record ∈ insertActivityOccurrence _ state.activityOccurrences at member
  rw [insertActivityOccurrence_eq_canonicalInsertBy, mem_canonicalInsertBy] at member
  rcases member with rfl | old
  · exact Nat.le_of_eq (activityActivationCount_set_self state contract.task.id
      (activityActivationCount state contract.task.id + 1)).symm
  · exact Nat.le_trans (timerBounds.2 record old) (activities ⟨record.activityElementId.value⟩)

theorem prepared_timer_task_preserves_wait_owners
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (owners : waitOwnersLive state = true) :
    waitOwnersLive (applyInternalTimerTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, live, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  simp only [waitOwnersLive, Bool.and_eq_true] at owners ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨taskOwners, messageOwners⟩, timerOwners⟩, effectOwners⟩,
    incidentOwners⟩, selectionOwners⟩, raceOwners⟩, callOwners⟩, activityOwners⟩ := owners
  refine ⟨⟨⟨⟨⟨⟨⟨⟨?_, messageOwners⟩, ?_⟩, effectOwners⟩,
    incidentOwners⟩, selectionOwners⟩, raceOwners⟩, callOwners⟩, ?_⟩
  · change (insertUserTaskWait _ state.waits).all (fun wait => exactLiveOccurrence state wait.owner) = true
    rw [all_insertUserTaskWait]
    exact Bool.and_eq_true_iff.mpr ⟨live, taskOwners⟩
  · change (insertTimerWait _ state.timerWaits).all (fun wait => exactLiveOccurrence state wait.owner) = true
    rw [insertTimerWait, all_canonicalInsertBy]
    exact Bool.and_eq_true_iff.mpr ⟨live, timerOwners⟩
  · change (insertActivityOccurrence _ state.activityOccurrences).all
      (fun record => exactLiveOccurrence state record.owner) = true
    rw [insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy]
    exact Bool.and_eq_true_iff.mpr ⟨live, activityOwners⟩

theorem prepared_timer_task_preserves_wait_identities
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (identities : waitIdentitiesUnique state = true) :
    waitIdentitiesUnique (applyInternalTimerTaskPatch state patch) = true := by
  have timerFresh := prepared_timer_task_timer_keys_fresh program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, taskAbsent, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  have taskFresh := armingPatch_key_fresh_of_anchor_absent state
    (makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin).arm taskAbsent
  simp only [waitIdentitiesUnique, Bool.and_eq_true] at identities ⊢
  refine ⟨⟨⟨?_, identities.1.1.2⟩, ?_⟩, identities.2⟩
  · change (insertUserTaskWait _ state.waits).all (occursOnce userTaskWaitKeyMatches
      (insertUserTaskWait _ state.waits)) = true
    rw [insertUserTaskWait_eq_canonicalInsertBy]
    exact occurrenceKeysUnique_canonicalInsertBy _ _ _ _ identities.1.1.1 taskFresh
      (by simp [userTaskWaitKeyMatches])
  · change (insertTimerWait _ state.timerWaits).all (occursOnce timerWaitKeyMatches
      (insertTimerWait _ state.timerWaits)) = true
    rw [insertTimerWait]
    exact occurrenceKeysUnique_canonicalInsertBy _ _ _ _ identities.1.2 timerFresh
      (by simp [timerWaitKeyMatches])

theorem prepared_timer_task_preserves_activity_identities
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (identities : activityIdentitiesUnique state = true) :
    activityIdentitiesUnique (applyInternalTimerTaskPatch state patch) = true := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, disjoint, _⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  have fresh : ∀ old ∈ state.activityOccurrences,
      sameActivityOccurrence patch.record old = false ∧ sameActivityOccurrence old patch.record = false := by
    intro old member
    have absent := Bool.eq_false_iff.mpr ((List.any_eq_false.mp disjoint) old member)
    simp only [regionalActivityAssociationsConflict, Bool.or_eq_false_iff] at absent
    have reverse := absent.1.1.1
    have symmetry : sameActivityOccurrence patch.record old = sameActivityOccurrence old patch.record := by
      apply Bool.eq_iff_iff.mpr
      simp only [sameActivityOccurrence, Bool.and_eq_true, beq_iff_eq]
      constructor <;> rintro ⟨⟨process, element⟩, activation⟩ <;>
        exact ⟨⟨process.symm, element.symm⟩, activation.symm⟩
    exact ⟨symmetry.trans reverse, reverse⟩
  change (insertActivityOccurrence patch.record state.activityOccurrences).all
    (occursOnce sameActivityOccurrence (insertActivityOccurrence patch.record state.activityOccurrences)) = true
  rw [insertActivityOccurrence_eq_canonicalInsertBy]
  exact occurrenceKeysUnique_canonicalInsertBy _ _ _ _ identities fresh
    (by simp [sameActivityOccurrence])

theorem prepared_timer_task_preserves_wait_declarations
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch) (expectedInstance : SemanticId)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (declarations : waitDeclarationsValid program expectedInstance state = true) :
    waitDeclarationsValid program expectedInstance (applyInternalTimerTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, selected, _, _, _,
    taskDeclarer, timerDeclarer, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  have taskDeclared := declaredByExactlyOneOwnedOperation_of_exactSelection program
    contract.operation owner (userTaskWaitDeclarers program contract.task.id)
    (by simpa [uniqueFamilyDeclarer?] using taskDeclarer) selected
  have timerDeclared := declaredByExactlyOneOwnedOperation_of_exactSelection program
    contract.operation owner (timerWaitDeclarers program contract.timer.elementId)
    (by simpa [uniqueFamilyDeclarer?] using timerDeclarer) selected
  simp only [waitDeclarationsValid, Bool.and_eq_true] at declarations ⊢
  obtain ⟨⟨⟨⟨tasks, messages⟩, timers⟩, effects⟩, incidents⟩ := declarations
  refine ⟨⟨⟨⟨?_, messages⟩, ?_⟩, effects⟩, incidents⟩
  · apply List.all_eq_true.mpr
    intro wait member
    obtain ⟨raw, inInstance⟩ := List.mem_filter.mp member
    change wait ∈ insertUserTaskWait _ state.waits at raw
    rw [insertUserTaskWait_eq_canonicalInsertBy, mem_canonicalInsertBy] at raw
    rcases raw with rfl | old
    · exact taskDeclared
    · exact List.all_eq_true.mp tasks wait (List.mem_filter.mpr ⟨old, inInstance⟩)
  · apply List.all_eq_true.mpr
    intro wait member
    obtain ⟨raw, inInstance⟩ := List.mem_filter.mp member
    change wait ∈ insertTimerWait _ state.timerWaits at raw
    rw [insertTimerWait, mem_canonicalInsertBy] at raw
    rcases raw with rfl | old
    · exact timerDeclared
    · exact List.all_eq_true.mp timers wait (List.mem_filter.mpr ⟨old, inInstance⟩)

theorem prepared_timer_task_preserves_order
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (order : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder (applyInternalTimerTaskPatch state patch) = true := by
  have taskOrder := applyInternalArmingPatch_preserves_order state patch.arm order
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let selected := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  simp only [canonicalCollectionOrder, Bool.and_eq_true] at taskOrder ⊢
  obtain ⟨⟨⟨⟨taskOrder, scopeOrder⟩, scopeCounterOrder⟩, callCounterOrder⟩, raceCounterOrder⟩ := taskOrder
  refine ⟨⟨⟨⟨?_, scopeOrder⟩, scopeCounterOrder⟩, callCounterOrder⟩, raceCounterOrder⟩
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨tokenOrder, activityCounterOrder⟩, waitOrder⟩, activationOrder⟩, messageOrder⟩,
    timerOrder⟩, effectOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
    effectActivationOrder⟩, variableOrder⟩, selectionOrder⟩, raceOrder⟩,
    callOrder⟩, activityOrder⟩, sequentialOrder⟩, parallelOrder⟩ := taskOrder
  refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨tokenOrder, ?_⟩, waitOrder⟩, activationOrder⟩, messageOrder⟩,
    ?_⟩, effectOrder⟩, messageActivationOrder⟩, ?_⟩, effectActivationOrder⟩,
    variableOrder⟩, selectionOrder⟩, raceOrder⟩, callOrder⟩, ?_⟩, sequentialOrder⟩, parallelOrder⟩
  · exact orderedBy_insertTaskActivation _ _
      (orderedBy_filter activationBefore_compose _ _ activityCounterOrder)
  · exact orderedBy_insertTimerWait_preserved selected.timer state.timerWaits timerOrder
  · have inserted := orderedBy_replaceStringKey
      (fun value : TimerActivation => value.elementId.value) timerActivationBefore
      (fun _ _ => rfl) { elementId := selected.timer.elementId, count := selected.timer.activation }
      (fun activation => !decide (activation.elementId = selected.timer.elementId))
      state.timerActivations timerActivationOrder
    simpa only [applyInternalTimerTaskPatch, setTimerActivationCount, decide_not] using inserted
  · change orderedBy activityOccurrenceBefore
      (insertActivityOccurrence selected.record state.activityOccurrences) = true
    rw [insertActivityOccurrence_eq_canonicalInsertBy]
    exact orderedBy_canonicalInsertBy activityOccurrenceBefore activityOccurrenceBefore_asymm
      selected.record state.activityOccurrences activityOrder

private theorem prepared_timer_task_excludes_multiInstance
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ timer _ =>
          task.id ≠ contract.task.id ∧ timer.elementId ≠ contract.timer.elementId
      | .awaitParallelMultiInstanceUserTask _ _ _ taskId _ _ _ timer _ _ =>
          taskId ≠ contract.task.id ∧ timer.elementId ≠ contract.timer.elementId
      | _ => True := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, tasks, timers, _, _, _, _⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  have taskDeclarer : userTaskWaitDeclarers program contract.task.id = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using tasks
  have timerDeclarer : timerWaitDeclarers program contract.timer.elementId = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using timers
  intro operation member
  cases operation <;> try trivial
  all_goals
    constructor
    · intro same
      have conflict : _ ∈ userTaskWaitDeclarers program contract.task.id :=
        List.mem_filter.mpr ⟨member, by simp [same]⟩
      rw [taskDeclarer] at conflict
      cases kind : contract.kind <;> simp [InternalTimerTaskContract.operation, kind] at conflict
    · intro same
      have conflict : _ ∈ timerWaitDeclarers program contract.timer.elementId :=
        List.mem_filter.mpr ⟨member, by simp [same]⟩
      rw [timerDeclarer] at conflict
      cases kind : contract.kind <;> simp [InternalTimerTaskContract.operation, kind] at conflict

theorem prepared_timer_task_preserves_multiInstance
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (controllers : controllersOwnLiveActivity state = true)
    (sequential : sequentialMultiInstanceProgramBindingsValid program state = true)
    (parallel : parallelMultiInstanceProgramBindingsValid program state = true) :
    controllersOwnLiveActivity (applyInternalTimerTaskPatch state patch) = true ∧
      sequentialMultiInstanceProgramBindingsValid program (applyInternalTimerTaskPatch state patch) = true ∧
      parallelMultiInstanceProgramBindingsValid program (applyInternalTimerTaskPatch state patch) = true := by
  have disjoint := prepared_timer_task_excludes_multiInstance program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let selected := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  let taskState : RuntimeState :=
    { state with
      waits := insertUserTaskWait wait state.waits
      activations := setActivationCount state.activations wait.task.id wait.activation }
  let timerState : RuntimeState :=
    { taskState with
      timerWaits := insertTimerWait selected.timer state.timerWaits
      timerActivations := setTimerActivationCount state.timerActivations selected.timer.elementId
        selected.timer.activation }
  have taskDisjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ => task.id ≠ wait.task.id
      | .awaitParallelMultiInstanceUserTask _ _ _ taskId _ _ _ _ _ _ => taskId ≠ wait.task.id
      | _ => True := by
    intro operation member
    have separate := disjoint operation member
    cases operation <;> first | trivial | exact separate.1
  have timerDisjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ _ _ _ timer _ => timer.elementId ≠ selected.timer.elementId
      | .awaitParallelMultiInstanceUserTask _ _ _ _ _ _ _ timer _ _ => timer.elementId ≠ selected.timer.elementId
      | _ => True := by
    intro operation member
    have separate := disjoint operation member
    cases operation <;> first | trivial | exact separate.2
  have sequentialDisjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
          task.id.value ≠ selected.record.activityElementId.value
      | _ => True := by
    intro operation member
    have separate := taskDisjoint operation member
    cases operation <;> try trivial
    intro same
    exact separate (taskDefinitionId_eq_of_value_eq _ _ same)
  refine ⟨controllersOwnLiveActivity_insert_unrelated_activity program state selected.record
    sequentialDisjoint sequential controllers, ?_, ?_⟩
  · have taskValid : sequentialMultiInstanceProgramBindingsValid program taskState = true :=
      smiBindings_insertUserTaskWait_frame program state wait (by
        intro operation member
        have separate := taskDisjoint operation member
        cases operation <;> trivial) sequential
    have timerValid : sequentialMultiInstanceProgramBindingsValid program timerState = true :=
      smiBindings_insertTimerWait_frame program taskState selected.timer (by
        intro operation member
        have separate := timerDisjoint operation member
        cases operation <;> trivial) taskValid
    exact sequentialBindings_insertActivityOccurrence_frame program timerState selected.record
      sequentialDisjoint timerValid
  · have taskValid : parallelMultiInstanceProgramBindingsValid program taskState = true :=
      parallelMultiInstanceProgramBindingsValid_insertUserTaskWait_frame program state wait
        taskDisjoint parallel
    have timerValid : parallelMultiInstanceProgramBindingsValid program timerState = true :=
      parallelMultiInstanceProgramBindingsValid_insertTimerWait_frame program taskState selected.timer
        timerDisjoint (by
          intro operation member
          have separate := timerDisjoint operation member
          cases operation <;> try trivial
          simp only [ParallelMultiInstanceArm.ofOperation?]
          exact timerActivationCount_set_other taskState _ _ _ separate) taskValid
    exact parallelBindings_insertActivityOccurrence_frame program timerState selected.record (by
      intro operation member arm projects
      have separate := taskDisjoint operation member
      cases operation <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
      cases projects
      intro same
      exact separate (taskDefinitionId_eq_of_value_eq _ _ same)) timerValid

/-- Complete predecessor preparation preserves the unchanged aggregate runtime predicate.
The task and Timer insertion lemmas discharge component facts, never intermediate validity premises. -/
theorem prepared_timer_task_preserves_runtime
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch) (expectedInstance : SemanticId)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (wellFormed : runtimeStateWellFormed program expectedInstance state = true) :
    runtimeStateWellFormed program expectedInstance (applyInternalTimerTaskPatch state patch) = true := by
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed
  obtain ⟨aggregate, ⟨⟨⟨claims, retention⟩, snapshots⟩, execution⟩⟩ := wellFormed
  obtain ⟨aggregate, _lifecycle⟩ := aggregate
  obtain ⟨aggregate, notExhausted⟩ := aggregate
  obtain ⟨aggregate, controllerIds⟩ := aggregate
  obtain ⟨aggregate, parallel⟩ := aggregate
  obtain ⟨aggregate, sequential⟩ := aggregate
  obtain ⟨aggregate, controllers⟩ := aggregate
  obtain ⟨aggregate, activityIds⟩ := aggregate
  obtain ⟨aggregate, messages⟩ := aggregate
  obtain ⟨aggregate, timers⟩ := aggregate
  obtain ⟨aggregate, records⟩ := aggregate
  obtain ⟨aggregate, order⟩ := aggregate
  obtain ⟨aggregate, hidden⟩ := aggregate
  obtain ⟨aggregate, declarations⟩ := aggregate
  obtain ⟨aggregate, bounds⟩ := aggregate
  obtain ⟨aggregate, waitIds⟩ := aggregate
  obtain ⟨aggregate, owners⟩ := aggregate
  obtain ⟨aggregate, incidents⟩ := aggregate
  obtain ⟨position, races⟩ := aggregate
  have ownersAfter := prepared_timer_task_preserves_wait_owners program state contract patch prepared owners
  have waitIdsAfter := prepared_timer_task_preserves_wait_identities program state contract patch prepared waitIds
  have boundsAfter := prepared_timer_task_preserves_identity_bounds program state contract patch prepared bounds
  have declarationsAfter := prepared_timer_task_preserves_wait_declarations program state contract patch expectedInstance
    prepared declarations
  have orderAfter := prepared_timer_task_preserves_order program state contract patch prepared order
  have recordsAfter := prepared_timer_task_preserves_activity_work program state contract patch prepared bounds records timers
  have timersAfter := prepared_timer_task_preserves_timer_attachments program state contract patch prepared records timers
  have activityIdsAfter := prepared_timer_task_preserves_activity_identities program state contract patch prepared activityIds
  have multiAfter := prepared_timer_task_preserves_multiInstance program state contract patch prepared controllers sequential parallel
  have claimsAfter := prepareInternalTimerTaskContract_preserves_bodyClaims program state contract patch prepared claims
  have timerFresh := prepared_timer_task_timer_keys_fresh program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, owned, running, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let selected := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  let after := applyInternalTimerTaskPatch state selected
  have control : state.control = .running instanceId := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have positionAfter : runtimePositionValid program expectedInstance after = true :=
    runtimePositionValid_removeToken_frame program expectedInstance state after contract.input owner
      position owned rfl rfl rfl rfl
  have racesAfter : eventRaceAssociationsValid after = true :=
    eventRaces_insertTimerWait state selected.timer timerFresh races
  have messagesAfter : attachedMessagesUnambiguous after = true :=
    insertActivityOccurrence_preserves_attachedMessagesUnambiguous_of_empty state selected.record
      (by simp [selected, makeInternalTimerTaskPatch, ActivityOccurrence.messageHandlerOccurrences]) messages
  have lifecycleAfter : (match after.control with
      | .notStarted => notStartedStateEmpty after
      | _ => true) = true := by
    simp [after, selected, applyInternalTimerTaskPatch, makeInternalTimerTaskPatch,
      applyInternalArmingPatch, control]
  have executionAfter : compensationExecutionStateValid program after = true :=
    (compensationExecutionStateValid_running_frame program state after instanceId control
      rfl rfl rfl rfl rfl rfl).trans execution
  change runtimeStateWellFormed program expectedInstance after = true
  simp only [runtimeStateWellFormed, Bool.and_eq_true]
  exact ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨positionAfter, racesAfter⟩, incidents⟩,
    ownersAfter⟩, waitIdsAfter⟩, boundsAfter⟩, declarationsAfter⟩, hidden⟩,
    orderAfter⟩, recordsAfter⟩, timersAfter⟩, messagesAfter⟩, activityIdsAfter⟩,
    multiAfter.1⟩, multiAfter.2.1⟩, multiAfter.2.2⟩, controllerIds⟩, notExhausted⟩, lifecycleAfter⟩,
    ⟨⟨⟨claimsAfter, retention⟩, snapshots⟩, executionAfter⟩⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
