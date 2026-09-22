import BpmnSemantics.SemanticProcess.InternalTimerTaskProjection
import BpmnSemantics.SemanticProcess.TransitionRecord

/-! Timer-task publication is checked through the evaluator's lifecycle acceptance boundary.
The attached Timer remains private; the public delta starts only the prepared User Task.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_timer_task_candidate_singleton
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch) (commandId : SemanticId) (transitionIndex : Nat)
    (newStart : OpenSemanticFlowNodeOccurrence)
    (programValid : programWellFormed program = true)
    (occurrencesValid : flowNodeOccurrenceProgramValidity program state = true)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (started : waitStart? program state patch.arm.owner patch.arm.write.elementId
      patch.arm.write.occurrence.activation = some newStart) :
    candidateFlowNodeOccurrenceDeltaForOperation? program state
      (applyInternalTimerTaskPatch state patch) contract.operation commandId transitionIndex =
      some (canonicalFlowNodeOccurrenceDelta [newStart] []) := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, owned, runningInstance, selected, live,
    _, _, _, _, absent, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let patch := makeInternalTimerTaskPatch program state contract owner instanceId processId inputOrigin
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner
      task := { id := contract.task.id, name := contract.task.name }
      activation := activationCount state contract.task.id + 1
      output := contract.task.output }
  have fresh : ∀ old ∈ state.waits, userTaskWaitKeyMatches wait old = false := by
    intro old member
    exact (armingPatch_key_fresh_of_anchor_absent state patch.arm absent old member).1
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    have parts := occurrencesValid
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
    exact parts.1.1.1
  have running : state.control = .running instanceId := by
    cases control : state.control <;> simp_all [runningInstance?]
  have ownerIds := flowNodeOccurrenceProgramValidity_wait_owner_ids program state occurrencesValid
  have startEq : waitStart? program state owner ⟨contract.task.id.value⟩
      (activationCount state contract.task.id + 1) = some newStart := started
  unfold waitStart? at startEq
  obtain ⟨runtimeProcess, runtimeProcessEq, newStartEq⟩ := Option.bind_eq_some_iff.mp startEq
  have newStartExact := Option.some.inj newStartEq
  subst newStart
  have processAligned := candidateProcessIdForDefinitionScope_eq_processIdForOwner
    program state owner runtimeProcess instanceId programValid running structural live runtimeProcessEq
  obtain ⟨binding, operationSelection, scopeSelection, scopeMatches⟩ :=
    exactProgramSelection_parts program contract.operation owner programValid selected
  have filtered : (insertUserTaskWait wait state.waits).filter (fun old =>
      decide (old.owner = owner) && decide (old.task.id = contract.task.id) &&
        decide (old.activation = activationForTask state contract.task.id + 1)) = [wait] := by
    simpa [wait, activationForTask_eq_activationCount] using
      filter_insertUserTaskWait_eq_singleton wait state.waits rfl ownerIds.1 fresh
  cases kind : contract.kind
  all_goals
    simp only [InternalTimerTaskContract.operation, kind, candidateFlowNodeOccurrenceDeltaForOperation?,
      flowNodeSelectedOperationOwner?, owned, Option.bind_eq_bind, Option.bind_some,
      applyInternalTimerTaskPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch,
      Bool.decide_coe]
    dsimp [wait] at filtered
    rw [filtered]
    have candidate := candidateWaitStart_of_exact_selection program contract.operation owner
      owner.processInstanceId ⟨contract.task.id.value⟩ (activationCount state contract.task.id + 1)
      runtimeProcess binding operationSelection scopeSelection scopeMatches processAligned rfl (by omega)
    simp only [InternalTimerTaskContract.operation, kind] at candidate
    simp [candidateUserTaskStart?, candidate]
    rfl

theorem prepared_timer_task_lifecycle_singleton
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch) (expectedInstanceId commandId : SemanticId)
    (transitionIndex : Nat)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program expectedInstanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    ∃ newStart,
      waitStart? program state patch.arm.owner patch.arm.write.elementId
        patch.arm.write.occurrence.activation = some newStart ∧
      flowNodeOccurrenceDeltaForOperation? program state (applyInternalTimerTaskPatch state patch)
        contract.operation commandId transitionIndex =
        some (canonicalFlowNodeOccurrenceDelta [newStart] []) := by
  obtain ⟨current, newStart, next, beforeEq, started, afterEq, nextEq, _⟩ :=
    prepared_timer_task_preserves_runtime_and_open_projection_exact program state contract patch
      expectedInstanceId programValid stateValid openBefore prepared
  obtain ⟨_, _, instanceId, _, _, _, runningInstance, _⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  have running : state.control = .running instanceId := by
    cases control : state.control <;> simp_all [runningInstance?]
  have validities := projectOpenFlowNodeOccurrences_validities program state current
    instanceId running beforeEq
  have candidate := prepared_timer_task_candidate_singleton program state contract patch commandId
    transitionIndex newStart programValid validities.1 prepared started
  refine ⟨newStart, started, single_start_candidate_accepted program state _ contract.operation
    commandId transitionIndex current newStart next beforeEq afterEq nextEq candidate ?_⟩
  rw [waitStart_anchor_of_eq program state _ _ _ _ started]
  rfl

theorem internalTransitionRecord_prepared_timer_task
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (programValid : programWellFormed program = true)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    internalTransitionRecord? program state contract.operation = some
      { operationId := contract.operation.id
        operationKind := contract.operation.kind
        origin := contract.operation.origin
        owner := patch.arm.owner } := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, owned, _, _, _, _, _, unique, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  have declarers : userTaskWaitDeclarers program contract.task.id = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using unique
  have member : contract.operation ∈ program.operations :=
    (List.mem_filter.mp (show contract.operation ∈ userTaskWaitDeclarers program contract.task.id from
      by rw [declarers]; simp)).1
  have idsNodup := strictlySortedStrings_nodup _
    (programWellFormed_operationIdsSorted program programValid)
  have selectedById : program.operations.filter
      (fun candidate => decide (candidate.id = contract.operation.id)) = [contract.operation] :=
    filter_eq_singleton_of_key_nodup program.operations (fun candidate => candidate.id.value)
      (fun candidate => decide (candidate.id = contract.operation.id)) contract.operation idsNodup
      member (by simp) (by
        intro candidate _ accepted
        exact congrArg OperationId.value (of_decide_eq_true accepted))
  apply internalTransitionRecord_of_selection program state contract.operation owner selectedById
  cases kind : contract.kind <;>
    simpa [selectedOperationOwner?, flowNodeSelectedOperationOwner?,
      InternalTimerTaskContract.operation, kind] using owned

end BpmnSemantics.SemanticProcess.InternalCommutation
