import BpmnSemantics.CompensationSourceLoweringFixtures

/-! # Compensation source JSON conformance

Each accepted or refused wire shape is an independent kernel decision. This preserves every strict
decoder obligation while preventing one conjunction from retaining all decoded fixture terms.
-/

namespace BpmnSemantics.CompensationSourceLoweringConformance

theorem strict_decoder_accepts_the_exact_declaration :
    compensationAcceptedAs compensationJson checkedCompensation = true := by
  decide +kernel

theorem strict_checked_decoder_accepts_the_exact_artifact :
    checkedAccepted checkedJsonWithCompensation = true := by
  decide +kernel

theorem strict_checked_decoder_preserves_old_omission :
    checkedAccepted oldCheckedJson = true := by
  decide +kernel

theorem strict_decoder_rejects_null_declaration :
    compensationRejected .null = true := by
  decide +kernel

theorem strict_checked_decoder_rejects_present_null :
    checkedAccepted (checkedJsonWithCompensation .null) = false := by
  decide +kernel

theorem strict_decoder_rejects_an_extra_key :
    compensationRejected (compensationJson (includeExtra := true)) = true := by
  decide +kernel

theorem strict_decoder_rejects_handler_body_discriminator_drift :
    compensationRejected (compensationJson (bodyKind := "otherEffect")) = true := by
  decide +kernel

theorem strict_decoder_rejects_dependency_discriminator_drift :
    compensationRejected (compensationJson (dependencyReason := "association")) = true := by
  decide +kernel

theorem strict_decoder_rejects_retention_record_limit_drift :
    compensationRejected (compensationJson (retentionRecords := 3)) = true := by
  decide +kernel

theorem strict_decoder_rejects_retention_byte_limit_drift :
    compensationRejected (compensationJson (retentionBytes := 4097)) = true := by
  decide +kernel

theorem strict_decoder_rejects_snapshot_record_limit_drift :
    compensationRejected (compensationJson (snapshotRecords := 2)) = true := by
  decide +kernel

theorem strict_decoder_rejects_snapshot_byte_limit_drift :
    compensationRejected (compensationJson (snapshotBytes := 8193)) = true := by
  decide +kernel

theorem strict_decoder_rejects_execution_trigger_limit_drift :
    compensationRejected (compensationJson (executionTriggers := 2)) = true := by
  decide +kernel

theorem strict_decoder_rejects_execution_handler_limit_drift :
    compensationRejected (compensationJson (executionHandlers := 4)) = true := by
  decide +kernel

theorem strict_decoder_rejects_execution_byte_limit_drift :
    compensationRejected (compensationJson (executionBytes := 20481)) = true := by
  decide +kernel

end BpmnSemantics.CompensationSourceLoweringConformance
