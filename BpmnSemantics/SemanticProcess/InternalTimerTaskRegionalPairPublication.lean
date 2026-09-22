import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalCommutation
import BpmnSemantics.SemanticProcess.InternalTimerTaskAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlPairPublication

/-! Both regional/Timer-task orders accept the same per-operation publication at assigned indices.
The retained Timer-task preparation fixes its Process identity and task-only lifecycle template. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_regional_timer_task_pair_execution_publication (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (commandId : SemanticId) (regionalIndex taskIndex : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program patch.arm.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (taskFound : prepareInternalTimerTaskContract? program before contract = some patch)
    (independent : regionalStateFootprintsIndependent regional.footprint (timerTaskStateFootprint patch) = true) :
    prepareInternalRegional? program (applyInternalTimerTaskPatch before patch) operation = some regional ∧
      ∃ afterRegional template,
        applyPreparedInternalRegional? program before regional = some afterRegional ∧
        prepareInternalTimerTaskContract? program afterRegional contract = some patch ∧
        applyPreparedInternalRegional? program (applyInternalTimerTaskPatch before patch) regional =
          some (applyInternalTimerTaskPatch afterRegional patch) ∧
        fire? program contract.operation before = some (applyInternalTimerTaskPatch before patch) ∧
        fire? program contract.operation afterRegional = some (applyInternalTimerTaskPatch afterRegional patch) ∧
        runtimeStateWellFormed program patch.arm.runtimeInstanceId (applyInternalTimerTaskPatch before patch) = true ∧
        RegionalExecutionPublication program before afterRegional operation regional
          patch.arm.runtimeInstanceId commandId regionalIndex ∧
        RegionalExecutionPublication program (applyInternalTimerTaskPatch before patch)
          (applyInternalTimerTaskPatch afterRegional patch) operation regional
          patch.arm.runtimeInstanceId commandId regionalIndex ∧
        internalArmingPublicationTemplate? program before contract.operation patch.arm = some template ∧
        internalArmingPublicationTemplate? program afterRegional contract.operation patch.arm = some template ∧
        actualInternalTransitionPublication? program patch.arm.runtimeInstanceId before
          (applyInternalTimerTaskPatch before patch) contract.operation commandId taskIndex =
          some (template.instantiate commandId taskIndex) ∧
        actualInternalTransitionPublication? program patch.arm.runtimeInstanceId afterRegional
          (applyInternalTimerTaskPatch afterRegional patch) contract.operation commandId taskIndex =
          some (template.instantiate commandId taskIndex) := by
  obtain ⟨regionalFrame, afterRegional, applied, taskFrame, commute⟩ :=
    prepared_regional_timer_task_pair_commutes program before operation regional contract patch
      programWF beforeWF regionalFound taskFound independent
  obtain ⟨publishedAfter, publishedApplied, regionalFirst⟩ := prepareInternalRegional_execution_publication program before
    operation regional patch.arm.runtimeInstanceId commandId regionalIndex programWF beforeWF regionalFound
  have same : publishedAfter = afterRegional := Option.some.inj (publishedApplied.symm.trans applied)
  subst publishedAfter
  obtain ⟨_, _, openedBefore, openedAfter, _⟩ :=
    accepted_operation_delta_equals_independent_open_projection program before afterRegional operation
      commandId regionalIndex _ regionalFirst.lifecycle
  have taskWF := prepared_timer_task_preserves_runtime program before contract patch
    patch.arm.runtimeInstanceId taskFound beforeWF
  obtain ⟨final, finalApplied, regionalSecond⟩ := prepareInternalRegional_execution_publication program
    (applyInternalTimerTaskPatch before patch) operation regional patch.arm.runtimeInstanceId commandId regionalIndex
    programWF taskWF regionalFrame
  have finalEq : final = applyInternalTimerTaskPatch afterRegional patch :=
    Option.some.inj (finalApplied.symm.trans commute)
  rw [finalEq] at regionalSecond
  have firstExecution := prepareInternalTimerTaskContract_refines_operation program before contract patch taskFound
  have secondExecution := prepareInternalTimerTaskContract_refines_operation program afterRegional contract patch taskFrame
  obtain ⟨template, templateFound, taskFirst⟩ := prepared_timer_task_publication_template_accepted program before
    contract patch patch.arm.runtimeInstanceId commandId taskIndex programWF beforeWF (by simp [openedBefore]) taskFound
  obtain ⟨afterTemplate, afterTemplateFound, taskSecond⟩ := prepared_timer_task_publication_template_accepted program
    afterRegional contract patch patch.arm.runtimeInstanceId commandId taskIndex programWF regionalFirst.wellFormed
    (by simp [openedAfter]) taskFrame
  have fixedBefore := prepared_timer_task_publication_template_determined program before contract patch template
    programWF (by simp [openedBefore]) taskFound templateFound
  have fixedAfter := prepared_timer_task_publication_template_determined program afterRegional contract patch afterTemplate
    programWF (by simp [openedAfter]) taskFrame afterTemplateFound
  have sameTemplate : afterTemplate = template := fixedAfter.trans fixedBefore.symm
  rw [sameTemplate] at afterTemplateFound taskSecond
  exact ⟨regionalFrame, afterRegional, template, applied, taskFrame, commute, firstExecution, secondExecution,
    taskWF, regionalFirst, regionalSecond, templateFound, afterTemplateFound, taskFirst, taskSecond⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
