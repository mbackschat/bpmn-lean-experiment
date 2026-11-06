module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.Fixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.SemanticProcess.TopologyFixtures
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.TopologyFixtures
import all BpmnSemantics.SemanticProcessContract

/-! # BpmnSemantics.SemanticProcessAdmissionConformance: admission and lowering contract checks

These checks own the generic checked-graph admission, program validation, profile capability, definition binding, and canonical lowering fixtures. Runtime closure and evaluator checks remain in `SemanticProcessConformance` so each kernel-decided lane has an independent build boundary.
-/

public section

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

/-- The shared lexeme list of TED-PARSE-01; `timer-duration-lexeme.test.ts` checks the same list. -/
private def exact_timer_durations_have_their_milliseconds : Bool :=
  [("PT1S", 1000), ("PT5S", 5000), ("PT01S", 1000), ("PT0H1S", 1000), ("PT30S", 30000),
    ("PT15M", 900000), ("PT2H", 7200000), ("PT1H30M", 5400000), ("PT90M", 5400000),
    ("PT36H", 129600000), ("PT87660H", 315576000000)].all
    fun (lexeme, ms) => normalizeTimerDuration lexeme == ms

private def refused_timer_durations_lower_to_zero : Bool :=
  ["PT0S", "PT0H0M0S", "PT1.5S", "PT1,5S", "P1D", "P0DT1S", "P1W", "P1M", "P1Y", "PT", "P", "PTH",
    "PT-1S", "PT+1S", "PT1S1M", "PT1H1H", "pt1s", " PT1S", "PT1S ", "PT87661H",
    "PT9007199254740993S", "PT99999999999999999999H", "2026-01-01T00:00:00Z",
    "2026-01-01T00:00:00Z/PT1H", "PT1H/2026-01-01T00:00:00Z", "R/PT1S", "R3/PT1S"].all
    fun lexeme => normalizeTimerDuration lexeme == 0

private def withTimerLexeme (lexeme : String) (source : CheckedProcess) : CheckedProcess :=
  { source with nodes := source.nodes.map fun
      | .intermediateCatchTimerEvent id _ => .intermediateCatchTimerEvent id lexeme
      | node => node }

/-- Definition admission end to end: checked admission, lowering and the positive program pin. -/
private def exact_intermediate_catch_duration_is_admitted : Bool :=
  let source := withTimerLexeme "PT2H" timerUserTaskCompositionCheckedProcess
  checkedWellFormed source && programWellFormed (lowerCheckedProcess source) &&
    !programWellFormed (lowerCheckedProcess (withTimerLexeme "PT0S" timerUserTaskCompositionCheckedProcess))

private def boundaryWith (literal : String) : CheckedNode :=
  .timerBoundaryEvent ⟨"Boundary"⟩ ⟨"Task"⟩ .interrupting (.duration literal) ⟨"Flow_Out"⟩

/-- TED-SITE-01: the boundary and the repeatable catch keep their exact `PT1S` pins. -/
private def non_unit_boundary_and_repeatable_durations_are_refused : Bool :=
  let flows := [{ id := ⟨"Flow_Out"⟩, sourceId := ⟨"Boundary"⟩, targetId := ⟨"End"⟩ }]
  let arity := checkedNodeArityValid false false false false false [] flows
  arity (boundaryWith "PT1S") && !arity (boundaryWith "PT2S") &&
    checkedAllowed (.intermediateCatchTimerEvent ⟨"Catch"⟩ "PT1S") &&
    !checkedAllowed (.intermediateCatchTimerEvent ⟨"Catch"⟩ "PT2S")

private def raceArmSource (lexeme : String) : CheckedProcess :=
  { timerUserTaskCompositionCheckedProcess with
    nodes := [.eventBasedGateway ⟨"Gateway"⟩, .intermediateCatchTimerEvent ⟨"Timer"⟩ lexeme]
    sequenceFlows := [{ id := ⟨"F_GT"⟩, sourceId := ⟨"Gateway"⟩, targetId := ⟨"Timer"⟩ }] }

/-- TED-SITE-01: a race arm lowers only `PT1S`; an equal value such as `PT01S` lowers to 0, which
the race pin in `ProgramStructuralValidation` refuses. -/
private def race_arm_lowers_only_pt1s : Bool :=
  [("PT1S", 1000), ("PT01S", 0), ("PT2S", 0)].all fun (lexeme, ms) =>
    (eventRaceTimerArm (raceArmSource lexeme) ⟨"Gateway"⟩).durationMs == ms

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
  ("parallel_definition_binding_is_valid", parallel_definition_binding_is_valid),
  ("exact_timer_durations_have_their_milliseconds", exact_timer_durations_have_their_milliseconds),
  ("refused_timer_durations_lower_to_zero", refused_timer_durations_lower_to_zero),
  ("exact_intermediate_catch_duration_is_admitted", exact_intermediate_catch_duration_is_admitted),
  ("non_unit_boundary_and_repeatable_durations_are_refused", non_unit_boundary_and_repeatable_durations_are_refused),
  ("race_arm_lowers_only_pt1s", race_arm_lowers_only_pt1s)
]

end BpmnSemantics.SemanticProcessConformance
