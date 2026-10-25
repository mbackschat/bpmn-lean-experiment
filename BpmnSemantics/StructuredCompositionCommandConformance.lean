module

public import BpmnSemantics.SemanticProcess.CommandAdmission
public import BpmnSemantics.SemanticProcess.StructuredCompositionFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.CallActivity

/-! Command witnesses exercise the actual external dispatcher, so a profile value-domain change alone cannot satisfy the required-input and ordinary-task write restrictions. -/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.StructuredCompositionCommandConformance

open SemanticProcess StructuredCompositionFixtures

def start (bindings : List VariableBinding) : Stimulus :=
  .startProcess ⟨"start"⟩ ⟨"InvoiceProcess"⟩ ⟨"invoice-1"⟩ bindings

def invoice : VariableBinding := { name := "Invoice", value := .string "invoice-4711" }

def required_input_start_commits : Bool := decide <|
    (admitStimulus serialProgram initialState (start [invoice])).outcome = .committed

def missing_required_input_start_rejects : Bool := decide <|
    (admitStimulus serialProgram initialState (start [])).outcome = .rejected ∧
    (admitStimulus serialProgram initialState (start [])).state = initialState

def null_required_input_counts_as_present : Bool := decide <|
    (admitStimulus serialProgram initialState
      (start [{ name := "Invoice", value := .null }])).outcome = .committed

def unrelated_start_binding_is_retained : Bool := decide <|
    (admitStimulus serialProgram initialState
      (start [invoice, { name := "Unrelated", value := .string "keep" }])).state.variables.process.bindings =
        [invoice, { name := "Unrelated", value := .string "keep" }]

def notifyId : UserTaskInstanceId :=
  { processInstanceId := ⟨"invoice-1"⟩, elementId := ⟨"Notify"⟩, activation := 1 }

def notifyWait : RuntimeState :=
  { initialState with
    control := .running ⟨"invoice-1"⟩
    waits := [{ processInstanceId := ⟨"invoice-1"⟩
                owner := { processInstanceId := ⟨"invoice-1"⟩
                           definitionScopeId := ⟨"scope:InvoiceProcess"⟩, activation := 1 }
                task := { id := ⟨"Notify"⟩, name := none }, activation := 1
                output := ⟨"place:d"⟩, metadata := none }] }

def ordinary_completion_accepts_empty_patch : Bool := decide <|
    (admitStimulus serialProgram notifyWait
      (.completeUserTaskInstance ⟨"notify"⟩ notifyId [])).outcome = .committed

def ordinary_completion_refuses_process_write : Bool := decide <|
    (admitStimulus serialProgram notifyWait
      (.completeUserTaskInstance ⟨"notify"⟩ notifyId [invoice])).outcome = .rejected ∧
    (admitStimulus serialProgram notifyWait
      (.completeUserTaskInstance ⟨"notify"⟩ notifyId [invoice])).state = notifyWait

def parallelProfileProgram : Program :=
  { serialProgram with identity := { serialProgram.identity with
      semanticProfile := ⟨"cibseven-2.2.0-parallel-multi-instance-subprocess-draft"⟩ } }

theorem reprofiled_ordinary_completion_separates_raw_dispatch_from_admission :
    StructuredComposition.programAnalysis parallelProfileProgram =
      StructuredComposition.programAnalysis serialProgram ∧
    (StructuredComposition.programAnalysis parallelProfileProgram).isSome = true ∧
    processDataBindingsAdmitted parallelProfileProgram.identity.semanticProfile
      .userTaskCompletion [invoice] = false ∧
    (dispatchStimulus parallelProfileProgram notifyWait
      (.completeUserTaskInstance ⟨"notify"⟩ notifyId [invoice])).outcome = .committed ∧
    (dispatchStimulus parallelProfileProgram notifyWait
      (.completeUserTaskInstance ⟨"notify"⟩ notifyId [invoice])).state.variables.process.bindings = [invoice] ∧
    (admitStimulus parallelProfileProgram notifyWait
      (.completeUserTaskInstance ⟨"notify"⟩ notifyId [invoice])).outcome = .rejected ∧
    (admitStimulus parallelProfileProgram notifyWait
      (.completeUserTaskInstance ⟨"notify"⟩ notifyId [invoice])).state = notifyWait := by
  refine ⟨rfl, ?_⟩
  decide +kernel

def assessId : UserTaskInstanceId :=
  { notifyId with elementId := ⟨"Assess"⟩ }

/-- The absent Activity/input lifetime also separates the raw wait fallback from ADIO-ATOMIC-01 admission. -/
def assessWait : RuntimeState :=
  { notifyWait with waits := notifyWait.waits.map fun wait =>
      { wait with task := { id := ⟨"Assess"⟩, name := none }, output := ⟨"place:b"⟩ } }

def propertyNamedOutput : VariableBinding :=
  { name := "Decision", value := .string "accepted" }

theorem reprofiled_data_completion_separates_raw_dispatch_from_admission :
    StructuredComposition.programAnalysis parallelProfileProgram =
      StructuredComposition.programAnalysis serialProgram ∧
    (StructuredComposition.programAnalysis parallelProfileProgram).isSome = true ∧
    isDataInputOutputTaskDefinition parallelProfileProgram ⟨"Assess"⟩ = true ∧
    completeDataInputOutputUserTask? parallelProfileProgram assessWait assessId.processInstanceId
      ⟨"Assess"⟩ assessId.activation [propertyNamedOutput] = none ∧
    (dispatchStimulus parallelProfileProgram assessWait
      (.completeUserTaskInstance ⟨"assess"⟩ assessId [propertyNamedOutput])).outcome = .committed ∧
    (dispatchStimulus parallelProfileProgram assessWait
      (.completeUserTaskInstance ⟨"assess"⟩ assessId [propertyNamedOutput])).state.variables.process.bindings =
        [propertyNamedOutput] ∧
    (admitStimulus parallelProfileProgram assessWait
      (.completeUserTaskInstance ⟨"assess"⟩ assessId [propertyNamedOutput])).outcome = .rejected ∧
    (admitStimulus parallelProfileProgram assessWait
      (.completeUserTaskInstance ⟨"assess"⟩ assessId [propertyNamedOutput])).state = assessWait := by
  refine ⟨rfl, ?_⟩
  decide +kernel

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("required_input_start_commits", required_input_start_commits),
  ("missing_required_input_start_rejects", missing_required_input_start_rejects),
  ("null_required_input_counts_as_present", null_required_input_counts_as_present),
  ("unrelated_start_binding_is_retained", unrelated_start_binding_is_retained),
  ("ordinary_completion_accepts_empty_patch", ordinary_completion_accepts_empty_patch),
  ("ordinary_completion_refuses_process_write", ordinary_completion_refuses_process_write)
]

end BpmnSemantics.StructuredCompositionCommandConformance
