import BpmnSemantics.SequentialUserTask

/-! # BpmnSemantics.ProcessStartDataConformance — initial Process-data locks

This module owns the selected CIB Seven start-variable extension for the bounded sequential User Task profile. It separates the universal fresh-state data invariant from the exact positive and negative executable witnesses.
-/

namespace BpmnSemantics.ProcessStartDataConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialUserTask

/-- A fresh semantic start installs exactly the supplied Process bindings and creates no Activity-local scope. -/
theorem running_start_installs_only_process_bindings
    (instanceId : SemanticId) (bindings : List VariableBinding) :
    (runningStartState instanceId bindings).variables =
      { process := { bindings }
        activities := [] } := by
  rfl

/-- The selected start data is committed before internal closure reaches the first User Task wait. -/
theorem exact_start_data_is_visible_at_first_wait :
    applyStimulus scenarioClosureLimit program initialState startStimulus =
      { outcome := .committed
        state := afterStartState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- A Process-identity mismatch rejects without installing even a discriminating initial binding. -/
theorem wrong_process_start_installs_no_data :
    applyStimulus scenarioClosureLimit program initialState
        (.startProcess ⟨"wrong-process-start"⟩ ⟨"Other_Process"⟩
          ⟨"Instance_1"⟩
          [{ name := "mustNotAppear", value := .string "guard" }]) =
      { outcome := .rejected
        state := initialState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- Start data does not change the quiescent enabled-operation count of the admitted first wait. -/
theorem first_wait_enabledness_is_initial_data_independent :
    enabledInternalOperationCount program afterStartState =
      enabledInternalOperationCount program
        { afterStartState with variables := emptyScopedVariables } := by
  decide +kernel

/-- String start data belongs to the Process-data composition, not to a structurally similar profile. -/
theorem process_start_value_domain_is_profile_closed :
    variableValueAdmitted
        ⟨"bpmn-2.0.2-user-task-preserved-notation-draft"⟩
        .processStart (.string "unexpected") = false ∧
      variableValueAdmitted
        ⟨"bpmn-2.0.2-timer-user-task-composition-draft"⟩
        .processStart (.string "unexpected") = false ∧
      variableValueAdmitted
        ⟨"cibseven-2.2.0-user-task-process-data-preserved-notation-draft"⟩
        .processStart (.string "selected") = true := by
  decide +kernel

end BpmnSemantics.ProcessStartDataConformance
