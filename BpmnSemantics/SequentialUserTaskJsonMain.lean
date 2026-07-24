import BpmnSemantics.Conformance
import BpmnSemantics.SequentialUserTask
import Lean.Data.Json

/-! One-way canonical JSON emitter for the Milestone 0 Lean scenario result.

This is deliberately not a general scenario parser or transport. It exposes the result derived by the executable Lean interpreter for the content-addressed sequential User Task capsule so the external differential harness can compare it without parsing Lean's diagnostic `Repr` output.
-/

namespace BpmnSemantics.SequentialUserTaskJsonMain

open BpmnSemantics
open Lean

private def jsonArray (values : List Json) : Json :=
  .arr values.toArray

private def commandOutcomeJson : CommandOutcome → Json
  | .committed => toJson "committed"
  | .rolledBack => toJson "rolledBack"
  | .rejected => toJson "rejected"
  | .semanticFailure => toJson "semanticFailure"
  | .unsupported => toJson "unsupported"

private def processStatusJson : ProcessStatus → Json
  | .notStarted => toJson "notStarted"
  | .running => toJson "running"
  | .completed => toJson "completed"

private def waitKindJson : WaitKind → Json
  | .userTask => toJson "userTask"

private def userTaskInstanceIdJson (taskId : UserTaskInstanceId) : Json :=
  Json.mkObj
    [ ("processInstanceId", toJson taskId.processInstanceId.value)
    , ("elementId", toJson taskId.elementId.value)
    , ("activation", toJson taskId.activation) ]

private def stimulusJson : Stimulus → Json
  | .startProcess commandId processId instanceId =>
      Json.mkObj
        [ ("kind", toJson "startProcess")
        , ("commandId", toJson commandId.value)
        , ("processId", toJson processId.value)
        , ("instanceId", toJson instanceId.value) ]
  | .completeUserTask commandId elementId =>
      Json.mkObj
        [ ("kind", toJson "completeUserTask")
        , ("commandId", toJson commandId.value)
        , ("elementId", toJson elementId.value) ]
  | .completeUserTaskInstance commandId taskId =>
      Json.mkObj
        [ ("kind", toJson "completeUserTaskInstance")
        , ("commandId", toJson commandId.value)
        , ("taskId", userTaskInstanceIdJson taskId) ]

private def activeWaitJson (wait : ActiveWait) : Json :=
  Json.mkObj
    [ ("elementId", toJson wait.elementId.value)
    , ("kind", waitKindJson wait.kind)
    , ("multiplicity", toJson wait.multiplicity) ]

private def userTaskLifecycleStateJson : UserTaskLifecycleState → Json
  | .active => toJson "active"

private def openUserTaskJson (task : OpenUserTask) : Json :=
  Json.mkObj
    [ ("id", userTaskInstanceIdJson task.id)
    , ("name", toJson task.name)
    , ("state", userTaskLifecycleStateJson task.state) ]

private def enabledInteractionJson : EnabledInteraction → Json
  | .completeUserTaskInstance taskId =>
      Json.mkObj
        [ ("kind", toJson "completeUserTaskInstance")
        , ("taskId", userTaskInstanceIdJson taskId) ]

private def optionalArrayField (name : String) (encode : α → Json) :
    Option (List α) → List (String × Json)
  | none => []
  | some values => [(name, jsonArray (values.map encode))]

private def stateObservationJson (state : StateObservation) : Json :=
  Json.mkObj
    ([ ("kind", toJson "state")
     , ("instanceId", toJson state.instanceId.value)
     , ("status", processStatusJson state.status)
     , ("activeWaits", jsonArray (state.activeWaits.map activeWaitJson)) ] ++
    optionalArrayField "openUserTasks" openUserTaskJson state.openUserTasks ++
    optionalArrayField "enabledStimuli" stimulusJson state.enabledStimuli ++
    optionalArrayField "enabledInteractions" enabledInteractionJson
      state.enabledInteractions ++
    [("logicalTimeMs", toJson state.logicalTimeMs)])

private def canonicalObservationJson : CanonicalObservation → Json
  | .deployment outcome =>
      Json.mkObj
        [ ("kind", toJson "deployment")
        , ("outcome", commandOutcomeJson outcome) ]
  | .command commandId outcome =>
      Json.mkObj
        [ ("kind", toJson "command")
        , ("commandId", toJson commandId.value)
        , ("outcome", commandOutcomeJson outcome) ]
  | .state state =>
      stateObservationJson state

private def scenarioOutcomeJson : ScenarioOutcome → Json
  | .semantic outcome =>
      Json.mkObj
        [ ("kind", toJson "semantic")
        , ("outcome", commandOutcomeJson outcome) ]
  | .harnessFailure =>
      Json.mkObj [("kind", toJson "harnessFailure")]
  | .infrastructureFailure =>
      Json.mkObj [("kind", toJson "infrastructureFailure")]

private def scenarioResultJson (result : ScenarioResult) : Json :=
  Json.mkObj
    [ ("outcome", scenarioOutcomeJson result.outcome)
    , ("trace", jsonArray (result.trace.map canonicalObservationJson)) ]

def emit : IO Unit :=
  IO.println
    (scenarioResultJson
      (BpmnSemantics.SequentialUserTask.run contractScenario)).compress

end BpmnSemantics.SequentialUserTaskJsonMain

def main : IO Unit :=
  BpmnSemantics.SequentialUserTaskJsonMain.emit
