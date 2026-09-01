import BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionFixture

/-! # Compensation Event Sub-Process snapshot Error Program conformance -/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance

open BpmnSemantics.SemanticProcess

/-- The dormant snapshot handler preserves strict admission for the Error fixture. -/
theorem error_program_is_well_formed :
    programWellFormed errorProgram = true := by
  decide +kernel

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
