module

public import BpmnSemantics.UserTaskCompletionDataConformanceCheckFixtures
import BpmnSemantics.SequentialUserTask
import BpmnSemantics.SemanticProcess.Execution
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
/-! # BpmnSemantics.UserTaskCompletionDataConformance — exact completion-patch locks

This module owns the selected CIB Seven completion-data extension over the existing exact User Task occurrence. It checks atomic Process-variable merge, enabledness independence, bounded outgoing closure, and complete variable-state preservation on refusal.
-/

@[expose] public section

namespace BpmnSemantics.UserTaskCompletionDataConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialUserTask
/-- Exact completion creates, replaces, preserves, and retains null before the ordinary outgoing closure completes. -/
theorem exact_completion_merges_process_bindings :
    applyStimulus scenarioClosureLimit program stateWithExistingBindings
        completionStimulus =
      { outcome := .committed
        state := completedStateWithMergedBindings
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
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
      submittedValues 0 variables
      (by decide +kernel)
      (by decide +kernel)
      (Or.inr (Or.inr (by decide +kernel)))

/-- Null completion data belongs to the Process-data composition, not to a structurally similar profile. -/
theorem completion_value_domain_is_profile_closed :
    variableValueAdmitted
        ⟨"bpmn-2.0.2-user-task-preserved-notation-draft"⟩
        .userTaskCompletion .null = false ∧
      variableValueAdmitted
        ⟨"bpmn-2.0.2-timer-user-task-composition-draft"⟩
        .userTaskCompletion .null = false ∧
      variableValueAdmitted
        ⟨"cibseven-2.2.0-user-task-process-data-preserved-notation-draft"⟩
        .userTaskCompletion .null = true := by
  decide +kernel

end BpmnSemantics.UserTaskCompletionDataConformance
