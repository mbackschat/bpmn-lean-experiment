import BpmnSemantics.Conformance
import BpmnSemantics.SequentialUserTask
import BpmnSemantics.UserTaskInteractionConformance
import Lean.Data.Json

/-! One-way canonical JSON-lines emitter for the sequential User Task results.

This is deliberately not a general scenario parser or transport. It exposes the results derived by the executable Lean interpreter for the content-addressed User Task interaction capsule so the external differential harness can compare them without parsing Lean's diagnostic `Repr` output.
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

private def stateObservationJson (state : StateObservation) : Json :=
  Json.mkObj
    [ ("kind", toJson "state")
    , ("instanceId", toJson state.instanceId.value)
    , ("status", processStatusJson state.status)
    , ("activeWaits", jsonArray (state.activeWaits.map activeWaitJson))
    , ("openUserTasks", jsonArray (state.openUserTasks.map openUserTaskJson))
    , ("enabledInteractions",
        jsonArray (state.enabledInteractions.map enabledInteractionJson))
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

private def scenarioKindJson : ScenarioKind → Json
  | .scenario => toJson "scenario"

private def stimulusJson : Stimulus → Json
  | .startProcess commandId processId instanceId =>
      Json.mkObj
        [ ("kind", toJson "startProcess")
        , ("commandId", toJson commandId.value)
        , ("processId", toJson processId.value)
        , ("instanceId", toJson instanceId.value) ]
  | .completeUserTaskInstance commandId taskId =>
      Json.mkObj
        [ ("kind", toJson "completeUserTaskInstance")
        , ("commandId", toJson commandId.value)
        , ("taskId", userTaskInstanceIdJson taskId) ]

private def observationKindJson : ObservationKind → Json
  | .deployment => toJson "deployment"
  | .commandResults => toJson "commandResults"
  | .processStatus => toJson "processStatus"
  | .activeWaits => toJson "activeWaits"
  | .openUserTasks => toJson "openUserTasks"
  | .enabledInteractions => toJson "enabledInteractions"
  | .logicalTime => toJson "logicalTime"

private def resourceIdentityJson (resource : ResourceIdentity) : Json :=
  Json.mkObj
    [ ("id", toJson resource.id.value)
    , ("relativePath", toJson resource.relativePath)
    , ("sha256", toJson resource.sha256) ]

private def scenarioProvenanceJson (provenance : ScenarioProvenance) : Json :=
  Json.mkObj
    [ ("normativeRefs", toJson provenance.normativeRefs)
    , ("cibRevision", toJson provenance.cibRevision)
    , ("cibRefs", toJson provenance.cibRefs) ]

/-- Echo of the exact scenario content this interpreter executed.

The differential harness compares this against the admitted scenario document. Scenario identity alone cannot establish that the compiled-in Lean scenario still matches the admitted bytes, because a canonical command observation records only the command identity and outcome rather than the submitted payload. -/
private def scenarioJson (scenario : Scenario) : Json :=
  Json.mkObj
    [ ("kind", scenarioKindJson scenario.kind)
    , ("id", toJson scenario.id.value)
    , ("profile", toJson scenario.profile.value)
    , ("bpmn", resourceIdentityJson scenario.bpmn)
    , ("stimuli", jsonArray (scenario.stimuli.map stimulusJson))
    , ("observations",
        jsonArray (scenario.observations.map observationKindJson))
    , ("provenance", scenarioProvenanceJson scenario.provenance) ]

private def resultRecordJson (scenario : Scenario) : Json :=
  Json.mkObj
    [ ("scenarioId", toJson scenario.id.value)
    , ("scenario", scenarioJson scenario)
    , ("result", scenarioResultJson
        (BpmnSemantics.SequentialUserTask.run scenario)) ]

private def emittedScenarios : List Scenario :=
  [ BpmnSemantics.UserTaskInteractionConformance.successfulScenario
  , BpmnSemantics.UserTaskInteractionConformance.wrongActivationScenario
  , BpmnSemantics.UserTaskInteractionConformance.staleCompletionScenario ]

def emit : IO Unit :=
  for scenario in emittedScenarios do
    IO.println (resultRecordJson scenario).compress

end BpmnSemantics.SequentialUserTaskJsonMain

def main : IO Unit :=
  BpmnSemantics.SequentialUserTaskJsonMain.emit
