module

public import BpmnSemantics.UserTaskInteractionConformanceCheckFixtures
import BpmnSemantics.Conformance
import BpmnSemantics.SequentialUserTask
import BpmnSemantics.SemanticProcess.Execution
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
/-! # BpmnSemantics.UserTaskInteractionConformance — task-occurrence interaction locks

These checks close the structured User Task occurrence, exact completion, full-identity mismatch, wrong-activation, stale-completion, and state-derived interaction projection lanes for the bounded interaction capsule.
-/

@[expose] public section

namespace BpmnSemantics.UserTaskInteractionConformance

open BpmnSemantics
open BpmnSemantics.SequentialUserTask
theorem successful_scenario_trace_is_exact :
    run successfulScenario =
      { outcome := .semantic .committed
        trace := expectedSuccessfulTrace } := by
  decide +kernel

theorem stale_completion_is_rejected_without_reactivation :
    run staleCompletionScenario =
      { outcome := .semantic .rejected
        trace := expectedStaleCompletionTrace } := by
  decide +kernel

theorem waiting_projection_is_independent_of_next_command :
    (run successfulScenario).trace[2]? =
      (run wrongActivationScenario).trace[2]? := by
  decide +kernel

theorem wrong_activation_application_is_rejected :
    BpmnSemantics.SemanticProcess.applyStimulus
        BpmnSemantics.SemanticProcess.scenarioClosureLimit
        program afterStartState
        (.completeUserTaskInstance ⟨"wrong-activation"⟩
          { processInstanceId := ⟨"Instance_1"⟩
            elementId := ⟨"UserTask_Approve"⟩
            activation := 2 }
          submittedValues) =
      { outcome := .rejected
        state := afterStartState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  wrong_activation_is_rejected 2 (by decide +kernel)

theorem wrong_process_instance_is_rejected :
    BpmnSemantics.SemanticProcess.applyStimulus
        BpmnSemantics.SemanticProcess.scenarioClosureLimit
        program afterStartState
        (.completeUserTaskInstance ⟨"wrong-process-instance"⟩
          { exactTaskId with
            processInstanceId := ⟨"Other_Instance"⟩ }
          submittedValues) =
      { outcome := .rejected
        state := afterStartState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  BpmnSemantics.SemanticProcess.task_identity_mismatch_is_rejected
    program exactWait ⟨"wrong-process-instance"⟩
      { exactTaskId with processInstanceId := ⟨"Other_Instance"⟩ }
      submittedValues 0 afterStartState.variables
      (by decide +kernel)
      (by decide +kernel)
      (by simp [exactTaskId, exactWait])

theorem element_identity_without_activation_is_insufficient :
    let wrongTaskId := { exactTaskId with activation := 2 }
    wrongTaskId.elementId = exactTaskId.elementId ∧
      (BpmnSemantics.SemanticProcess.applyStimulus
        BpmnSemantics.SemanticProcess.scenarioClosureLimit
        program afterStartState
        (.completeUserTaskInstance
          ⟨"wrong-activation"⟩ wrongTaskId submittedValues)).outcome =
          .rejected :=
  element_id_alone_is_insufficient

end BpmnSemantics.UserTaskInteractionConformance
