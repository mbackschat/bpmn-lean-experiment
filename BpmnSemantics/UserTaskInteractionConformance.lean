import BpmnSemantics.Conformance
import BpmnSemantics.SequentialUserTask

/-! # BpmnSemantics.UserTaskInteractionConformance — task-occurrence interaction locks

These checks close the structured User Task occurrence, exact completion, full-identity mismatch, wrong-activation, stale-completion, and state-derived interaction projection lanes for the bounded interaction capsule.
-/

namespace BpmnSemantics.UserTaskInteractionConformance

open BpmnSemantics
open BpmnSemantics.SequentialUserTask

def exactTaskId : UserTaskInstanceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"UserTask_Approve"⟩
    activation := 1 }

def exactCompletionInteraction : EnabledInteraction :=
  .completeUserTaskInstance exactTaskId

def exactCompletionStimulus : Stimulus :=
  .completeUserTaskInstance
    ⟨"complete-user-task-instance"⟩ exactTaskId submittedValues

private def interactionObservations : List ObservationKind :=
  [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .openTimers
  , .openEffects
  , .variables
  , .enabledInteractions
  , .logicalTime ]

private def interactionScenario (id : String) (stimuli : List Stimulus) : Scenario :=
  { kind := .scenario
    id := ⟨id⟩
    profile := ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩
    bpmn := contractScenario.bpmn
    stimuli
    observations := interactionObservations
    provenance := contractScenario.provenance }

def successfulScenario : Scenario :=
  interactionScenario "user-task-discovery-completion"
    [ startStimulus
    , exactCompletionStimulus ]

def wrongActivationScenario : Scenario :=
  interactionScenario "user-task-wrong-activation"
    [ startStimulus
    , .completeUserTaskInstance ⟨"wrong-activation"⟩
        { exactTaskId with activation := 2 } submittedValues ]

def staleCompletionScenario : Scenario :=
  interactionScenario "user-task-stale-completion"
    [ startStimulus
    , exactCompletionStimulus
    , .completeUserTaskInstance
        ⟨"complete-stale-user-task-instance"⟩ exactTaskId
        [{ name := "decision", value := .string "denied" }] ]

def waitingObservation : StateObservation :=
  { instanceId := ⟨"Instance_1"⟩
    status := .running
    activeWaits :=
      [ { elementId := ⟨"UserTask_Approve"⟩
          kind := .userTask
          multiplicity := 1 } ]
    openUserTasks :=
      [ { id := exactTaskId
          name := some "Approve"
          state := .active } ]
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := initialBindings
    enabledInteractions := [exactCompletionInteraction]
    logicalTimeMs := 0 }

def completedObservation : StateObservation :=
  { instanceId := ⟨"Instance_1"⟩
    status := .completed
    activeWaits := []
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := completedBindings
    enabledInteractions := []
    logicalTimeMs := 0 }

def expectedSuccessfulTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-process"⟩ .committed
  , .state waitingObservation
  , .command ⟨"complete-user-task-instance"⟩ .committed
  , .state completedObservation ]

def expectedWrongActivationTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-process"⟩ .committed
  , .state waitingObservation
  , .command ⟨"wrong-activation"⟩ .rejected
  , .state waitingObservation ]

def expectedStaleCompletionTrace : List CanonicalObservation :=
  expectedSuccessfulTrace ++
    [ .command ⟨"complete-stale-user-task-instance"⟩ .rejected
    , .state completedObservation ]

theorem successful_scenario_trace_is_exact :
    run successfulScenario =
      { outcome := .semantic .committed
        trace := expectedSuccessfulTrace } := by
  decide +kernel

theorem wrong_activation_scenario_trace_is_exact :
    run wrongActivationScenario =
      { outcome := .semantic .rejected
        trace := expectedWrongActivationTrace } := by
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

theorem zero_closure_limit_is_a_harness_failure :
    runWithClosureLimit 0 successfulScenario =
      { outcome := .harnessFailure
        trace := [.deployment .committed] } := by
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
