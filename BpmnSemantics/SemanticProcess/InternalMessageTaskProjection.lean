import BpmnSemantics.SemanticProcess.InternalMessageTaskRuntimePreservation
import BpmnSemantics.SemanticProcess.InternalSubscriptionOwnerIdentity
import BpmnSemantics.SemanticProcess.InternalCommutationOpenProjection

/-! The subscription account publishes both Task and Message anchors at atomic arming.
Program validity uses admission-derived owner identity; existing Timer classification frames. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem messageTaskWaitStart_frame (program : Program) (state : RuntimeState)
    (patch : InternalMessageTaskPatch) (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat) :
    waitStart? program (applyInternalMessageTaskPatch state patch) owner element activation =
      waitStart? program state owner element activation :=
  armingWaitStart_frame program state patch.arm owner element activation

theorem prepared_message_task_owner_instance
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (valid : flowNodeOccurrenceProgramValidity program state = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    patch.arm.runtimeInstanceId = patch.arm.owner.processInstanceId := by
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at valid
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, running, _, live, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  have control : state.control = .running instanceId := by
    cases equation : state.control <;> simp_all [runningInstance?]
  exact (subscription_projectable_owner_instance program state owner instanceId admitted
    valid.1.1.1 control live).symm

theorem prepared_message_task_element_facts
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (programValid : programWellFormed program = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    (!contract.task.id.value.isEmpty) = true ∧ (!contract.message.elementId.value.isEmpty) = true ∧
      contract.task.id.value ≠ contract.message.elementId.value := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, unique, _⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  have declarers : userTaskWaitDeclarers program contract.task.id = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using unique
  have member : contract.operation ∈ program.operations :=
    (List.mem_filter.mp (show contract.operation ∈ userTaskWaitDeclarers program contract.task.id from
      by rw [declarers]; simp)).1
  have operationValid := List.all_eq_true.mp (programWellFormed_operations program programValid) contract.operation member
  cases kind : contract.kind <;>
    simp only [InternalMessageTaskContract.operation, kind] at operationValid
  all_goals
    change (_ && _ && !contract.task.id.value.isEmpty && !contract.message.elementId.value.isEmpty &&
      _ && _ && _ && decide (_ ∧ _ ∧ _ ∧ _) && _ && _ && _) = true at operationValid
    simp_all only [Bool.and_eq_true, decide_eq_true_eq]
    exact ⟨trivial, trivial, operationValid.1.1.1.2.1⟩

theorem prepared_message_task_preserves_occurrence_program_validity
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (programValid : programWellFormed program = true)
    (valid : flowNodeOccurrenceProgramValidity program state = true) :
    flowNodeOccurrenceProgramValidity program (applyInternalMessageTaskPatch state patch) = true := by
  have aligned := prepared_message_task_owner_instance program state contract patch admitted valid prepared
  have elements := prepared_message_task_element_facts program state contract patch programValid prepared
  have parts := valid
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, live, _, _, _, _, _, _, _, _, patchEq⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  have process := flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty program state owner parts.1.1.1 live
  have waits := prepared_message_task_preserves_wait_program_validity program state contract patch prepared
    parts.1.1.2 (by simpa [patchEq, makeInternalMessageTaskPatch] using process)
    aligned (by simpa using elements.1) (by simpa using elements.2.1)
  apply flowNodeOccurrenceProgramValidity_of_wait_frame program state _ valid waits
  all_goals cases patchEq; rfl

/-- Both public anchors are inserted atomically; the independently classified Timer list frames. -/
theorem prepared_message_task_projectWaits_insert
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (taskStart messageStart : OpenSemanticFlowNodeOccurrence)
    (taskStarted : waitStart? program state patch.arm.owner patch.arm.write.elementId
      patch.arm.write.occurrence.activation = some taskStart)
    (messageStarted : waitStart? program state patch.message.owner patch.message.elementId
      patch.message.activation = some messageStart) :
    ∀ beforeWaits, projectWaits? program state = some beforeWaits →
      ∃ afterWaits, projectWaits? program (applyInternalMessageTaskPatch state patch) = some afterWaits ∧
        afterWaits.Perm (taskStart :: messageStart :: beforeWaits) := by
  have timerMatches := prepared_message_task_preserves_existing_timer_match program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let selected := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  let wait : UserTaskWait :=
    { processInstanceId := instanceId, owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  let after := applyInternalMessageTaskPatch state selected
  intro beforeWaits beforeProjected
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
    effectsEq, incidentsEq, rfl⟩ := (projectWaits_eq_some_iff program state beforeWaits).mp beforeProjected
  obtain ⟨afterTasks, afterTasksEq, taskPerm⟩ := mapM_canonicalInsertBy_some userTaskWaitBefore
    (fun current => waitStart? program after current.owner ⟨current.task.id.value⟩ current.activation)
    wait taskStart state.waits tasks taskStarted tasksEq
  obtain ⟨afterMessages, afterMessagesEq, messagePerm⟩ := mapM_canonicalInsertBy_some messageWaitBefore
    (fun current => waitStart? program after current.owner current.elementId current.activation)
    selected.message messageStart state.messageWaits messages messageStarted messagesEq
  have timersFrame : (after.timerWaits.filter fun current =>
      !flowNodeOccurrenceBoundaryTimerBound program after current) =
      (state.timerWaits.filter fun current => !flowNodeOccurrenceBoundaryTimerBound program state current) := by
    apply List.filter_congr
    intro timer _
    unfold flowNodeOccurrenceBoundaryTimerBound
    congr 4
    apply List.filter_congr
    intro operation _
    exact timerMatches timer operation
  refine ⟨afterTasks ++ (afterMessages ++ (timers ++ (effects ++ incidents))), ?_, ?_⟩
  · apply (projectWaits_eq_some_iff _ _ _).mpr
    refine ⟨afterTasks, afterMessages, timers, effects, incidents, ?_, ?_, ?_, effectsEq, incidentsEq, rfl⟩
    · simpa [after, selected, applyInternalMessageTaskPatch, applyInternalArmingPatch,
        makeInternalMessageTaskPatch, wait, insertUserTaskWait_eq_canonicalInsertBy] using afterTasksEq
    · exact afterMessagesEq
    · change (after.timerWaits.filter fun current =>
        !flowNodeOccurrenceBoundaryTimerBound program after current).mapM
          (fun current => waitStart? program after current.owner current.elementId current.activation) = some timers
      rw [timersFrame]
      exact timersEq
  · have messagesMoved := messagePerm.append (List.Perm.refl (timers ++ (effects ++ incidents)))
    have combined := taskPerm.append messagesMoved
    exact combined.trans (List.Perm.cons taskStart List.perm_middle)

end BpmnSemantics.SemanticProcess.InternalCommutation
