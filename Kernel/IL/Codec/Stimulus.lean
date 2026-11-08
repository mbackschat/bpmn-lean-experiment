module

public import Kernel.IL.Codec

/-! # Scenario stimulus codecs

The scenario contract's input side: Message channels, occurrence identities, effect outcomes and stimuli, decoded
into kernel inputs, and the name of each failure outcome.
-/

public section

namespace Kernel.Codec

open Lean (Json)

/-- The scenario contract's `messageChannel`: an operation, a direct or an unspecified Message. -/
def channelFromJson (json : Json) : Except String MessageChannel := do
  match ← json.getObjValAs? String "kind" with
  | "operationMessage" =>
    pure { messageId := some (← json.getObjValAs? String "messageId")
           interfaceRef := some (← json.getObjValAs? String "interfaceId")
           operationRef := some (← json.getObjValAs? String "interfaceOperationId") }
  | "directMessage" => pure { messageId := some (← json.getObjValAs? String "messageId") }
  | "unspecifiedMessage" => pure { messageId := none }
  | other => throw s!"unknown message channel kind {other}"

/-- An operation channel needs all three identifiers; otherwise a Message identifier makes a direct channel. -/
def channelToJson (channel : MessageChannel) : Json :=
  match channel.messageId, channel.interfaceRef, channel.operationRef with
  | some message, some interface, some operation =>
    Json.mkObj [("kind", "operationMessage"), ("interfaceId", Json.str interface),
      ("interfaceOperationId", Json.str operation), ("messageId", Json.str message)]
  | some message, _, _ => Json.mkObj [("kind", "directMessage"), ("messageId", Json.str message)]
  | none, _, _ => Json.mkObj [("kind", "unspecifiedMessage")]

/-- An `occurrenceId` object, by process instance, element and activation. -/
def occurrenceFromJson (json : Json) : Except String OccurrenceRef := do
  pure { processInstanceId := ← json.getObjValAs? String "processInstanceId"
         element := ⟨← json.getObjValAs? String "elementId"⟩, activation := ← json.getObjValAs? Nat "activation" }

def bindingsField (json : Json) (field : String) : Except String (List (String × Value)) :=
  bindingsFromJson ((json.getObjVal? field).toOption.getD (Json.arr #[]))

def effectOutcomeFromJson (json : Json) : Except String EffectOutcome := do
  let patch ← bindingsField json "localPatch"
  match ← json.getObjValAs? String "kind" with
  | "success" => pure (.success patch)
  | "bpmnError" =>
    let message := (json.getObjValAs? String "message").toOption
    pure (.businessFailure (← json.getObjValAs? String "code") message patch)
  | other => throw s!"unknown effect result kind {other}"

/-- One scenario stimulus: its command identifier and the kernel input, or `none` for a stimulus kind the kernel
does not accept yet. -/
def stimulusFromJson (json : Json) : Except String (String × Option Input) := do
  let commandId ← json.getObjValAs? String "commandId"
  let input : Option Input ← match ← json.getObjValAs? String "kind" with
    | "startProcess" =>
      pure (some (.start { instanceId := ← json.getObjValAs? String "instanceId"
                           variables := ← bindingsField json "initialVariables" }))
    | "triggerTimerStart" | "triggerMessageStart" =>
      pure (some (.start { instanceId := ← json.getObjValAs? String "instanceId"
                           startEvent := some ⟨← json.getObjValAs? String "startEventId"⟩ }))
    | "completeUserTaskInstance" =>
      let occurrence ← occurrenceFromJson (← json.getObjVal? "taskId")
      pure (some (.command { occurrence, action := .completeUserTask (← bindingsField json "submittedValues") }))
    | "deliverMessage" =>
      pure (some (.deliver { occurrence := ← occurrenceFromJson (← json.getObjVal? "subscriptionId")
                             channel := ← channelFromJson (← json.getObjVal? "channel") }))
    | "deliverPayloadMessage" =>
      pure (some (.deliver { occurrence := ← occurrenceFromJson (← json.getObjVal? "subscriptionId")
                             channel := ← channelFromJson (← json.getObjVal? "channel")
                             payload := some (← valueFromJson (← json.getObjVal? "payload")) }))
    | "fireTimer" =>
      pure (some (.timerFire { occurrence := ← occurrenceFromJson (← json.getObjVal? "timerId")
                               logicalTimeMs := ← json.getObjValAs? Nat "logicalTimeMs" }))
    | "completeEffect" =>
      pure (some (.effectResult { occurrence := ← occurrenceFromJson (← json.getObjVal? "effectId")
                                  outcome := ← effectOutcomeFromJson (← json.getObjVal? "result") }))
    | "reportEffectFailure" =>
      pure (some (.effectResult { occurrence := ← occurrenceFromJson (← json.getObjVal? "effectId")
                                  outcome := .technicalFailure }))
    | "retryIncident" =>
      let incident ← json.getObjVal? "incidentId"
      pure (some (.command { occurrence := ← occurrenceFromJson (← incident.getObjVal? "effectId")
                             action := .retryIncident }))
    | "cancelIncidentProcess" =>
      let incident ← json.getObjVal? "incidentId"
      pure (some (.command { occurrence := ← occurrenceFromJson (← incident.getObjVal? "effectId")
                             action := .cancelIncidentProcess }))
    | _ => pure none
  pure (commandId, input)

def failureName : Failure → String
  | .rejected _ => "rejected"
  | .rolledBack _ => "rolledBack"
  | .semanticFailure _ => "semanticFailure"
  | .unsupported _ => "unsupported"

end Kernel.Codec
