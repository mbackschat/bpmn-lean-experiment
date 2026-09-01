import BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionFixture

/-! # Compensation Event Sub-Process snapshot Error recovery conformance -/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance

/-- The caught Error exposes only the parent-scope recovery work. -/
theorem error_interruption_exposes_recovery :
    (errorInterrupted.state.waits.map fun wait => wait.task.id.value) =
      ["UserTask_Recover"] := by
  decide +kernel

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
