import BpmnSemantics.SemanticProcess.InternalCommutationRuntimePreservation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProjectionShapeProofs

/-! # Internal commutation open-projection preservation

Combines the prepared-arm runtime preservation and occurrence-projector frame laws, leaving the
public classifier and two-order commutation theorem in `InternalCommutation`.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace InternalCommutation

private theorem one_wait_insert_open_projection_exact
    (program : Program) (before after : RuntimeState)
    (newStart : OpenSemanticFlowNodeOccurrence) (current : List OpenSemanticFlowNodeOccurrence)
    (beforeRunning : before.control = .running beforeInstance)
    (afterRunning : after.control = .running afterInstance)
    (beforeProjected : projectOpenFlowNodeOccurrences? program before = some current)
    (waitInsertion : ∀ beforeWaits, projectWaits? program before = some beforeWaits →
      ∃ afterWaits, projectWaits? program after = some afterWaits ∧
        afterWaits.Perm (newStart :: beforeWaits))
    (scopesFrame :
      (after.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
          (scopeStart? program after) =
        (before.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
          (scopeStart? program before))
    (callsFrame : after.calledProcessOccurrences.mapM (callStart? program after) =
      before.calledProcessOccurrences.mapM (callStart? program before))
    (newWaitAnchor : ∃ occurrence, newStart.anchor = .wait occurrence)
    (freshWaits : ∀ beforeWaits, projectWaits? program before = some beforeWaits →
      newStart.anchor ∉ beforeWaits.map (·.anchor))
    (programValid : programWellFormed program = true)
    (occurrencesValid : flowNodeOccurrenceProgramValidity program after = true)
    (racesValid : eventRaceAssociationsValid after = true)
    (callsValid : calledProcessAssociationsValid after = true)
    (incidentsValid : effectIncidentAssociationsValid after = true)
    (messagePairsValid : messageBoundedProjectionValid program after = true) :
    ∃ next,
      projectOpenFlowNodeOccurrences? program after = some next ∧
      next = sortFlowNodeOccurrenceStarts (newStart :: current) := by
  have originalProjected := beforeProjected
  simp only [projectOpenFlowNodeOccurrences?, beforeRunning] at beforeProjected
  split at beforeProjected
  · simp at beforeProjected
  · cases beforeWaitsEq : projectWaits? program before with
    | none => simp [beforeWaitsEq] at beforeProjected
    | some beforeWaits =>
        cases beforeScopesEq :
            (before.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
              (scopeStart? program before) with
        | none => simp [beforeWaitsEq, beforeScopesEq] at beforeProjected
        | some scopes =>
            cases beforeCallsEq : before.calledProcessOccurrences.mapM
                (callStart? program before) with
            | none => simp [beforeWaitsEq, beforeScopesEq, beforeCallsEq] at beforeProjected
            | some calls =>
                simp [beforeWaitsEq, beforeScopesEq, beforeCallsEq] at beforeProjected
                obtain ⟨afterWaits, afterWaitsEq, waitsPerm⟩ :=
                  waitInsertion beforeWaits beforeWaitsEq
                have afterScopesEq :
                    (after.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
                        (scopeStart? program after) = some scopes := by
                  rw [scopesFrame, beforeScopesEq]
                have afterCallsEq : after.calledProcessOccurrences.mapM
                    (callStart? program after) = some calls := by
                  rw [callsFrame, beforeCallsEq]
                let beforeRaw := beforeWaits ++ (scopes ++ calls)
                let afterRaw := afterWaits ++ (scopes ++ calls)
                have currentEq : current = sortFlowNodeOccurrenceStarts beforeRaw := by
                  simpa only [beforeRaw, List.append_assoc] using beforeProjected.2.symm
                have afterRawPerm : afterRaw.Perm (newStart :: beforeRaw) := by
                  change (afterWaits ++ (scopes ++ calls)).Perm
                    ((newStart :: beforeWaits) ++ (scopes ++ calls))
                  exact waitsPerm.append (List.Perm.refl (scopes ++ calls))
                have currentPerm : current.Perm beforeRaw := by
                  rw [currentEq]
                  exact sortFlowNodeOccurrenceStarts_perm beforeRaw
                have sortedEq : sortFlowNodeOccurrenceStarts afterRaw =
                    sortFlowNodeOccurrenceStarts (newStart :: current) := by
                  apply sortFlowNodeOccurrenceStarts_perm_eq
                  exact afterRawPerm.trans (List.Perm.cons newStart currentPerm).symm
                have afterSome := projectOpenFlowNodeOccurrences_one_wait_insert_isSome
                  program before after newStart current beforeRunning afterRunning
                  originalProjected waitInsertion scopesFrame callsFrame newWaitAnchor freshWaits
                  programValid occurrencesValid racesValid callsValid incidentsValid messagePairsValid
                cases afterProjected : projectOpenFlowNodeOccurrences? program after with
                | none => simp [afterProjected] at afterSome
                | some next =>
                    have nextEq : next = sortFlowNodeOccurrenceStarts afterRaw := by
                      simp only [projectOpenFlowNodeOccurrences?, afterRunning] at afterProjected
                      simp [programValid, occurrencesValid, racesValid, callsValid,
                        incidentsValid, messagePairsValid, afterWaitsEq, afterScopesEq,
                        afterCallsEq] at afterProjected
                      simpa only [afterRaw] using afterProjected.2.symm
                    exact ⟨next, rfl, nextEq.trans sortedEq⟩

private theorem prepared_arm_preserves_messageBoundedProjectionValid
    (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (valid : messageBoundedProjectionValid program state = true)
    (prepared : prepareInternalArm? program state operation = some patch) :
    messageBoundedProjectionValid program (applyInternalArmingPatch state patch) = true := by
  have selected := prepared_arm_selection_unique program state operation patch prepared
  have operationEq := prepared_operation_eq program state operation patch prepared
  unfold messageBoundedProjectionValid at valid ⊢
  simp only [List.all_eq_true] at valid ⊢
  intro candidate candidateMember
  have prior := valid candidate candidateMember
  cases candidate <;> try exact prior
  case awaitMessageBoundedUserTask candidateId candidateOrigin candidateInput boundedTask
      boundaryMessage =>
    let boundedOperation := SemanticOperation.awaitMessageBoundedUserTask candidateId
      candidateOrigin candidateInput boundedTask boundaryMessage
    let owned := FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program boundedOperation
    cases writeEq : patch.write with
    | userTask inserted =>
        have declarer := selected.2.1
        rw [writeEq] at declarer
        simp [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
          InternalArmingWrite.elementId] at declarer
        have different : inserted.task.id ≠ boundedTask.id := by
          intro same
          have boundedMember : boundedOperation ∈ userTaskWaitDeclarers program inserted.task.id := by
            simp [boundedOperation, userTaskWaitDeclarers, candidateMember, same]
          rw [declarer] at boundedMember
          have boundedEq : boundedOperation = patch.operation := by simpa using boundedMember
          have impossible : prepareInternalArm? program state boundedOperation = some patch := by
            rw [boundedEq, operationEq]
            exact prepared
          simp [boundedOperation, prepareInternalArm?, internalArmInput?] at impossible
        let taskFilter := fun wait : UserTaskWait =>
          owned wait.owner && decide (wait.task.id = boundedTask.id)
        have taskFrame : (insertUserTaskWait inserted state.waits).filter taskFilter =
            state.waits.filter taskFilter := by
          rw [insertUserTaskWait_eq_canonicalInsertBy]
          apply filter_canonicalInsertBy_rejected
          simp [taskFilter, different]
        simpa [boundedOperation, messageBoundedOperationProjectionValid,
          applyInternalArmingPatch, writeEq, owned, taskFilter, taskFrame] using prior
    | message inserted =>
        have declarer := selected.2.1
        rw [writeEq] at declarer
        simp [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
          InternalArmingWrite.elementId] at declarer
        have different : inserted.elementId ≠ boundaryMessage.elementId := by
          intro same
          have boundedMember : boundedOperation ∈
              messageWaitDeclarers program inserted.elementId := by
            simp [boundedOperation, messageWaitDeclarers, candidateMember, same]
          rw [declarer] at boundedMember
          have boundedEq : boundedOperation = patch.operation := by simpa using boundedMember
          have impossible : prepareInternalArm? program state boundedOperation = some patch := by
            rw [boundedEq, operationEq]
            exact prepared
          simp [boundedOperation, prepareInternalArm?, internalArmInput?] at impossible
        let messageFilter := fun wait : MessageWait =>
          owned wait.owner && decide (wait.elementId = boundaryMessage.elementId)
        have messageFrame : (insertMessageWait inserted state.messageWaits).filter messageFilter =
            state.messageWaits.filter messageFilter := by
          unfold insertMessageWait
          apply filter_canonicalInsertBy_rejected
          simp [messageFilter, different]
        simpa [boundedOperation, messageBoundedOperationProjectionValid,
          applyInternalArmingPatch, writeEq, owned, messageFilter, messageFrame] using prior
    | timer _ | effect _ _ =>
        simpa [boundedOperation, messageBoundedOperationProjectionValid,
          applyInternalArmingPatch, writeEq] using prior

theorem prepared_arm_preserves_runtime_and_open_projection_exact
    (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (expectedInstanceId : SemanticId) (programAdmitted : programWellFormed program = true)
    (stateAdmitted : runtimeStateWellFormed program expectedInstanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalArm? program state operation = some patch) :
    let after := applyInternalArmingPatch state patch
    ∃ current newStart next,
      projectOpenFlowNodeOccurrences? program state = some current ∧
      waitStart? program state patch.owner patch.write.elementId
        patch.write.occurrence.activation = some newStart ∧
      projectOpenFlowNodeOccurrences? program after = some next ∧
      next = sortFlowNodeOccurrenceStarts (newStart :: current) ∧
      runtimeStateWellFormed program expectedInstanceId after = true := by
  let after := applyInternalArmingPatch state patch
  obtain ⟨liveOwner, instanceId, running⟩ :=
    prepared_arm_live_running program state operation patch prepared
  cases projectedEq : projectOpenFlowNodeOccurrences? program state with
  | none => simp [projectedEq] at openBefore
  | some current =>
      have beforeValidities := projectOpenFlowNodeOccurrences_validities program state current
        instanceId running projectedEq
      have structuralBefore :
          flowNodeOccurrenceStructuralProgramValidity program state = true := by
        simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at beforeValidities
        exact beforeValidities.1.1.1.1
      have processSome := processIdForOwner_isSome_of_open_projection program state patch.owner
        current instanceId running structuralBefore beforeValidities.2.1 liveOwner projectedEq
      cases processEq : processIdForOwner? program state patch.owner with
      | none => simp [processEq] at processSome
      | some processId =>
        cases startedEq : waitStart? program state patch.owner patch.write.elementId
            patch.write.occurrence.activation with
        | none =>
          have startSome : (waitStart? program state patch.owner patch.write.elementId
              patch.write.occurrence.activation).isSome = true := by
            simp [waitStart?, processEq]
          simp [startedEq] at startSome
        | some newStart =>
          have started := startedEq
          have waitInsertion := prepared_arm_projectWaits_insert program state operation patch
            prepared newStart started
          have freshWaits := prepared_arm_projectWaits_fresh program state operation patch prepared
            beforeValidities.1 newStart started
          have scopeStateFrame : after.scopeOccurrences = state.scopeOccurrences := by
            cases patch with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl
          have callStateFrame : after.calledProcessOccurrences = state.calledProcessOccurrences := by
            cases patch with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl
          have controlFrame : after.control = state.control := by
            cases patch with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl
          have scopesFrame :
              (after.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
                  (scopeStart? program after) =
                (state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
                  (scopeStart? program state) := by
            rw [scopeStateFrame]
            exact mapM_eq_of_pointwise _ _ _ fun occurrence =>
              armingScopeStart_frame program state patch occurrence
          have callsFrame : after.calledProcessOccurrences.mapM (callStart? program after) =
              state.calledProcessOccurrences.mapM (callStart? program state) := by
            rw [callStateFrame]
            exact mapM_eq_of_pointwise _ _ _ fun record =>
              armingCallStart_frame program state patch record
          have afterRunning : after.control = .running instanceId := controlFrame.trans running
          have wellAfter := prepared_arm_preserves_runtime program state operation patch
            expectedInstanceId stateAdmitted prepared
          have occurrencesAfter := prepared_arm_preserves_flowNodeOccurrenceProgramValidity program
            state operation patch programAdmitted beforeValidities.1 prepared
          have callsAfter : calledProcessAssociationsValid after = true := by
            rw [calledProcessAssociationsValid_frame state after controlFrame scopeStateFrame
              callStateFrame]
            exact beforeValidities.2.1
          have associationValidities := runtimeStateWellFormed_associationValidities program
            expectedInstanceId after wellAfter
          have racesAfter := associationValidities.1
          have incidentsAfter := associationValidities.2
          have messagePairsAfter := prepared_arm_preserves_messageBoundedProjectionValid
            program state operation patch beforeValidities.2.2.2.2 prepared
          let newOccurrence : OccurrenceId :=
            { processInstanceId := patch.owner.processInstanceId
              elementId := ⟨patch.write.elementId.value⟩
              activation := patch.write.occurrence.activation }
          have newAnchor : ∃ occurrence, newStart.anchor =
              SemanticFlowNodeOccurrenceAnchor.wait occurrence := by
            refine ⟨newOccurrence, ?_⟩
            simpa only [newOccurrence] using
              waitStart_anchor_of_eq program state patch.owner patch.write.elementId
                patch.write.occurrence.activation newStart started
          have openAfter := one_wait_insert_open_projection_exact program state
            after newStart current running afterRunning projectedEq waitInsertion scopesFrame
            callsFrame newAnchor freshWaits
            (programValid := programAdmitted)
            (occurrencesValid := occurrencesAfter)
            (racesValid := racesAfter)
            (callsValid := callsAfter)
            (incidentsValid := incidentsAfter)
            (messagePairsValid := messagePairsAfter)
          exact ⟨current, newStart, openAfter.choose, rfl, rfl, openAfter.choose_spec.1,
            openAfter.choose_spec.2, wellAfter⟩

theorem prepared_arm_preserves_runtime_and_open_set (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (expectedInstanceId : SemanticId) (programAdmitted : programWellFormed program = true)
    (stateAdmitted : runtimeStateWellFormed program expectedInstanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalArm? program state operation = some patch) :
    let after := applyInternalArmingPatch state patch
    runtimeStateWellFormed program expectedInstanceId after = true ∧
      (projectOpenFlowNodeOccurrences? program after).isSome = true := by
  obtain ⟨current, newStart, next, beforeEq, started, afterEq, nextEq, wellAfter⟩ :=
    prepared_arm_preserves_runtime_and_open_projection_exact program state operation patch
      expectedInstanceId programAdmitted stateAdmitted openBefore prepared
  exact ⟨wellAfter, by simp [afterEq]⟩

private theorem filter_canonicalInsertBy_eq_singleton (before : α → α → Bool)
    (predicate : α → Bool) (inserted : α) (values : List α)
    (kept : predicate inserted = true)
    (rejected : ∀ value ∈ values, predicate value = false) :
    (canonicalInsertBy before inserted values).filter predicate = [inserted] := by
  have oldEmpty : values.filter predicate = [] :=
    List.filter_eq_nil_iff.mpr fun value member accepted => by
      rw [rejected value member] at accepted
      contradiction
  have permutation := filter_canonicalInsertBy_perm before predicate inserted values kept
  rw [oldEmpty] at permutation
  generalize filteredEq : (canonicalInsertBy before inserted values).filter predicate =
    filtered at permutation ⊢
  cases filtered with
  | nil => simp at permutation
  | cons head tail =>
      cases tail with
      | nil =>
          have member : inserted ∈ [head] := permutation.mem_iff.mpr (by simp)
          simp at member
          subst head
          rfl
      | cons next rest =>
          have lengthEq := permutation.length_eq
          simp at lengthEq

private theorem activationForTask_eq_activationCount (state : RuntimeState)
    (taskId : TaskDefinitionId) :
    activationForTask state taskId = activationCount state taskId := by
  unfold activationForTask activationCount
  induction state.activations with
  | nil => rfl
  | cons current rest ih =>
      by_cases here : current.taskId = taskId
      · simp [taskActivationCount, here]
      · simpa [taskActivationCount, List.find?_cons, here] using ih

private theorem activationForNode_eq_elementActivationCount
    (values : List (NodeId × Nat)) (elementId : NodeId) :
    activationForNode values elementId = elementActivationCount values elementId := rfl

private theorem filter_insertUserTaskWait_eq_singleton (inserted : UserTaskWait)
    (values : List UserTaskWait)
    (insertedOwner : inserted.processInstanceId = inserted.owner.processInstanceId)
    (ownerIds : ∀ old ∈ values, old.processInstanceId = old.owner.processInstanceId)
    (fresh : ∀ old ∈ values, userTaskWaitKeyMatches inserted old = false) :
    (insertUserTaskWait inserted values).filter (fun old =>
      decide (old.owner = inserted.owner) && decide (old.task.id = inserted.task.id) &&
        decide (old.activation = inserted.activation)) = [inserted] := by
  rw [insertUserTaskWait_eq_canonicalInsertBy]
  apply filter_canonicalInsertBy_eq_singleton
  · simp
  · intro old member
    apply Bool.eq_false_iff.mpr
    intro accepted
    simp only [Bool.and_eq_true] at accepted
    have ownerEq := of_decide_eq_true accepted.1.1
    have taskEq := of_decide_eq_true accepted.1.2
    have activationEq := of_decide_eq_true accepted.2
    have processEq : inserted.processInstanceId = old.processInstanceId :=
      insertedOwner.trans ((congrArg ScopeOccurrenceId.processInstanceId ownerEq).symm.trans
        (ownerIds old member).symm)
    have keyed : userTaskWaitKeyMatches inserted old = true := by
      simp [userTaskWaitKeyMatches, processEq, taskEq, activationEq]
    rw [fresh old member] at keyed
    simp at keyed

private theorem filter_insertMessageWait_eq_singleton (inserted : MessageWait)
    (values : List MessageWait)
    (insertedOwner : inserted.processInstanceId = inserted.owner.processInstanceId)
    (ownerIds : ∀ old ∈ values, old.processInstanceId = old.owner.processInstanceId)
    (fresh : ∀ old ∈ values, messageWaitKeyMatches inserted old = false) :
    (insertMessageWait inserted values).filter (fun old =>
      decide (old.owner = inserted.owner) && decide (old.elementId = inserted.elementId) &&
        decide (old.activation = inserted.activation)) = [inserted] := by
  unfold insertMessageWait
  apply filter_canonicalInsertBy_eq_singleton
  · simp
  · intro old member
    apply Bool.eq_false_iff.mpr
    intro accepted
    simp only [Bool.and_eq_true] at accepted
    have ownerEq := of_decide_eq_true accepted.1.1
    have elementEq := of_decide_eq_true accepted.1.2
    have activationEq := of_decide_eq_true accepted.2
    have processEq : inserted.processInstanceId = old.processInstanceId :=
      insertedOwner.trans ((congrArg ScopeOccurrenceId.processInstanceId ownerEq).symm.trans
        (ownerIds old member).symm)
    have keyed : messageWaitKeyMatches inserted old = true := by
      simp [messageWaitKeyMatches, processEq, elementEq, activationEq]
    rw [fresh old member] at keyed
    simp at keyed

private theorem filter_insertTimerWait_eq_singleton (inserted : TimerWait)
    (values : List TimerWait)
    (insertedOwner : inserted.processInstanceId = inserted.owner.processInstanceId)
    (ownerIds : ∀ old ∈ values, old.processInstanceId = old.owner.processInstanceId)
    (fresh : ∀ old ∈ values, timerWaitKeyMatches inserted old = false) :
    (insertTimerWait inserted values).filter (fun old =>
      decide (old.owner = inserted.owner) && decide (old.elementId = inserted.elementId) &&
        decide (old.activation = inserted.activation)) = [inserted] := by
  unfold insertTimerWait
  apply filter_canonicalInsertBy_eq_singleton
  · simp
  · intro old member
    apply Bool.eq_false_iff.mpr
    intro accepted
    simp only [Bool.and_eq_true] at accepted
    have ownerEq := of_decide_eq_true accepted.1.1
    have elementEq := of_decide_eq_true accepted.1.2
    have activationEq := of_decide_eq_true accepted.2
    have processEq : inserted.processInstanceId = old.processInstanceId :=
      insertedOwner.trans ((congrArg ScopeOccurrenceId.processInstanceId ownerEq).symm.trans
        (ownerIds old member).symm)
    have keyed : timerWaitKeyMatches inserted old = true := by
      simp [timerWaitKeyMatches, processEq, elementEq, activationEq]
    rw [fresh old member] at keyed
    simp at keyed

private theorem filter_insertEffectWait_eq_singleton (inserted : EffectWait)
    (values : List EffectWait)
    (insertedOwner : inserted.processInstanceId = inserted.owner.processInstanceId)
    (ownerIds : ∀ old ∈ values, old.processInstanceId = old.owner.processInstanceId)
    (fresh : ∀ old ∈ values, effectWaitKeyMatches inserted old = false) :
    (insertEffectWait inserted values).filter (fun old =>
      decide (old.owner = inserted.owner) && decide (old.elementId = inserted.elementId) &&
        decide (old.activation = inserted.activation)) = [inserted] := by
  unfold insertEffectWait
  apply filter_canonicalInsertBy_eq_singleton
  · simp
  · intro old member
    apply Bool.eq_false_iff.mpr
    intro accepted
    simp only [Bool.and_eq_true] at accepted
    have ownerEq := of_decide_eq_true accepted.1.1
    have elementEq := of_decide_eq_true accepted.1.2
    have activationEq := of_decide_eq_true accepted.2
    have processEq : inserted.processInstanceId = old.processInstanceId :=
      insertedOwner.trans ((congrArg ScopeOccurrenceId.processInstanceId ownerEq).symm.trans
        (ownerIds old member).symm)
    have keyed : effectWaitKeyMatches inserted old = true := by
      simp [effectWaitKeyMatches, processEq, elementEq, activationEq]
    rw [fresh old member] at keyed
    simp at keyed

private theorem exactProgramSelection_parts (program : Program)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId)
    (programValid : programWellFormed program = true)
    (selected : exactProgramSelection program operation owner = true) :
    ∃ binding,
      program.operations.filter (fun candidate => decide (candidate.id = operation.id)) =
        [operation] ∧
      program.operationScopes.filter (fun candidate =>
        decide (candidate.operationId = operation.id)) = [binding] ∧
      binding.scopeId = owner.definitionScopeId := by
  simp only [exactProgramSelection, Bool.and_eq_true] at selected
  have member : operation ∈ program.operations := by
    generalize filteredEq : program.operations.filter
      (fun candidate => decide (candidate = operation)) = filtered at selected
    cases filtered with
    | nil => simp at selected
    | cons candidate rest =>
        cases rest with
        | nil =>
            have candidateMember : candidate ∈ program.operations.filter
                (fun value => decide (value = operation)) := by simp [filteredEq]
            have candidateEq : candidate = operation :=
              of_decide_eq_true (List.mem_filter.mp candidateMember).2
            simpa [candidateEq] using (List.mem_filter.mp candidateMember).1
        | cons other tail => simp at selected
  have idsSorted : strictlySortedStrings
      (program.operations.map fun candidate => candidate.id.value) = true := by
    exact programWellFormed_operationIdsSorted program programValid
  have idsNodup := strictlySortedStrings_nodup _ idsSorted
  have operationSelection : program.operations.filter
      (fun candidate => decide (candidate.id = operation.id)) = [operation] :=
    filter_eq_singleton_of_key_nodup program.operations (fun candidate => candidate.id.value)
      (fun candidate => decide (candidate.id = operation.id)) operation idsNodup
      member (by simp) (by
        intro candidate _ accepted
        exact congrArg OperationId.value (of_decide_eq_true accepted))
  generalize scopeSelection : program.operationScopes.filter (fun candidate =>
    decide (candidate.operationId = operation.id)) = bindings at selected
  cases bindings with
  | nil => simp at selected
  | cons binding rest =>
      cases rest with
      | nil =>
          exact ⟨binding, operationSelection, rfl,
            of_decide_eq_true selected.2⟩
      | cons other tail => simp at selected

private theorem prepared_arm_candidate_singleton (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (commandId : SemanticId) (newStart : OpenSemanticFlowNodeOccurrence)
    (programValid : programWellFormed program = true)
    (occurrencesValid : flowNodeOccurrenceProgramValidity program state = true)
    (prepared : prepareInternalArm? program state operation = some patch)
    (started : waitStart? program state patch.owner patch.write.elementId
      patch.write.occurrence.activation = some newStart) :
    candidateFlowNodeOccurrenceDeltaForOperation? program state
        (applyInternalArmingPatch state patch) operation commandId 0 =
      some (canonicalFlowNodeOccurrenceDelta [newStart] []) := by
  have selection := prepared_arm_selection_unique program state operation patch prepared
  have keyFresh := prepared_arm_key_fresh program state operation patch prepared
  obtain ⟨live, instanceId, running⟩ :=
    prepared_arm_live_running program state operation patch prepared
  unfold waitStart? at started
  obtain ⟨runtimeProcess, runtimeProcessEq, newStartEq⟩ :=
    Option.bind_eq_some_iff.mp started
  have newStartExact := Option.some.inj newStartEq
  subst newStart
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at occurrencesValid
    exact occurrencesValid.1.1.1
  have ownerIds := flowNodeOccurrenceProgramValidity_wait_owner_ids program state occurrencesValid
  have processAligned := candidateProcessIdForDefinitionScope_eq_processIdForOwner
    program state patch.owner runtimeProcess instanceId programValid running structural live
      runtimeProcessEq
  cases operation
  case awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
      correlationPropertyId payloadSelector processPropertySelector =>
    simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared <;> try simp at prepared
    obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases controlEq : state.control <;> simp_all
    rename_i stateInstanceId selected
    cases filteredEq : state.variables.process.bindings.filter fun candidate =>
        candidate.name = processPropertySelector.propertyId with
    | nil => simp_all
    | cons binding rest =>
      cases rest with
      | cons _ _ => simp_all
      | nil =>
        cases valueEq : binding.value with
        | string value =>
          by_cases empty : value.isEmpty = true
          · simp_all
          · simp_all
            obtain ⟨_, unique, _, _, patchEq⟩ := prepared
            simp_all [candidateFlowNodeOccurrenceDeltaForOperation?,
              flowNodeSelectedOperationOwner?, applyInternalArmingPatch,
              InternalArmingWrite.elementId, InternalArmingWrite.occurrence,
              messageWaitOccurrence, candidateMessageStart?]
            obtain ⟨scopeBinding, operationSelection, scopeSelection, scopeMatches⟩ :=
              exactProgramSelection_parts program
                (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
                  correlationPropertyId payloadSelector processPropertySelector) owner
                programValid selection.1
            let wait : MessageWait :=
              { processInstanceId := owner.processInstanceId, owner,
                elementId := message.elementId,
                activation := messageActivationCount state message.elementId + 1,
                channel := message.channel, output }
            have filtered : (insertMessageWait wait state.messageWaits).filter (fun old =>
                decide (old.owner = owner) && decide (old.elementId = message.elementId) &&
                  decide (old.activation = activationForNode
                    (state.messageActivations.map fun current =>
                      (current.elementId, current.count)) message.elementId + 1)) = [wait] := by
              rw [activationForNode_eq_elementActivationCount]
              exact filter_insertMessageWait_eq_singleton wait state.messageWaits rfl ownerIds.2.1
                (fun old member => (keyFresh old member).1)
            dsimp [wait] at filtered
            rw [filtered]
            have candidate := candidateWaitStart_of_exact_selection program
              (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
                correlationPropertyId payloadSelector processPropertySelector) owner
              owner.processInstanceId message.elementId
              (messageActivationCount state message.elementId + 1) runtimeProcess scopeBinding
              operationSelection scopeSelection scopeMatches processAligned rfl (by omega)
            simp [candidate]
            rfl
        | boolean _ | integer _ | stringList _ | null => simp_all
  all_goals simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared <;> try simp at prepared
  all_goals
    obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases controlEq : state.control <;> simp_all
  all_goals
    obtain ⟨unique, absent, available, patchEq⟩ := prepared
    simp_all [candidateFlowNodeOccurrenceDeltaForOperation?, flowNodeSelectedOperationOwner?,
      applyInternalArmingPatch, InternalArmingWrite.elementId,
      InternalArmingWrite.occurrence, userTaskWaitOccurrence, messageWaitOccurrence,
      timerWaitOccurrence, effectWaitOccurrence, candidateUserTaskStart?,
      candidateMessageStart?, candidateTimerStart?, candidateEffectStart?]
  case awaitUserTask.isFalse.running =>
    rename_i id origin input output task stateInstanceId
    obtain ⟨binding, operationSelection, scopeSelection, scopeMatches⟩ :=
      exactProgramSelection_parts program (.awaitUserTask id origin input output task) owner
        programValid selection.1
    let wait : UserTaskWait :=
      { processInstanceId := owner.processInstanceId, owner, task,
        activation := activationCount state task.id + 1, output, metadata := task.metadata }
    have filtered : (insertUserTaskWait wait state.waits).filter (fun old =>
        decide (old.owner = owner) && decide (old.task.id = task.id) &&
          decide (old.activation = activationForTask state task.id + 1)) = [wait] := by
      simpa [wait, activationForTask_eq_activationCount] using
        filter_insertUserTaskWait_eq_singleton wait state.waits rfl ownerIds.1
          (fun old member => (keyFresh old member).1)
    dsimp [wait] at filtered
    rw [filtered]
    have candidate := candidateWaitStart_of_exact_selection program
      (.awaitUserTask id origin input output task) owner owner.processInstanceId
      ⟨task.id.value⟩ (activationCount state task.id + 1) runtimeProcess binding
      operationSelection scopeSelection scopeMatches processAligned rfl (by omega)
    simp [candidate]
    rfl
  case awaitMessage.isFalse.running =>
    rename_i id origin input output message stateInstanceId
    obtain ⟨binding, operationSelection, scopeSelection, scopeMatches⟩ :=
      exactProgramSelection_parts program (.awaitMessage id origin input output message) owner
        programValid selection.1
    let wait : MessageWait :=
      { processInstanceId := owner.processInstanceId, owner,
        elementId := message.elementId,
        activation := messageActivationCount state message.elementId + 1,
        channel := message.channel, output }
    have filtered : (insertMessageWait wait state.messageWaits).filter (fun old =>
        decide (old.owner = owner) && decide (old.elementId = message.elementId) &&
          decide (old.activation = activationForNode
            (state.messageActivations.map fun value => (value.elementId, value.count))
              message.elementId + 1)) = [wait] := by
      rw [activationForNode_eq_elementActivationCount]
      exact filter_insertMessageWait_eq_singleton wait state.messageWaits rfl ownerIds.2.1
        (fun old member => (keyFresh old member).1)
    dsimp [wait] at filtered
    rw [filtered]
    have candidate := candidateWaitStart_of_exact_selection program
      (.awaitMessage id origin input output message) owner owner.processInstanceId
      message.elementId (messageActivationCount state message.elementId + 1) runtimeProcess binding
      operationSelection scopeSelection scopeMatches processAligned rfl (by omega)
    simp [candidate]
    rfl
  case awaitPayloadMessage.isFalse.running =>
    rename_i id origin input output message directOutput stateInstanceId
    obtain ⟨binding, operationSelection, scopeSelection, scopeMatches⟩ :=
      exactProgramSelection_parts program
        (.awaitPayloadMessage id origin input output message directOutput) owner
        programValid selection.1
    let wait : MessageWait :=
      { processInstanceId := owner.processInstanceId, owner,
        elementId := message.elementId,
        activation := messageActivationCount state message.elementId + 1,
        channel := message.channel, output }
    have filtered : (insertMessageWait wait state.messageWaits).filter (fun old =>
        decide (old.owner = owner) && decide (old.elementId = message.elementId) &&
          decide (old.activation = activationForNode
            (state.messageActivations.map fun value => (value.elementId, value.count))
              message.elementId + 1)) = [wait] := by
      rw [activationForNode_eq_elementActivationCount]
      exact filter_insertMessageWait_eq_singleton wait state.messageWaits rfl ownerIds.2.1
        (fun old member => (keyFresh old member).1)
    dsimp [wait] at filtered
    rw [filtered]
    have candidate := candidateWaitStart_of_exact_selection program
      (.awaitPayloadMessage id origin input output message directOutput) owner
      owner.processInstanceId message.elementId
      (messageActivationCount state message.elementId + 1) runtimeProcess binding
      operationSelection scopeSelection scopeMatches processAligned rfl (by omega)
    simp [candidate]
    rfl
  case awaitTimer.isFalse.running =>
    rename_i id origin input output timer stateInstanceId
    obtain ⟨binding, operationSelection, scopeSelection, scopeMatches⟩ :=
      exactProgramSelection_parts program (.awaitTimer id origin input output timer) owner
        programValid selection.1
    let wait : TimerWait :=
      { processInstanceId := owner.processInstanceId, owner,
        elementId := timer.elementId,
        activation := timerActivationCount state timer.elementId + 1,
        deadlineMs := state.logicalTimeMs + timer.durationMs, output }
    have filtered : (insertTimerWait wait state.timerWaits).filter (fun old =>
        decide (old.owner = owner) && decide (old.elementId = timer.elementId) &&
          decide (old.activation = activationForNode
            (state.timerActivations.map fun value => (value.elementId, value.count))
              timer.elementId + 1)) = [wait] := by
      rw [activationForNode_eq_elementActivationCount]
      exact filter_insertTimerWait_eq_singleton wait state.timerWaits rfl ownerIds.2.2.1
        (fun old member => (keyFresh old member).1)
    dsimp [wait] at filtered
    rw [filtered]
    have candidate := candidateWaitStart_of_exact_selection program
      (.awaitTimer id origin input output timer) owner owner.processInstanceId
      timer.elementId (timerActivationCount state timer.elementId + 1) runtimeProcess binding
      operationSelection scopeSelection scopeMatches processAligned rfl (by omega)
    simp [candidate]
    rfl
  case awaitEffect.isFalse.running =>
    rename_i id origin input output effect route stateInstanceId
    obtain ⟨binding, operationSelection, scopeSelection, scopeMatches⟩ :=
      exactProgramSelection_parts program (.awaitEffect id origin input output effect route) owner
        programValid selection.1
    let wait : EffectWait :=
      { processInstanceId := owner.processInstanceId, owner,
        elementId := effect.elementId,
        activation := effectActivationCount state effect.elementId + 1,
        descriptor := effect.descriptor,
        arguments := (evaluateInputMappings effect.inputMappings).getD [],
        outputMappings := effect.outputMappings, output, bpmnErrorRoute := route }
    have filtered : (insertEffectWait wait state.effectWaits).filter (fun old =>
        decide (old.owner = owner) && decide (old.elementId = effect.elementId) &&
          decide (old.activation = activationForNode
            (state.effectActivations.map fun value => (value.elementId, value.count))
              effect.elementId + 1)) = [wait] := by
      rw [activationForNode_eq_elementActivationCount]
      exact filter_insertEffectWait_eq_singleton wait state.effectWaits rfl ownerIds.2.2.2.1
        (fun old member => (keyFresh old member).1)
    dsimp [wait] at filtered
    rw [filtered]
    cases evaluatedEq : evaluateInputMappings effect.inputMappings with
    | none => exact (unique evaluatedEq).elim
    | some bindings =>
        have candidate := candidateWaitStart_of_exact_selection program
          (.awaitEffect id origin input output effect route) owner owner.processInstanceId
          effect.elementId (effectActivationCount state effect.elementId + 1) runtimeProcess binding
          operationSelection scopeSelection scopeMatches processAligned rfl (by omega)
        simp [candidate]
        rfl

/-- A prepared ordinary arm publishes exactly its one accepted wait start. -/
theorem prepared_arm_lifecycle_singleton (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (expectedInstanceId commandId : SemanticId)
    (programAdmitted : programWellFormed program = true)
    (stateAdmitted : runtimeStateWellFormed program expectedInstanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalArm? program state operation = some patch) :
    ∃ newStart,
      waitStart? program state patch.owner patch.write.elementId
          patch.write.occurrence.activation = some newStart ∧
      flowNodeOccurrenceDeltaForOperation? program state
          (applyInternalArmingPatch state patch) operation commandId 0 =
        some (canonicalFlowNodeOccurrenceDelta [newStart] []) := by
  obtain ⟨current, newStart, next, beforeEq, started, afterEq, nextEq, _⟩ :=
    prepared_arm_preserves_runtime_and_open_projection_exact program state operation patch
      expectedInstanceId programAdmitted stateAdmitted openBefore prepared
  obtain ⟨_, instanceId, running⟩ :=
    prepared_arm_live_running program state operation patch prepared
  have validities := projectOpenFlowNodeOccurrences_validities program state current
    instanceId running beforeEq
  have candidate := prepared_arm_candidate_singleton program state operation patch commandId
    newStart programAdmitted validities.1 prepared started
  have nextNodup := projectOpenFlowNodeOccurrences_anchor_nodup program
    (applyInternalArmingPatch state patch) next afterEq
  rw [nextEq] at nextNodup
  have consNodup : ((newStart :: current).map (·.anchor)).Nodup :=
    ((sortFlowNodeOccurrenceStarts_perm (newStart :: current)).map (·.anchor)).nodup_iff.mp nextNodup
  have appendNodup : ((current ++ [newStart]).map (·.anchor)).Nodup :=
    ((List.perm_append_singleton newStart current).map (·.anchor)).nodup_iff.mpr consNodup
  have availableEq : sortFlowNodeOccurrenceStarts (current ++ [newStart]) = next := by
    rw [nextEq]; apply sortFlowNodeOccurrenceStarts_perm_eq
    exact List.perm_append_singleton newStart current
  have startSort : sortFlowNodeOccurrenceStarts [newStart] = [newStart] := by rfl
  have endSort : sortFlowNodeOccurrenceEnds [] = [] := by rfl
  have nonTransition : transitionAnchor newStart.anchor = false := by
    rw [waitStart_anchor_of_eq program state _ _ _ _ started]
    rfl
  have nextNonTransition := projectOpenFlowNodeOccurrences_transitionAnchor_false program
    (applyInternalArmingPatch state patch) next afterEq
  simp only [List.map_append, List.map_cons, List.map_nil] at appendNodup
  refine ⟨newStart, started, ?_⟩
  unfold flowNodeOccurrenceDeltaForOperation?
  simp only [Option.bind_eq_bind]
  rw [candidate]
  unfold acceptFlowNodeOccurrenceCandidate?
  simp only [Option.bind_eq_bind]
  rw [beforeEq, afterEq]
  simp only [Option.bind_some]
  simp only [canonicalFlowNodeOccurrenceDelta]
  unfold applyFlowNodeOccurrenceDelta?
  rw [startSort, endSort]
  simp [availableAfterStarts, removeEndedFlowNodeOccurrences, nonTransition, availableEq,
    nextNonTransition, appendNodup]

end InternalCommutation

end BpmnSemantics.SemanticProcess
