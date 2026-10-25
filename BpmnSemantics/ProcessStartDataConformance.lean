module

public import BpmnSemantics.ProcessStartDataConformanceCheckFixtures
public import BpmnSemantics.SequentialUserTask
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
/-! # BpmnSemantics.ProcessStartDataConformance — initial Process-data locks

This module owns the selected CIB Seven start-variable extension for the bounded sequential User Task profile. It separates the universal fresh-state data invariant from the exact positive and negative executable witnesses.
-/

@[expose] public section

namespace BpmnSemantics.ProcessStartDataConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialUserTask

/-- A fresh semantic start installs exactly the supplied Process bindings and creates no Activity-local scope. -/
theorem running_start_installs_only_process_bindings
    (instanceId : SemanticId) (bindings : List VariableBinding) :
    (runningStartState instanceId bindings).variables =
      { process := { bindings }
        activities := []
        processInterfaces := [], scopes := [] } := by
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

end BpmnSemantics.ProcessStartDataConformance
