import BpmnSemantics.SemanticProcess.InternalMessageTaskPublication
import BpmnSemantics.SemanticProcess.InternalTransitionPublication
import BpmnSemantics.SemanticProcess.ControlPositionDeltaProofs

/-! The selected subscription account publishes one atomic Task/Message delta.
Acceptance checks the actual candidate, independent open projection, transition record, and token position. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem message_pair_candidate_accepted (program : Program) (state after : RuntimeState)
    (operation : SemanticOperation) (commandId : SemanticId) (transitionIndex : Nat)
    (current : List OpenSemanticFlowNodeOccurrence) (task message : OpenSemanticFlowNodeOccurrence)
    (beforeEq : projectOpenFlowNodeOccurrences? program state = some current)
    (afterEq : projectOpenFlowNodeOccurrences? program after =
      some (sortFlowNodeOccurrenceStarts (task :: message :: current)))
    (candidate : candidateFlowNodeOccurrenceDeltaForOperation? program state after operation
      commandId transitionIndex = some (canonicalFlowNodeOccurrenceDelta [task, message] []))
    (taskNonTransition : transitionAnchor task.anchor = false)
    (messageNonTransition : transitionAnchor message.anchor = false) :
    flowNodeOccurrenceDeltaForOperation? program state after operation commandId transitionIndex =
      some (canonicalFlowNodeOccurrenceDelta [task, message] []) := by
  let next := sortFlowNodeOccurrenceStarts (task :: message :: current)
  let starts := sortFlowNodeOccurrenceStarts [task, message]
  have nextNodup := projectOpenFlowNodeOccurrences_anchor_nodup program after next afterEq
  have consNodup : ((task :: message :: current).map (·.anchor)).Nodup :=
    ((sortFlowNodeOccurrenceStarts_perm _).map (·.anchor)).nodup_iff.mp nextNodup
  have appendPerm : (current ++ starts).Perm (task :: message :: current) :=
    ((List.Perm.refl current).append (sortFlowNodeOccurrenceStarts_perm [task, message])).trans
      (List.perm_append_comm ..)
  have appendNodup := (appendPerm.map (·.anchor)).nodup_iff.mpr consNodup
  have availableEq : sortFlowNodeOccurrenceStarts (current ++ starts) = next :=
    sortFlowNodeOccurrenceStarts_perm_eq appendPerm
  have nextNonTransition := projectOpenFlowNodeOccurrences_transitionAnchor_false program after next afterEq
  have noInstant : (starts.filter fun start => transitionAnchor start.anchor) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro start member
    have member' := (sortFlowNodeOccurrenceStarts_perm [task, message]).mem_iff.mp member
    simp only [List.mem_cons, List.not_mem_nil, or_false] at member'
    rcases member' with rfl | rfl <;> simp_all
  unfold flowNodeOccurrenceDeltaForOperation?
  simp only [Option.bind_eq_bind, candidate, Option.bind_some]
  unfold acceptFlowNodeOccurrenceCandidate?
  simp only [Option.bind_eq_bind, beforeEq, afterEq, Option.bind_some]
  change (do
    let result ← applyFlowNodeOccurrenceDelta? current { started := starts, ended := [] }
    if result = next then some ({ started := starts, ended := [] } : UnnumberedFlowNodeOccurrenceDelta) else none) = _
  have endsEq : sortFlowNodeOccurrenceEnds [] = [] := rfl
  simp only [List.map_append] at appendNodup
  simp [applyFlowNodeOccurrenceDelta?, availableAfterStarts, removeEndedFlowNodeOccurrences,
    appendNodup, noInstant, availableEq, nextNonTransition, canonicalFlowNodeOccurrenceDelta, starts, endsEq]

/-- Projectability supplies both starts; neither successful successor projection nor acceptance is assumed. -/
theorem prepared_message_task_lifecycle_pair
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch) (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    ∃ task message,
      waitStart? program state patch.arm.owner patch.arm.write.elementId patch.arm.write.occurrence.activation = some task ∧
      waitStart? program state patch.message.owner patch.message.elementId patch.message.activation = some message ∧
      flowNodeOccurrenceDeltaForOperation? program state (applyInternalMessageTaskPatch state patch)
        contract.operation commandId transitionIndex = some (canonicalFlowNodeOccurrenceDelta [task, message] []) := by
  obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp projectable
  obtain ⟨_, owner, runtimeInstance, inputOrigin, processId, _, runningInstance, _, live,
    _, _, _, _, _, _, _, _, patchEq⟩ := prepareInternalMessageTaskContract_facts program state contract patch prepared
  have running : state.control = .running runtimeInstance := by
    cases control : state.control <;> simp_all [runningInstance?]
  have validities := projectOpenFlowNodeOccurrences_validities program state current runtimeInstance running projected
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    have parts := validities.1
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
    exact parts.1.1.1
  have processSome := processIdForOwner_isSome_of_open_projection program state owner current runtimeInstance
    running structural validities.2.1 live projected
  obtain ⟨runtimeProcess, processEq⟩ := Option.isSome_iff_exists.mp processSome
  have taskSome : (waitStart? program state patch.arm.owner patch.arm.write.elementId
      patch.arm.write.occurrence.activation).isSome = true := by
    simp [waitStart?, patchEq, makeInternalMessageTaskPatch, processEq]
  have messageSome : (waitStart? program state patch.message.owner patch.message.elementId
      patch.message.activation).isSome = true := by
    simp [waitStart?, patchEq, makeInternalMessageTaskPatch, processEq]
  obtain ⟨task, taskStarted⟩ := Option.isSome_iff_exists.mp taskSome
  obtain ⟨message, messageStarted⟩ := Option.isSome_iff_exists.mp messageSome
  have afterEq := prepared_message_task_open_projection_exact program state contract patch instanceId admitted
    programValid stateValid prepared current projected task message taskStarted messageStarted
  have candidate := prepared_message_task_candidate_pair program state contract patch commandId transitionIndex
    task message admitted programValid validities.1 prepared taskStarted messageStarted
  refine ⟨task, message, taskStarted, messageStarted,
    message_pair_candidate_accepted program state _ contract.operation commandId transitionIndex
      current task message projected afterEq candidate ?_ ?_⟩
  · rw [waitStart_anchor_of_eq program state _ _ _ _ taskStarted]; rfl
  · rw [waitStart_anchor_of_eq program state _ _ _ _ messageStarted]; rfl

theorem internalTransitionRecord_prepared_message_task
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (programValid : programWellFormed program = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    internalTransitionRecord? program state contract.operation = some
      { operationId := contract.operation.id, operationKind := contract.operation.kind
        origin := contract.operation.origin, owner := patch.arm.owner } := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, owned, _, _, _, _, _, unique, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  have declarers : userTaskWaitDeclarers program contract.task.id = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using unique
  have member : contract.operation ∈ program.operations :=
    (List.mem_filter.mp (show contract.operation ∈ userTaskWaitDeclarers program contract.task.id from
      by rw [declarers]; simp)).1
  have idsNodup := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program programValid)
  have selectedById : program.operations.filter
      (fun candidate => decide (candidate.id = contract.operation.id)) = [contract.operation] :=
    filter_eq_singleton_of_key_nodup program.operations (fun candidate => candidate.id.value)
      (fun candidate => decide (candidate.id = contract.operation.id)) contract.operation idsNodup
      member (by simp) (by intro candidate _ accepted; exact congrArg OperationId.value (of_decide_eq_true accepted))
  apply internalTransitionRecord_of_selection program state contract.operation owner selectedById
  cases kind : contract.kind <;>
    simpa [selectedOperationOwner?, flowNodeSelectedOperationOwner?, InternalMessageTaskContract.operation, kind] using owned

theorem controlPositionDelta_prepared_message_task
    (program : Program) (instanceId : SemanticId) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (position : runtimePositionValid program instanceId state = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    controlPositionDelta? program instanceId state (applyInternalMessageTaskPatch state patch) =
      some
        { consumedTokens := [PublicControlTokenPosition.mk patch.arm.inputOrigin.elementId patch.arm.owner 1]
          producedTokens := [], enteredScopes := [], exitedScopes := [] } := by
  obtain ⟨_, owner, runtimeInstance, inputOrigin, processId, owned, _, _, _, originFound, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  exact controlPositionDelta_consumed_token program instanceId state _ _ position owned originFound rfl rfl rfl rfl

/-- The complete evaluator publication equals the predecessor template at every command/index assignment. -/
theorem prepared_message_task_publication_template_accepted
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch) (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    ∃ template,
      internalMessageTaskPublicationTemplate? program state contract patch = some template ∧
      actualInternalTransitionPublication? program instanceId state (applyInternalMessageTaskPatch state patch)
        contract.operation commandId transitionIndex = some (template.instantiate commandId transitionIndex) := by
  obtain ⟨task, message, taskStarted, messageStarted, lifecycle⟩ := prepared_message_task_lifecycle_pair
    program state contract patch instanceId commandId transitionIndex admitted programValid stateValid projectable prepared
  have record := internalTransitionRecord_prepared_message_task program state contract patch programValid prepared
  have positionValid : runtimePositionValid program instanceId state = true := by
    have parts := stateValid
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at parts
    simp_all only
  have position := controlPositionDelta_prepared_message_task program instanceId state contract patch positionValid prepared
  let template := { internalArmingPublicationTemplate contract.operation patch.arm state.logicalTimeMs task with
    lifecycle := .waits [task, message] }
  refine ⟨template, ?_, ?_⟩
  · simp [internalMessageTaskPublicationTemplate?, taskStarted, messageStarted, template]
  · simp [actualInternalTransitionPublication?, record, lifecycle, position, template,
      internalArmingPublicationTemplate, InternalTransitionPublicationTemplate.instantiate,
      InternalTransitionLifecycleTemplate.instantiate]

end BpmnSemantics.SemanticProcess.InternalCommutation
