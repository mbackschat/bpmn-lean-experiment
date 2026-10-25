module

public import BpmnSemantics.CompensationSourceLoweringFixtures

/-! # Compensation source storage-limit binding conformance

Retention and snapshot record and byte limits remain four separately reduced binding obligations.
-/

@[expose] public section

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

def binding_rejects_retention_record_limit_drift : Bool := decide <|
    definitionBindingValid checkedProcess (mutateRetentionLimits 3 4096) = false

def binding_rejects_retention_byte_limit_drift : Bool := decide <|
    definitionBindingValid checkedProcess (mutateRetentionLimits 2 4097) = false

def binding_rejects_snapshot_record_limit_drift : Bool := decide <|
    definitionBindingValid checkedProcess (mutateSnapshotLimits 2 8192) = false

def binding_rejects_snapshot_byte_limit_drift : Bool := decide <|
    definitionBindingValid checkedProcess (mutateSnapshotLimits 1 8193) = false

/-- Every executable check of this module, named for the driver's failure report. -/
def compensationSourceBindingStorageLimitConformanceChecks : List (String × Bool) := [
  ("binding_rejects_retention_record_limit_drift", binding_rejects_retention_record_limit_drift),
  ("binding_rejects_retention_byte_limit_drift", binding_rejects_retention_byte_limit_drift),
  ("binding_rejects_snapshot_record_limit_drift", binding_rejects_snapshot_record_limit_drift),
  ("binding_rejects_snapshot_byte_limit_drift", binding_rejects_snapshot_byte_limit_drift)
]

end BpmnSemantics.CompensationSourceLoweringConformance
