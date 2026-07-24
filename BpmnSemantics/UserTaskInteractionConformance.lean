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
  .completeUserTaskInstance ⟨"complete-user-task-instance"⟩ exactTaskId

private def interactionObservations : List ObservationKind :=
  [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .enabledInteractions
  , .logicalTime ]

private def interactionScenario (id : String) (stimuli : List Stimulus) : Scenario :=
  { schemaVersion := "0.2.0"
    traceSchemaVersion := "0.2.0"
    id := ⟨id⟩
    profile := ⟨"cibseven-2.2.0-spike.2"⟩
    bpmn := contractScenario.bpmn
    stimuli
    observations := interactionObservations
    provenance := contractScenario.provenance }

def successfulScenario : Scenario :=
  interactionScenario "m1-user-task-discovery-completion"
    [ startStimulus
    , exactCompletionStimulus ]

def wrongActivationScenario : Scenario :=
  interactionScenario "m1-user-task-wrong-activation"
    [ startStimulus
    , .completeUserTaskInstance ⟨"wrong-activation"⟩
        { exactTaskId with activation := 2 } ]

def staleCompletionScenario : Scenario :=
  interactionScenario "m1-user-task-stale-completion"
    [ startStimulus
    , exactCompletionStimulus
    , .completeUserTaskInstance ⟨"complete-stale-user-task-instance"⟩ exactTaskId ]

def waitingObservation : StateObservation :=
  { instanceId := ⟨"Instance_1"⟩
    status := .running
    activeWaits :=
      [ { elementId := ⟨"UserTask_Approve"⟩
          kind := .userTask
          multiplicity := 1 } ]
    openUserTasks :=
      some
        [ { id := exactTaskId
            name := some "Approve"
            state := .active } ]
    enabledStimuli := none
    enabledInteractions := some [exactCompletionInteraction]
    logicalTimeMs := 0 }

def completedObservation : StateObservation :=
  { instanceId := ⟨"Instance_1"⟩
    status := .completed
    activeWaits := []
    openUserTasks := some []
    enabledStimuli := none
    enabledInteractions := some []
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

example :
    run successfulScenario =
      { outcome := .semantic .committed
        trace := expectedSuccessfulTrace } := by
  decide

example :
    run wrongActivationScenario =
      { outcome := .semantic .rejected
        trace := expectedWrongActivationTrace } := by
  decide

example :
    run staleCompletionScenario =
      { outcome := .semantic .rejected
        trace := expectedStaleCompletionTrace } := by
  decide

example :
    (run successfulScenario).trace[2]? =
      (run wrongActivationScenario).trace[2]? := by
  decide

example :
    applyStimulus 4 model
        { control := .waitingUserTask ⟨"Instance_1"⟩ 1
          logicalTimeMs := 0 }
        (.completeUserTaskInstance ⟨"wrong-activation"⟩
          { processInstanceId := ⟨"Instance_1"⟩
            elementId := model.userTaskId
            activation := 2 }) =
      { outcome := .rejected
        state :=
          { control := .waitingUserTask ⟨"Instance_1"⟩ 1
            logicalTimeMs := 0 }
        microtrace := []
        internalStepBoundExceeded := false } :=
  wrong_activation_is_rejected
    model ⟨"Instance_1"⟩ 1 2 ⟨"wrong-activation"⟩ 0 (by decide)

example :
    applyStimulus 4 model
        { control := .waitingUserTask ⟨"Instance_1"⟩ 1
          logicalTimeMs := 0 }
        (.completeUserTaskInstance ⟨"wrong-process-instance"⟩
          { exactTaskId with
            processInstanceId := ⟨"Other_Instance"⟩ }) =
      { outcome := .rejected
        state :=
          { control := .waitingUserTask ⟨"Instance_1"⟩ 1
            logicalTimeMs := 0 }
        microtrace := []
        internalStepBoundExceeded := false } :=
  task_identity_mismatch_is_rejected
    model ⟨"Instance_1"⟩ 1 ⟨"wrong-process-instance"⟩
      { exactTaskId with processInstanceId := ⟨"Other_Instance"⟩ } 0
      (by simp [exactTaskId])

example :
    let wrongTaskId := { exactTaskId with activation := 2 }
    wrongTaskId.elementId = exactTaskId.elementId ∧
      (applyStimulus 4 model afterStartState
        (.completeUserTaskInstance ⟨"wrong-activation"⟩ wrongTaskId)).outcome =
          .rejected :=
  element_id_alone_is_insufficient

end BpmnSemantics.UserTaskInteractionConformance
