import BpmnSemantics.SemanticProcess.InternalTransitionPublication
import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
import BpmnSemantics.SemanticProcess.InternalLocalControlPairPublication

/-! Predecessor-only mixed publication templates implement the numbering boundary in the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_arm_lifecycle_index_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch) (commandId : SemanticId)
    (firstIndex secondIndex : Nat)
    (found : prepareInternalArm? program before operation = some patch) :
    flowNodeOccurrenceDeltaForOperation? program before after operation commandId firstIndex =
      flowNodeOccurrenceDeltaForOperation? program before after operation commandId secondIndex := by
  have input := prepareInternalArm_input program before operation patch found
  have candidate : candidateFlowNodeOccurrenceDeltaForOperation? program before after operation
      commandId firstIndex = candidateFlowNodeOccurrenceDeltaForOperation? program before after
        operation commandId secondIndex := by
    cases operation <;> simp only [internalArmInput?] at input <;> (try contradiction) <;> rfl
  unfold flowNodeOccurrenceDeltaForOperation?
  rw [candidate]

theorem prepared_ordinary_publication_template_accepted (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch) (instanceId commandId : SemanticId)
    (transitionIndex : Nat) (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (found : prepareInternalArm? program state operation = some patch) :
    ∃ template,
      internalArmingPublicationTemplate? program state operation patch = some template ∧
      actualInternalTransitionPublication? program instanceId state (applyInternalArmingPatch state patch)
        operation commandId transitionIndex = some (template.instantiate commandId transitionIndex) := by
  obtain ⟨start, started, lifecycle⟩ := prepared_arm_lifecycle_singleton program state operation patch
    instanceId commandId programWF beforeWF projectable found
  have indexed : flowNodeOccurrenceDeltaForOperation? program state (applyInternalArmingPatch state patch)
      operation commandId transitionIndex = some (canonicalFlowNodeOccurrenceDelta [start] []) := by
    rw [prepared_arm_lifecycle_index_frame program state _ operation patch commandId transitionIndex 0 found]
    exact lifecycle
  have record := internalTransitionRecord_prepared program state operation patch programWF found
  rw [prepared_operation_eq program state operation patch found] at record
  have position := controlPositionDelta_prepared_internal_arm program instanceId state operation patch
    (runtimeStateWellFormed_position program instanceId state beforeWF) found
  refine ⟨internalArmingPublicationTemplate operation patch state.logicalTimeMs start, ?_, ?_⟩
  · simp [internalArmingPublicationTemplate?, started]
  · simp [actualInternalTransitionPublication?, record, indexed, position,
      internalArmingPublicationTemplate, InternalTransitionPublicationTemplate.instantiate,
      InternalTransitionLifecycleTemplate.instantiate]

theorem prepared_data_publication_template_accepted (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (found : prepareInternalDataArmingContract? program state contract = some patch) :
    ∃ template,
      internalArmingPublicationTemplate? program state contract.operation patch.arm = some template ∧
      actualInternalTransitionPublication? program instanceId state (applyInternalDataArmingPatch state patch)
        contract.operation commandId transitionIndex = some (template.instantiate commandId transitionIndex) := by
  obtain ⟨start, started, lifecycle⟩ := prepared_data_arm_lifecycle_singleton program state contract patch
    instanceId commandId transitionIndex programWF beforeWF projectable found
  have record := internalTransitionRecord_prepared_data program state contract patch programWF found
  have position := controlPositionDelta_prepared_data_arm program instanceId state contract patch
    (runtimeStateWellFormed_position program instanceId state beforeWF) found
  refine ⟨internalArmingPublicationTemplate contract.operation patch.arm state.logicalTimeMs start, ?_, ?_⟩
  · simp [internalArmingPublicationTemplate?, started]
  · simp [actualInternalTransitionPublication?, record, lifecycle, position,
      internalArmingPublicationTemplate, InternalTransitionPublicationTemplate.instantiate,
      InternalTransitionLifecycleTemplate.instantiate]

/-- Every actual publication component is accepted at any later assigned index and equals the
predecessor template; acceptance and position correspondence are derived, never premises. -/
theorem prepared_transition_publication_template_accepted (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (found : prepared.Prepared program state) :
    ∃ template,
      preparedTransitionPublicationTemplate? program state prepared = some template ∧
      actualInternalTransitionPublication? program instanceId state (prepared.apply state)
        prepared.operation commandId transitionIndex = some (template.instantiate commandId transitionIndex) := by
  cases prepared with
  | arming arm =>
      cases arm with
      | ordinary operation patch =>
          exact prepared_ordinary_publication_template_accepted program state operation patch instanceId
            commandId transitionIndex programWF beforeWF projectable found
      | data contract patch =>
          exact prepared_data_publication_template_accepted program state contract patch instanceId
            commandId transitionIndex programWF beforeWF projectable found
  | localControl localPrepared =>
      have record := prepareInternalLocalControl_record program state localPrepared.operation localPrepared found
      have lifecycle := prepareInternalLocalControl_accepted_lifecycle program state localPrepared.operation
        localPrepared instanceId commandId transitionIndex beforeWF running projectable found
      have position := internalLocalControlPositionDelta?_corresponds program state localPrepared.operation
        localPrepared instanceId programWF beforeWF running found
      have time := (prepareInternalLocalControl_template_facts program state localPrepared.operation
        localPrepared found).2
      refine ⟨internalLocalControlPublicationTemplate localPrepared, rfl, ?_⟩
      change actualInternalTransitionPublication? program instanceId state (localPrepared.selection.apply state)
        localPrepared.operation commandId transitionIndex = _
      simp only [actualInternalTransitionPublication?, record, lifecycle, position,
        time]
      rfl

theorem prepared_transition_template_operation_id (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (template : InternalTransitionPublicationTemplate)
    (found : preparedTransitionPublicationTemplate? program state prepared = some template) :
    template.record.operationId = prepared.operation.id := by
  cases prepared with
  | arming arm =>
      cases arm with
      | ordinary operation patch | data operation patch =>
          obtain ⟨start, _, found⟩ := Option.map_eq_some_iff.mp found
          cases found
          rfl
  | localControl localPrepared => cases found; rfl

theorem prepared_transition_template_frame (program : Program) (before after : RuntimeState)
    (prepared : PreparedInternalTransition)
    (time : after.logicalTimeMs = before.logicalTimeMs)
    (starts : ∀ owner element activation, waitStart? program after owner element activation =
      waitStart? program before owner element activation) :
    preparedTransitionPublicationTemplate? program after prepared =
      preparedTransitionPublicationTemplate? program before prepared := by
  cases prepared with
  | arming arm =>
      cases arm <;> simp only [preparedTransitionPublicationTemplate?, internalArmingPublicationTemplate?,
        starts, time]
  | localControl _ => rfl

theorem prepared_transition_time_frame (state : RuntimeState) (prepared : PreparedInternalTransition) :
    (prepared.apply state).logicalTimeMs = state.logicalTimeMs := by
  cases prepared with
  | arming arm => exact prepared_arming_time_frame state arm
  | localControl _ => rfl

theorem prepared_transition_start_frame (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (owner : ScopeOccurrenceId) (element : NodeId)
    (activation : Nat) :
    waitStart? program (prepared.apply state) owner element activation =
      waitStart? program state owner element activation := by
  cases prepared with
  | arming arm => exact prepared_arming_start_frame program state arm owner element activation
  | localControl _ => rfl

theorem prepared_transition_template_after_step (program : Program) (state : RuntimeState)
    (step query : PreparedInternalTransition) :
    preparedTransitionPublicationTemplate? program (step.apply state) query =
      preparedTransitionPublicationTemplate? program state query :=
  prepared_transition_template_frame program state (step.apply state) query
    (prepared_transition_time_frame state step) (prepared_transition_start_frame program state step)

end BpmnSemantics.SemanticProcess.InternalCommutation
