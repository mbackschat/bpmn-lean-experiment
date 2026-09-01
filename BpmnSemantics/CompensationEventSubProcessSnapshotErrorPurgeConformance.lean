import BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionFixture

/-! # Compensation Event Sub-Process snapshot Error purge conformance -/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance

/-- Regional Error cancellation removes the failed parent's provisional context. -/
theorem error_interruption_purges_the_provisional_context :
    errorInterrupted.state.compensationParentContextRetentions = [] := by
  decide +kernel

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
