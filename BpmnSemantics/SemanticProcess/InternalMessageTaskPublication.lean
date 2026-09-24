import BpmnSemantics.SemanticProcess.InternalMessageTaskOpenProjection

/-! Message-host candidates must select the exact two newly inserted waits before the lifecycle fold.
ESL-OWN-01 freshness and predecessor owner identity settle the selectors independently of projection. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_message_task_candidate_pair
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch) (commandId : SemanticId) (transitionIndex : Nat)
    (taskStart messageStart : OpenSemanticFlowNodeOccurrence)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (programValid : programWellFormed program = true)
    (occurrencesValid : flowNodeOccurrenceProgramValidity program state = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (taskStarted : waitStart? program state patch.arm.owner patch.arm.write.elementId
      patch.arm.write.occurrence.activation = some taskStart)
    (messageStarted : waitStart? program state patch.message.owner patch.message.elementId
      patch.message.activation = some messageStart) :
    candidateFlowNodeOccurrenceDeltaForOperation? program state (applyInternalMessageTaskPatch state patch)
      contract.operation commandId transitionIndex = some (canonicalFlowNodeOccurrenceDelta [taskStart, messageStart] []) := by
  have aligned := prepared_message_task_owner_instance program state contract patch admitted occurrencesValid prepared
  have messageFresh := prepared_message_task_message_keys_fresh program state contract patch prepared
  obtain ⟨_, owner, instanceId, inputOrigin, processId, owned, runningInstance, selected, live,
    _, _, _, _, absent, _, _, _, patchEq⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  have aligned' : instanceId = owner.processInstanceId := by simpa [patchEq, makeInternalMessageTaskPatch] using aligned
  let inserted := makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin
  let task : UserTaskWait :=
    { processInstanceId := instanceId, owner, task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1, output := contract.task.output }
  have taskFresh : ∀ old ∈ state.waits, userTaskWaitKeyMatches task old = false := by
    intro old member
    have fresh := armingPatch_key_fresh_of_anchor_absent state patch.arm absent
    simp only [patchEq, makeInternalMessageTaskPatch] at fresh
    exact (fresh old member).1
  have ownerIds := flowNodeOccurrenceProgramValidity_wait_owner_ids program state occurrencesValid
  have taskFiltered : (insertUserTaskWait task state.waits).filter (fun old => decide
      (old.owner = owner && old.task.id = contract.task.id && old.task.name = contract.task.name &&
        old.output = contract.task.output && old.activation = activationForTask state contract.task.id + 1)) = [task] := by
    rw [insertUserTaskWait_eq_canonicalInsertBy]
    apply filter_canonicalInsertBy_eq_singleton
    · simp [task, activationForTask_eq_activationCount]
    · intro old member
      apply Bool.eq_false_iff.mpr
      intro accepted
      simp only [Bool.and_eq_true, decide_eq_true_eq] at accepted
      have processEq : old.processInstanceId = instanceId :=
        (ownerIds.1 old member).trans ((congrArg ScopeOccurrenceId.processInstanceId accepted.1.1.1.1).trans aligned'.symm)
      have keyed : userTaskWaitKeyMatches task old = true := by
        simp [userTaskWaitKeyMatches, task, processEq, accepted.1.1.1.2,
          accepted.2, activationForTask_eq_activationCount]
      rw [taskFresh old member] at keyed
      contradiction
  have messageFiltered : (insertMessageWait inserted.message state.messageWaits).filter (fun old => decide
      (old.owner = owner && old.elementId = contract.message.elementId && old.channel = contract.message.channel &&
        old.output = contract.message.output && old.activation = messageActivationCount state contract.message.elementId + 1)) =
      [inserted.message] := by
    apply filter_canonicalInsertBy_eq_singleton
    · simp [inserted, makeInternalMessageTaskPatch]
    · intro old member
      apply Bool.eq_false_iff.mpr
      intro accepted
      simp only [Bool.and_eq_true, decide_eq_true_eq] at accepted
      have processEq : old.processInstanceId = instanceId :=
        (ownerIds.2.1 old member).trans ((congrArg ScopeOccurrenceId.processInstanceId accepted.1.1.1.1).trans aligned'.symm)
      have keyed : messageWaitKeyMatches patch.message old = true := by
        simp [messageWaitKeyMatches, patchEq, makeInternalMessageTaskPatch, processEq, accepted.1.1.1.2, accepted.2]
      rw [(messageFresh old member).1] at keyed
      contradiction
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at occurrencesValid
    exact occurrencesValid.1.1.1
  have running : state.control = .running instanceId := by
    cases control : state.control <;> simp_all [runningInstance?]
  have taskStarted' : waitStart? program state owner ⟨contract.task.id.value⟩
      (activationCount state contract.task.id + 1) = some taskStart := by simpa [patchEq, makeInternalMessageTaskPatch, InternalArmingWrite.elementId, InternalArmingWrite.occurrence, userTaskWaitOccurrence] using taskStarted
  have messageStarted' : waitStart? program state owner contract.message.elementId
      (messageActivationCount state contract.message.elementId + 1) = some messageStart := by
    simpa [patchEq, makeInternalMessageTaskPatch] using messageStarted
  unfold waitStart? at taskStarted'
  obtain ⟨runtimeProcess, processEq, taskEq⟩ := Option.bind_eq_some_iff.mp taskStarted'
  have messageEq := messageStarted'
  simp [waitStart?, processEq] at messageEq
  cases taskEq
  subst messageStart
  have processAligned := candidateProcessIdForDefinitionScope_eq_processIdForOwner
    program state owner runtimeProcess instanceId programValid running structural live processEq
  obtain ⟨binding, operationSelection, scopeSelection, scopeMatches⟩ :=
    exactProgramSelection_parts program contract.operation owner programValid selected
  have identity (element : NodeId) := candidateOperationFlowNodeIdentity_of_exact_selection program contract.operation
    owner element runtimeProcess binding operationSelection scopeSelection scopeMatches processAligned
  cases kind : contract.kind
  all_goals
    simp only [InternalMessageTaskContract.operation, kind] at identity
    simp only [InternalMessageTaskContract.operation, kind, candidateFlowNodeOccurrenceDeltaForOperation?,
      flowNodeSelectedOperationOwner?, owned, Option.bind_eq_bind, Option.bind_some,
      patchEq, applyInternalMessageTaskPatch, makeInternalMessageTaskPatch, applyInternalArmingPatch]
    dsimp only [task] at taskFiltered
    dsimp only [inserted, makeInternalMessageTaskPatch] at messageFiltered
    rw [taskFiltered]
    have countEq : activationForNode (state.messageActivations.map fun value => (value.elementId, value.count))
        contract.message.elementId = messageActivationCount state contract.message.elementId := rfl
    rw [countEq, messageFiltered]
    simp only [Option.bind_some, identity]
    simp only [aligned']
    rfl

end BpmnSemantics.SemanticProcess.InternalCommutation
