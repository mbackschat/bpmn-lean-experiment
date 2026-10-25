import BpmnSemantics.CompensationSourceLoweringFixtures

/-! # Compensation source JSON conformance

Each accepted or refused wire shape is an independent kernel decision. This preserves every strict
decoder obligation while preventing one conjunction from retaining all decoded fixture terms.
-/

namespace BpmnSemantics.CompensationSourceLoweringConformance

def strict_decoder_accepts_the_exact_declaration : Bool := decide <|
    compensationAcceptedAs compensationJson checkedCompensation = true

def strict_checked_decoder_accepts_the_exact_artifact : Bool := decide <|
    checkedAccepted checkedJsonWithCompensation = true

def strict_checked_decoder_preserves_old_omission : Bool := decide <|
    checkedAccepted oldCheckedJson = true

def strict_decoder_rejects_null_declaration : Bool := decide <|
    compensationRejected .null = true

def strict_checked_decoder_rejects_present_null : Bool := decide <|
    checkedAccepted (checkedJsonWithCompensation .null) = false

def strict_decoder_rejects_an_extra_key : Bool := decide <|
    compensationRejected (compensationJson (includeExtra := true)) = true

def strict_decoder_rejects_handler_body_discriminator_drift : Bool := decide <|
    compensationRejected (compensationJson (bodyKind := "otherEffect")) = true

def strict_decoder_rejects_dependency_discriminator_drift : Bool := decide <|
    compensationRejected (compensationJson (dependencyReason := "association")) = true

def strict_decoder_rejects_retention_record_limit_drift : Bool := decide <|
    compensationRejected (compensationJson (retentionRecords := 3)) = true

def strict_decoder_rejects_retention_byte_limit_drift : Bool := decide <|
    compensationRejected (compensationJson (retentionBytes := 4097)) = true

def strict_decoder_rejects_snapshot_record_limit_drift : Bool := decide <|
    compensationRejected (compensationJson (snapshotRecords := 2)) = true

def strict_decoder_rejects_snapshot_byte_limit_drift : Bool := decide <|
    compensationRejected (compensationJson (snapshotBytes := 8193)) = true

def strict_decoder_rejects_execution_trigger_limit_drift : Bool := decide <|
    compensationRejected (compensationJson (executionTriggers := 2)) = true

def strict_decoder_rejects_execution_handler_limit_drift : Bool := decide <|
    compensationRejected (compensationJson (executionHandlers := 4)) = true

def strict_decoder_rejects_execution_byte_limit_drift : Bool := decide <|
    compensationRejected (compensationJson (executionBytes := 20481)) = true

/-- Every executable check of this module, named for the driver's failure report. -/
def compensationSourceJsonConformanceChecks : List (String × Bool) := [
  ("strict_decoder_accepts_the_exact_declaration", strict_decoder_accepts_the_exact_declaration),
  ("strict_checked_decoder_accepts_the_exact_artifact", strict_checked_decoder_accepts_the_exact_artifact),
  ("strict_checked_decoder_preserves_old_omission", strict_checked_decoder_preserves_old_omission),
  ("strict_decoder_rejects_null_declaration", strict_decoder_rejects_null_declaration),
  ("strict_checked_decoder_rejects_present_null", strict_checked_decoder_rejects_present_null),
  ("strict_decoder_rejects_an_extra_key", strict_decoder_rejects_an_extra_key),
  ("strict_decoder_rejects_handler_body_discriminator_drift", strict_decoder_rejects_handler_body_discriminator_drift),
  ("strict_decoder_rejects_dependency_discriminator_drift", strict_decoder_rejects_dependency_discriminator_drift),
  ("strict_decoder_rejects_retention_record_limit_drift", strict_decoder_rejects_retention_record_limit_drift),
  ("strict_decoder_rejects_retention_byte_limit_drift", strict_decoder_rejects_retention_byte_limit_drift),
  ("strict_decoder_rejects_snapshot_record_limit_drift", strict_decoder_rejects_snapshot_record_limit_drift),
  ("strict_decoder_rejects_snapshot_byte_limit_drift", strict_decoder_rejects_snapshot_byte_limit_drift),
  ("strict_decoder_rejects_execution_trigger_limit_drift", strict_decoder_rejects_execution_trigger_limit_drift),
  ("strict_decoder_rejects_execution_handler_limit_drift", strict_decoder_rejects_execution_handler_limit_drift),
  ("strict_decoder_rejects_execution_byte_limit_drift", strict_decoder_rejects_execution_byte_limit_drift)
]

end BpmnSemantics.CompensationSourceLoweringConformance
