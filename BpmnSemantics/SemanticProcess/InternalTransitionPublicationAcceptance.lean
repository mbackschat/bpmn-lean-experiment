import BpmnSemantics.SemanticProcess.InternalTransitionPublicationCore
import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
import BpmnSemantics.SemanticProcess.InternalLocalControlPairPublication
import BpmnSemantics.SemanticProcess.InternalScopeCreationAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalScopeCreationPositionPublication


/-! Individual family acceptance is shared by pair and finite-batch consumers, without depending on their unified preparation type. -/

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

private theorem scope_creation_selected_owner (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected) :
    selectedOperationOwner? state operation = some selected.owner := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      dsimp only at found
      repeat first | contradiction | split at found
      all_goals cases found
      all_goals exact owned

theorem prepared_scope_creation_publication_template_accepted (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalScopeCreation) (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (found : prepareInternalScopeCreation? program state prepared.selection.operation = some prepared) :
    actualInternalTransitionPublication? program instanceId state (prepared.selection.apply state)
      prepared.selection.operation commandId transitionIndex =
        some ((internalScopeCreationPublicationTemplate prepared).instantiate commandId transitionIndex) := by
  obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp projectable
  have lifecycle := prepareInternalScopeCreation_accepted_lifecycle program state
    prepared.selection.operation prepared instanceId commandId transitionIndex current
    programWF beforeWF projected found
  have position := internalScopeCreationPositionDelta_corresponds program instanceId state
    prepared.selection.operation prepared programWF beforeWF found
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta, selection, _, _,
    exactOperation, _, _, _, _, _, _, preparedEq⟩ :=
      prepareInternalScopeCreation_facts program state prepared.selection.operation prepared found
  have record := internalTransitionRecord_of_selection program state prepared.selection.operation
    selected.owner exactOperation (scope_creation_selected_owner state _ selected selection)
  have ownerEq : selected.owner = prepared.selection.owner := by
    rw [preparedEq]; rfl
  have time : prepared.publicationTemplate.logicalTimeMs = state.logicalTimeMs := by
    rw [preparedEq]; rfl
  rw [ownerEq] at record
  simp [actualInternalTransitionPublication?, record, lifecycle, position,
    internalScopeCreationPublicationTemplate, InternalTransitionPublicationTemplate.instantiate,
    InternalTransitionLifecycleTemplate.instantiate, time]

end BpmnSemantics.SemanticProcess.InternalCommutation
