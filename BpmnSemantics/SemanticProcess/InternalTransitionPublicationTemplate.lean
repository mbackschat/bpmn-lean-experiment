import BpmnSemantics.SemanticProcess.InternalTransitionPublication
import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
import BpmnSemantics.SemanticProcess.InternalLocalControlPairPublication
import BpmnSemantics.SemanticProcess.InternalScopeCreationAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalScopeCreationPositionPublication

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
  | scopeCreation scopePrepared =>
      exact ⟨internalScopeCreationPublicationTemplate scopePrepared, rfl,
        prepared_scope_creation_publication_template_accepted program state scopePrepared instanceId
          commandId transitionIndex programWF beforeWF projectable found⟩

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
  | scopeCreation scopePrepared => cases found; rfl

theorem prepared_transition_template_frame (program : Program) (before after : RuntimeState)
    (prepared : PreparedInternalTransition)
    (template : InternalTransitionPublicationTemplate)
    (time : after.logicalTimeMs = before.logicalTimeMs)
    (starts : ∀ owner element activation start,
      waitStart? program before owner element activation = some start →
      waitStart? program after owner element activation = some start)
    (found : preparedTransitionPublicationTemplate? program before prepared = some template) :
    preparedTransitionPublicationTemplate? program after prepared = some template := by
  cases prepared with
  | arming arm =>
      cases arm with
      | ordinary operation patch | data operation patch =>
          obtain ⟨start, started, templateEq⟩ := Option.map_eq_some_iff.mp found
          cases templateEq
          simp only [preparedTransitionPublicationTemplate?, internalArmingPublicationTemplate?,
            starts _ _ _ _ started, Option.map_some, time]
  | localControl _ => exact found
  | scopeCreation _ => exact found

theorem prepared_transition_time_frame (state : RuntimeState) (prepared : PreparedInternalTransition) :
    (prepared.apply state).logicalTimeMs = state.logicalTimeMs := by
  cases prepared with
  | arming arm => exact prepared_arming_time_frame state arm
  | localControl _ => rfl
  | scopeCreation scopePrepared => exact scopeCreation_apply_time state scopePrepared.selection

theorem prepared_transition_start_frame (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (owner : ScopeOccurrenceId) (element : NodeId)
    (activation : Nat) (start : OpenSemanticFlowNodeOccurrence)
    (found : prepared.Prepared program state)
    (prior : waitStart? program state owner element activation = some start) :
    waitStart? program (prepared.apply state) owner element activation = some start := by
  cases prepared with
  | arming arm =>
      change waitStart? program (arm.apply state) owner element activation = some start
      rw [prepared_arming_start_frame program state arm owner element activation]
      exact prior
  | localControl _ => exact prior
  | scopeCreation scopePrepared =>
      obtain ⟨selected, hosting, ownerRecord, origin, definition, scopeStart, delta, selection,
        _, _, _, _, _, _, _, _, _, preparedEq⟩ :=
          prepareInternalScopeCreation_facts program state scopePrepared.selection.operation scopePrepared found
      have preserved := scopeCreation_wait_start_preserved program state _ selected owner element
        activation start selection prior
      simpa only [preparedEq, PreparedInternalTransition.apply, makeInternalScopeCreationPreparation]
        using preserved

theorem prepared_transition_template_after_step (program : Program) (state : RuntimeState)
    (step query : PreparedInternalTransition) (instanceId : SemanticId)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (stepPrepared : step.Prepared program state) (queryPrepared : query.Prepared program state) :
    preparedTransitionPublicationTemplate? program (step.apply state) query =
      preparedTransitionPublicationTemplate? program state query := by
  obtain ⟨template, found, _⟩ := prepared_transition_publication_template_accepted program state query
    instanceId instanceId 0 programWF beforeWF running projectable queryPrepared
  rw [found]
  exact prepared_transition_template_frame program state (step.apply state) query template
    (prepared_transition_time_frame state step)
    (fun owner element activation start prior => prepared_transition_start_frame program state step
      owner element activation start stepPrepared prior) found

end BpmnSemantics.SemanticProcess.InternalCommutation
