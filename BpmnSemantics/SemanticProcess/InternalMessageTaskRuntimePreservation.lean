import BpmnSemantics.SemanticProcess.InternalMessageTaskValidity
import BpmnSemantics.SemanticProcess.ActivityDataInputOutputMultiInstanceFrames
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStatePreservation
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateEntryOrder

/-! Message-host arming preserves the existing runtime predicate from complete raw preparation.
The independent issuer and attachment obligations remain separate from public projection. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_message_task_preserves_identity_bounds
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (bounds : runtimeStateIdentityBound state = true) :
    runtimeStateIdentityBound (applyInternalMessageTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let selected := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  let after := applyInternalMessageTaskPatch state selected
  have taskBounds := applyInternalArmingPatch_preserves_identityBound state selected.arm rfl bounds
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
  simp only [runtimeStateIdentityBound, Bool.and_eq_true] at taskBounds ⊢
  refine ⟨taskBounds.1, ?_⟩
  simp only [List.all_eq_true, decide_eq_true_eq] at taskBounds ⊢
  intro record member
  change record ∈ insertActivityOccurrence _ state.activityOccurrences at member
  rw [insertActivityOccurrence_eq_canonicalInsertBy, mem_canonicalInsertBy] at member
  rcases member with rfl | old
  · exact Nat.le_of_eq (activityActivationCount_set_self state contract.task.id
      (activityActivationCount state contract.task.id + 1)).symm
  · exact Nat.le_trans (taskBounds.2 record old) (activities ⟨record.activityElementId.value⟩)

theorem prepared_message_task_preserves_wait_owners
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (owners : waitOwnersLive state = true) :
    waitOwnersLive (applyInternalMessageTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, live, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  simp only [waitOwnersLive, Bool.and_eq_true] at owners ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨taskOwners, messageOwners⟩, timerOwners⟩, effectOwners⟩,
    incidentOwners⟩, selectionOwners⟩, raceOwners⟩, callOwners⟩, activityOwners⟩ := owners
  refine ⟨⟨⟨⟨⟨⟨⟨⟨?_, ?_⟩, timerOwners⟩, effectOwners⟩,
    incidentOwners⟩, selectionOwners⟩, raceOwners⟩, callOwners⟩, ?_⟩
  · change (insertUserTaskWait _ state.waits).all (fun wait => exactLiveOccurrence state wait.owner) = true
    rw [all_insertUserTaskWait]
    exact Bool.and_eq_true_iff.mpr ⟨live, taskOwners⟩
  · change (insertMessageWait _ state.messageWaits).all (fun wait => exactLiveOccurrence state wait.owner) = true
    rw [insertMessageWait, all_canonicalInsertBy]
    exact Bool.and_eq_true_iff.mpr ⟨live, messageOwners⟩
  · change (insertActivityOccurrence _ state.activityOccurrences).all
      (fun record => exactLiveOccurrence state record.owner) = true
    rw [insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy]
    exact Bool.and_eq_true_iff.mpr ⟨live, activityOwners⟩

theorem prepared_message_task_preserves_wait_identities
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (identities : waitIdentitiesUnique state = true) :
    waitIdentitiesUnique (applyInternalMessageTaskPatch state patch) = true := by
  have messageFresh := prepared_message_task_message_keys_fresh program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, taskAbsent, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  have taskFresh := armingPatch_key_fresh_of_anchor_absent state
    (makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin).arm taskAbsent
  simp only [waitIdentitiesUnique, Bool.and_eq_true] at identities ⊢
  refine ⟨⟨⟨?_, ?_⟩, identities.1.2⟩, identities.2⟩
  · change (insertUserTaskWait _ state.waits).all (occursOnce userTaskWaitKeyMatches
      (insertUserTaskWait _ state.waits)) = true
    rw [insertUserTaskWait_eq_canonicalInsertBy]
    exact occurrenceKeysUnique_canonicalInsertBy _ _ _ _ identities.1.1.1 taskFresh
      (by simp [userTaskWaitKeyMatches])
  · change (insertMessageWait _ state.messageWaits).all (occursOnce messageWaitKeyMatches
      (insertMessageWait _ state.messageWaits)) = true
    rw [insertMessageWait]
    exact occurrenceKeysUnique_canonicalInsertBy _ _ _ _ identities.1.1.2 messageFresh
      (by simp [messageWaitKeyMatches])

theorem prepared_message_task_preserves_activity_identities
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (identities : activityIdentitiesUnique state = true) :
    activityIdentitiesUnique (applyInternalMessageTaskPatch state patch) = true := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, disjoint, _, _⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
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

theorem prepared_message_task_preserves_wait_declarations
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch) (expectedInstance : SemanticId)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (declarations : waitDeclarationsValid program expectedInstance state = true) :
    waitDeclarationsValid program expectedInstance (applyInternalMessageTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, selected, _, _, _,
    taskDeclarer, messageDeclarer, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  have taskDeclared := declaredByExactlyOneOwnedOperation_of_exactSelection program
    contract.operation owner (userTaskWaitDeclarers program contract.task.id)
    (by simpa [uniqueFamilyDeclarer?] using taskDeclarer) selected
  have messageDeclared := declaredByExactlyOneOwnedOperation_of_exactSelection program
    contract.operation owner (messageWaitDeclarers program contract.message.elementId)
    (by simpa [uniqueFamilyDeclarer?] using messageDeclarer) selected
  simp only [waitDeclarationsValid, Bool.and_eq_true] at declarations ⊢
  obtain ⟨⟨⟨⟨tasks, messages⟩, timers⟩, effects⟩, incidents⟩ := declarations
  refine ⟨⟨⟨⟨?_, ?_⟩, timers⟩, effects⟩, incidents⟩
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
    change wait ∈ insertMessageWait _ state.messageWaits at raw
    rw [insertMessageWait, mem_canonicalInsertBy] at raw
    rcases raw with rfl | old
    · exact messageDeclared
    · exact List.all_eq_true.mp messages wait (List.mem_filter.mpr ⟨old, inInstance⟩)

theorem prepared_message_task_preserves_order
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (order : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder (applyInternalMessageTaskPatch state patch) = true := by
  have taskOrder := applyInternalArmingPatch_preserves_order state patch.arm order
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let selected := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  simp only [canonicalCollectionOrder, Bool.and_eq_true] at taskOrder ⊢
  obtain ⟨⟨⟨⟨taskOrder, scopeOrder⟩, scopeCounterOrder⟩, callCounterOrder⟩, raceCounterOrder⟩ := taskOrder
  refine ⟨⟨⟨⟨?_, scopeOrder⟩, scopeCounterOrder⟩, callCounterOrder⟩, raceCounterOrder⟩
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨tokenOrder, activityCounterOrder⟩, waitOrder⟩, activationOrder⟩, messageOrder⟩,
    timerOrder⟩, effectOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
    effectActivationOrder⟩, variableOrder⟩, selectionOrder⟩, raceOrder⟩,
    callOrder⟩, activityOrder⟩, sequentialOrder⟩, parallelOrder⟩ := taskOrder
  refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨tokenOrder, ?_⟩, waitOrder⟩, activationOrder⟩, ?_⟩,
    timerOrder⟩, effectOrder⟩, ?_⟩, timerActivationOrder⟩, effectActivationOrder⟩,
    variableOrder⟩, selectionOrder⟩, raceOrder⟩, callOrder⟩, ?_⟩, sequentialOrder⟩, parallelOrder⟩
  · exact orderedBy_insertTaskActivation _ _
      (orderedBy_filter activationBefore_compose _ _ activityCounterOrder)
  · exact orderedBy_insertMessageWait_preserved selected.message state.messageWaits messageOrder
  · have inserted := orderedBy_replaceStringKey
      (fun value : MessageActivation => value.elementId.value) messageActivationBefore
      (fun _ _ => rfl) { elementId := selected.message.elementId, count := selected.message.activation }
      (fun activation => !decide (activation.elementId = selected.message.elementId))
      state.messageActivations messageActivationOrder
    simpa only [applyInternalMessageTaskPatch, setMessageActivationCount, decide_not] using inserted
  · change orderedBy activityOccurrenceBefore
      (insertActivityOccurrence selected.record state.activityOccurrences) = true
    rw [insertActivityOccurrence_eq_canonicalInsertBy]
    exact orderedBy_canonicalInsertBy activityOccurrenceBefore activityOccurrenceBefore_asymm
      selected.record state.activityOccurrences activityOrder

theorem prepared_message_task_preserves_handler_attachments
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (timers : attachedTimersUnambiguous state = true)
    (messages : attachedMessagesUnambiguous state = true) :
    attachedTimersUnambiguous (applyInternalMessageTaskPatch state patch) = true ∧
      attachedMessagesUnambiguous (applyInternalMessageTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, disjoint, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let selected := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  have handlers : selected.record.messageHandlerOccurrences = [messageWaitOccurrence selected.message] := rfl
  have fresh : ∀ old ∈ state.activityOccurrences,
      messageWaitOccurrence selected.message ∉ old.messageHandlerOccurrences := by
    intro old member claimed
    obtain ⟨handler, present, matched⟩ := List.mem_filterMap.mp claimed
    cases handler with
    | timer _ => contradiction
    | message identity =>
        have same : identity = messageWaitOccurrence selected.message := Option.some.inj matched
        subst identity
        have conflict : regionalActivityAssociationsConflict old selected.record = true := by
          simp only [regionalActivityAssociationsConflict, Bool.or_eq_true]
          exact Or.inr (List.any_eq_true.mpr ⟨_, present, by simp [selected, makeInternalMessageTaskPatch, messageWaitOccurrence]⟩)
        have absent := List.any_eq_false.mp disjoint old member
        exact absent conflict
  constructor
  · unfold attachedTimersUnambiguous at timers ⊢
    apply List.all_eq_true.mpr
    intro wait member
    have prior := List.all_eq_true.mp timers wait member
    change decide (((insertActivityOccurrence selected.record state.activityOccurrences).filter
      (fun record => anyTimerIdNamesWait record.timerHandlerOccurrences wait)).length ≤ 1) = true
    rw [insertActivityOccurrence_eq_canonicalInsertBy, filter_canonicalInsertBy_rejected]
    · exact prior
    · simp [selected, makeInternalMessageTaskPatch, anyTimerIdNamesWait, ActivityOccurrence.timerHandlerOccurrences]
  · unfold attachedMessagesUnambiguous at messages ⊢
    simp only [List.all_eq_true, decide_eq_true_eq] at messages ⊢
    intro candidate member subscription attached
    change candidate ∈ insertActivityOccurrence selected.record state.activityOccurrences at member
    rw [insertActivityOccurrence_eq_canonicalInsertBy, mem_canonicalInsertBy] at member
    change ((insertActivityOccurrence selected.record state.activityOccurrences).filter
      (fun record => record.messageHandlerOccurrences.contains subscription)).length ≤ 1
    rcases member with same | old
    · subst candidate
      rw [handlers] at attached
      have same := List.mem_singleton.mp attached
      subst subscription
      have empty : state.activityOccurrences.filter (fun record =>
          record.messageHandlerOccurrences.contains (messageWaitOccurrence selected.message)) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro record member
        simpa only [List.contains_eq_mem, decide_eq_true_eq] using fresh record member
      rw [insertActivityOccurrence_eq_canonicalInsertBy, length_filter_canonicalInsertBy, empty]
      simp [handlers]
    · have prior := messages candidate old subscription attached
      have rejected : selected.record.messageHandlerOccurrences.contains subscription = false := by
        simp only [handlers, List.contains_eq_mem, List.mem_singleton, decide_eq_false_iff_not]
        intro same
        exact fresh candidate old (same ▸ attached)
      rw [insertActivityOccurrence_eq_canonicalInsertBy,
        filter_canonicalInsertBy_rejected activityOccurrenceBefore
          (fun record => record.messageHandlerOccurrences.contains subscription)
          selected.record state.activityOccurrences rejected]
      exact prior

theorem prepared_message_task_preserves_multiInstance
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (controllers : controllersOwnLiveActivity state = true)
    (sequential : sequentialMultiInstanceProgramBindingsValid program state = true)
    (parallel : parallelMultiInstanceProgramBindingsValid program state = true) :
    controllersOwnLiveActivity (applyInternalMessageTaskPatch state patch) = true ∧
      sequentialMultiInstanceProgramBindingsValid program (applyInternalMessageTaskPatch state patch) = true ∧
      parallelMultiInstanceProgramBindingsValid program (applyInternalMessageTaskPatch state patch) = true := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, unique, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let selected := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  let wait : UserTaskWait :=
    { processInstanceId := instanceId, owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  let taskState : RuntimeState :=
    { state with
      waits := insertUserTaskWait wait state.waits
      activations := setActivationCount state.activations wait.task.id wait.activation }
  have declarers : userTaskWaitDeclarers program contract.task.id = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using unique
  have disjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ => task.id ≠ wait.task.id
      | .awaitParallelMultiInstanceUserTask _ _ _ taskId _ _ _ _ _ _ => taskId ≠ wait.task.id
      | _ => True := by
    intro operation member
    cases operation <;> try trivial
    all_goals
      intro same
      have conflict : _ ∈ userTaskWaitDeclarers program contract.task.id :=
        List.mem_filter.mpr ⟨member, by simpa [wait] using same⟩
      rw [declarers] at conflict
      cases kind : contract.kind <;> simp [InternalMessageTaskContract.operation, kind] at conflict
  have sequentialDisjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ => task.id.value ≠ selected.record.activityElementId.value
      | _ => True := by
    intro operation member
    have separate := disjoint operation member
    cases operation <;> try trivial
    intro same
    exact separate (taskDefinitionId_eq_of_value_eq _ _ same)
  refine ⟨controllersOwnLiveActivity_insert_unrelated_activity program state selected.record
    sequentialDisjoint sequential controllers, ?_, ?_⟩
  · have taskValid : sequentialMultiInstanceProgramBindingsValid program taskState = true :=
      smiBindings_insertUserTaskWait_frame program state wait (by
        intro operation member
        have separate := disjoint operation member
        cases operation <;> trivial) sequential
    exact sequentialBindings_insertActivityOccurrence_frame program taskState selected.record
      sequentialDisjoint taskValid
  · have taskValid : parallelMultiInstanceProgramBindingsValid program taskState = true :=
      parallelMultiInstanceProgramBindingsValid_insertUserTaskWait_frame program state wait disjoint parallel
    exact parallelBindings_insertActivityOccurrence_frame program taskState selected.record (by
      intro operation member arm projects
      have separate := disjoint operation member
      cases operation <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
      cases projects
      intro same
      exact separate (taskDefinitionId_eq_of_value_eq _ _ same)) taskValid

/-- Complete predecessor preparation preserves the unchanged aggregate runtime predicate.
The Task and Message insertion lemmas discharge component facts, never intermediate validity premises. -/
theorem prepared_message_task_preserves_runtime
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch) (expectedInstance : SemanticId)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (wellFormed : runtimeStateWellFormed program expectedInstance state = true) :
    runtimeStateWellFormed program expectedInstance (applyInternalMessageTaskPatch state patch) = true := by
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
  have ownersAfter := prepared_message_task_preserves_wait_owners program state contract patch prepared owners
  have waitIdsAfter := prepared_message_task_preserves_wait_identities program state contract patch prepared waitIds
  have boundsAfter := prepared_message_task_preserves_identity_bounds program state contract patch prepared bounds
  have declarationsAfter := prepared_message_task_preserves_wait_declarations program state contract patch expectedInstance
    prepared declarations
  have orderAfter := prepared_message_task_preserves_order program state contract patch prepared order
  have recordsAfter := prepared_message_task_preserves_activity_work program state contract patch prepared bounds records
  have attachmentsAfter := prepared_message_task_preserves_handler_attachments program state contract patch prepared timers messages
  have activityIdsAfter := prepared_message_task_preserves_activity_identities program state contract patch prepared activityIds
  have multiAfter := prepared_message_task_preserves_multiInstance program state contract patch prepared controllers sequential parallel
  have claimsAfter := prepareInternalMessageTaskContract_preserves_bodyClaims program state contract patch prepared claims
  have messageFresh := prepared_message_task_message_keys_fresh program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, owned, running, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let selected := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  let after := applyInternalMessageTaskPatch state selected
  have control : state.control = .running instanceId := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have positionAfter : runtimePositionValid program expectedInstance after = true :=
    runtimePositionValid_removeToken_frame program expectedInstance state after contract.input owner
      position owned rfl rfl rfl rfl
  have racesAfter : eventRaceAssociationsValid after = true :=
    eventRaces_insertMessageWait state selected.message messageFresh races
  have lifecycleAfter : (match after.control with
      | .notStarted => notStartedStateEmpty after
      | _ => true) = true := by
    simp [after, selected, applyInternalMessageTaskPatch, makeInternalMessageTaskPatch,
      applyInternalArmingPatch, control]
  have executionAfter : compensationExecutionStateValid program after = true :=
    (compensationExecutionStateValid_running_frame program state after instanceId control
      rfl rfl rfl rfl rfl rfl).trans execution
  change runtimeStateWellFormed program expectedInstance after = true
  simp only [runtimeStateWellFormed, Bool.and_eq_true]
  exact ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨positionAfter, racesAfter⟩, incidents⟩,
    ownersAfter⟩, waitIdsAfter⟩, boundsAfter⟩, declarationsAfter⟩, hidden⟩,
    orderAfter⟩, recordsAfter⟩, attachmentsAfter.1⟩, attachmentsAfter.2⟩, activityIdsAfter⟩,
    multiAfter.1⟩, multiAfter.2.1⟩, multiAfter.2.2⟩, controllerIds⟩, notExhausted⟩, lifecycleAfter⟩,
    ⟨⟨⟨claimsAfter, retention⟩, snapshots⟩, executionAfter⟩⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
