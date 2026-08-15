import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.Fixtures

/-! # BpmnSemantics.SemanticProcessAdmissionConformance: admission and lowering contract checks

These checks own the generic checked-graph admission, program validation, profile capability, definition binding, and canonical lowering fixtures. Runtime closure and evaluator checks remain in `SemanticProcessConformance` so each kernel-decided lane has an independent build boundary.
-/

namespace BpmnSemantics.SemanticProcessConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def emptyCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with nodes := [], sequenceFlows := [] }

private def flowlessCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with sequenceFlows := [] }

private def danglingCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with
    nodes := []
    sequenceFlows :=
      [{ id := ⟨"Flow_Dangling"⟩
         sourceId := ⟨"Missing_Source"⟩
         targetId := ⟨"Missing_Target"⟩ }] }

theorem sequential_checked_process_is_well_formed :
    checkedWellFormed sequentialCheckedProcess = true := by decide +kernel

theorem parallel_checked_process_is_well_formed :
    checkedWellFormed parallelCheckedProcess = true := by decide +kernel

theorem timer_user_task_checked_process_is_well_formed :
    checkedWellFormed timerUserTaskCompositionCheckedProcess = true := by
  decide +kernel

theorem reverse_timer_user_task_checked_process_is_well_formed :
    checkedWellFormed reverseTimerUserTaskCompositionCheckedProcess = true := by
  decide +kernel

theorem empty_checked_graph_is_rejected :
    checkedWellFormed emptyCheckedGraph = false := by decide +kernel

theorem flowless_checked_graph_is_rejected :
    checkedWellFormed flowlessCheckedGraph = false := by decide +kernel

theorem dangling_checked_graph_is_rejected :
    checkedWellFormed danglingCheckedGraph = false := by decide +kernel

theorem sequential_program_is_well_formed :
    programWellFormed sequentialProgram = true := by decide +kernel

theorem parallel_program_is_well_formed :
    programWellFormed parallelProgram = true := by decide +kernel

theorem timer_user_task_program_is_well_formed :
    programWellFormed timerUserTaskCompositionProgram = true := by decide +kernel

theorem timer_user_task_profile_capabilities_are_valid :
    programProfileCapabilitiesValid timerUserTaskCompositionProgram = true := by
  decide +kernel

theorem timer_user_task_profile_mismatch_is_rejected :
    programProfileCapabilitiesValid
      { timerUserTaskCompositionProgram with
        identity :=
          { timerUserTaskCompositionProgram.identity with
            semanticProfile :=
              ⟨"cibseven-2.2.0-intermediate-catch-timer-draft"⟩ } } =
      false := by
  decide +kernel

theorem sequential_definition_binding_is_valid :
    definitionBindingValid sequentialCheckedProcess sequentialProgram = true := by
  decide +kernel

theorem parallel_definition_binding_is_valid :
    definitionBindingValid parallelCheckedProcess parallelProgram = true := by
  decide +kernel

theorem sequential_lowering_is_exact :
    lowerCheckedProcess sequentialCheckedProcess = sequentialProgram := by
  decide +kernel

theorem parallel_lowering_is_exact :
    lowerCheckedProcess parallelCheckedProcess = parallelProgram := by
  decide +kernel

theorem timer_user_task_lowering_is_exact :
    lowerCheckedProcess timerUserTaskCompositionCheckedProcess =
      timerUserTaskCompositionProgram := by
  decide +kernel

end BpmnSemantics.SemanticProcessConformance
