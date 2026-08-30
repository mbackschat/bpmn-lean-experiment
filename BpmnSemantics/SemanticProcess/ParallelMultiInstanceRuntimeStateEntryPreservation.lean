import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateEmptyPreservation

/-! # Parallel Multi-Instance shared runtime-state entry preservation

This module owns nonempty insertion and complete shared entry-step preservation. The evaluator
corollary and closing preservation remain downstream and are not imported here.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem activityOccurrenceBefore_asymm (left right : ActivityOccurrence) :
    activityOccurrenceBefore left right = true →
      activityOccurrenceBefore right left = false := by
  by_cases processEq : left.processInstanceId.value = right.processInstanceId.value
  · by_cases activityEq : left.activityElementId.value = right.activityElementId.value
    · simp [activityOccurrenceBefore, processEq, activityEq]
      exact Nat.le_of_lt
    · simp [activityOccurrenceBefore, processEq, activityEq, Ne.symm activityEq]
      exact Std.le_of_lt
  · simp [activityOccurrenceBefore, processEq, Ne.symm processEq]
    exact Std.le_of_lt

theorem sharedParallelEntry_preserves_runtimeStateWellFormed (program : Program)
    (expectedInstanceId : SemanticId) (arm : ParallelMultiInstanceArm)
    (ownerScope : DefinitionScopeId) (account : SharedParallelProgramAccount program arm ownerScope)
    (before after : RuntimeState) (step : SharedParallelMultiInstanceEntryStep arm before after)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true) :
    runtimeStateWellFormed program expectedInstanceId after = true := by
  cases step with
  | empty instanceId owner running tokenOwner controllerAbsent _ _ _ _ _ rewrite =>
      subst after
      exact sharedParallelEmpty_preserves_runtimeStateWellFormed program expectedInstanceId arm
        ownerScope account before instanceId owner running tokenOwner controllerAbsent wellFormed
  | nonempty instanceId owner firstItem restItems running tokenOwner controllerAbsent
      recordAbsent taskWaitAbsent timerWaitAbsent snapshot outputAbsent firstTask restTasks pending
      rewrite =>
      subst after
      let items := firstItem :: restItems
      let taskHighWater := activationCount before arm.taskId
      let activityActivation := activityActivationCount before arm.taskId + 1
      let timerActivation := timerActivationCount before arm.boundaryTimer.elementId + 1
      let slots := pendingParallelSlots instanceId arm.taskId taskHighWater items
      let controller : ParallelMultiInstanceController :=
        { id :=
            { processInstanceId := instanceId
              activityElementId := ⟨arm.taskId.value⟩
              activation := activityActivation }
          snapshot := items
          slots }
      let timerId : TimerOccurrenceId :=
        { processInstanceId := instanceId
          elementId := ⟨arm.boundaryTimer.elementId.value⟩
          activation := timerActivation }
      let timerWait : TimerWait :=
        { processInstanceId := instanceId
          owner
          elementId := arm.boundaryTimer.elementId
          activation := timerActivation
          deadlineMs := before.logicalTimeMs + arm.boundaryTimer.durationMs
          output := arm.boundaryTimer.output }
      let record : ActivityOccurrence :=
        { processInstanceId := instanceId
          activityElementId := ⟨arm.taskId.value⟩
          activation := activityActivation
          owner
          body := .parallelUserTasks firstTask restTasks
          attachedHandlers := [.timer timerId] }
      let successor : RuntimeState :=
        { before with
          tokens := removeToken before.tokens arm.input owner
          waits := insertParallelChildWaits arm owner slots before.waits
          timerWaits := insertTimerWait timerWait before.timerWaits
          activityOccurrences := insertActivityOccurrence record before.activityOccurrences
          parallelMultiInstanceControllers := insertParallelMultiInstanceController controller
            before.parallelMultiInstanceControllers
          activations := setActivationCount before.activations arm.taskId
            (taskHighWater + items.length)
          timerActivations := setTimerActivationCount before.timerActivations
            arm.boundaryTimer.elementId timerActivation
          activityActivations := setActivationCount before.activityActivations arm.taskId
            activityActivation }
      change runtimeStateWellFormed program expectedInstanceId successor = true
      simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed
      obtain ⟨existing, claims⟩ := wellFormed
      obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, races⟩, incidents⟩, owners⟩, identities⟩,
        bounds⟩, declarations⟩, hidden⟩, order⟩, bodies⟩, timersUnambiguous⟩,
        messagesUnambiguous⟩, activityIds⟩, controllers⟩, sequentialBindings⟩,
        parallelBindings⟩, controllerIds⟩, notExhausted⟩, lifecycle⟩ := existing
      have ownerFacts := runtimePositionValid_onlyTokenOwner_live_and_scope program
        expectedInstanceId before arm.input owner ownerScope position tokenOwner account.inputOwner
      have positionAfter : runtimePositionValid program expectedInstanceId successor = true :=
        runtimePositionValid_removeToken_frame program expectedInstanceId before successor arm.input
          owner position tokenOwner (by rfl) (by rfl) (by rfl) (by rfl)
      have ownerLive : exactLiveOccurrence successor owner = true := by
        simpa [successor, exactLiveOccurrence] using ownerFacts.1
      have noParallelControllers := admitted_parallel_controllers_absent program arm ownerScope
        account before parallelBindings controllerAbsent
      have noSequentialOperation := admitted_parallel_has_no_sequential_operation program arm
        ownerScope account
      have noSequentialControllers := sequential_controllers_absent program before
        noSequentialOperation sequentialBindings
      let childState : RuntimeState :=
        { before with
          waits := insertParallelChildWaits arm owner slots before.waits
          activations := setActivationCount before.activations arm.taskId
            (taskHighWater + items.length) }
      have childFacts : runtimeStateIdentityBound childState = true ∧
          activityRecordsOwnLiveWork childState = true := by
        have staged := insertPendingParallelChildWaitState_preserves arm owner instanceId
          taskHighWater 0 items before rfl bounds bodies
        rw [insertPendingParallelChildWaitState_eq arm owner instanceId taskHighWater 0 firstItem
          restItems before] at staged
        simpa [childState, slots, items, pendingParallelSlots, Nat.add_assoc] using staged
      have oldTaskDifferent : ∀ wait ∈ before.waits, wait.task.id ≠ arm.taskId := by
        intro wait member same
        have present : before.waits.any (fun candidate => candidate.task.id == arm.taskId) = true := by
          rw [List.any_eq_true]
          exact ⟨wait, member, by simp [same]⟩
        rw [taskWaitAbsent] at present
        contradiction
      have oldTimerDifferent : ∀ wait ∈ before.timerWaits,
          wait.elementId ≠ arm.boundaryTimer.elementId := by
        intro wait member same
        have present : before.timerWaits.any (fun candidate =>
            candidate.elementId == arm.boundaryTimer.elementId) = true := by
          rw [List.any_eq_true]
          exact ⟨wait, member, by simp [same]⟩
        rw [timerWaitAbsent] at present
        contradiction
      have oldRecordDifferent : ∀ old ∈ before.activityOccurrences,
          old.activityElementId.value ≠ arm.taskId.value := by
        intro old member same
        have present : before.activityOccurrences.any (fun candidate =>
            candidate.activityElementId.value == arm.taskId.value) = true := by
          rw [List.any_eq_true]
          exact ⟨old, member, by simp [same]⟩
        rw [recordAbsent] at present
        contradiction
      have timerFresh : ∀ old ∈ childState.timerWaits,
          timerWaitKeyMatches timerWait old = false ∧
            timerWaitKeyMatches old timerWait = false := by
        intro old member
        have different := oldTimerDifferent old (by simpa [childState] using member)
        constructor <;> apply Bool.eq_false_iff.mpr <;> intro matched
        · simp only [timerWaitKeyMatches, Bool.and_eq_true, decide_eq_true_eq] at matched
          exact different matched.1.2.symm
        · simp only [timerWaitKeyMatches, Bool.and_eq_true, decide_eq_true_eq] at matched
          exact different matched.1.2
      let timerState : RuntimeState :=
        { childState with
          timerWaits := insertTimerWait timerWait childState.timerWaits
          timerActivations := setTimerActivationCount childState.timerActivations
            timerWait.elementId timerWait.activation }
      have timerBound : runtimeStateIdentityBound timerState = true := by
        have next : timerWait.activation = timerActivationCount childState timerWait.elementId + 1 := by
          change timerActivation = timerActivationCount before arm.boundaryTimer.elementId + 1
          rfl
        simpa [timerState] using
          insertNextTimer_preserves_identityBound childState timerWait next childFacts.1
      have timerSemantic : activityRecordsOwnLiveWork timerState = true ∧
          attachedTimersUnambiguous timerState = true := by
        have attachedChild : attachedTimersUnambiguous childState = true := by
          change attachedTimersUnambiguous before = true
          exact timersUnambiguous
        have preserved := InternalCommutation.activityRecords_insertFreshTimerWait childState
          timerWait timerFresh childFacts.2 attachedChild
        constructor
        · change activityRecordsOwnLiveWork
            { childState with timerWaits := insertTimerWait timerWait childState.timerWaits } = true
          exact preserved.1
        · change attachedTimersUnambiguous
            { childState with timerWaits := insertTimerWait timerWait childState.timerWaits } = true
          exact preserved.2
      let recordState : RuntimeState :=
        { timerState with
          activityOccurrences := insertActivityOccurrence record timerState.activityOccurrences
          activityActivations := setActivationCount timerState.activityActivations arm.taskId
            record.activation }
      have recordBound : runtimeStateIdentityBound recordState = true := by
        have next : record.activation = activityActivationCount timerState
            ⟨record.activityElementId.value⟩ + 1 := by
          change activityActivation = activityActivationCount before arm.taskId + 1
          rfl
        have fresh : ∀ old ∈ timerState.activityOccurrences,
            old.activityElementId.value ≠ record.activityElementId.value := by
          intro old member
          simpa [timerState, childState, record] using oldRecordDifferent old member
        simpa [recordState, record] using
          insertNextActivity_preserves_identityBound timerState record next fresh timerBound
      have boundsAfter : runtimeStateIdentityBound successor = true := by
        change runtimeStateIdentityBound recordState = true
        exact recordBound
      simp only [waitIdentitiesUnique, Bool.and_eq_true] at identities
      obtain ⟨⟨⟨taskIdentities, messageIdentities⟩, timerIdentities⟩, effectIdentities⟩ :=
        identities
      have childIdentities : childState.waits.all
          (occursOnce userTaskWaitKeyMatches childState.waits) = true := by
        have prior : ∀ wait ∈ before.waits, wait.task.id = arm.taskId →
            wait.activation < taskHighWater + 0 + 1 := by
          intro wait member same
          simp only [runtimeStateIdentityBound, Bool.and_eq_true, List.all_eq_true,
            decide_eq_true_eq] at bounds
          have upper := bounds.1.1 wait member
          rw [same] at upper
          simpa [taskHighWater] using Nat.lt_succ_of_le upper
        simpa [childState, slots, items, pendingParallelSlots, taskHighWater] using
          pendingParallelChildWaits_unique_from arm owner instanceId taskHighWater items 0
            before.waits taskIdentities prior
      have timerIdentitiesAfter : timerState.timerWaits.all
          (occursOnce timerWaitKeyMatches timerState.timerWaits) = true := by
        change (insertTimerWait timerWait childState.timerWaits).all
          (occursOnce timerWaitKeyMatches (insertTimerWait timerWait childState.timerWaits)) = true
        exact InternalCommutation.occurrenceKeysUnique_canonicalInsertBy timerWaitBefore
          timerWaitKeyMatches timerWait childState.timerWaits (by simpa [childState] using
            timerIdentities) timerFresh (by simp [timerWaitKeyMatches])
      have identitiesAfter : waitIdentitiesUnique successor = true := by
        simp only [waitIdentitiesUnique, Bool.and_eq_true]
        exact ⟨⟨⟨by simpa [successor, childState] using childIdentities, messageIdentities⟩,
          by simpa [successor, timerState, childState] using timerIdentitiesAfter⟩,
          effectIdentities⟩
      simp only [waitOwnersLive, Bool.and_eq_true] at owners
      obtain ⟨⟨⟨⟨⟨⟨⟨⟨taskOwners, messageOwners⟩, timerOwners⟩, effectOwners⟩,
        incidentOwners⟩, branchOwners⟩, raceOwners⟩, callOwners⟩, activityOwners⟩ := owners
      have ownersAfter : waitOwnersLive successor = true := by
        simp only [waitOwnersLive, Bool.and_eq_true]
        refine ⟨⟨⟨⟨⟨⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩
        · apply insertParallelChildWaits_all_live successor arm owner slots before.waits ownerLive
          simpa [successor, exactLiveOccurrence] using taskOwners
        · simpa [successor, exactLiveOccurrence] using messageOwners
        · simp only [successor, insertTimerWait, all_canonicalInsertBy, Bool.and_eq_true]
          exact ⟨by simpa [timerWait, exactLiveOccurrence, successor] using ownerLive,
            by simpa [successor, exactLiveOccurrence] using timerOwners⟩
        · simpa [successor, exactLiveOccurrence] using effectOwners
        · simpa [successor, exactLiveOccurrence] using incidentOwners
        · simpa [successor, exactLiveOccurrence] using branchOwners
        · simpa [successor, exactLiveOccurrence] using raceOwners
        · simpa [successor, exactLiveOccurrence] using callOwners
        · change (insertActivityOccurrence record before.activityOccurrences).all
            (fun occurrence => exactLiveOccurrence successor occurrence.owner) = true
          rw [List.all_eq_true]
          intro occurrence member
          rw [insertActivityOccurrence_eq_canonicalInsertBy] at member
          rcases (mem_canonicalInsertBy activityOccurrenceBefore record occurrence
            before.activityOccurrences).mp member with new | old
          · subst occurrence
            simpa [record, exactLiveOccurrence, successor] using ownerLive
          · exact List.all_eq_true.mp activityOwners occurrence old
      have entryId : account.entryOperation.id = arm.id :=
        parallelEntry_projection_id account.entryOperation arm account.projects
      have userDeclares : operationDeclaresWaitKey account.entryOperation
          (userTaskWaitDeclarationKey arm.taskId) = true :=
        parallelEntry_projection_declares_user_task account.entryOperation arm account.projects
      have timerDeclares : operationDeclaresWaitKey account.entryOperation
          (timerWaitDeclarationKey arm.boundaryTimer.elementId) = true :=
        parallelEntry_projection_declares_timer account.entryOperation arm account.projects
      have declaredUser : declaredByExactlyOneOwnedOperation program
          (userTaskWaitDeclarers program arm.taskId) owner = true := by
        rw [userTaskWaitDeclarers_eq_keyFilter,
          programWellFormed_waitDeclarer program account.entryOperation _ account.structural
            account.entryMember userDeclares]
        simp [declaredByExactlyOneOwnedOperation, entryId, account.entryOwner, ownerFacts.2]
      have declaredTimer : declaredByExactlyOneOwnedOperation program
          (timerWaitDeclarers program arm.boundaryTimer.elementId) owner = true := by
        rw [timerWaitDeclarers_eq_keyFilter,
          programWellFormed_waitDeclarer program account.entryOperation _ account.structural
            account.entryMember timerDeclares]
        simp [declaredByExactlyOneOwnedOperation, entryId, account.entryOwner, ownerFacts.2]
      simp only [waitDeclarationsValid, Bool.and_eq_true] at declarations
      obtain ⟨⟨⟨⟨userDeclarations, messageDeclarations⟩, timerDeclarations⟩,
        effectDeclarations⟩, incidentDeclarations⟩ := declarations
      have declarationsAfter : waitDeclarationsValid program expectedInstanceId successor = true := by
        simp only [waitDeclarationsValid, Bool.and_eq_true]
        refine ⟨⟨⟨⟨?_, messageDeclarations⟩, ?_⟩, effectDeclarations⟩, incidentDeclarations⟩
        · rw [List.all_eq_true]
          intro wait member
          obtain ⟨raw, expected⟩ := List.mem_filter.mp member
          rcases mem_insertParallelChildWaits_shape arm owner slots before.waits wait raw with old | new
          · exact List.all_eq_true.mp userDeclarations wait (List.mem_filter.mpr ⟨old, expected⟩)
          · simpa [new.1, new.2] using declaredUser
        · rw [List.all_eq_true]
          intro wait member
          obtain ⟨raw, expected⟩ := List.mem_filter.mp member
          rcases (mem_canonicalInsertBy timerWaitBefore timerWait wait before.timerWaits).mp raw with
            new | old
          · subst wait
            simpa [timerWait] using declaredTimer
          · exact List.all_eq_true.mp timerDeclarations wait
              (List.mem_filter.mpr ⟨old, expected⟩)
      have racesAfter : eventRaceAssociationsValid successor = true := by
        have inserted := InternalCommutation.eventRaces_insertTimerWait childState timerWait
          timerFresh (by simpa [eventRaceAssociationsValid, childState] using races)
        simpa [eventRaceAssociationsValid, successor, childState] using inserted
      have incidentsAfter : effectIncidentAssociationsValid successor = true := by
        rw [effectIncidentAssociationsValid_frame before successor (by rfl) (by rfl)
          (by rfl) (by rfl) (by rfl)]
        exact incidents
      have hiddenAfter : hiddenRecordDeclarationsValid program successor = true := by
        simpa [hiddenRecordDeclarationsValid, successor] using hidden
      have allPending : pendingParallelTaskIds slots = parallelSlotTaskIds slots := by
        simpa [slots, pendingParallelSlots] using
          pendingParallelSlots_all_pending instanceId arm.taskId taskHighWater 0 items
      have pendingIds : parallelSlotTaskIds slots = firstTask :: restTasks :=
        allPending.symm.trans pending
      have claimsAfter : activityBodyClaimsUnique successor.activityOccurrences = true := by
        simpa [successor, record, slots] using
          insertPendingParallelActivity_preserves_activityBodyClaimsUnique before arm instanceId
            taskHighWater items record firstTask restTasks pendingIds taskWaitAbsent bodies claims
      have recordBodyLive : activityBodyLive timerState record = true := by
        simp only [activityBodyLive, record, List.all_eq_true, decide_eq_true_eq]
        intro task taskMember
        have slotTask : task ∈ parallelSlotTaskIds slots := by
          rw [pendingIds]
          exact taskMember
        obtain ⟨slot, slotMember, sameTask⟩ := List.mem_map.mp slotTask
        subst task
        obtain ⟨wait, waitMember, waitEq⟩ :=
          pending_slot_has_inserted_wait arm owner slots before.waits slot slotMember
        subst wait
        have unique := List.all_eq_true.mp childIdentities
          (parallelEntryChildWait arm owner slot) (by
          simpa [childState] using waitMember)
        have identity := pendingParallelSlotsFrom_identity instanceId arm.taskId taskHighWater 0
          items slot (by simpa [slots, pendingParallelSlots] using slotMember)
        change (timerState.waits.filter fun candidate =>
          decide (candidate.processInstanceId = slot.taskId.processInstanceId) &&
            decide (candidate.task.id.value = slot.taskId.elementId.value) &&
            decide (candidate.activation = slot.taskId.activation)).length = 1
        change (childState.waits.filter fun candidate =>
          decide (candidate.processInstanceId = slot.taskId.processInstanceId) &&
            decide (candidate.task.id.value = slot.taskId.elementId.value) &&
            decide (candidate.activation = slot.taskId.activation)).length = 1
        have filterEq : childState.waits.filter (fun candidate =>
              decide (candidate.processInstanceId = slot.taskId.processInstanceId) &&
                decide (candidate.task.id.value = slot.taskId.elementId.value) &&
                decide (candidate.activation = slot.taskId.activation)) =
            childState.waits.filter
              (userTaskWaitKeyMatches (parallelEntryChildWait arm owner slot)) := by
          congr 1
          funext candidate
          simp [userTaskWaitKeyMatches, parallelEntryChildWait,
            taskDefinitionId_eq_iff_value_eq, identity.2.1, eq_comm]
        rw [filterEq]
        simpa [occursOnce] using unique
      have recordTimersLive : record.timerHandlerOccurrences.all (fun timer =>
          timerState.timerWaits.any fun wait =>
            timerIdNamesWait timer wait && decide (wait.owner = record.owner)) = true := by
        simp only [record, ActivityOccurrence.timerHandlerOccurrences, List.filterMap,
          List.all_cons, List.all_nil, Bool.and_true, List.any_eq_true]
        refine ⟨timerWait, ?_, ?_⟩
        · exact (mem_canonicalInsertBy timerWaitBefore timerWait timerWait
            childState.timerWaits).mpr (Or.inl rfl)
        · simp [timerIdNamesWait, timerId, timerWait]
      have bodiesAfter : activityRecordsOwnLiveWork successor = true := by
        simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true]
        intro candidate member
        change candidate ∈ insertActivityOccurrence record before.activityOccurrences at member
        rw [insertActivityOccurrence_eq_canonicalInsertBy] at member
        rcases (mem_canonicalInsertBy activityOccurrenceBefore record candidate
          before.activityOccurrences).mp member with new | old
        · subst candidate
          exact ⟨⟨by simpa [activityBodyLive, successor, timerState, childState]
              using recordBodyLive,
            by simpa [successor, timerState, childState] using recordTimersLive⟩,
            by simp [record, ActivityOccurrence.messageHandlerOccurrences]⟩
        · have prior := List.all_eq_true.mp timerSemantic.1 candidate (by
            simpa [timerState, childState] using old)
          simpa [activityBodyLive, successor, timerState, childState, exactLiveOccurrence] using prior
      have insertedTimerUnclaimed : ∀ old ∈ before.activityOccurrences,
          anyTimerIdNamesWait old.timerHandlerOccurrences timerWait = false := by
        intro old oldMember
        apply Bool.eq_false_iff.mpr
        intro insertedNamed
        have recordsChild := childFacts.2
        simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true] at recordsChild
        obtain ⟨⟨_, attachedOld⟩, _⟩ := recordsChild old (by simpa [childState] using oldMember)
        simp only [anyTimerIdNamesWait, List.any_eq_true] at insertedNamed
        obtain ⟨oldTimerId, oldTimerMember, insertedMatch⟩ := insertedNamed
        simp only [List.any_eq_true] at attachedOld
        obtain ⟨oldWait, oldWaitMember, oldMatch⟩ := attachedOld oldTimerId oldTimerMember
        simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq,
          decide_eq_true_eq] at insertedMatch oldMatch
        have elementEq : timerWait.elementId = oldWait.elementId :=
          congrArg NodeId.mk (insertedMatch.1.2.symm.trans oldMatch.1.1.2)
        have keyed : timerWaitKeyMatches timerWait oldWait = true := by
          simp [timerWaitKeyMatches, insertedMatch.1.1.symm.trans oldMatch.1.1.1,
            elementEq, insertedMatch.2.symm.trans oldMatch.1.2]
        rw [(timerFresh oldWait (by simpa [childState] using oldWaitMember)).1] at keyed
        contradiction
      have attachedAfter : attachedTimersUnambiguous successor = true := by
        simp only [attachedTimersUnambiguous, List.all_eq_true, decide_eq_true_eq]
        intro wait waitMember
        change wait ∈ insertTimerWait timerWait before.timerWaits at waitMember
        rcases (mem_canonicalInsertBy timerWaitBefore timerWait wait before.timerWaits).mp
          waitMember with new | old
        · subst wait
          change ((insertActivityOccurrence record before.activityOccurrences).filter (fun old =>
            anyTimerIdNamesWait old.timerHandlerOccurrences timerWait)).length ≤ 1
          rw [insertActivityOccurrence_eq_canonicalInsertBy,
            length_filter_canonicalInsertBy]
          have empty : before.activityOccurrences.filter (fun old =>
              anyTimerIdNamesWait old.timerHandlerOccurrences timerWait) = [] :=
            List.filter_eq_nil_iff.mpr fun old member holds => by
              rw [insertedTimerUnclaimed old member] at holds
              contradiction
          have claimed : anyTimerIdNamesWait record.timerHandlerOccurrences timerWait = true := by
            simp [record, ActivityOccurrence.timerHandlerOccurrences, timerId, timerWait,
              anyTimerIdNamesWait, timerIdNamesWait]
          rw [claimed, empty]
          simp
        · change ((insertActivityOccurrence record before.activityOccurrences).filter
            (fun candidate => anyTimerIdNamesWait candidate.timerHandlerOccurrences wait)).length ≤ 1
          rw [insertActivityOccurrence_eq_canonicalInsertBy,
            length_filter_canonicalInsertBy]
          have rejected : anyTimerIdNamesWait record.timerHandlerOccurrences wait = false := by
            apply Bool.eq_false_iff.mpr
            intro claimed
            simp only [record, ActivityOccurrence.timerHandlerOccurrences, List.filterMap,
              anyTimerIdNamesWait, List.any_cons, List.any_nil, Bool.or_false, timerIdNamesWait,
              timerId, Bool.and_eq_true, beq_iff_eq] at claimed
            exact oldTimerDifferent wait old
              (congrArg NodeId.mk claimed.1.2).symm
          have prior := List.all_eq_true.mp timerSemantic.2 wait (by
            exact (mem_canonicalInsertBy timerWaitBefore timerWait wait
              childState.timerWaits).mpr (Or.inr (by simpa [childState] using old)))
          simpa [rejected, timerState, childState] using prior
      have messagesUnambiguousAfter : attachedMessagesUnambiguous successor = true := by
        simpa [attachedMessagesUnambiguous, successor] using
          insertActivityOccurrence_preserves_attachedMessagesUnambiguous_of_empty before record
            (by simp [record, ActivityOccurrence.messageHandlerOccurrences]) messagesUnambiguous
      simp only [canonicalCollectionOrder, Bool.and_eq_true] at order
      obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨taskOrder, activationOrder⟩, messageWaitOrder⟩,
        timerWaitOrder⟩, effectWaitOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
        effectActivationOrder⟩, activityVariableOrder⟩, selectionOrder⟩, raceOrder⟩,
        callOrder⟩, activityOrder⟩, sequentialControllerOrder⟩, parallelControllerOrder⟩ := order
      have activationOrderAfter : orderedBy activationBefore successor.activations = true := by
        have inserted := InternalCommutation.orderedBy_replaceStringKey
          (fun value : TaskActivation => value.taskId.value) activationBefore (fun _ _ => rfl)
          { taskId := arm.taskId, count := taskHighWater + items.length }
          (fun activation => !decide (activation.taskId = arm.taskId)) before.activations
          activationOrder
        simpa [successor, setActivationCount, insertTaskActivation_eq_canonicalInsertBy,
          decide_not] using inserted
      have timerActivationOrderAfter : orderedBy timerActivationBefore
          successor.timerActivations = true := by
        have inserted := InternalCommutation.orderedBy_replaceStringKey
          (fun value : TimerActivation => value.elementId.value) timerActivationBefore
          (fun _ _ => rfl) { elementId := arm.boundaryTimer.elementId, count := timerActivation }
          (fun activation => !decide (activation.elementId = arm.boundaryTimer.elementId))
          before.timerActivations timerActivationOrder
        simpa [successor, setTimerActivationCount, decide_not] using inserted
      have orderAfter : canonicalCollectionOrder successor = true := by
        simp only [canonicalCollectionOrder, Bool.and_eq_true]
        refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨?_, activationOrderAfter⟩, messageWaitOrder⟩,
          ?_⟩, effectWaitOrder⟩, messageActivationOrder⟩, timerActivationOrderAfter⟩,
          effectActivationOrder⟩, activityVariableOrder⟩, selectionOrder⟩, raceOrder⟩,
          callOrder⟩, ?_⟩, ?_⟩, ?_⟩
        · exact insertParallelChildWaits_ordered arm owner slots before.waits taskOrder
        · simpa [successor] using
            InternalCommutation.orderedBy_insertTimerWait_preserved timerWait before.timerWaits
              timerWaitOrder
        · change orderedBy activityOccurrenceBefore
            (insertActivityOccurrence record before.activityOccurrences) = true
          rw [insertActivityOccurrence_eq_canonicalInsertBy]
          exact orderedBy_canonicalInsertBy activityOccurrenceBefore
            activityOccurrenceBefore_asymm record before.activityOccurrences activityOrder
        · rw [show successor.sequentialMultiInstanceControllers =
              before.sequentialMultiInstanceControllers by rfl, noSequentialControllers]
          change orderedBy sequentialMultiInstanceControllerBefore [] = true
          rfl
        · simp [successor, noParallelControllers, insertParallelMultiInstanceController,
            parallelMultiInstanceControllersOrdered]
      have parallelControllersAfter : successor.parallelMultiInstanceControllers = [controller] := by
        simp [successor, noParallelControllers, insertParallelMultiInstanceController]
      have matchingOperations : program.operations.filter (fun operation =>
          match ParallelMultiInstanceArm.ofOperation? operation with
          | some candidate => candidate.taskId.value == arm.taskId.value
          | none => false) = [account.entryOperation] :=
        parallelEntry_matching_operations program.operations account.entryOperation arm
          account.entryMember account.projects account.uniqueEntry
      have controllerRecords : successor.activityOccurrences.filter (fun candidate =>
          parallelControllerNamesIdentity controller candidate.processInstanceId
            ⟨candidate.activityElementId.value⟩ candidate.activation) = [record] := by
        change (insertActivityOccurrence record before.activityOccurrences).filter _ = [record]
        rw [insertActivityOccurrence_eq_canonicalInsertBy]
        have oldEmpty : before.activityOccurrences.filter (fun candidate =>
            parallelControllerNamesIdentity controller candidate.processInstanceId
              ⟨candidate.activityElementId.value⟩ candidate.activation) = [] := by
          apply List.filter_eq_nil_iff.mpr
          intro old member selected
          simp only [parallelControllerNamesIdentity, controller, Bool.and_eq_true,
            beq_iff_eq] at selected
          apply oldRecordDifferent old member
          simpa using (congrArg (fun id => id.value) selected.1.2).symm
        have perm := filter_canonicalInsertBy_perm activityOccurrenceBefore
          (fun candidate => parallelControllerNamesIdentity controller candidate.processInstanceId
            ⟨candidate.activityElementId.value⟩ candidate.activation) record
          before.activityOccurrences (by simp [parallelControllerNamesIdentity, controller, record])
        rw [oldEmpty] at perm
        simpa using perm
      have timerForRecord : successor.timerWaits.filter (timerIdNamesWait timerId) = [timerWait] := by
        change (insertTimerWait timerWait before.timerWaits).filter
          (timerIdNamesWait timerId) = [timerWait]
        have oldEmpty : before.timerWaits.filter (timerIdNamesWait timerId) = [] := by
          apply List.filter_eq_nil_iff.mpr
          intro old member selected
          simp only [timerIdNamesWait, timerId, Bool.and_eq_true, beq_iff_eq] at selected
          apply oldTimerDifferent old member
          exact (congrArg NodeId.mk selected.1.2).symm
        have perm := filter_canonicalInsertBy_perm timerWaitBefore (timerIdNamesWait timerId)
          timerWait before.timerWaits (by simp [timerIdNamesWait, timerId, timerWait])
        rw [oldEmpty] at perm
        simpa [insertTimerWait] using perm
      have familyWellFormed : parallelMultiInstanceRuntimeWellFormed arm
          { processInstanceId := instanceId
            controller := some controller
            liveChildren := pendingParallelTaskIds slots
            lifetimeTimer := some timerId
            processBindings := successor.variables.process.bindings
            taskActivationHighWater := activationCount successor arm.taskId
            activityActivationHighWater := activityActivationCount successor arm.taskId
            timerActivationHighWater := timerActivationCount successor arm.boundaryTimer.elementId } =
          true := by
        simp only [parallelMultiInstanceRuntimeWellFormed, Bool.and_eq_true, decide_eq_true_eq,
          List.all_eq_true, Option.isNone]
        have boundedAfter := boundsAfter
        simp only [runtimeStateIdentityBound, Bool.and_eq_true, List.all_eq_true,
          decide_eq_true_eq] at boundedAfter
        have controllerBound : controller.id.activation ≤
            activityActivationCount successor arm.taskId := by
          have recordMember : record ∈ successor.activityOccurrences := by
            change record ∈ insertActivityOccurrence record before.activityOccurrences
            rw [insertActivityOccurrence_eq_canonicalInsertBy]
            exact (mem_canonicalInsertBy activityOccurrenceBefore record record
              before.activityOccurrences).mpr (Or.inl rfl)
          simpa [controller, record] using boundedAfter.2 record recordMember
        have sameLength : controller.snapshot.length = controller.slots.length := by
          simpa [controller, slots, items] using
            (pending_parallel_slots_match_snapshot_length instanceId arm.taskId taskHighWater items).symm
        have slotIds : (parallelSlotTaskIds controller.slots).Nodup := by
          simpa [controller, slots, pendingParallelSlots] using
            pendingParallelSlotsFrom_task_ids_nodup instanceId arm.taskId taskHighWater 0 items
        have slotBounds : ∀ slot ∈ controller.slots,
            parallelSlotIdentityValid arm
              { processInstanceId := instanceId
                taskActivationHighWater := activationCount successor arm.taskId } slot = true := by
          intro slot slotMember
          have identity := pendingParallelSlotsFrom_identity instanceId arm.taskId taskHighWater 0
            items slot (by simpa [controller, slots, pendingParallelSlots] using slotMember)
          simp only [parallelSlotIdentityValid, Bool.and_eq_true, decide_eq_true_eq]
          exact ⟨⟨identity.1, identity.2.1⟩, by
            change slot.taskId.activation ≤ activationCount
              { before with activations := (setActivationCount before.activations arm.taskId
                (taskHighWater + items.length)) } arm.taskId
            rw [activationCount_setActivationCount_self]
            simpa using identity.2.2⟩
        have timerBound : timerId.activation ≤ timerActivationCount successor
            arm.boundaryTimer.elementId := by
          have timerMember : timerWait ∈ successor.timerWaits := by
            change timerWait ∈ insertTimerWait timerWait before.timerWaits
            exact (mem_canonicalInsertBy timerWaitBefore timerWait timerWait
              before.timerWaits).mpr (Or.inl rfl)
          simpa [timerId, timerWait] using boundedAfter.1.2 timerWait timerMember
        have absentAfter : parallelOutputAbsent arm
            { processInstanceId := instanceId
              processBindings := successor.variables.process.bindings } = true := by
          simpa [successor] using outputAbsent
        exact ⟨⟨⟨⟨⟨⟨⟨⟨⟨rfl, rfl⟩, controllerBound⟩, sameLength⟩, slotIds⟩,
          slotBounds⟩, rfl⟩, ⟨⟨by simp [timerId], by simp [timerId]⟩, timerBound⟩⟩,
          True.intro⟩, absentAfter⟩
      let regionWaits := successor.waits.filter fun wait =>
        (pendingParallelTaskIds slots).contains (parallelEntryWaitTaskId wait)
      have oldRegionEmpty : before.waits.filter (fun wait =>
          (pendingParallelTaskIds slots).contains (parallelEntryWaitTaskId wait)) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro wait member selected
        simp only [List.contains_eq_mem] at selected
        have selected := of_decide_eq_true selected
        rw [allPending] at selected
        obtain ⟨slot, slotMember, same⟩ := List.mem_map.mp selected
        have identity := pendingParallelSlotsFrom_identity instanceId arm.taskId taskHighWater 0
          items slot (by simpa [slots, pendingParallelSlots] using slotMember)
        apply oldTaskDifferent wait member
        apply (taskDefinitionId_eq_iff_value_eq _ _).mpr
        calc
          wait.task.id.value = (parallelEntryWaitTaskId wait).elementId.value := rfl
          _ = slot.taskId.elementId.value := congrArg (fun id => id.elementId.value) same.symm
          _ = arm.taskId.value := identity.2.1
      have regionPerm : regionWaits.Perm (slots.map (parallelEntryChildWait arm owner)) := by
        have kept : ∀ slot ∈ slots,
            (pendingParallelTaskIds slots).contains
              (parallelEntryWaitTaskId (parallelEntryChildWait arm owner slot)) = true := by
          intro slot member
          simp only [List.contains_eq_mem, decide_eq_true_eq]
          rw [allPending]
          refine List.mem_map.mpr ⟨slot, member, ?_⟩
          have identity := pendingParallelSlotsFrom_identity instanceId arm.taskId taskHighWater 0
            items slot (by simpa [slots, pendingParallelSlots] using member)
          simp only [parallelEntryWaitTaskId, parallelEntryChildWait]
          generalize slot.taskId = task at identity ⊢
          rcases task with ⟨process, ⟨element⟩, activation⟩
          simp only at identity ⊢
          cases identity.2.1
          rfl
        have perm := filter_insertParallelChildWaits_perm arm owner slots before.waits
          (fun wait => (pendingParallelTaskIds slots).contains (parallelEntryWaitTaskId wait)) kept
        rw [oldRegionEmpty, List.append_nil] at perm
        simpa [regionWaits, successor] using perm
      have pendingLength : slots.length = (pendingParallelTaskIds slots).length := by
        calc
          slots.length = (parallelSlotTaskIds slots).length := by
            exact (List.length_map (f := ParallelMultiInstanceSlot.taskId)).symm
          _ = (pendingParallelTaskIds slots).length :=
            (congrArg List.length allPending).symm
      have regionLength : regionWaits.length = (pendingParallelTaskIds slots).length := by
        calc
          regionWaits.length = (slots.map (parallelEntryChildWait arm owner)).length :=
            regionPerm.length_eq
          _ = slots.length := by simp
          _ = (pendingParallelTaskIds slots).length := pendingLength
      have regionNodup : (regionWaits.map parallelEntryWaitTaskId).Nodup := by
        have mapped := regionPerm.map parallelEntryWaitTaskId
        have slotsNodup : (parallelSlotTaskIds slots).Nodup := by
          simpa [slots, pendingParallelSlots] using
            pendingParallelSlotsFrom_task_ids_nodup instanceId arm.taskId taskHighWater 0 items
        have generated : (slots.map (parallelEntryChildWait arm owner)).map
            parallelEntryWaitTaskId = parallelSlotTaskIds slots := by
          rw [List.map_map]
          change slots.map (fun slot => parallelEntryWaitTaskId
            (parallelEntryChildWait arm owner slot)) =
              slots.map ParallelMultiInstanceSlot.taskId
          apply List.map_congr_left
          intro slot member
          simp only [parallelEntryWaitTaskId, parallelEntryChildWait]
          have identity := pendingParallelSlotsFrom_identity instanceId arm.taskId taskHighWater 0
            items slot (by simpa [slots, pendingParallelSlots] using member)
          generalize slot.taskId = task at identity ⊢
          rcases task with ⟨process, ⟨element⟩, activation⟩
          simp only at identity ⊢
          cases identity.2.1
          rfl
        rw [generated] at mapped
        exact mapped.nodup_iff.mpr slotsNodup
      have regionShape : regionWaits.all (fun wait =>
          wait.owner == record.owner && wait.task.id == arm.taskId &&
            wait.task.name == arm.taskName && wait.metadata == none &&
            wait.output == arm.normalOutput) = true := by
        rw [List.all_eq_true]
        intro wait member
        have generated := regionPerm.mem_iff.mp member
        obtain ⟨slot, _, same⟩ := List.mem_map.mp generated
        rw [← same]
        simp [parallelEntryChildWait, record]
      have scopedRecords : successor.activityOccurrences.filter (fun candidate =>
          candidate.activityElementId.value == arm.taskId.value &&
            candidate.owner.definitionScopeId == ownerScope &&
            (activityBodyParallelTasks? candidate).isSome) = [record] := by
        have kept : (record.activityElementId.value == arm.taskId.value &&
            record.owner.definitionScopeId == ownerScope &&
            (activityBodyParallelTasks? record).isSome) = true := by
          simp [record, activityBodyParallelTasks?, ownerFacts.2]
        have perm := filter_canonicalInsertBy_perm activityOccurrenceBefore (fun candidate =>
          candidate.activityElementId.value == arm.taskId.value &&
            candidate.owner.definitionScopeId == ownerScope &&
            (activityBodyParallelTasks? candidate).isSome) record before.activityOccurrences kept
        have empty : before.activityOccurrences.filter (fun candidate =>
            candidate.activityElementId.value == arm.taskId.value &&
              candidate.owner.definitionScopeId == ownerScope &&
              (activityBodyParallelTasks? candidate).isSome) = [] :=
          List.filter_eq_nil_iff.mpr fun old member selected => by
            simp [oldRecordDifferent old member] at selected
        rw [empty] at perm
        simpa [successor, insertActivityOccurrence_eq_canonicalInsertBy] using perm
      have scopedTimers : successor.timerWaits.filter (fun wait =>
          wait.elementId == arm.boundaryTimer.elementId &&
            wait.owner.definitionScopeId == ownerScope) = [timerWait] := by
        have perm := filter_canonicalInsertBy_perm timerWaitBefore (fun wait =>
            wait.elementId == arm.boundaryTimer.elementId &&
            wait.owner.definitionScopeId == ownerScope) timerWait before.timerWaits
          (by rw [ownerFacts.2]; simp [timerWait])
        have empty : before.timerWaits.filter (fun wait =>
            wait.elementId == arm.boundaryTimer.elementId &&
              wait.owner.definitionScopeId == ownerScope) = [] :=
          List.filter_eq_nil_iff.mpr fun old member selected => by
            simp [oldTimerDifferent old member] at selected
        rw [empty] at perm
        simpa [successor, insertTimerWait] using perm
      have scopedTaskLength : (successor.waits.filter (fun wait =>
          wait.task.id == arm.taskId && wait.owner.definitionScopeId == ownerScope)).length =
          (pendingParallelTaskIds slots).length := by
        have perm := filter_insertParallelChildWaits_perm arm owner slots before.waits
          (fun wait => wait.task.id == arm.taskId &&
            wait.owner.definitionScopeId == ownerScope)
          (fun _ _ => by
            simp only [parallelEntryChildWait]
            rw [ownerFacts.2]
            simp)
        have empty : before.waits.filter (fun wait =>
            wait.task.id == arm.taskId && wait.owner.definitionScopeId == ownerScope) = [] :=
          List.filter_eq_nil_iff.mpr fun old member selected => by
            simp [oldTaskDifferent old member] at selected
        rw [empty, List.append_nil] at perm
        calc
          _ = (slots.map (parallelEntryChildWait arm owner)).length := by
            simpa [successor] using perm.length_eq
          _ = slots.length := by simp
          _ = (pendingParallelTaskIds slots).length := pendingLength
      have parallelBindingsAfter : parallelMultiInstanceProgramBindingsValid program successor =
          true := by
        apply parallelMultiInstanceProgramBindingsValid_singleton program successor controller record
          account.entryOperation arm timerId timerWait regionWaits
        · exact parallelControllersAfter
        · exact controllerRecords
        · change program.operations.filter (fun operation =>
              match ParallelMultiInstanceArm.ofOperation? operation with
              | some candidate => candidate.taskId.value == arm.taskId.value
              | none => false) = [account.entryOperation]
          exact matchingOperations
        · exact account.projects
        · rw [entryId]
          simpa [record, ownerFacts.2] using account.entryOwner
        · simpa [controller] using familyWellFormed
        · change some (firstTask :: restTasks) = some (pendingParallelTaskIds slots)
          rw [allPending, pendingIds]
        · change regionWaits = regionWaits
          rfl
        · simpa [controller] using regionLength
        · change (regionWaits.map parallelEntryWaitTaskId).Nodup
          exact regionNodup
        · exact regionShape
        · rfl
        · exact timerForRecord
        · rfl
        · rfl
        · rfl
        · rw [List.all_eq_true]
          intro operation member
          cases projects : ParallelMultiInstanceArm.ofOperation? operation with
          | none => rfl
          | some candidate =>
              have mapped : candidate ∈
                  program.operations.filterMap ParallelMultiInstanceArm.ofOperation? :=
                List.mem_filterMap.mpr ⟨operation, member, projects⟩
              rw [account.uniqueEntry] at mapped
              have candidateEq : candidate = arm := by simpa using mapped
              subst candidate
              have selected : operation ∈ program.operations.filter (fun operation =>
                  match ParallelMultiInstanceArm.ofOperation? operation with
                  | some candidate => candidate.taskId.value == arm.taskId.value
                  | none => false) := List.mem_filter.mpr ⟨member, by simp [projects]⟩
              rw [matchingOperations] at selected
              have operationEq : operation = account.entryOperation := by simpa using selected
              subst operation
              rw [entryId, account.entryOwner]
              simp only
              rw [parallelControllersAfter, scopedRecords, scopedTimers, scopedTaskLength]
              simp [controller]
      have activityIdsAfter : activityIdentitiesUnique successor = true := by
        simp only [activityIdentitiesUnique]
        change (insertActivityOccurrence record before.activityOccurrences).all
          (occursOnce sameActivityOccurrence (insertActivityOccurrence record before.activityOccurrences)) = true
        rw [insertActivityOccurrence_eq_canonicalInsertBy]
        apply InternalCommutation.occurrenceKeysUnique_canonicalInsertBy
          activityOccurrenceBefore sameActivityOccurrence record before.activityOccurrences
          activityIds
        · intro old member
          have different := oldRecordDifferent old member
          constructor
          · apply Bool.eq_false_iff.mpr
            intro matched
            simp only [sameActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at matched
            apply different
            simpa [record] using (congrArg (fun id => id.value) matched.1.2).symm
          · apply Bool.eq_false_iff.mpr
            intro matched
            simp only [sameActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at matched
            apply different
            simpa [record] using congrArg (fun id => id.value) matched.1.2
        · simp [sameActivityOccurrence]
      have controllersAfter : controllersOwnLiveActivity successor = true := by
        simp [controllersOwnLiveActivity, successor, noSequentialControllers]
      have sequentialBindingsAfter : sequentialMultiInstanceProgramBindingsValid program successor = true := by
        apply sequential_bindings_of_no_sequential_operation program successor noSequentialOperation
        simp [successor, noSequentialControllers]
      have controllerIdsAfter : controllerIdentitiesUnique successor = true := by
        simp [controllerIdentitiesUnique, successor, noSequentialControllers]
      have notExhaustedAfter : controllersNotExhausted successor = true := by
        simp [controllersNotExhausted, successor, noSequentialControllers]
      have lifecycleAfter : (match successor.control with
          | .notStarted => notStartedStateEmpty successor
          | _ => true) = true := by
        simp [successor, running]
      simp only [runtimeStateWellFormed, Bool.and_eq_true]
      exact ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨positionAfter, racesAfter⟩, incidentsAfter⟩, ownersAfter⟩,
        identitiesAfter⟩, boundsAfter⟩, declarationsAfter⟩, hiddenAfter⟩, orderAfter⟩, bodiesAfter⟩,
        attachedAfter⟩, messagesUnambiguousAfter⟩, activityIdsAfter⟩, controllersAfter⟩,
        sequentialBindingsAfter⟩, parallelBindingsAfter⟩, controllerIdsAfter⟩, notExhaustedAfter⟩,
        lifecycleAfter⟩, claimsAfter⟩
end BpmnSemantics.SemanticProcess
