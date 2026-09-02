import BpmnSemantics.CompensationSourceLoweringFixtures

/-! # Compensation source storage-limit binding conformance

Retention and snapshot record and byte limits remain four separately reduced binding obligations.
-/

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

theorem binding_rejects_retention_record_limit_drift :
    definitionBindingValid checkedProcess (mutateRetentionLimits 3 4096) = false := by
  decide +kernel

theorem binding_rejects_retention_byte_limit_drift :
    definitionBindingValid checkedProcess (mutateRetentionLimits 2 4097) = false := by
  decide +kernel

theorem binding_rejects_snapshot_record_limit_drift :
    definitionBindingValid checkedProcess (mutateSnapshotLimits 2 8192) = false := by
  decide +kernel

theorem binding_rejects_snapshot_byte_limit_drift :
    definitionBindingValid checkedProcess (mutateSnapshotLimits 1 8193) = false := by
  decide +kernel

end BpmnSemantics.CompensationSourceLoweringConformance
