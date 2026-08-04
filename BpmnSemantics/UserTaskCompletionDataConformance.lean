import BpmnSemantics.SequentialUserTask

/-! # BpmnSemantics.UserTaskCompletionDataConformance — exact completion-patch locks

This module owns the selected CIB Seven completion-data extension over the existing exact User Task occurrence. It checks atomic Process-variable merge, enabledness independence, bounded outgoing closure, and complete variable-state preservation on refusal.
-/

namespace BpmnSemantics.UserTaskCompletionDataConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialUserTask

def existingBindings : List VariableBinding :=
  [ { name := "decision", value := .string "pending" }
  , { name := "untouched", value := .string "kept" } ]

def stateWithExistingBindings : RuntimeState :=
  { afterStartState with
    variables :=
      { afterStartState.variables with
        process := { bindings := existingBindings } } }

def expectedBindings : List VariableBinding :=
  [ { name := "decision", value := .string "approved" }
  , { name := "reviewNote", value := .null }
  , { name := "untouched", value := .string "kept" } ]

def completedStateWithMergedBindings : RuntimeState :=
  { completedState with
    variables :=
      { completedState.variables with
        process := { bindings := expectedBindings } } }

/-- Exact completion creates, replaces, preserves, and retains null before the ordinary outgoing closure completes. -/
theorem exact_completion_merges_process_bindings :
    applyStimulus scenarioClosureLimit program stateWithExistingBindings
        completionStimulus =
      { outcome := .committed
        state := completedStateWithMergedBindings
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- Merely placing completion data in a future stimulus cannot affect the operations enabled by the current waiting state. -/
theorem waiting_enabledness_is_data_independent :
    enabledInternalOperationCount program stateWithExistingBindings =
      enabledInternalOperationCount program afterStartState := by
  decide +kernel

/-- A mismatched completion preserves every Process and Activity-local binding supplied by the pre-command state. -/
theorem mismatched_completion_preserves_all_scoped_variables
    (variables : ScopedVariables) (submittedValues : List VariableBinding) :
    applyStimulus scenarioClosureLimit program
        (singletonWaitingState exactWait 0 variables)
        (.completeUserTaskInstance ⟨"wrong-activation"⟩
          { exactTaskInstanceId with activation := 2 }
          submittedValues) =
      { outcome := .rejected
        state := singletonWaitingState exactWait 0 variables
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  exact task_identity_mismatch_is_rejected
    program exactWait ⟨"wrong-activation"⟩
      { exactTaskInstanceId with activation := 2 }
      submittedValues 0 variables (Or.inr (Or.inr (by decide +kernel)))

end BpmnSemantics.UserTaskCompletionDataConformance
