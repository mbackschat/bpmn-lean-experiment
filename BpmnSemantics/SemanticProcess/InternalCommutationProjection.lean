import BpmnSemantics.SemanticProcess.InternalCommutationCore
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleProofs
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidityFrames

/-! # Internal commutation occurrence-projection frames

Proves that one prepared ordinary internal arm adds exactly one fresh projected wait occurrence while preserving the existing wait, scope, and called-process projections.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace InternalCommutation

theorem armingWaitStart_frame (program : Program) (state : RuntimeState) (patch : InternalArmingPatch) (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat) : waitStart? program (applyInternalArmingPatch state patch) owner element activation = waitStart? program state owner element activation := by cases patch with | mk _ _ _ _ _ _ _ write => cases write <;> rfl
theorem armingScopeStart_frame (program : Program) (state : RuntimeState) (patch : InternalArmingPatch) (occurrence : RuntimeScopeOccurrence) : scopeStart? program (applyInternalArmingPatch state patch) occurrence = scopeStart? program state occurrence := by cases patch with | mk _ _ _ _ _ _ _ write => cases write <;> rfl
theorem armingCallStart_frame (program : Program) (state : RuntimeState) (patch : InternalArmingPatch) (record : CalledProcessOccurrence) : callStart? program (applyInternalArmingPatch state patch) record = callStart? program state record := by cases patch with | mk _ _ _ _ _ _ _ write => cases write <;> rfl

theorem prepared_arm_anchor_shape (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) :
    patch.write.occurrence =
        { processInstanceId := patch.owner.processInstanceId,
          elementId := ⟨patch.write.elementId.value⟩,
          activation := patch.write.occurrence.activation } ∧
      openWaitAnchorAbsent state patch.write.occurrence = true := by
  cases operation <;> simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared
    · simp at prepared
    · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
        Option.bind_eq_some_iff.mp prepared
      cases controlEq : state.control <;> simp_all
      all_goals
        obtain ⟨_, _, _, patchEq⟩ := prepared
        simp_all [InternalArmingWrite.occurrence, InternalArmingWrite.elementId,
          userTaskWaitOccurrence, messageWaitOccurrence, timerWaitOccurrence,
          effectWaitOccurrence]

theorem prepared_arm_projectWaits_insert (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch)
    (newStart : OpenSemanticFlowNodeOccurrence)
    (started : waitStart? program state patch.owner patch.write.elementId
      patch.write.occurrence.activation = some newStart) :
    ∀ beforeWaits, projectWaits? program state = some beforeWaits →
      ∃ afterWaits, projectWaits? program (applyInternalArmingPatch state patch) = some afterWaits ∧
        afterWaits.Perm (newStart :: beforeWaits) := by
  intro beforeWaits beforeProjected
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
      effectsEq, incidentsEq, rfl⟩ :=
    (projectWaits_eq_some_iff program state beforeWaits).mp beforeProjected
  cases operation <;> simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared <;> try simp at prepared
  all_goals
    obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases controlEq : state.control <;> simp_all
  all_goals
    obtain ⟨unique, absent, available, patchEq⟩ := prepared
  case awaitUserTask.isFalse.running =>
       rename_i id origin input output task instanceId selection
       let wait : UserTaskWait :=
         { processInstanceId := owner.processInstanceId, owner, task,
           activation := activationCount state task.id + 1, output, metadata := task.metadata }
       let currentPatch : InternalArmingPatch :=
         { operation := .awaitUserTask id origin input output task, origin,
           runtimeInstanceId := instanceId, logicalTimeMs := state.logicalTimeMs,
           input, inputOrigin, owner, write := .userTask wait }
       have declarer : userTaskWaitDeclarers program task.id =
           [.awaitUserTask id origin input output task] := by
         simpa [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
           InternalArmingWrite.elementId, wait] using unique.1.1
       have startEq : waitStart? program state wait.owner ⟨wait.task.id.value⟩
           wait.activation = some newStart := by
         simpa [currentPatch, wait, InternalArmingWrite.elementId,
           InternalArmingWrite.occurrence, userTaskWaitOccurrence] using started
       have newMapped : waitStart? program (applyInternalArmingPatch state currentPatch)
           wait.owner ⟨wait.task.id.value⟩ wait.activation = some newStart := by
         rw [armingWaitStart_frame]
         exact startEq
       have oldTasksMapped : state.waits.mapM (fun current => waitStart? program
           (applyInternalArmingPatch state currentPatch) current.owner
           ⟨current.task.id.value⟩ current.activation) = some tasks := by
         rw [mapM_eq_of_pointwise state.waits _ _
           (fun current => armingWaitStart_frame _ _ _ _ _ _)]
         exact tasksEq
       obtain ⟨afterTasks, afterTasksEq, taskPerm⟩ :=
         mapM_canonicalInsertBy_some userTaskWaitBefore _ wait newStart state.waits tasks
           newMapped oldTasksMapped
       have messagesAfterEq : state.messageWaits.mapM (fun current => waitStart? program
           (applyInternalArmingPatch state currentPatch) current.owner current.elementId
           current.activation) = some messages := by
         rw [mapM_eq_of_pointwise state.messageWaits _ _
           (fun current => armingWaitStart_frame _ _ _ _ _ _)]
         exact messagesEq
       have boundaryFrame (current : TimerWait) :
           flowNodeOccurrenceBoundaryTimerBound program
               (applyInternalArmingPatch state currentPatch) current =
             flowNodeOccurrenceBoundaryTimerBound program state current := by
         change flowNodeOccurrenceBoundaryTimerBound program
             { state with waits := insertUserTaskWait wait state.waits } current = _
         exact flowNodeOccurrenceBoundaryTimerBound_insertOrdinaryUserTask program state id
           origin input output wait declarer current
       have timersAfterEq : (state.timerWaits.filter fun current =>
           !flowNodeOccurrenceBoundaryTimerBound program
             (applyInternalArmingPatch state currentPatch) current).mapM
           (fun current => waitStart? program (applyInternalArmingPatch state currentPatch)
             current.owner current.elementId current.activation) = some timers := by
         rw [show (state.timerWaits.filter fun current =>
             !flowNodeOccurrenceBoundaryTimerBound program
               (applyInternalArmingPatch state currentPatch) current) =
             (state.timerWaits.filter fun current =>
               !flowNodeOccurrenceBoundaryTimerBound program state current) by
               apply List.filter_congr
               intro current _
               rw [boundaryFrame]]
         rw [mapM_eq_of_pointwise _ _ _
           (fun current => armingWaitStart_frame _ _ _ _ _ _)]
         exact timersEq
       have effectsAfterEq : state.effectWaits.mapM (fun current => waitStart? program
           (applyInternalArmingPatch state currentPatch) current.owner current.elementId
           current.activation) = some effects := by
         rw [mapM_eq_of_pointwise state.effectWaits _ _
           (fun current => armingWaitStart_frame _ _ _ _ _ _)]
         exact effectsEq
       have incidentsAfterEq : state.effectIncidents.mapM (fun current => waitStart? program
           (applyInternalArmingPatch state currentPatch) current.wait.owner
           current.wait.elementId current.wait.activation) = some incidents := by
         rw [mapM_eq_of_pointwise state.effectIncidents _ _
           (fun current => armingWaitStart_frame _ _ _ _ _ _)]
         exact incidentsEq
       refine ⟨afterTasks ++ (messages ++ (timers ++ (effects ++ incidents))), ?_, ?_⟩
       · apply (projectWaits_eq_some_iff _ _ _).mpr
         refine ⟨afterTasks, messages, timers, effects, incidents, ?_, ?_, ?_, ?_, ?_, rfl⟩
         · simpa [currentPatch, applyInternalArmingPatch, wait,
             insertUserTaskWait_eq_canonicalInsertBy] using afterTasksEq
         · exact messagesAfterEq
         · exact timersAfterEq
         · exact effectsAfterEq
         · exact incidentsAfterEq
       · simpa using taskPerm.append
           (List.Perm.refl (messages ++ (timers ++ (effects ++ incidents))))
  case awaitMessage.isFalse.running =>
    rename_i id origin input output message instanceId selection
    let wait : MessageWait :=
      { processInstanceId := owner.processInstanceId, owner,
        elementId := message.elementId, activation := messageActivationCount state message.elementId + 1,
        channel := message.channel, output }
    let currentPatch : InternalArmingPatch :=
      { operation := .awaitMessage id origin input output message, origin,
        runtimeInstanceId := instanceId, logicalTimeMs := state.logicalTimeMs,
        input, inputOrigin, owner, write := .message wait }
    have startEq : waitStart? program state wait.owner wait.elementId wait.activation =
        some newStart := by
      simpa [currentPatch, wait, InternalArmingWrite.elementId,
        InternalArmingWrite.occurrence, messageWaitOccurrence] using started
    have newMapped : waitStart? program (applyInternalArmingPatch state currentPatch)
        wait.owner wait.elementId wait.activation = some newStart := by
      rw [armingWaitStart_frame]
      exact startEq
    have oldMessagesMapped : state.messageWaits.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.owner current.elementId
        current.activation) = some messages := by
      rw [mapM_eq_of_pointwise state.messageWaits _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact messagesEq
    obtain ⟨afterMessages, afterMessagesEq, messagePerm⟩ :=
      mapM_canonicalInsertBy_some messageWaitBefore _ wait newStart state.messageWaits
        messages newMapped oldMessagesMapped
    have tasksAfterEq : state.waits.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.owner
        ⟨current.task.id.value⟩ current.activation) = some tasks := by
      rw [mapM_eq_of_pointwise state.waits _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact tasksEq
    have timersAfterEq : (state.timerWaits.filter fun current =>
        !flowNodeOccurrenceBoundaryTimerBound program state current).mapM
        (fun current => waitStart? program (applyInternalArmingPatch state currentPatch)
          current.owner current.elementId current.activation) = some timers := by
      rw [mapM_eq_of_pointwise _ _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact timersEq
    have effectsAfterEq : state.effectWaits.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.owner current.elementId
        current.activation) = some effects := by
      rw [mapM_eq_of_pointwise state.effectWaits _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact effectsEq
    have incidentsAfterEq : state.effectIncidents.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.wait.owner current.wait.elementId
        current.wait.activation) = some incidents := by
      rw [mapM_eq_of_pointwise state.effectIncidents _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact incidentsEq
    refine ⟨tasks ++ (afterMessages ++ (timers ++ (effects ++ incidents))), ?_, ?_⟩
    · apply (projectWaits_eq_some_iff _ _ _).mpr
      exact ⟨tasks, afterMessages, timers, effects, incidents, tasksAfterEq,
        by simpa [currentPatch, applyInternalArmingPatch, wait, insertMessageWait] using afterMessagesEq,
        timersAfterEq, effectsAfterEq, incidentsAfterEq, rfl⟩
    · exact append_component_insert_perm tasks afterMessages messages
        (timers ++ (effects ++ incidents)) newStart messagePerm
  case awaitTimer.isFalse.running =>
    rename_i id origin input output timer instanceId selection
    let wait : TimerWait :=
      { processInstanceId := owner.processInstanceId, owner, elementId := timer.elementId,
        activation := timerActivationCount state timer.elementId + 1,
        deadlineMs := state.logicalTimeMs + timer.durationMs, output }
    let currentPatch : InternalArmingPatch :=
      { operation := .awaitTimer id origin input output timer, origin,
        runtimeInstanceId := instanceId, logicalTimeMs := state.logicalTimeMs,
        input, inputOrigin, owner, write := .timer wait }
    have declarer : timerWaitDeclarers program timer.elementId =
        [.awaitTimer id origin input output timer] := by
      simpa [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
        InternalArmingWrite.elementId, wait] using unique.1.1
    have startEq : waitStart? program state wait.owner wait.elementId wait.activation =
        some newStart := by
      simpa [currentPatch, wait, InternalArmingWrite.elementId,
        InternalArmingWrite.occurrence, timerWaitOccurrence] using started
    have newMapped : waitStart? program (applyInternalArmingPatch state currentPatch)
        wait.owner wait.elementId wait.activation = some newStart := by
      rw [armingWaitStart_frame]
      exact startEq
    have boundaryFrame (current : TimerWait) :
        flowNodeOccurrenceBoundaryTimerBound program
            (applyInternalArmingPatch state currentPatch) current =
          flowNodeOccurrenceBoundaryTimerBound program state current := by
      rfl
    have newNotBound : flowNodeOccurrenceBoundaryTimerBound program
        (applyInternalArmingPatch state currentPatch) wait = false :=
      flowNodeOccurrenceBoundaryTimerBound_ordinaryTimer_false program
        (applyInternalArmingPatch state currentPatch) id origin input output timer wait rfl declarer
    have newKept : (!flowNodeOccurrenceBoundaryTimerBound program
        (applyInternalArmingPatch state currentPatch) wait) = true := by
      simp [newNotBound]
    have oldFilterFrame : (state.timerWaits.filter fun current =>
        !flowNodeOccurrenceBoundaryTimerBound program
          (applyInternalArmingPatch state currentPatch) current) =
        (state.timerWaits.filter fun current =>
          !flowNodeOccurrenceBoundaryTimerBound program state current) := by
      apply List.filter_congr
      intro current _
      rw [boundaryFrame]
    have oldTimersAfterEq : (state.timerWaits.filter fun current =>
        !flowNodeOccurrenceBoundaryTimerBound program state current).mapM
        (fun current => waitStart? program (applyInternalArmingPatch state currentPatch)
          current.owner current.elementId current.activation) = some timers := by
      rw [mapM_eq_of_pointwise _ _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact timersEq
    have oldTimersCurrentPredicateEq : (state.timerWaits.filter fun current =>
        !flowNodeOccurrenceBoundaryTimerBound program
          (applyInternalArmingPatch state currentPatch) current).mapM
        (fun current => waitStart? program (applyInternalArmingPatch state currentPatch)
          current.owner current.elementId current.activation) = some timers := by
      rw [oldFilterFrame]
      exact oldTimersAfterEq
    obtain ⟨afterTimers, afterTimersEq, timerPerm⟩ :=
      filter_mapM_canonicalInsertBy_some timerWaitBefore
        (fun current => !flowNodeOccurrenceBoundaryTimerBound program
          (applyInternalArmingPatch state currentPatch) current)
        (fun current => waitStart? program (applyInternalArmingPatch state currentPatch)
          current.owner current.elementId current.activation)
        wait newStart state.timerWaits timers newKept newMapped oldTimersCurrentPredicateEq
    have tasksAfterEq : state.waits.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.owner
        ⟨current.task.id.value⟩ current.activation) = some tasks := by
      rw [mapM_eq_of_pointwise state.waits _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact tasksEq
    have messagesAfterEq : state.messageWaits.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.owner current.elementId
        current.activation) = some messages := by
      rw [mapM_eq_of_pointwise state.messageWaits _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact messagesEq
    have effectsAfterEq : state.effectWaits.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.owner current.elementId
        current.activation) = some effects := by
      rw [mapM_eq_of_pointwise state.effectWaits _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact effectsEq
    have incidentsAfterEq : state.effectIncidents.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.wait.owner current.wait.elementId
        current.wait.activation) = some incidents := by
      rw [mapM_eq_of_pointwise state.effectIncidents _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact incidentsEq
    refine ⟨tasks ++ (messages ++ (afterTimers ++ (effects ++ incidents))), ?_, ?_⟩
    · apply (projectWaits_eq_some_iff _ _ _).mpr
      exact ⟨tasks, messages, afterTimers, effects, incidents, tasksAfterEq, messagesAfterEq,
        by simpa [currentPatch, applyInternalArmingPatch, wait, insertTimerWait] using afterTimersEq,
        effectsAfterEq, incidentsAfterEq, rfl⟩
    · simpa only [List.append_assoc] using
        append_component_insert_perm (tasks ++ messages) afterTimers timers
          (effects ++ incidents) newStart timerPerm
  case awaitEffect.isFalse.running =>
    rename_i id origin input output effect route instanceId selection
    let bindings := (evaluateInputMappings effect.inputMappings).getD []
    let wait : EffectWait :=
      { processInstanceId := owner.processInstanceId, owner, elementId := effect.elementId,
        activation := effectActivationCount state effect.elementId + 1,
        descriptor := effect.descriptor, arguments := bindings,
        outputMappings := effect.outputMappings, output, bpmnErrorRoute := route }
    let currentPatch : InternalArmingPatch :=
      { operation := .awaitEffect id origin input output effect route, origin,
        runtimeInstanceId := instanceId, logicalTimeMs := state.logicalTimeMs,
        input, inputOrigin, owner, write := .effect wait bindings }
    have startEq : waitStart? program state wait.owner wait.elementId wait.activation =
        some newStart := by
      simpa [currentPatch, wait, bindings, InternalArmingWrite.elementId,
        InternalArmingWrite.occurrence, effectWaitOccurrence] using started
    have newMapped : waitStart? program (applyInternalArmingPatch state currentPatch)
        wait.owner wait.elementId wait.activation = some newStart := by
      rw [armingWaitStart_frame]
      exact startEq
    have oldEffectsMapped : state.effectWaits.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.owner current.elementId
        current.activation) = some effects := by
      rw [mapM_eq_of_pointwise state.effectWaits _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact effectsEq
    obtain ⟨afterEffects, afterEffectsEq, effectPerm⟩ :=
      mapM_canonicalInsertBy_some effectWaitBefore _ wait newStart state.effectWaits effects
        newMapped oldEffectsMapped
    have tasksAfterEq : state.waits.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.owner
        ⟨current.task.id.value⟩ current.activation) = some tasks := by
      rw [mapM_eq_of_pointwise state.waits _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact tasksEq
    have messagesAfterEq : state.messageWaits.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.owner current.elementId
        current.activation) = some messages := by
      rw [mapM_eq_of_pointwise state.messageWaits _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact messagesEq
    have timersAfterEq : (state.timerWaits.filter fun current =>
        !flowNodeOccurrenceBoundaryTimerBound program state current).mapM
        (fun current => waitStart? program (applyInternalArmingPatch state currentPatch)
          current.owner current.elementId current.activation) = some timers := by
      rw [mapM_eq_of_pointwise _ _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact timersEq
    have incidentsAfterEq : state.effectIncidents.mapM (fun current => waitStart? program
        (applyInternalArmingPatch state currentPatch) current.wait.owner current.wait.elementId
        current.wait.activation) = some incidents := by
      rw [mapM_eq_of_pointwise state.effectIncidents _ _
        (fun current => armingWaitStart_frame _ _ _ _ _ _)]
      exact incidentsEq
    refine ⟨tasks ++ (messages ++ (timers ++ (afterEffects ++ incidents))), ?_, ?_⟩
    · apply (projectWaits_eq_some_iff _ _ _).mpr
      exact ⟨tasks, messages, timers, afterEffects, incidents, tasksAfterEq, messagesAfterEq,
        timersAfterEq,
        by simpa [currentPatch, applyInternalArmingPatch, wait, bindings,
          insertEffectWait] using afterEffectsEq,
        incidentsAfterEq, rfl⟩
    · simpa only [List.append_assoc] using
        append_component_insert_perm (tasks ++ messages ++ timers) afterEffects effects
          incidents newStart effectPerm
  all_goals simp_all

theorem prepared_arm_projectWaits_fresh (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch)
    (occurrencesValid : flowNodeOccurrenceProgramValidity program state = true)
    (newStart : OpenSemanticFlowNodeOccurrence)
    (started : waitStart? program state patch.owner patch.write.elementId
      patch.write.occurrence.activation = some newStart) :
    ∀ beforeWaits, projectWaits? program state = some beforeWaits →
      newStart.anchor ∉ beforeWaits.map (·.anchor) := by
  intro beforeWaits beforeProjected member
  let projectedOccurrence : OccurrenceId :=
    { processInstanceId := patch.owner.processInstanceId,
      elementId := ⟨patch.write.elementId.value⟩,
      activation := patch.write.occurrence.activation }
  have anchorEq : newStart.anchor = .wait projectedOccurrence := by
    simpa [projectedOccurrence] using waitStart_anchor_of_eq program state patch.owner
      patch.write.elementId patch.write.occurrence.activation newStart started
  rw [anchorEq] at member
  have ownerRaw := projectWaits_wait_anchor_mem program state beforeWaits projectedOccurrence
    beforeProjected member
  simp only [List.mem_append, List.mem_map, or_assoc] at ownerRaw
  obtain ⟨taskIds, messageIds, timerIds, effectIds, incidentIds⟩ :=
    flowNodeOccurrenceProgramValidity_wait_owner_ids program state occurrencesValid
  have storedRaw : projectedOccurrence ∈ openWaitAnchors state := by
    simp only [openWaitAnchors, List.mem_append, List.mem_map, or_assoc]
    rcases ownerRaw with raw | raw | raw | raw | raw
    · rcases raw with ⟨wait, waitMember, same⟩
      exact Or.inl ⟨wait, waitMember, by
        simpa [userTaskWaitOccurrence, taskIds wait waitMember] using same⟩
    · rcases raw with ⟨wait, waitMember, same⟩
      exact Or.inr (Or.inl ⟨wait, waitMember, by
        simpa [messageWaitOccurrence, messageIds wait waitMember] using same⟩)
    · rcases raw with ⟨wait, waitMember, same⟩
      exact Or.inr (Or.inr (Or.inl ⟨wait, waitMember, by
        simpa [timerWaitOccurrence, timerIds wait waitMember] using same⟩))
    · rcases raw with ⟨wait, waitMember, same⟩
      exact Or.inr (Or.inr (Or.inr (Or.inl ⟨wait, waitMember, by
        simpa [effectWaitOccurrence, effectIds wait waitMember] using same⟩)))
    · rcases raw with ⟨incident, incidentMember, same⟩
      exact Or.inr (Or.inr (Or.inr (Or.inr ⟨incident, incidentMember, by
        simpa [effectWaitOccurrence, incidentIds incident incidentMember] using same⟩)))
  obtain ⟨occurrenceEq, absent⟩ :=
    prepared_arm_anchor_shape program state operation patch prepared
  have notMember : patch.write.occurrence ∉ openWaitAnchors state := by
    simpa [openWaitAnchorAbsent, List.contains_eq_mem] using absent
  apply notMember
  rw [occurrenceEq]
  exact storedRaw

theorem prepared_arm_preserves_flowNodeOccurrenceProgramValidity (program : Program)
    (state : RuntimeState) (operation : SemanticOperation) (patch : InternalArmingPatch)
    (programAdmitted : programWellFormed program = true)
    (valid : flowNodeOccurrenceProgramValidity program state = true)
    (prepared : prepareInternalArm? program state operation = some patch) :
    flowNodeOccurrenceProgramValidity program (applyInternalArmingPatch state patch) = true := by
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    have parts := valid
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
    exact parts.1.1.1
  cases operation <;> simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared <;> try simp at prepared
  all_goals
    obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
      Option.bind_eq_some_iff.mp prepared
    cases controlEq : state.control <;> simp_all
  all_goals
    obtain ⟨unique, absent, available, patchEq⟩ := prepared
  case awaitUserTask.isFalse.running =>
    rename_i id origin input output task instanceId selection
    let wait : UserTaskWait :=
      { processInstanceId := owner.processInstanceId, owner, task,
        activation := activationCount state task.id + 1, output, metadata := task.metadata }
    have declarers : userTaskWaitDeclarers program task.id =
        [.awaitUserTask id origin input output task] := by
      simpa [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
        InternalArmingWrite.elementId, wait] using unique.1.1
    have operationMember : .awaitUserTask id origin input output task ∈ program.operations := by
      have member : .awaitUserTask id origin input output task ∈
          userTaskWaitDeclarers program task.id := by rw [declarers]; simp
      exact (List.mem_filter.mp member).1
    have declared := declaredByExactlyOneOwnedOperation_of_exactSelection program
      (.awaitUserTask id origin input output task) owner _ declarers selection.1
    have live : flowNodeOccurrenceOwnerLiveUnique state owner = true := by
      simpa [flowNodeOccurrenceOwnerLiveUnique, exactLiveOccurrence] using selection.2
    have processId := flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty
      program state owner structural selection.2
    have elementId := programWellFormed_internalArm_element_nonempty program
      (.awaitUserTask id origin input output task) programAdmitted operationMember
    have referenceValid := flowNodeOccurrenceProgramValidity_insertOrdinaryUserTask program state
      id origin input wait valid declarers declared live processId
        (by simpa [wait] using elementId) (by simp [wait]) rfl rfl
    apply flowNodeOccurrenceProgramValidity_from_reference program state
      { state with waits := insertUserTaskWait wait state.waits } _ valid referenceValid
    all_goals rfl
  case awaitMessage.isFalse.running =>
    rename_i id origin input output message instanceId selection
    let wait : MessageWait :=
      { processInstanceId := owner.processInstanceId, owner,
        elementId := message.elementId, activation := messageActivationCount state message.elementId + 1,
        channel := message.channel, output }
    have declarers : messageWaitDeclarers program message.elementId =
        [.awaitMessage id origin input output message] := by
      simpa [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
        InternalArmingWrite.elementId, wait] using unique.1.1
    have operationMember : .awaitMessage id origin input output message ∈ program.operations := by
      have member : .awaitMessage id origin input output message ∈
          messageWaitDeclarers program message.elementId := by rw [declarers]; simp
      exact (List.mem_filter.mp member).1
    have declared := declaredByExactlyOneOwnedOperation_of_exactSelection program
      (.awaitMessage id origin input output message) owner _ declarers selection.1
    have live : flowNodeOccurrenceOwnerLiveUnique state owner = true := by
      simpa [flowNodeOccurrenceOwnerLiveUnique, exactLiveOccurrence] using selection.2
    have processId := flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty
      program state owner structural selection.2
    have elementId := programWellFormed_internalArm_element_nonempty program
      (.awaitMessage id origin input output message) programAdmitted operationMember
    have referenceValid := flowNodeOccurrenceProgramValidity_insertOrdinaryMessage program state id
      origin input message wait valid declarers declared live processId
        (by simpa [wait] using elementId) (by simp [wait]) rfl rfl rfl
    apply flowNodeOccurrenceProgramValidity_from_reference program state
      { state with messageWaits := insertMessageWait wait state.messageWaits } _ valid referenceValid
    all_goals rfl
  case awaitTimer.isFalse.running =>
    rename_i id origin input output timer instanceId selection
    let wait : TimerWait :=
      { processInstanceId := owner.processInstanceId, owner,
        elementId := timer.elementId, activation := timerActivationCount state timer.elementId + 1,
        deadlineMs := state.logicalTimeMs + timer.durationMs, output }
    have declarers : timerWaitDeclarers program timer.elementId =
        [.awaitTimer id origin input output timer] := by
      simpa [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
        InternalArmingWrite.elementId, wait] using unique.1.1
    have operationMember : .awaitTimer id origin input output timer ∈ program.operations := by
      have member : .awaitTimer id origin input output timer ∈
          timerWaitDeclarers program timer.elementId := by rw [declarers]; simp
      exact (List.mem_filter.mp member).1
    have declared := declaredByExactlyOneOwnedOperation_of_exactSelection program
      (.awaitTimer id origin input output timer) owner _ declarers selection.1
    have live : flowNodeOccurrenceOwnerLiveUnique state owner = true := by
      simpa [flowNodeOccurrenceOwnerLiveUnique, exactLiveOccurrence] using selection.2
    have processId := flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty
      program state owner structural selection.2
    have elementId := programWellFormed_internalArm_element_nonempty program
      (.awaitTimer id origin input output timer) programAdmitted operationMember
    have referenceValid := flowNodeOccurrenceProgramValidity_insertOrdinaryTimer program state id
      origin input timer wait valid declarers declared live processId
        (by simpa [wait] using elementId) (by simp [wait]) rfl rfl
    apply flowNodeOccurrenceProgramValidity_from_reference program state
      { state with timerWaits := insertTimerWait wait state.timerWaits } _ valid referenceValid
    all_goals rfl
  case awaitEffect.isFalse.running =>
    rename_i id origin input output effect route instanceId selection
    let bindings := (evaluateInputMappings effect.inputMappings).getD []
    let wait : EffectWait :=
      { processInstanceId := owner.processInstanceId, owner, elementId := effect.elementId,
        activation := effectActivationCount state effect.elementId + 1,
        descriptor := effect.descriptor, arguments := bindings,
        outputMappings := effect.outputMappings, output, bpmnErrorRoute := route }
    have declarers : effectWaitDeclarers program effect.elementId =
        [.awaitEffect id origin input output effect route] := by
      simpa [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
        InternalArmingWrite.elementId, wait] using absent.1.1
    have operationMember : .awaitEffect id origin input output effect route ∈
        program.operations := by
      have member : .awaitEffect id origin input output effect route ∈
          effectWaitDeclarers program effect.elementId := by rw [declarers]; simp
      exact (List.mem_filter.mp member).1
    have declared := declaredByExactlyOneOwnedOperation_of_exactSelection program
      (.awaitEffect id origin input output effect route) owner _ declarers selection.1
    have live : flowNodeOccurrenceOwnerLiveUnique state owner = true := by
      simpa [flowNodeOccurrenceOwnerLiveUnique, exactLiveOccurrence] using selection.2
    have processId := flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty
      program state owner structural selection.2
    have elementId := programWellFormed_internalArm_element_nonempty program
      (.awaitEffect id origin input output effect route) programAdmitted operationMember
    have originElement := programWellFormed_awaitEffect_elements_align program programAdmitted
      id origin input output effect route operationMember
    have missing : effectWaitOccurrence wait ∉ openWaitAnchors state := by
      simpa [wait, InternalArmingWrite.occurrence, openWaitAnchorAbsent,
        List.contains_eq_mem] using absent.1.2
    have freshWaits : ∀ old ∈ state.effectWaits,
        effectWaitOccurrenceId wait ≠ effectWaitOccurrenceId old := by
      intro old member same
      apply missing
      simp only [openWaitAnchors, List.mem_append, List.mem_map, or_assoc]
      exact Or.inr (Or.inr (Or.inr (Or.inl ⟨old, member, by
        simpa [effectWaitOccurrence, effectWaitOccurrenceId] using same.symm⟩)))
    have freshIncidents : ∀ incident ∈ state.effectIncidents,
        effectWaitOccurrenceId wait ≠ effectWaitOccurrenceId incident.wait := by
      intro incident member same
      apply missing
      simp only [openWaitAnchors, List.mem_append, List.mem_map, or_assoc]
      exact Or.inr (Or.inr (Or.inr (Or.inr ⟨incident, member, by
        simpa [effectWaitOccurrence, effectWaitOccurrenceId] using same.symm⟩)))
    have freshActivities : ∀ activity ∈ state.variables.activities,
        activityScopeMatches (effectWaitOccurrenceId wait) activity = false := by
      have rejectedAll : state.variables.activities.all (fun activity =>
          !activityScopeMatches (effectWaitOccurrence wait) activity) = true := by
        simpa [wait, InternalArmingWrite.available, List.not_any_eq_all_not] using absent.2
      intro activity member
      have rejected := List.all_eq_true.mp rejectedAll activity member
      simpa [effectWaitOccurrenceId, effectWaitOccurrence] using rejected
    have arguments : evaluateInputMappings effect.inputMappings = some bindings := by
      cases evaluatedEq : evaluateInputMappings effect.inputMappings with
      | none => exact False.elim (unique evaluatedEq)
      | some values => simp [bindings, evaluatedEq]
    have referenceValid := flowNodeOccurrenceProgramValidity_insertOrdinaryEffect program state id
      origin input effect
        route wait bindings valid declarers declared live processId
        (by simpa [wait] using elementId) (by simp [wait]) rfl originElement rfl rfl
        arguments rfl rfl rfl
        (fun candidateId candidateOrigin candidateInput candidateOutput candidateEffect
          candidateRoute member => programWellFormed_awaitEffect_elements_align program
            programAdmitted candidateId candidateOrigin candidateInput candidateOutput candidateEffect
              candidateRoute member)
        freshWaits freshIncidents freshActivities
    apply flowNodeOccurrenceProgramValidity_from_reference program state
      { state with
        effectWaits := insertEffectWait wait state.effectWaits
        variables := addActivityVariableScope state.variables (effectWaitOccurrenceId wait) bindings }
      _ valid referenceValid
    all_goals rfl


end InternalCommutation

end BpmnSemantics.SemanticProcess
