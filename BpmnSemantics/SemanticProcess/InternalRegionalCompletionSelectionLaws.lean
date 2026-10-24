module

public import BpmnSemantics.SemanticProcess.InternalRegionalCompletionSelection
public import BpmnSemantics.SemanticProcess.InternalRegionalCompletionAdmission

/-! Predecessor-selected completion preserves runtime position under the checked admission contract. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics


/-- The admitted completion law now applies to the predecessor-selected bounded withdrawal. -/
theorem completionWithdrawal_preserves_position (program : Program) (before completed : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId) (withdrawal : InternalCompletionWithdrawal)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (running : before.control = .running instanceId)
    (operation : .completeScope id origin scopeId output ∈ program.operations)
    (selected : selectInternalCompletionWithdrawal? program before scopeId = some withdrawal)
    (ordinary : completeScopeState? before scopeId output = some completed) :
    ∃ after, completeBoundedScope? program before scopeId output = some after ∧
      runtimePositionValid program expectedInstanceId after = true := by
  obtain ⟨after, result, _⟩ := completionWithdrawal_refines program before completed scopeId output withdrawal selected ordinary
  exact ⟨after, result, declaredBoundedComplete_preserves_position program before after expectedInstanceId instanceId
    id origin scopeId output valid structural running operation result⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
