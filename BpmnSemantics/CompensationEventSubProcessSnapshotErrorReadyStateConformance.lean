import BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionFixture

/-! # Compensation Event Sub-Process snapshot pre-Error-state conformance -/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance

open BpmnSemantics.SemanticProcess

/-- The pre-Error state has the exact selected child occurrence and one valid provisional context. -/
theorem error_ready_state_is_valid_and_reserved :
    compensationEventSubProcessSnapshotStateValid errorProgram errorReadyState = true ∧
      errorReadyState.compensationParentContextRetentions =
        [.provisional errorChildOccurrence errorHandlerScopeId] := by
  decide +kernel

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
