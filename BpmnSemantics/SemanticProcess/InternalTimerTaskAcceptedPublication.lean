import BpmnSemantics.SemanticProcess.InternalTimerTaskPublication
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationCore
import BpmnSemantics.SemanticProcess.ControlPositionDeltaProofs

/-! The existing prepared-publication template covers Timer-task arming without a new wire shape.
Acceptance checks the actual transition record, task-only lifecycle, and consumed-token position.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem controlPositionDelta_prepared_timer_task
    (program : Program) (expectedInstanceId : SemanticId) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (position : runtimePositionValid program expectedInstanceId state = true)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    controlPositionDelta? program expectedInstanceId state (applyInternalTimerTaskPatch state patch) =
      some
        { consumedTokens :=
            [PublicControlTokenPosition.mk patch.arm.inputOrigin.elementId patch.arm.owner 1]
          producedTokens := [], enteredScopes := [], exitedScopes := [] } := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, owned, _, _, _, originFound, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  exact controlPositionDelta_consumed_token program expectedInstanceId state _ _ position
    owned originFound rfl rfl rfl rfl

theorem prepared_timer_task_publication_template_accepted
    (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    ∃ template,
      internalArmingPublicationTemplate? program state contract.operation patch.arm = some template ∧
      actualInternalTransitionPublication? program instanceId state (applyInternalTimerTaskPatch state patch)
        contract.operation commandId transitionIndex = some (template.instantiate commandId transitionIndex) := by
  obtain ⟨start, started, lifecycle⟩ := prepared_timer_task_lifecycle_singleton program state contract patch
    instanceId commandId transitionIndex programValid stateValid projectable prepared
  have record := internalTransitionRecord_prepared_timer_task program state contract patch programValid prepared
  have positionValid : runtimePositionValid program instanceId state = true := by
    have parts := stateValid
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at parts
    simp_all only
  have position := controlPositionDelta_prepared_timer_task program instanceId state contract patch
    positionValid prepared
  refine ⟨internalArmingPublicationTemplate contract.operation patch.arm state.logicalTimeMs start, ?_, ?_⟩
  · simp [internalArmingPublicationTemplate?, started]
  · simp [actualInternalTransitionPublication?, record, lifecycle, position,
      internalArmingPublicationTemplate, InternalTransitionPublicationTemplate.instantiate,
      InternalTransitionLifecycleTemplate.instantiate]

/-- Complete preparation fixes the template's remaining runtime lookups. This lets every
mixed pair reuse preparation preservation instead of reproving Process lookup preservation. -/
theorem prepared_timer_task_publication_template_determined
    (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (template : InternalTransitionPublicationTemplate)
    (programValid : programWellFormed program = true)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (found : internalArmingPublicationTemplate? program state contract.operation patch.arm = some template) :
    template = internalArmingPublicationTemplate contract.operation patch.arm patch.arm.logicalTimeMs
      { anchor := .wait patch.arm.write.occurrence, processId := patch.arm.processId,
        elementId := patch.arm.write.elementId, owner := patch.arm.owner } := by
  obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp projectable
  obtain ⟨start, started, templateEq⟩ := Option.map_eq_some_iff.mp found
  subst template
  obtain ⟨_, owner, instanceId, origin, processId, _, runningInstance, _, live, _, processFound,
    _, _, _, _, _, rfl⟩ := prepareInternalTimerTaskContract_facts program state contract patch prepared
  have running : state.control = .running instanceId := by
    cases control : state.control <;> simp_all [runningInstance?]
  have validities := projectOpenFlowNodeOccurrences_validities program state current instanceId running projected
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    have occurrences := validities.1
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at occurrences
    exact occurrences.1.1.1
  unfold waitStart? at started
  obtain ⟨runtimeProcess, processRuntime, startEq⟩ := Option.bind_eq_some_iff.mp started
  have aligned := candidateProcessIdForDefinitionScope_eq_processIdForOwner program state owner
    runtimeProcess instanceId programValid running structural live processRuntime
  have processSame : processId = runtimeProcess := Option.some.inj (processFound.symm.trans aligned)
  subst runtimeProcess
  cases startEq
  rfl

theorem timerTaskPublicationTemplate_frame
    (program : Program) (state : RuntimeState) (patch : InternalTimerTaskPatch)
    (operation : SemanticOperation) (other : InternalArmingPatch) :
    internalArmingPublicationTemplate? program (applyInternalTimerTaskPatch state patch) operation other =
      internalArmingPublicationTemplate? program state operation other := by
  simp only [internalArmingPublicationTemplate?, timerTaskWaitStart_frame]
  cases write : patch.arm.write <;>
    simp only [applyInternalTimerTaskPatch, applyInternalArmingPatch, write]

theorem prepared_timer_task_preserves_runtime_and_open_set
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    runtimeStateWellFormed program instanceId (applyInternalTimerTaskPatch state patch) = true ∧
      (projectOpenFlowNodeOccurrences? program (applyInternalTimerTaskPatch state patch)).isSome = true := by
  obtain ⟨_, _, _, _, _, projected, _, valid⟩ :=
    prepared_timer_task_preserves_runtime_and_open_projection_exact program state contract patch
      instanceId programValid stateValid openBefore prepared
  exact ⟨valid, by rw [projected]; rfl⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
