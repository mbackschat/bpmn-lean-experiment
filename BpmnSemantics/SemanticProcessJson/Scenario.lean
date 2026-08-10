import BpmnSemantics.SemanticProcess.JsonSupport

/-! # Scenario JSON admission

This module owns strict decoding of the current answer-free scenario document. It does not decode definition artifacts or execute scenarios.
-/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics
open Lean

private def decodeStimulus (json : Json) : Except String Stimulus := do
  let kind ← stringField json "kind"
  match kind with
  | "startProcess" =>
      requireObjectShape json
        ["commandId", "initialVariables", "instanceId", "kind", "processId"]
      pure
        (.startProcess
          ⟨← stringField json "commandId"⟩
          ⟨← stringField json "processId"⟩
          ⟨← stringField json "instanceId"⟩
          (← decodeCanonicalVariableBindings
            (← field json "initialVariables")))
  | "triggerMessageStart" =>
      requireObjectShape json
        ["channel", "commandId", "instanceId", "kind", "processId",
          "startEventId"]
      pure
        (.triggerMessageStart
          (← decodeSemanticIdentityField json "commandId")
          (← decodeSemanticIdentityField json "processId")
          (← decodeSemanticIdentityField json "instanceId")
          (← decodeSemanticIdentityField json "startEventId")
          (← decodeOperationMessageChannel (← field json "channel")))
  | "completeUserTaskInstance" =>
      requireObjectShape json
        ["commandId", "kind", "submittedValues", "taskId"]
      pure
        (.completeUserTaskInstance
          ⟨← stringField json "commandId"⟩
          (← decodeOccurrenceId (← field json "taskId"))
          (← decodeCanonicalVariableBindings
            (← field json "submittedValues")))
  | "deliverMessage" =>
      requireObjectShape json
        ["channel", "commandId", "kind", "subscriptionId"]
      pure
        (.deliverMessage
          ⟨← stringField json "commandId"⟩
          (← decodeOccurrenceId (← field json "subscriptionId"))
          (← decodeMessageChannel (← field json "channel")))
  | "fireTimer" =>
      requireObjectShape json
        ["commandId", "kind", "logicalTimeMs", "timerId"]
      pure
        (.fireTimer
          ⟨← stringField json "commandId"⟩
          (← decodeOccurrenceId (← field json "timerId"))
          (← decodeSafeNat (← field json "logicalTimeMs")))
  | "completeEffect" =>
      requireObjectShape json ["commandId", "effectId", "kind", "result"]
      pure
        (.completeEffect
          ⟨← stringField json "commandId"⟩
          (← decodeOccurrenceId (← field json "effectId"))
          (← decodeEffectExecutionResult (← field json "result")))
  | _ => throw s!"unsupported scenario stimulus {kind}"

private def decodeObservationKind (json : Json) :
    Except String ObservationKind := do
  match ← json.getStr? with
  | "deployment" => pure .deployment
  | "commandResults" => pure .commandResults
  | "processStatus" => pure .processStatus
  | "activeWaits" => pure .activeWaits
  | "openUserTasks" => pure .openUserTasks
  | "openTimers" => pure .openTimers
  | "openEffects" => pure .openEffects
  | "variables" => pure .variables
  | "enabledInteractions" => pure .enabledInteractions
  | "logicalTime" => pure .logicalTime
  | kind => throw s!"unsupported scenario observation {kind}"

private def decodeScenarioProvenance (json : Json) :
    Except String ScenarioProvenance := do
  requireObjectShape json ["cibRefs", "cibRevision", "normativeRefs"]
  pure
    { normativeRefs :=
        ← decodeStringArray (← field json "normativeRefs")
      cibRevision := ← stringField json "cibRevision"
      cibRefs := ← decodeStringArray (← field json "cibRefs") }

/-- Decode only the exact current answer-free scenario shape supplied to every target. Unknown or missing fields, unknown observation names, unsafe occurrence numbers, and malformed explicit string/null values are rejected rather than defaulted. -/
def decodeScenario (json : Json) : Except String Scenario := do
  requireObjectShape json
    ["bpmn", "id", "kind", "observations", "profile", "provenance",
      "stimuli"]
  expectStringField json "kind" "scenario"
  pure
    { kind := .scenario
      id := ⟨← stringField json "id"⟩
      profile := ⟨← stringField json "profile"⟩
      bpmn := ← decodeResourceIdentity (← field json "bpmn")
      stimuli := ← decodeArray decodeStimulus (← field json "stimuli")
      observations :=
        ← decodeArray decodeObservationKind (← field json "observations")
      provenance :=
        ← decodeScenarioProvenance (← field json "provenance") }

def decodeScenarioDocument (contents : String) :
    Except String Scenario := do
  decodeScenario (← parseWireJson contents)

end BpmnSemantics.SemanticProcessJson
