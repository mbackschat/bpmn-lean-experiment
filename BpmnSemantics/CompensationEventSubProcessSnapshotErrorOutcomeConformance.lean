import BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionFixture

/-! # Compensation Event Sub-Process snapshot Error outcome conformance -/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance

open BpmnSemantics.SemanticProcess

/-- The Error command remains a committed semantic transition. -/
theorem error_interruption_commits :
    errorInterrupted.outcome = .committed := by
  decide +kernel

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
