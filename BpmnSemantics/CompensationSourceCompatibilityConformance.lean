import BpmnSemantics.CompensationSourceLoweringFixtures

/-! # Compensation source compatibility conformance

The checkpoint-only profile's empty Process-start domain and every physically absent legacy
declaration are decided independently of the larger admission and binding fixtures.
-/

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

theorem checkpoint_process_start_accepts_the_empty_patch :
    processDataBindingsAdmitted compensationSourceCheckpointProfileId .processStart [] = true := by
  decide +kernel

theorem checkpoint_process_start_rejects_a_nonempty_patch :
    processDataBindingsAdmitted compensationSourceCheckpointProfileId .processStart
      [{ name := "unexpected", value := .string "value" }] = false := by
  decide +kernel

theorem old_checked_process_omits_compensation :
    oldCheckedProcess.compensation = none := by
  decide +kernel

theorem old_lowering_omits_compensation_retention :
    (lowerCheckedProcess oldCheckedProcess).compensationActivityRetention = none := by
  decide +kernel

theorem old_lowering_omits_compensation_snapshots :
    (lowerCheckedProcess oldCheckedProcess).compensationEventSubProcessSnapshots = none := by
  decide +kernel

theorem old_lowering_omits_compensation_execution :
    (lowerCheckedProcess oldCheckedProcess).compensationExecution = none := by
  decide +kernel

end BpmnSemantics.CompensationSourceLoweringConformance
