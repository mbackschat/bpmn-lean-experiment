module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.Fixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity

/-! # BpmnSemantics.SemanticProcessAdmissionConformance: admission and lowering contract checks

These checks own the generic checked-graph admission, program validation, profile capability, definition binding, and canonical lowering fixtures. Runtime closure and evaluator checks remain in `SemanticProcessConformance` so each kernel-decided lane has an independent build boundary.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcessConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def emptyCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with nodes := [], sequenceFlows := [] }

def flowlessCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with sequenceFlows := [] }

def danglingCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with
    nodes := []
    sequenceFlows :=
      [{ id := ⟨"Flow_Dangling"⟩
         sourceId := ⟨"Missing_Source"⟩
         targetId := ⟨"Missing_Target"⟩ }] }

def sequential_checked_process_is_well_formed : Bool := decide <|
    checkedWellFormed sequentialCheckedProcess = true

def parallel_checked_process_is_well_formed : Bool := decide <|
    checkedWellFormed parallelCheckedProcess = true

def timer_user_task_checked_process_is_well_formed : Bool := decide <|
    checkedWellFormed timerUserTaskCompositionCheckedProcess = true

def reverse_timer_user_task_checked_process_is_well_formed : Bool := decide <|
    checkedWellFormed reverseTimerUserTaskCompositionCheckedProcess = true

def empty_checked_graph_is_rejected : Bool := decide <|
    checkedWellFormed emptyCheckedGraph = false

def flowless_checked_graph_is_rejected : Bool := decide <|
    checkedWellFormed flowlessCheckedGraph = false

def dangling_checked_graph_is_rejected : Bool := decide <|
    checkedWellFormed danglingCheckedGraph = false

def sequential_program_is_well_formed : Bool := decide <|
    programWellFormed sequentialProgram = true

def parallel_program_is_well_formed : Bool := decide <|
    programWellFormed parallelProgram = true

def timer_user_task_program_is_well_formed : Bool := decide <|
    programWellFormed timerUserTaskCompositionProgram = true

def sharedIdentityUserTask : SemanticOperation :=
  .awaitUserTask ⟨"operation:Shared_User"⟩ { elementId := ⟨"Shared_Wait"⟩ }
    ⟨"place:User_Input"⟩ ⟨"place:User_Output"⟩
    { id := ⟨"Shared_Wait"⟩, name := none }

def sharedIdentityTimer : SemanticOperation :=
  .awaitTimer ⟨"operation:Shared_Timer"⟩ { elementId := ⟨"Shared_Wait"⟩ }
    ⟨"place:Timer_Input"⟩ ⟨"place:Timer_Output"⟩
    { elementId := ⟨"Shared_Wait"⟩, durationMs := 1000 }

/-- Family tagging admits the same element text across distinct runtime wait families. -/
def cross_family_wait_identifier_reuse_is_admitted : Bool := decide <|
    programWaitDeclarersUnique [sharedIdentityUserTask, sharedIdentityTimer] = true

def timer_user_task_profile_capabilities_are_valid : Bool := decide <|
    programProfileCapabilitiesValid timerUserTaskCompositionProgram = true

def timer_user_task_profile_mismatch_is_rejected : Bool := decide <|
    programProfileCapabilitiesValid
      { timerUserTaskCompositionProgram with
        identity :=
          { timerUserTaskCompositionProgram.identity with
            semanticProfile :=
              ⟨"cibseven-2.2.0-intermediate-catch-timer-draft"⟩ } } =
      false

def sequential_definition_binding_is_valid : Bool := decide <|
    definitionBindingValid sequentialCheckedProcess sequentialProgram = true

def parallel_definition_binding_is_valid : Bool := decide <|
    definitionBindingValid parallelCheckedProcess parallelProgram = true

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

/-- Every executable check of this module, named for the driver's failure report. -/
def semanticProcessAdmissionConformanceChecks : List (String × Bool) := [
  ("sequential_checked_process_is_well_formed", sequential_checked_process_is_well_formed),
  ("parallel_checked_process_is_well_formed", parallel_checked_process_is_well_formed),
  ("timer_user_task_checked_process_is_well_formed", timer_user_task_checked_process_is_well_formed),
  ("reverse_timer_user_task_checked_process_is_well_formed", reverse_timer_user_task_checked_process_is_well_formed),
  ("empty_checked_graph_is_rejected", empty_checked_graph_is_rejected),
  ("flowless_checked_graph_is_rejected", flowless_checked_graph_is_rejected),
  ("dangling_checked_graph_is_rejected", dangling_checked_graph_is_rejected),
  ("sequential_program_is_well_formed", sequential_program_is_well_formed),
  ("parallel_program_is_well_formed", parallel_program_is_well_formed),
  ("timer_user_task_program_is_well_formed", timer_user_task_program_is_well_formed),
  ("cross_family_wait_identifier_reuse_is_admitted", cross_family_wait_identifier_reuse_is_admitted),
  ("timer_user_task_profile_capabilities_are_valid", timer_user_task_profile_capabilities_are_valid),
  ("timer_user_task_profile_mismatch_is_rejected", timer_user_task_profile_mismatch_is_rejected),
  ("sequential_definition_binding_is_valid", sequential_definition_binding_is_valid),
  ("parallel_definition_binding_is_valid", parallel_definition_binding_is_valid)
]

end BpmnSemantics.SemanticProcessConformance
