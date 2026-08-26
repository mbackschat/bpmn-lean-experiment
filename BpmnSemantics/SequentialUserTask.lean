import BpmnSemantics.SemanticProcess.Fixtures

/-! # BpmnSemantics.SequentialUserTask — sequential capsule witnesses

This module names the current sequential capsule's inputs, states, and laws over the generic Semantic Process semantics. It contains no topology-specific representation or evaluator.
-/

namespace BpmnSemantics.SequentialUserTask

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def program : Program :=
  sequentialProgram

def startStimulus : Stimulus :=
  .startProcess
    ⟨"start-process"⟩
    ⟨program.processId.value⟩
    ⟨"Instance_1"⟩
    [ { name := "requestTitle", value := .string "Review invoice 42" } ]

def exactTaskInstanceId : UserTaskInstanceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"UserTask_Approve"⟩
    activation := 1 }

def submittedValues : List VariableBinding :=
  [ { name := "decision", value := .string "approved" }
  , { name := "reviewNote", value := .null } ]

def initialBindings : List VariableBinding :=
  [ { name := "requestTitle", value := .string "Review invoice 42" } ]

def completedBindings : List VariableBinding :=
  [ { name := "decision", value := .string "approved" }
  , { name := "requestTitle", value := .string "Review invoice 42" }
  , { name := "reviewNote", value := .null } ]

def completionStimulus : Stimulus :=
  .completeUserTaskInstance
    ⟨"complete-user-task-instance"⟩
    exactTaskInstanceId
    submittedValues

def rootOwner : ScopeOccurrenceId :=
  rootScopeOccurrenceId ⟨"Instance_1"⟩ program.processId

def exactWait : UserTaskWait :=
  { processInstanceId := ⟨"Instance_1"⟩
    owner := rootOwner
    task :=
      { id := ⟨"UserTask_Approve"⟩
        name := some "Approve" }
    activation := 1
    output := ⟨"place:Flow_TaskToEnd"⟩ }

def afterStartState : RuntimeState :=
  { (runningProgramStartState? program ⟨"Instance_1"⟩ initialBindings).getD
      initialState with
    initiationPending := false
    waits := [exactWait]
    activations := [{ taskId := exactWait.task.id, count := 1 }] }

def completedState : RuntimeState :=
  { afterStartState with
    control := .completed ⟨"Instance_1"⟩
    scopeOccurrences := []
    waits := []
    variables :=
      { afterStartState.variables with
        process := { bindings := completedBindings } }
    endOccurrences := 1 }

def runWithClosureLimit (closureLimit : Nat) : ScenarioRunner :=
  fun scenario =>
    runScenarioWithClosureLimit closureLimit program scenario

def run : ScenarioRunner :=
  fun scenario => runScenario program scenario

theorem start_reaches_single_user_task_wait :
    applyStimulus scenarioClosureLimit program initialState startStimulus =
      { outcome := .committed
        state := afterStartState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem matching_completion_terminates :
    applyStimulus scenarioClosureLimit program afterStartState
        completionStimulus =
      { outcome := .committed
        state := completedState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem no_completion_before_matching_command :
    applyStimulus scenarioClosureLimit program afterStartState
        (.completeUserTaskInstance ⟨"wrong-completion"⟩
          { exactTaskInstanceId with elementId := ⟨"Other_Task"⟩ }
          submittedValues) =
      { outcome := .rejected
        state := afterStartState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem wrong_activation_is_rejected
    (submittedActivation : Nat) (mismatch : submittedActivation ≠ 1) :
    applyStimulus scenarioClosureLimit program afterStartState
        (.completeUserTaskInstance ⟨"wrong-activation"⟩
          { exactTaskInstanceId with activation := submittedActivation }
          submittedValues) =
      { outcome := .rejected
        state := afterStartState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  exact task_identity_mismatch_is_rejected
    program exactWait ⟨"wrong-activation"⟩
      { exactTaskInstanceId with activation := submittedActivation }
      submittedValues
      0 afterStartState.variables
      (by rfl)
      (by rfl)
      (Or.inr (Or.inr mismatch))

theorem element_id_alone_is_insufficient :
    let wrongTaskId := { exactTaskInstanceId with activation := 2 }
    wrongTaskId.elementId = exactTaskInstanceId.elementId ∧
      (applyStimulus scenarioClosureLimit program afterStartState
        (.completeUserTaskInstance
          ⟨"wrong-activation"⟩ wrongTaskId submittedValues)).outcome = .rejected := by
  decide +kernel

end BpmnSemantics.SequentialUserTask
