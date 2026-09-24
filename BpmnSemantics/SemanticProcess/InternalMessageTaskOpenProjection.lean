import BpmnSemantics.SemanticProcess.InternalMessageTaskPairProjection

/-! ESL-OWN-01 inserts the Task and subscription anchors in one projection step.
The half-inserted state is not a publication boundary; freshness applies to both starts. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- The actual Message-host successor projects exactly the two new starts and every prior start. -/
theorem prepared_message_task_open_projection_exact
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch) (expectedInstanceId : SemanticId)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program expectedInstanceId state = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (current : List OpenSemanticFlowNodeOccurrence)
    (beforeProjected : projectOpenFlowNodeOccurrences? program state = some current)
    (taskStart messageStart : OpenSemanticFlowNodeOccurrence)
    (taskStarted : waitStart? program state patch.arm.owner patch.arm.write.elementId
      patch.arm.write.occurrence.activation = some taskStart)
    (messageStarted : waitStart? program state patch.message.owner patch.message.elementId
      patch.message.activation = some messageStart) :
    projectOpenFlowNodeOccurrences? program (applyInternalMessageTaskPatch state patch) =
      some (sortFlowNodeOccurrenceStarts (taskStart :: messageStart :: current)) := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, running, _, _, _, _, _, _,
    taskAbsent, messageAbsent, _, _, patchEq⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  have control : state.control = .running instanceId := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have validities := projectOpenFlowNodeOccurrences_validities program state current instanceId control beforeProjected
  have aligned := prepared_message_task_owner_instance program state contract patch admitted validities.1 prepared
  have aligned' : instanceId = owner.processInstanceId := by
    simpa [patchEq, makeInternalMessageTaskPatch] using aligned
  have elements := prepared_message_task_element_facts program state contract patch programValid prepared
  have occurrencesAfter := prepared_message_task_preserves_occurrence_program_validity
    program state contract patch admitted prepared programValid validities.1
  have wellAfter := prepared_message_task_preserves_runtime program state contract patch expectedInstanceId prepared stateValid
  have associations := runtimeStateWellFormed_associationValidities program expectedInstanceId _ wellAfter
  have pairsAfter := prepared_message_task_preserves_message_pairing program state contract patch
    admitted prepared aligned validities.2.2.2.2
  let after := applyInternalMessageTaskPatch state patch
  change flowNodeOccurrenceProgramValidity program after = true at occurrencesAfter
  change eventRaceAssociationsValid after = true ∧ effectIncidentAssociationsValid after = true at associations
  change messageBoundedProjectionValid program after = true at pairsAfter
  have afterControl : after.control = state.control := by dsimp only [after]; rw [patchEq]; rfl
  have scopeState : after.scopeOccurrences = state.scopeOccurrences := by dsimp only [after]; rw [patchEq]; rfl
  have callState : after.calledProcessOccurrences = state.calledProcessOccurrences := by dsimp only [after]; rw [patchEq]; rfl
  have scopesFrame :
      (after.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM (scopeStart? program after) =
        (state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM (scopeStart? program state) := by
    rw [scopeState]
    exact mapM_eq_of_pointwise _ _ _ fun occurrence => armingScopeStart_frame program state patch.arm occurrence
  have callsFrame : after.calledProcessOccurrences.mapM (callStart? program after) =
      state.calledProcessOccurrences.mapM (callStart? program state) := by
    rw [callState]
    exact mapM_eq_of_pointwise _ _ _ fun record => armingCallStart_frame program state patch.arm record
  have callsAfter : calledProcessAssociationsValid after = true := by
    rw [calledProcessAssociationsValid_frame state after afterControl scopeState callState]
    exact validities.2.1
  have taskAnchor := waitStart_anchor_of_eq program state _ _ _ taskStart taskStarted
  have messageAnchor := waitStart_anchor_of_eq program state _ _ _ messageStart messageStarted
  have distinct : taskStart.anchor ≠ messageStart.anchor := by
    rw [taskAnchor, messageAnchor]
    intro same
    have sameElement := congrArg (fun occurrence : OccurrenceId => occurrence.elementId.value)
      (SemanticFlowNodeOccurrenceAnchor.wait.inj same)
    exact elements.2.2 (by simpa [patchEq, makeInternalMessageTaskPatch, InternalArmingWrite.elementId] using sameElement)
  have freshTask := absent_wait_anchor_projectWaits_fresh program state patch.arm.owner
    patch.arm.write.elementId patch.arm.write.occurrence.activation
    (by simpa [patchEq, makeInternalMessageTaskPatch, InternalArmingWrite.elementId,
      InternalArmingWrite.occurrence, userTaskWaitOccurrence, aligned'] using taskAbsent) validities.1 taskStart taskStarted
  have freshMessage := absent_wait_anchor_projectWaits_fresh program state patch.message.owner
    patch.message.elementId patch.message.activation
    (by simpa [patchEq, makeInternalMessageTaskPatch, messageWaitOccurrence, aligned'] using messageAbsent)
    validities.1 messageStart messageStarted
  have waitInsertion := prepared_message_task_projectWaits_insert program state contract patch prepared
    taskStart messageStart taskStarted messageStarted
  simp only [projectOpenFlowNodeOccurrences?, control] at beforeProjected
  split at beforeProjected
  · simp at beforeProjected
  · cases waitsEq : projectWaits? program state with
    | none => simp [waitsEq] at beforeProjected
    | some waits =>
      cases scopesEq : (state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
          (scopeStart? program state) with
      | none => simp [waitsEq, scopesEq] at beforeProjected
      | some scopes =>
        cases callsEq : state.calledProcessOccurrences.mapM (callStart? program state) with
        | none => simp [waitsEq, scopesEq, callsEq] at beforeProjected
        | some calls =>
          simp [waitsEq, scopesEq, callsEq] at beforeProjected
          obtain ⟨afterWaits, afterWaitsEq, waitsPerm⟩ := waitInsertion waits waitsEq
          let beforeRaw := waits ++ (scopes ++ calls)
          let afterRaw := afterWaits ++ (scopes ++ calls)
          have currentEq : current = sortFlowNodeOccurrenceStarts beforeRaw := beforeProjected.2.symm
          have beforeNodup : (beforeRaw.map (·.anchor)).Nodup :=
            ((sortFlowNodeOccurrenceStarts_perm beforeRaw).map (·.anchor)).nodup_iff.mp beforeProjected.1
          have freshRaw (start : OpenSemanticFlowNodeOccurrence) (occurrence : OccurrenceId)
              (anchor : start.anchor = .wait occurrence)
              (fresh : start.anchor ∉ waits.map (·.anchor)) : start.anchor ∉ beforeRaw.map (·.anchor) := by
            have freshScopes := mapM_no_anchor _ (scopeStart? program state) scopes (.wait occurrence) scopesEq
              (fun scope start started => scopeStart_anchor_ne_wait program state scope start occurrence started)
            have freshCalls := mapM_no_anchor _ (callStart? program state) calls (.wait occurrence) callsEq
              (fun call start started => callStart_anchor_ne_wait program state call start occurrence started)
            rw [anchor] at fresh ⊢
            simpa only [beforeRaw, List.map_append, List.mem_append, not_or] using ⟨fresh, freshScopes, freshCalls⟩
          have taskFresh := freshRaw taskStart _ taskAnchor (freshTask waits waitsEq)
          have messageFresh := freshRaw messageStart _ messageAnchor (freshMessage waits waitsEq)
          have insertedNodup : ((taskStart :: messageStart :: beforeRaw).map (·.anchor)).Nodup := by
            simpa only [List.map_cons, List.nodup_cons, List.mem_cons, not_or] using
              ⟨⟨distinct, taskFresh⟩, messageFresh, beforeNodup⟩
          have afterPerm : afterRaw.Perm (taskStart :: messageStart :: beforeRaw) :=
            waitsPerm.append (List.Perm.refl (scopes ++ calls))
          have afterNodup : ((sortFlowNodeOccurrenceStarts afterRaw).map (·.anchor)).Nodup :=
            ((sortFlowNodeOccurrenceStarts_perm afterRaw).map (·.anchor)).nodup_iff.mpr
              ((afterPerm.map (·.anchor)).nodup_iff.mpr insertedNodup)
          have sortedEq : sortFlowNodeOccurrenceStarts afterRaw =
              sortFlowNodeOccurrenceStarts (taskStart :: messageStart :: current) := by
            apply sortFlowNodeOccurrenceStarts_perm_eq
            rw [currentEq]
            exact afterPerm.trans (List.Perm.cons taskStart
              (List.Perm.cons messageStart (sortFlowNodeOccurrenceStarts_perm beforeRaw))).symm
          have afterScopesEq := scopesFrame.trans scopesEq
          have afterCallsEq := callsFrame.trans callsEq
          change projectWaits? program after = some afterWaits at afterWaitsEq
          simp only [afterRaw] at afterNodup
          change projectOpenFlowNodeOccurrences? program after = _
          rw [← sortedEq]
          simp [projectOpenFlowNodeOccurrences?, afterControl, control, programValid, occurrencesAfter,
            associations.1, callsAfter, associations.2, pairsAfter, afterWaitsEq, afterScopesEq, afterCallsEq,
            afterRaw, afterNodup]

end BpmnSemantics.SemanticProcess.InternalCommutation
