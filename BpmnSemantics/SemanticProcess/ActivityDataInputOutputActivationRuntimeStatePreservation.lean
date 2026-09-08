import BpmnSemantics.SemanticProcess.ActivityDataInputOutput
import BpmnSemantics.SemanticProcess.InternalCommutationRuntimePreservation
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateEntryOrder
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStatePreservation
import BpmnSemantics.SemanticProcess.ActivityDataInputOutputMultiInstanceFrames

/-! # Composed Activity-data activation runtime-state preservation

Activating the composed User Task inserts one joined wait, Activity record, and Activity-local input
scope while preserving the aggregate runtime-state predicate. Exact declaration uniqueness keeps
the inserted Activity disjoint from every existing Multi-Instance controller's binding.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
theorem activityDataInputOutput_nodup_of_string_projection_nodup
    (values : List α) (value : α → String)
    (valid : (values.map value).Nodup) : values.Nodup := by
  induction values with
  | nil => simp
  | cons head tail ih =>
      obtain ⟨fresh, rest⟩ := List.nodup_cons.mp valid
      apply List.nodup_cons.mpr
      refine ⟨?_, ih rest⟩
      intro member
      exact fresh (List.mem_map.mpr ⟨head, member, rfl⟩)

theorem activityDataInputOutput_parallelControllers_absent_of_forbidden
    (program : Program) (state : RuntimeState)
    (forbidden : ∀ operation ∈ program.operations,
      (match operation with
       | .awaitParallelMultiInstanceUserTask .. | .completeParallelMultiInstanceUserTask .. => true
       | _ => false) = false)
    (bindings : parallelMultiInstanceProgramBindingsValid program state = true) :
    state.parallelMultiInstanceControllers = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro controller member
  obtain ⟨entry, arm, record, timer, timerWait, childWaits, pendingTask, pendingWait,
    recordExact, operationExact, projects, rest⟩ :=
    (parallelMultiInstanceProgramBindingsValid_controller_facts program state controller
      bindings member).witnesses
  have selected : entry ∈ program.operations.filter (fun operation =>
      match ParallelMultiInstanceArm.ofOperation? operation with
      | some candidate => candidate.taskId.value == controller.id.activityElementId.value
      | none => false) := by
    have inSingleton : entry ∈ [entry] := by simp
    rw [← operationExact] at inSingleton
    exact inSingleton
  have absent := forbidden entry (List.mem_filter.mp selected).1
  have family : (match entry with
      | .awaitParallelMultiInstanceUserTask .. | .completeParallelMultiInstanceUserTask .. => true
      | _ => false) = true := by
    have selectedPredicate := (List.mem_filter.mp selected).2
    cases entry <;> simp_all only [ParallelMultiInstanceArm.ofOperation?, Bool.false_eq_true]
  simp_all

theorem activityDataInputOutput_parallelBindings_of_forbidden
    (program : Program) (state : RuntimeState)
    (forbidden : ∀ operation ∈ program.operations,
      (match operation with
       | .awaitParallelMultiInstanceUserTask .. | .completeParallelMultiInstanceUserTask .. => true
       | _ => false) = false)
    (controllers : state.parallelMultiInstanceControllers = []) :
    parallelMultiInstanceProgramBindingsValid program state = true := by
  simp only [parallelMultiInstanceProgramBindingsValid, controllers, List.all_nil,
    Bool.true_and, Bool.and_eq_true]
  refine ⟨rfl, ?_⟩
  rw [List.all_eq_true]
  intro operation member
  have absent := forbidden operation member
  cases operation <;> simp_all [ParallelMultiInstanceArm.ofOperation?]

/-- Exact declaration binding preserves unrelated Multi-Instance controllers during activation. -/
theorem dataInputOutputActivationStep_preserves_runtimeStateWellFormed_general
    (program : Program) (expectedInstanceId : SemanticId)
    (before after : RuntimeState)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true)
    (transition : DataInputOutputActivationStep program before after) :
    runtimeStateWellFormed program expectedInstanceId after = true := by
  cases transition
  case activate =>
      rename_i instanceId id origin input output taskId taskName directInput directOutput
        declared running source success
      have activationStep := success
      unfold activateDataInputOutputUserTask? at success
      cases selected : onlyTokenOwner? before input with
      | none => simp [selected] at success
      | some owner =>
          cases available : dataInputOutputSourceBinding? before directInput with
          | none => simp [selected, running, available] at success
          | some binding =>
              let insertedWait : UserTaskWait :=
                { processInstanceId := instanceId
                  owner
                  task := { id := taskId, name := taskName }
                  activation := activationCount before taskId + 1
                  output }
              let record := dataInputOutputActivityRecord before instanceId owner taskId
              let activityOwner := dataInputOutputActivityOwner before instanceId taskId
              let successor : RuntimeState :=
                { before with
                  tokens := removeToken before.tokens input owner
                  waits := insertUserTaskWait insertedWait before.waits
                  activations := setActivationCount before.activations taskId insertedWait.activation
                  activityOccurrences :=
                    insertActivityOccurrence record before.activityOccurrences
                  activityActivations := setActivationCount before.activityActivations taskId
                    record.activation
                  variables := addActivityOccurrenceVariableScope before.variables activityOwner
                    [{ name := directInput.targetDataInputId, value := binding.value }] }
              rw [selected, dataInputOutputRunningInstance_of_running running, available] at success
              have prepared :
                  (∀ scope ∈ before.variables.activities,
                    activityOccurrenceScopeMatches activityOwner scope = false) ∧
                    after = successor := by
                simpa [successor, insertedWait, record, activityOwner,
                  dataInputOutputActivityRecord, dataInputOutputActivityOwner] using success.symm
              obtain ⟨localOwnerFresh, rfl⟩ := prepared
              change runtimeStateWellFormed program expectedInstanceId successor = true
              simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed
              have claims := wellFormed.2.1.1.1
              have retention := wellFormed.2.1.1.2
              have snapshots := wellFormed.2.1.2
              have execution := wellFormed.2.2
              obtain ⟨aggregate, lifecycle⟩ := wellFormed.1
              obtain ⟨aggregate, notExhausted⟩ := aggregate
              obtain ⟨aggregate, controllerIds⟩ := aggregate
              obtain ⟨aggregate, parallelBindings⟩ := aggregate
              obtain ⟨aggregate, sequentialBindings⟩ := aggregate
              obtain ⟨aggregate, controllers⟩ := aggregate
              obtain ⟨aggregate, activityIds⟩ := aggregate
              obtain ⟨aggregate, attachedMessages⟩ := aggregate
              obtain ⟨aggregate, attachedTimers⟩ := aggregate
              obtain ⟨aggregate, bodies⟩ := aggregate
              obtain ⟨aggregate, order⟩ := aggregate
              obtain ⟨aggregate, hidden⟩ := aggregate
              obtain ⟨aggregate, declarations⟩ := aggregate
              obtain ⟨aggregate, bounds⟩ := aggregate
              obtain ⟨aggregate, identities⟩ := aggregate
              obtain ⟨aggregate, owners⟩ := aggregate
              obtain ⟨aggregate, incidents⟩ := aggregate
              obtain ⟨position, races⟩ := aggregate
              have structural : programWellFormed program = true := by
                simp only [runtimePositionValid, Bool.and_eq_true] at position
                exact position.1.1
              have operationIdsUnique :
                  (program.operations.map (fun operation => operation.id)).Nodup := by
                apply activityDataInputOutput_nodup_of_string_projection_nodup _
                  (fun operationId => operationId.value)
                rw [List.map_map]
                exact strictlySortedStrings_nodup _
                  (programWellFormed_operationIdsSorted program structural)
              have placeIdsUnique :
                  (program.controlPlaces.map (fun place => place.id)).Nodup := by
                apply activityDataInputOutput_nodup_of_string_projection_nodup _
                  (fun placeId => placeId.value)
                rw [List.map_map]
                exact strictlySortedStrings_nodup _
                  (programWellFormed_controlPlaceIdsSorted program structural)
              let operation := SemanticOperation.awaitDataInputOutputUserTask id origin input output
                taskId taskName directInput directOutput
              obtain ⟨operationScope, _, operationOwner, inputOwner, _⟩ :=
                programGraphWellFormed_operationControlPlaceScope program operation input
                  (programWellFormed_graph program structural) operationIdsUnique placeIdsUnique
                  declared (by simp [operation, operationControlPlacesShareOwner])
                  (by left)
              have ownerFacts := runtimePositionValid_onlyTokenOwner_live_and_scope program
                expectedInstanceId before input owner operationScope position selected inputOwner
              have positionAfter : runtimePositionValid program expectedInstanceId successor = true :=
                runtimePositionValid_removeToken_frame program expectedInstanceId before successor
                  input owner position selected rfl rfl rfl rfl
              have runningIdentity : instanceId = expectedInstanceId := by
                exact runtimePositionValid_running_instance program expectedInstanceId instanceId
                  before position running
              have racesAfter : eventRaceAssociationsValid successor = true := by
                simpa [successor, eventRaceAssociationsValid] using races
              have incidentsAfter : effectIncidentAssociationsValid successor = true := by
                have activityFrame (effectId : EffectOccurrenceId) :
                    successor.variables.activities.filter (activityScopeMatches effectId) =
                      before.variables.activities.filter (activityScopeMatches effectId) := by
                  change (insertActivityVariableScope
                    { owner := .activityOccurrence activityOwner
                      bindings :=
                        [{ name := directInput.targetDataInputId, value := binding.value }] }
                    before.variables.activities).filter (activityScopeMatches effectId) = _
                  exact filter_insertActivityVariableScope_of_rejected _ _
                    (by simp [activityScopeMatches, localDataOwnerMatches]) _
                simp only [effectIncidentAssociationsValid] at incidents ⊢
                cases incidentsEq : before.effectIncidents with
                | nil => simp
                | cons incident rest =>
                    cases rest with
                    | cons next tail => simp_all
                    | nil =>
                        simp only [incidentsEq] at incidents ⊢
                        change effectIncidentAssociationValid successor incident = true
                        change effectIncidentAssociationValid before incident = true at incidents
                        have associationFrame : effectIncidentAssociationValid successor incident =
                            effectIncidentAssociationValid before incident := by
                          unfold effectIncidentAssociationValid
                          rw [show successor.variables.activities.filter
                            (activityScopeMatches incident.id.effectId) =
                              before.variables.activities.filter
                                (activityScopeMatches incident.id.effectId) from
                            activityFrame incident.id.effectId]
                          simp [successor, effectWaitOwnerAssociationValid]
                        rw [associationFrame]
                        exact incidents
              have ownersAfter : waitOwnersLive successor = true := by
                simp only [waitOwnersLive, Bool.and_eq_true] at owners ⊢
                obtain ⟨⟨⟨⟨⟨⟨⟨⟨taskOwners, messageOwners⟩, timerOwners⟩, effectOwners⟩,
                  incidentOwners⟩, selectionOwners⟩, raceOwners⟩, callOwners⟩,
                  activityOwners⟩ := owners
                refine ⟨⟨⟨⟨⟨⟨⟨⟨?_, messageOwners⟩, timerOwners⟩, effectOwners⟩,
                  incidentOwners⟩, selectionOwners⟩, raceOwners⟩, callOwners⟩, ?_⟩
                · change (insertUserTaskWait insertedWait before.waits).all
                    (fun wait => exactLiveOccurrence before wait.owner) = true
                  rw [all_insertUserTaskWait]
                  simp only [Bool.and_eq_true]
                  exact ⟨by simpa [insertedWait] using ownerFacts.1, taskOwners⟩
                · change (insertActivityOccurrence record before.activityOccurrences).all
                    (fun record => exactLiveOccurrence before record.owner) = true
                  rw [insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy]
                  simp only [Bool.and_eq_true]
                  exact ⟨by simpa [record, dataInputOutputActivityRecord] using ownerFacts.1,
                    activityOwners⟩
              have waitFresh : ∀ old ∈ before.waits,
                  userTaskWaitKeyMatches insertedWait old = false ∧
                    userTaskWaitKeyMatches old insertedWait = false := by
                intro old member
                simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds
                have oldBound := List.all_eq_true.mp bounds.1.1 old member
                simp only [decide_eq_true_eq] at oldBound
                constructor <;> apply Bool.eq_false_iff.mpr <;> intro matched <;>
                  simp only [userTaskWaitKeyMatches, Bool.and_eq_true,
                    decide_eq_true_eq] at matched
                · have taskEq : old.task.id = taskId := by
                    simpa [insertedWait] using matched.1.2.symm
                  have activationEq : old.activation = activationCount before taskId + 1 := by
                    simpa [insertedWait] using matched.2.symm
                  rw [taskEq, activationEq] at oldBound
                  omega
                · have taskEq : old.task.id = taskId := by
                    simpa [insertedWait] using matched.1.2
                  have activationEq : old.activation = activationCount before taskId + 1 := by
                    simpa [insertedWait] using matched.2
                  rw [taskEq, activationEq] at oldBound
                  omega
              have identitiesAfter : waitIdentitiesUnique successor = true := by
                simp only [waitIdentitiesUnique, Bool.and_eq_true] at identities ⊢
                obtain ⟨⟨⟨taskIdentities, messageIdentities⟩, timerIdentities⟩,
                  effectIdentities⟩ := identities
                refine ⟨⟨⟨?_, messageIdentities⟩, timerIdentities⟩, effectIdentities⟩
                simpa [successor, insertUserTaskWait_eq_canonicalInsertBy] using
                  InternalCommutation.occurrenceKeysUnique_canonicalInsertBy userTaskWaitBefore
                    userTaskWaitKeyMatches insertedWait before.waits taskIdentities waitFresh
                    (by simp [userTaskWaitKeyMatches])
              have boundsAfter : runtimeStateIdentityBound successor = true := by
                simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds ⊢
                obtain ⟨⟨taskBounds, timerBounds⟩, activityBounds⟩ := bounds
                refine ⟨⟨?_, timerBounds⟩, ?_⟩
                · change (insertUserTaskWait insertedWait before.waits).all (fun wait =>
                    decide (wait.activation ≤ activationCount
                      { before with activations :=
                          setActivationCount before.activations taskId insertedWait.activation }
                      wait.task.id)) = true
                  rw [insertUserTaskWait_eq_canonicalInsertBy, all_canonicalInsertBy]
                  simp only [Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq]
                  refine ⟨?_, ?_⟩
                  · change insertedWait.activation ≤ activationCount
                      { before with activations :=
                          setActivationCount before.activations taskId insertedWait.activation }
                        insertedWait.task.id
                    simp [insertedWait, activationCount_setActivationCount_self]
                  · intro old member
                    have prior := List.all_eq_true.mp taskBounds old member
                    simp only [decide_eq_true_eq] at prior
                    change old.activation ≤ activationCount
                      { before with activations :=
                          setActivationCount before.activations taskId insertedWait.activation }
                        old.task.id
                    by_cases same : old.task.id = taskId
                    · subst taskId
                      rw [activationCount_setActivationCount_self]
                      change old.activation ≤ activationCount before old.task.id + 1
                      omega
                    · rw [activationCount_setActivationCount_other _ _ _ _ same]
                      exact prior
                · change (insertActivityOccurrence record before.activityOccurrences).all
                    (fun old => decide (old.activation ≤ activityActivationCount
                      ({ before with activityActivations := (setActivationCount
                          before.activityActivations taskId record.activation) })
                      ⟨old.activityElementId.value⟩)) = true
                  rw [insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy]
                  simp only [Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq]
                  refine ⟨?_, ?_⟩
                  · change record.activation ≤ activityActivationCount
                      ({ before with activityActivations := (setActivationCount
                          before.activityActivations taskId record.activation) })
                        ⟨record.activityElementId.value⟩
                    simp [record, dataInputOutputActivityRecord,
                      activityActivationCount_set_self]
                  · intro old member
                    have prior := List.all_eq_true.mp activityBounds old member
                    simp only [decide_eq_true_eq] at prior
                    change old.activation ≤ activityActivationCount
                      ({ before with activityActivations := (setActivationCount
                          before.activityActivations taskId record.activation) })
                        ⟨old.activityElementId.value⟩
                    by_cases same : TaskDefinitionId.mk old.activityElementId.value = taskId
                    · subst taskId
                      rw [activityActivationCount_set_self]
                      change old.activation ≤
                        activityActivationCount before ⟨old.activityElementId.value⟩ + 1
                      omega
                    · rw [activityActivationCount_set_other _ _ _ _ same]
                      exact prior
              have declarer : declaredByExactlyOneOwnedOperation program
                  (userTaskWaitDeclarers program taskId) owner = true := by
                rw [userTaskWaitDeclarers_eq_keyFilter,
                  programWellFormed_waitDeclarer program operation _ structural declared
                    (by simp [operation, operationDeclaresWaitKey,
                      operationWaitDeclarationKeys, userTaskWaitDeclarationKey])]
                simp [declaredByExactlyOneOwnedOperation, operation, operationOwningScope?,
                  operationOwner, ownerFacts.2]
              have declarationsAfter : waitDeclarationsValid program expectedInstanceId
                  successor = true := by
                simp only [waitDeclarationsValid, Bool.and_eq_true] at declarations ⊢
                refine ⟨⟨⟨⟨?_, declarations.1.1.1.2⟩, declarations.1.1.2⟩,
                  declarations.1.2⟩, declarations.2⟩
                simp only [successor, List.all_eq_true]
                intro wait member
                obtain ⟨raw, sameInstance⟩ := List.mem_filter.mp member
                rw [insertUserTaskWait_eq_canonicalInsertBy] at raw
                rcases (mem_canonicalInsertBy userTaskWaitBefore insertedWait wait
                  before.waits).mp raw with new | old
                · subst wait
                  simpa [insertedWait, runningIdentity] using declarer
                · exact List.all_eq_true.mp declarations.1.1.1.1 wait
                    (List.mem_filter.mpr ⟨old, sameInstance⟩)
              have hiddenAfter : hiddenRecordDeclarationsValid program successor = true := by
                simpa [successor, hiddenRecordDeclarationsValid] using hidden
              have claimsAfter : activityBodyClaimsUnique successor.activityOccurrences = true := by
                exact activateDataInputOutputUserTask_preserves_activityBodyClaimsUnique selected
                  running source bodies bounds claims activationStep
              have bodiesAfter : activityRecordsOwnLiveWork successor = true := by
                have oldBodies := InternalCommutation.activityRecords_insertUserTaskWait before
                  insertedWait (by simp [insertedWait]) bounds bodies
                simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true] at ⊢
                intro candidate member
                change candidate ∈ insertActivityOccurrence record before.activityOccurrences at member
                rw [insertActivityOccurrence_eq_canonicalInsertBy] at member
                rcases (mem_canonicalInsertBy activityOccurrenceBefore record candidate
                  before.activityOccurrences).mp member with new | old
                · subst candidate
                  simp only [waitIdentitiesUnique, Bool.and_eq_true] at identitiesAfter
                  have insertedMember : insertedWait ∈ successor.waits := by
                    change insertedWait ∈ insertUserTaskWait insertedWait before.waits
                    rw [insertUserTaskWait_eq_canonicalInsertBy, mem_canonicalInsertBy]
                    exact Or.inl rfl
                  have insertedUnique := List.all_eq_true.mp identitiesAfter.1.1.1 insertedWait
                    insertedMember
                  simp only [occursOnce, decide_eq_true_eq] at insertedUnique
                  have insertedOwners : activityTaskBodyOwnersAgree successor record = true := by
                    simp only [activityTaskBodyOwnersAgree, record, dataInputOutputActivityRecord,
                      List.all_eq_true, decide_eq_true_eq]
                    intro wait member
                    obtain ⟨waitMember, matched⟩ := List.mem_filter.mp member
                    change wait ∈ insertUserTaskWait insertedWait before.waits at waitMember
                    rw [insertUserTaskWait_eq_canonicalInsertBy] at waitMember
                    rcases (mem_canonicalInsertBy userTaskWaitBefore insertedWait wait
                      before.waits).mp waitMember with new | old
                    · subst wait
                      rfl
                    · have keyed : userTaskWaitKeyMatches insertedWait wait = true := by
                        simpa [taskIdNamesWait, userTaskWaitKeyMatches, insertedWait,
                          taskDefinitionId_eq_iff_value_eq] using matched
                      rw [(waitFresh wait old).1] at keyed
                      contradiction
                  refine ⟨⟨⟨?_, insertedOwners⟩, by simp [record, dataInputOutputActivityRecord,
                    ActivityOccurrence.timerHandlerOccurrences]⟩,
                    by simp [record, dataInputOutputActivityRecord,
                      ActivityOccurrence.messageHandlerOccurrences]⟩
                  simp only [activityBodyLive, record, dataInputOutputActivityRecord]
                  simp only [decide_eq_true_eq]
                  change (successor.waits.filter fun wait =>
                    decide (wait.processInstanceId = instanceId) &&
                      decide (wait.task.id.value = taskId.value) &&
                      decide (wait.activation = activationCount before taskId + 1)).length = 1
                  have keyFrame : (fun wait => userTaskWaitKeyMatches insertedWait wait) =
                      (fun wait =>
                        decide (wait.processInstanceId = instanceId) &&
                          decide (wait.task.id.value = taskId.value) &&
                          decide (wait.activation = activationCount before taskId + 1)) := by
                    funext wait
                    simp [userTaskWaitKeyMatches, insertedWait,
                      taskDefinitionId_eq_iff_value_eq, eq_comm]
                  rw [← keyFrame]
                  exact insertedUnique
                · have prior := List.all_eq_true.mp oldBodies candidate old
                  simpa [successor, activityRecordsOwnLiveWork, activityBodyLive,
                    activityTaskBodyOwnersAgree,
                    exactLiveOccurrence] using prior
              have attachedTimersAfter : attachedTimersUnambiguous successor = true := by
                simp only [attachedTimersUnambiguous, List.all_eq_true] at attachedTimers ⊢
                intro wait member
                have prior := attachedTimers wait member
                simp only [decide_eq_true_eq] at prior ⊢
                change ((insertActivityOccurrence record before.activityOccurrences).filter
                  (fun candidate => anyTimerIdNamesWait candidate.timerHandlerOccurrences wait)).length ≤ 1
                rw [insertActivityOccurrence_eq_canonicalInsertBy,
                  length_filter_canonicalInsertBy]
                have rejected : anyTimerIdNamesWait record.timerHandlerOccurrences wait = false := by
                  simp [record, dataInputOutputActivityRecord,
                    ActivityOccurrence.timerHandlerOccurrences, anyTimerIdNamesWait]
                simpa [rejected] using prior
              have attachedMessagesAfter : attachedMessagesUnambiguous successor = true := by
                simpa only [attachedMessagesUnambiguous, successor] using
                  insertActivityOccurrence_preserves_attachedMessagesUnambiguous_of_empty before
                    record (by simp [record, dataInputOutputActivityRecord,
                      ActivityOccurrence.messageHandlerOccurrences]) attachedMessages
              have activityFresh : ∀ old ∈ before.activityOccurrences,
                  sameActivityOccurrence record old = false ∧
                    sameActivityOccurrence old record = false := by
                intro old member
                simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds
                have oldBound := List.all_eq_true.mp bounds.2 old member
                simp only [decide_eq_true_eq] at oldBound
                constructor <;> apply Bool.eq_false_iff.mpr <;> intro matched <;>
                  simp only [sameActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at matched
                · have taskEq : TaskDefinitionId.mk old.activityElementId.value = taskId := by
                    apply taskDefinitionId_eq_of_value
                    simpa [record, dataInputOutputActivityRecord] using
                      congrArg (fun value : NodeId => value.value) matched.1.2.symm
                  have activationEq : old.activation = activityActivationCount before taskId + 1 := by
                    simpa [record, dataInputOutputActivityRecord] using matched.2.symm
                  rw [taskEq, activationEq] at oldBound
                  omega
                · have taskEq : TaskDefinitionId.mk old.activityElementId.value = taskId := by
                    apply taskDefinitionId_eq_of_value
                    simpa [record, dataInputOutputActivityRecord] using
                      congrArg (fun value : NodeId => value.value) matched.1.2
                  have activationEq : old.activation = activityActivationCount before taskId + 1 := by
                    simpa [record, dataInputOutputActivityRecord] using matched.2
                  rw [taskEq, activationEq] at oldBound
                  omega
              have activityIdsAfter : activityIdentitiesUnique successor = true := by
                simp only [activityIdentitiesUnique]
                change (insertActivityOccurrence record before.activityOccurrences).all
                  (occursOnce sameActivityOccurrence
                    (insertActivityOccurrence record before.activityOccurrences)) = true
                rw [insertActivityOccurrence_eq_canonicalInsertBy]
                exact InternalCommutation.occurrenceKeysUnique_canonicalInsertBy
                  activityOccurrenceBefore sameActivityOccurrence record before.activityOccurrences
                  activityIds activityFresh (by simp [sameActivityOccurrence])
              have onlyDeclarer : userTaskWaitDeclarers program taskId = [operation] := by
                rw [userTaskWaitDeclarers_eq_keyFilter,
                  programWellFormed_waitDeclarer program operation _ structural declared
                    (by simp [operation, operationDeclaresWaitKey,
                      operationWaitDeclarationKeys, userTaskWaitDeclarationKey])]
              have disjoint : ∀ candidate ∈ program.operations,
                  match candidate with
                  | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ => task.id ≠ taskId
                  | .awaitParallelMultiInstanceUserTask _ _ _ task _ _ _ _ _ _ => task ≠ taskId
                  | _ => True := by
                intro candidate member
                cases candidate <;> try trivial
                all_goals
                  intro same
                  have conflict : _ ∈ userTaskWaitDeclarers program taskId :=
                    List.mem_filter.mpr ⟨member, by simp [same]⟩
                  rw [onlyDeclarer] at conflict
                  simp [operation] at conflict
              have sequentialDisjoint : ∀ candidate ∈ program.operations,
                  match candidate with
                  | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
                      task.id.value ≠ record.activityElementId.value
                  | _ => True := by
                intro candidate member
                have different := disjoint candidate member
                cases candidate <;> try trivial
                intro same
                apply different
                apply taskDefinitionId_eq_of_value_eq
                exact same
              have controllersAfter : controllersOwnLiveActivity successor = true := by
                exact controllersOwnLiveActivity_insert_unrelated_activity program before record
                  sequentialDisjoint sequentialBindings controllers
              have sequentialBindingsAfter :
                  sequentialMultiInstanceProgramBindingsValid program successor = true := by
                have waitBindings := InternalCommutation.smiBindings_insertUserTaskWait_frame
                  program before insertedWait (by
                    intro candidate member
                    have different := disjoint candidate member
                    cases candidate <;> trivial) sequentialBindings
                exact sequentialBindings_insertActivityOccurrence_frame program
                  { before with waits := insertUserTaskWait insertedWait before.waits } record
                  sequentialDisjoint waitBindings
              have parallelBindingsAfter :
                  parallelMultiInstanceProgramBindingsValid program successor = true := by
                have waitBindings := parallelMultiInstanceProgramBindingsValid_insertUserTaskWait_frame
                  program before insertedWait disjoint parallelBindings
                have activityBindings := parallelBindings_insertActivityOccurrence_frame program
                  { before with
                    waits := insertUserTaskWait insertedWait before.waits
                    activations := setActivationCount before.activations taskId insertedWait.activation }
                  record (by
                    intro candidate member arm projects
                    have different := disjoint candidate member
                    cases candidate <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
                    cases projects
                    intro same
                    exact different (taskDefinitionId_eq_of_value_eq _ _ same)) waitBindings
                exact activityBindings
              have controllerIdsAfter : controllerIdentitiesUnique successor = true := by
                simpa [successor, controllerIdentitiesUnique] using controllerIds
              have notExhaustedAfter : controllersNotExhausted successor = true := by
                simpa [successor, controllersNotExhausted] using notExhausted
              have orderAfter : canonicalCollectionOrder successor = true := by
                simp only [canonicalCollectionOrder, Bool.and_eq_true] at order ⊢
                obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨tokenOrder, activityCounterOrder⟩, taskOrder⟩, activationOrder⟩, messageOrder⟩,
                  timerOrder⟩, effectOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
                  effectActivationOrder⟩, activityVariableOrder⟩, selectionOrder⟩, raceOrder⟩,
                  callOrder⟩, activityOrder⟩, sequentialOrder⟩, parallelOrder⟩ := order
                have activationOrderAfter : orderedBy activationBefore
                    successor.activations = true := by
                  have inserted := InternalCommutation.orderedBy_replaceStringKey
                    (fun value : TaskActivation => value.taskId.value) activationBefore
                    (fun _ _ => rfl)
                    { taskId, count := insertedWait.activation }
                    (fun activation => !decide (activation.taskId = taskId)) before.activations
                    activationOrder
                  simpa [successor, setActivationCount,
                    insertTaskActivation_eq_canonicalInsertBy, decide_not] using inserted
                refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨orderedBy_removeToken _ input owner tokenOrder, ?_⟩, ?_⟩, activationOrderAfter⟩, messageOrder⟩,
                  timerOrder⟩, effectOrder⟩, messageActivationOrder⟩,
                  timerActivationOrder⟩, effectActivationOrder⟩, ?_⟩, selectionOrder⟩,
                  raceOrder⟩, callOrder⟩, ?_⟩, sequentialOrder⟩, parallelOrder⟩
                · exact orderedBy_insertTaskActivation _ _
                    (orderedBy_filter activationBefore_compose _ _ activityCounterOrder)
                · simpa [successor] using orderedBy_insertUserTaskWait insertedWait
                    before.waits taskOrder
                · change orderedBy activityVariableScopeBefore
                    (insertActivityVariableScope
                      { owner := .activityOccurrence activityOwner
                        bindings :=
                          [{ name := directInput.targetDataInputId, value := binding.value }] }
                      before.variables.activities) = true
                  exact InternalCommutation.orderedBy_insertActivityVariableScope_preserved _ _
                    activityVariableOrder
                · change orderedBy activityOccurrenceBefore
                    (insertActivityOccurrence record before.activityOccurrences) = true
                  rw [insertActivityOccurrence_eq_canonicalInsertBy]
                  exact orderedBy_canonicalInsertBy activityOccurrenceBefore
                    activityOccurrenceBefore_asymm record before.activityOccurrences activityOrder
              have lifecycleAfter : (match successor.control with
                  | .notStarted => notStartedStateEmpty successor
                  | _ => true) = true := by
                simp [successor, running]
              have retentionAfter :
                  compensationActivityRetentionStateValid program successor = true := by
                change compensationActivityRetentionStateValid program before = true
                exact retention
              have snapshotsAfter :
                  compensationEventSubProcessSnapshotStateValid program successor = true := by
                change compensationEventSubProcessSnapshotStateValid program before = true
                exact snapshots
              have executionAfter : compensationExecutionStateValid program successor = true := by
                rw [compensationExecutionStateValid_running_frame program before successor
                  instanceId running rfl rfl rfl rfl rfl rfl]
                exact execution
              simp only [runtimeStateWellFormed, Bool.and_eq_true]
              exact ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨positionAfter, racesAfter⟩, incidentsAfter⟩,
                ownersAfter⟩, identitiesAfter⟩, boundsAfter⟩, declarationsAfter⟩,
                hiddenAfter⟩, orderAfter⟩, bodiesAfter⟩, attachedTimersAfter⟩,
                attachedMessagesAfter⟩, activityIdsAfter⟩, controllersAfter⟩,
                sequentialBindingsAfter⟩, parallelBindingsAfter⟩, controllerIdsAfter⟩,
                notExhaustedAfter⟩, lifecycleAfter⟩,
                ⟨⟨⟨claimsAfter, retentionAfter⟩, snapshotsAfter⟩, executionAfter⟩⟩

theorem dataInputOutputActivationStep_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId : SemanticId)
    (before after : RuntimeState)
    (_profile : program.identity.semanticProfile = activityDataInputOutputUserTaskProfileId)
    (_capabilities : programProfileCapabilitiesValid program = true)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true)
    (transition : DataInputOutputActivationStep program before after) :
    runtimeStateWellFormed program expectedInstanceId after = true :=
  dataInputOutputActivationStep_preserves_runtimeStateWellFormed_general program expectedInstanceId
    before after wellFormed transition

end BpmnSemantics.SemanticProcess
