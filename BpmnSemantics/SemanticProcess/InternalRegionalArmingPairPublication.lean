import BpmnSemantics.SemanticProcess.InternalRegionalArmingCommutation
import BpmnSemantics.SemanticProcess.InternalRegionalArmingAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationAcceptance

/-! Complete regional/arming publication composes the actual four steps. Each operation keeps
its assigned index in either order; successor validity and accepted deltas are derived from
the original preparations rather than supplied as intermediate assumptions. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem preparedArming_publication_at_index (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (found : arm.Prepared program state) :
    ∃ template,
      internalArmingPublicationTemplate? program state arm.operation arm.scopeFramePatch = some template ∧
      actualInternalTransitionPublication? program instanceId state (arm.apply state) arm.operation
        commandId transitionIndex = some (template.instantiate commandId transitionIndex) := by
  cases arm with
  | ordinary operation patch =>
      exact prepared_ordinary_publication_template_accepted program state operation patch instanceId commandId transitionIndex
        programWF stateWF projectable found
  | data contract patch =>
      exact prepared_data_publication_template_accepted program state contract patch instanceId commandId transitionIndex
        programWF stateWF projectable found

/-- Both orders execute, retain preparation, preserve validity, and accept the same publication
for each operation at its assigned index, including nonzero and unequal indices. -/
theorem prepared_regional_arming_pair_execution_publication (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional) (arm : PreparedInternalArming)
    (commandId : SemanticId) (regionalIndex armingIndex : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program arm.scopeFramePatch.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (armFound : arm.Prepared program before)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    prepareInternalRegional? program (arm.apply before) operation = some regional ∧
      ∃ afterRegional template,
        applyPreparedInternalRegional? program before regional = some afterRegional ∧
        arm.Prepared program afterRegional ∧
        applyPreparedInternalRegional? program (arm.apply before) regional = some (arm.apply afterRegional) ∧
        fire? program arm.operation before = some (arm.apply before) ∧
        fire? program arm.operation afterRegional = some (arm.apply afterRegional) ∧
        runtimeStateWellFormed program arm.scopeFramePatch.runtimeInstanceId (arm.apply before) = true ∧
        RegionalExecutionPublication program before afterRegional operation regional
          arm.scopeFramePatch.runtimeInstanceId commandId regionalIndex ∧
        RegionalExecutionPublication program (arm.apply before) (arm.apply afterRegional) operation regional
          arm.scopeFramePatch.runtimeInstanceId commandId regionalIndex ∧
        internalArmingPublicationTemplate? program before arm.operation arm.scopeFramePatch = some template ∧
        internalArmingPublicationTemplate? program afterRegional arm.operation arm.scopeFramePatch = some template ∧
        actualInternalTransitionPublication? program arm.scopeFramePatch.runtimeInstanceId before (arm.apply before)
          arm.operation commandId armingIndex = some (template.instantiate commandId armingIndex) ∧
        actualInternalTransitionPublication? program arm.scopeFramePatch.runtimeInstanceId afterRegional (arm.apply afterRegional)
          arm.operation commandId armingIndex = some (template.instantiate commandId armingIndex) := by
  obtain ⟨regionalFrame, afterRegional, applied, armFrame, commute⟩ :=
    prepared_regional_arming_pair_commutes program before operation regional arm programWF beforeWF
      regionalFound armFound independent
  obtain ⟨publishedAfter, publishedApplied, regionalFirst⟩ := prepareInternalRegional_execution_publication program before
    operation regional arm.scopeFramePatch.runtimeInstanceId commandId regionalIndex programWF beforeWF regionalFound
  have same : publishedAfter = afterRegional := Option.some.inj (publishedApplied.symm.trans applied)
  subst publishedAfter
  obtain ⟨_, _, openedBefore, openedAfter, _⟩ :=
    accepted_operation_delta_equals_independent_open_projection program before afterRegional operation
      commandId regionalIndex _ regionalFirst.lifecycle
  have armWF := (prepared_arming_preserves program before arm arm.scopeFramePatch.runtimeInstanceId programWF beforeWF
    (by simp [openedBefore]) armFound).1
  obtain ⟨final, finalApplied, regionalSecond⟩ := prepareInternalRegional_execution_publication program (arm.apply before)
    operation regional arm.scopeFramePatch.runtimeInstanceId commandId regionalIndex programWF armWF regionalFrame
  have finalEq : final = arm.apply afterRegional := Option.some.inj (finalApplied.symm.trans commute)
  rw [finalEq] at regionalSecond
  have snapshots := (prepareInternalRegional_facts program before operation regional regionalFound).1
  have firstExecution := (prepared_arming_applies program before arm snapshots armFound).1
  have secondExecution := (prepared_arming_applies program afterRegional arm snapshots armFrame).1
  obtain ⟨template, templateFound, armFirst⟩ := preparedArming_publication_at_index program before arm
    arm.scopeFramePatch.runtimeInstanceId commandId armingIndex programWF beforeWF (by simp [openedBefore]) armFound
  obtain ⟨afterTemplate, afterTemplateFound, armSecond⟩ := preparedArming_publication_at_index program afterRegional arm
    arm.scopeFramePatch.runtimeInstanceId commandId armingIndex programWF regionalFirst.wellFormed
    (by simp [openedAfter]) armFrame
  have startFrame := preparedArming_regional_start_frame program before afterRegional operation regional arm
    arm.scopeFramePatch.write.elementId arm.scopeFramePatch.write.occurrence.activation
    beforeWF regionalFound armFound independent applied
  have timeFrame := (arming_regional_control_frame program before afterRegional operation regional arm beforeWF
    (preparedArming_owner_facts program before arm armFound).2.2 regionalFound applied independent).2.1
  have templateFrame : internalArmingPublicationTemplate? program afterRegional arm.operation arm.scopeFramePatch =
      internalArmingPublicationTemplate? program before arm.operation arm.scopeFramePatch := by
    simp only [internalArmingPublicationTemplate?, startFrame, timeFrame]
  rw [templateFrame, templateFound] at afterTemplateFound
  cases afterTemplateFound
  exact ⟨regionalFrame, afterRegional, template, applied, armFrame, commute, firstExecution, secondExecution,
    armWF, regionalFirst, regionalSecond, templateFound, templateFrame.trans templateFound, armFirst, armSecond⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
