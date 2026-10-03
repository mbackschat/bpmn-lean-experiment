import BpmnSemantics.SemanticProcess.CommandAdmission
import BpmnSemantics.SemanticProcess.StructuredCompositionFixtures

/-! Command witnesses exercise the actual external dispatcher, so a profile value-domain change alone cannot satisfy the required-input and ordinary-task write restrictions. -/

set_option Elab.async false

namespace BpmnSemantics.StructuredCompositionCommandConformance

open SemanticProcess StructuredCompositionFixtures

private def start (bindings : List VariableBinding) : Stimulus :=
  .startProcess ⟨"start"⟩ ⟨"InvoiceProcess"⟩ ⟨"invoice-1"⟩ bindings

private def invoice : VariableBinding := { name := "Invoice", value := .string "invoice-4711" }

theorem required_input_start_commits :
    (admitStimulus serialProgram initialState (start [invoice])).outcome = .committed := by
  decide +kernel

theorem missing_required_input_start_rejects :
    (admitStimulus serialProgram initialState (start [])).outcome = .rejected ∧
    (admitStimulus serialProgram initialState (start [])).state = initialState := by
  decide +kernel

theorem null_required_input_counts_as_present :
    (admitStimulus serialProgram initialState
      (start [{ name := "Invoice", value := .null }])).outcome = .committed := by
  decide +kernel

theorem unrelated_start_binding_is_retained :
    (admitStimulus serialProgram initialState
      (start [invoice, { name := "Unrelated", value := .string "keep" }])).state.variables.process.bindings =
        [invoice, { name := "Unrelated", value := .string "keep" }] := by
  decide +kernel

private def notifyId : UserTaskInstanceId :=
  { processInstanceId := ⟨"invoice-1"⟩, elementId := ⟨"Notify"⟩, activation := 1 }

private def notifyWait : RuntimeState :=
  { initialState with
    control := .running ⟨"invoice-1"⟩
    waits := [{ processInstanceId := ⟨"invoice-1"⟩
                owner := { processInstanceId := ⟨"invoice-1"⟩
                           definitionScopeId := ⟨"scope:InvoiceProcess"⟩, activation := 1 }
                task := { id := ⟨"Notify"⟩, name := none }, activation := 1
                output := ⟨"place:d"⟩, metadata := none }] }

theorem ordinary_completion_accepts_empty_patch :
    (admitStimulus serialProgram notifyWait
      (.completeUserTaskInstance ⟨"notify"⟩ notifyId [])).outcome = .committed := by
  decide +kernel

theorem ordinary_completion_refuses_process_write :
    (admitStimulus serialProgram notifyWait
      (.completeUserTaskInstance ⟨"notify"⟩ notifyId [invoice])).outcome = .rejected ∧
    (admitStimulus serialProgram notifyWait
      (.completeUserTaskInstance ⟨"notify"⟩ notifyId [invoice])).state = notifyWait := by
  decide +kernel

end BpmnSemantics.StructuredCompositionCommandConformance
