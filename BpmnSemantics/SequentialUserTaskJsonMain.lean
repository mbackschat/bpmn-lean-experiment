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

private def activeWaitJson (wait : ActiveWait) : Json :=
  Json.mkObj
    [ ("elementId", toJson wait.elementId.value)
    , ("kind", waitKindJson wait.kind)
    , ("multiplicity", toJson wait.multiplicity) ]

private def stateObservationJson (state : StateObservation) : Json :=
  Json.mkObj
    [ ("kind", toJson "state")
    , ("instanceId", toJson state.instanceId.value)
    , ("status", processStatusJson state.status)
    , ("activeWaits", jsonArray (state.activeWaits.map activeWaitJson))
    , ("enabledStimuli", jsonArray (state.enabledStimuli.map stimulusJson))
    , ("logicalTimeMs", toJson state.logicalTimeMs) ]

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
