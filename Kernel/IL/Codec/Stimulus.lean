module

public import Kernel.IL.Codec

/-! # Scenario stimulus codecs

The scenario contract's input side ([schema](../../../contracts/schemas/scenario.schema.json)): Message channels,
occurrence identities and the five stimulus forms, each decoded into the kernel input of the same name, and the name
of each failure outcome. A stimulus outside these forms refuses the scenario. Every object is read strictly: a key
outside its form, a missing required key or a `null` member refuses it with a `Kernel.Codec` strict-decoding code.
-/

public section

namespace Kernel.Codec

open Lean (Json)

/-- Refuse `json` unless it is an object whose keys are all of `required` and some of `optional`. -/
def fields (json : Json) (required : List String) (optional : List String := []) : Except String Unit := do
  let .obj members := json | throw s!"{malformedCode}: object expected"
  if let some key := members.keys.find? (fun key => !(required.contains key || optional.contains key)) then
    throw s!"{unknownField}: {key}"
  if let some key := required.find? (fun key => !(members.keys.contains key)) then
    throw s!"{missingField}: {key}"

/-- The `kind` of a tagged object, after checking it has its form's keys. -/
def kindOf (json : Json) : Except String String := do
  let .obj _ := json | throw s!"{malformedCode}: object expected"
  match json.getObjVal? "kind" with
  | .ok kind => kind.getStr?
  | .error _ => throw s!"{missingField}: kind"

/-- The scenario contract's `messageChannel`: an operation, a direct or an unspecified Message. -/
def channelFromJson (json : Json) : Except String MessageChannel := do
  match ← kindOf json with
  | "operationMessage" =>
    fields json ["kind", "messageId", "interfaceId", "interfaceOperationId"]
    pure { messageId := some (← json.getObjValAs? String "messageId")
           interfaceRef := some (← json.getObjValAs? String "interfaceId")
           operationRef := some (← json.getObjValAs? String "interfaceOperationId") }
  | "directMessage" =>
    fields json ["kind", "messageId"]
    pure { messageId := some (← json.getObjValAs? String "messageId") }
  | "unspecifiedMessage" =>
    fields json ["kind"]
    pure { messageId := none }
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
  fields json ["processInstanceId", "elementId", "activation"]
  pure { processInstanceId := ← json.getObjValAs? String "processInstanceId"
         element := ⟨← json.getObjValAs? String "elementId"⟩, activation := ← json.getObjValAs? Nat "activation" }

/-- `field` when present; the contract's optional members, which are never `null`. -/
def optionalField (json : Json) (field : String) : Option Json :=
  (json.getObjVal? field).toOption

def optionalString (json : Json) (field : String) : Except String (Option String) :=
  (optionalField json field).mapM (·.getStr?)

def valueAt (json : Json) : Except String Value :=
  strictly valueFromJson valueToJson json

def bindingsAt (json : Json) (field : String) : Except String (List (String × Value)) := do
  strictly bindingsFromJson bindingsToJson (← json.getObjVal? field)

/-- A Signal address: `name` for a named one, `signalRef` (`{id, namespace?}`) for a QName; a stimulus gives exactly
one. -/
def signalAddressFromJson (json : Json) : Except String SignalAddress := do
  match optionalField json "name", optionalField json "signalRef" with
  | some name, none => SignalAddress.named <$> name.getStr?
  | none, some ref =>
    fields ref ["id"] ["namespace"]
    pure (.qualified { «namespace» := ← optionalString ref "namespace", localName := ← ref.getObjValAs? String "id" })
  | some _, some _ => throw s!"{malformedCode}: a Signal address is a name or a signalRef, not both"
  | none, none => throw s!"{missingField}: name"

/-- The members `signalAddressFromJson` reads back. -/
def signalAddressToJson : SignalAddress → List (String × Json)
  | .named name => [("name", Json.str name)]
  | .qualified ref =>
    [("signalRef", Json.mkObj ((ref.«namespace».map fun uri => ("namespace", Json.str uri)).toList ++
      [("id", Json.str ref.localName)]))]

def startTriggerFromJson (json : Json) : Except String StartTrigger := do
  match ← kindOf json with
  | "none" => fields json ["kind"]; pure .none
  | "timer" => fields json ["kind", "logicalTimeMs"]; pure (.timer (← json.getObjValAs? Nat "logicalTimeMs"))
  | "message" =>
    fields json ["kind", "channel"] ["payload"]
    pure (.message (← channelFromJson (← json.getObjVal? "channel")) (← (optionalField json "payload").mapM valueAt))
  | "signal" =>
    fields json ["kind", "variables"] ["name", "signalRef"]
    pure (.signal (← signalAddressFromJson json) (← bindingsAt json "variables"))
  | "condition" => fields json ["kind"]; pure .condition
  | other => throw s!"unknown start trigger kind {other}"

def commandActionFromJson (json : Json) : Except String CommandAction := do
  match ← kindOf json with
  | "completeUserTask" => fields json ["kind", "values"]; pure (.completeUserTask (← bindingsAt json "values"))
  | "retryIncident" => fields json ["kind", "generation"]; pure (.retryIncident (← json.getObjValAs? Nat "generation"))
  | "cancelIncidentProcess" =>
    fields json ["kind", "generation"]
    pure (.cancelIncidentProcess (← json.getObjValAs? Nat "generation"))
  | "setVariables" => fields json ["kind", "values"]; pure (.setVariables (← bindingsAt json "values"))
  | "removeVariables" =>
    fields json ["kind", "names"]
    pure (.removeVariables (← json.getObjValAs? (List String) "names"))
  | other => throw s!"unknown command action kind {other}"

def deliveryTriggerFromJson (json : Json) : Except String DeliveryTrigger := do
  match ← kindOf json with
  | "message" => fields json ["kind", "channel"]; pure (.message (← channelFromJson (← json.getObjVal? "channel")))
  | "signal" => fields json ["kind"] ["name", "signalRef"]; pure (.signal (← signalAddressFromJson json) .targeted)
  | other => throw s!"unknown delivery trigger kind {other}"

def criterionTargetFromJson (json : Json) : Except String CriterionTarget := do
  match ← kindOf json with
  | "processVariable" => fields json ["kind", "name"]; pure (.processVariable (← json.getObjValAs? String "name"))
  | "localVariable" => fields json ["kind", "name"]; pure (.localVariable (← json.getObjValAs? String "name"))
  | "businessKey" => fields json ["kind"]; pure .businessKey
  | "processInstance" => fields json ["kind"]; pure .processInstance
  | other => throw s!"unknown correlation target kind {other}"

def correlationFromJson (json : Json) : Except String CorrelationMatch := do
  fields json ["target", "expected"]
  pure { target := ← criterionTargetFromJson (← json.getObjVal? "target")
         expected := ← valueAt (← json.getObjVal? "expected") }

def effectOutcomeFromJson (json : Json) : Except String EffectOutcome := do
  match ← kindOf json with
  | "success" => fields json ["kind", "outputs"]; pure (.success (← bindingsAt json "outputs"))
  | "businessFailure" =>
    fields json ["kind", "code", "outputs"] ["message"]
    pure (.businessFailure (← json.getObjValAs? String "code") (← optionalString json "message")
      (← bindingsAt json "outputs"))
  | "technicalFailure" => fields json ["kind"]; pure .technicalFailure
  | "unsupported" => fields json ["kind", "code"]; pure (.unsupported (← json.getObjValAs? String "code"))
  | other => throw s!"unknown effect outcome kind {other}"

/-- An input's ranking of competing Conditional items, `conditionChoices`: absent is `[]`; each entry is an object naming
one public element, so a later refinement adds a member without reinterpreting an entry. -/
def conditionChoicesFromJson (json : Json) : Except String (List ConditionChoice) := do
  match optionalField json "conditionChoices" with
  | none => pure []
  | some entries =>
    (← entries.getArr?).toList.mapM fun entry => do
      fields entry ["elementId"]
      pure { element := ⟨← entry.getObjValAs? String "elementId"⟩ }

/-- The members `conditionChoicesFromJson` reads back. -/
def conditionChoicesToJson (choices : List ConditionChoice) : Json :=
  Json.arr (choices.map fun choice => Json.mkObj [("elementId", Json.str choice.element.value)]).toArray

/-- The firing a start stimulus states when its trigger is a Timer: the start it names, if any, and the due instant its
trigger's logical time gives. A single-instance run checks it before the step (`Run.runStep`). -/
structure TimerFiring where
  startEvent : Option ElementId
  dueMs : Nat
  deriving Repr

/-- One scenario stimulus: its command identifier, the kernel input and the Timer firing it states. -/
def decodeStimulus (json : Json) : Except String (String × Input × Option TimerFiring) := do
  let kind ← kindOf json
  let common := ["kind", "commandId"]
  match kind with
  | "start" =>
    fields json (common ++ ["instanceId", "variables"]) ["startEvent", "trigger", "businessKey", "at", "conditionChoices"]
  | "command" => fields json (common ++ ["occurrence", "action"]) ["at", "conditionChoices"]
  | "deliver" =>
    fields json (common ++ ["occurrence", "trigger"]) ["correlation", "payload", "variables", "at", "conditionChoices"]
  | "timerFire" => fields json (common ++ ["occurrence", "logicalTimeMs"]) ["at", "conditionChoices"]
  | "effectResult" => fields json (common ++ ["occurrence", "outcome"]) ["at", "conditionChoices"]
  | _ => pure ()
  let commandId ← json.getObjValAs? String "commandId"
  -- `at`, the input's logical time in milliseconds, is optional; absent or null leaves the clock unchanged.
  let atMs ← (optionalField json "at").mapM fun value => Lean.fromJson? (α := Nat) value
  let conditionChoices ← conditionChoicesFromJson json
  let occurrence : Unit → Except String OccurrenceRef := fun _ => do occurrenceFromJson (← json.getObjVal? "occurrence")
  let (input, firing) : Input × Option TimerFiring ← match kind with
    | "start" =>
      let trigger ← (optionalField json "trigger").mapM startTriggerFromJson
      let startEvent := (← optionalString json "startEvent").map (⟨·⟩)
      let firing := trigger.bind fun
        | .timer dueMs => some { startEvent, dueMs }
        | .none | .message .. | .signal .. | .condition => none
      pure (.start { instanceId := ← json.getObjValAs? String "instanceId", startEvent
                     variables := ← bindingsAt json "variables", trigger := trigger.getD .none
                     businessKey := ← optionalString json "businessKey", atMs, conditionChoices }, firing)
    | "command" =>
      pure (.command { occurrence := ← occurrence (), action := ← commandActionFromJson (← json.getObjVal? "action")
                       atMs, conditionChoices }, none)
    | "deliver" =>
      let entries ← ((optionalField json "correlation").getD (Json.arr #[])).getArr?
      pure (.deliver { occurrence := ← occurrence (), trigger := ← deliveryTriggerFromJson (← json.getObjVal? "trigger")
                       correlation := ← entries.toList.mapM correlationFromJson
                       payload := ← (optionalField json "payload").mapM valueAt
                       variables := ← if (optionalField json "variables").isSome then bindingsAt json "variables" else pure []
                       atMs, conditionChoices }, none)
    | "timerFire" =>
      pure (.timerFire { occurrence := ← occurrence (), logicalTimeMs := ← json.getObjValAs? Nat "logicalTimeMs"
                         atMs, conditionChoices }, none)
    | "effectResult" =>
      pure (.effectResult { occurrence := ← occurrence ()
                            outcome := ← effectOutcomeFromJson (← json.getObjVal? "outcome"), atMs, conditionChoices }, none)
    | other => throw s!"unknown stimulus kind {other}"
  pure (commandId, input, firing)

/-- One scenario stimulus with the Timer firing it states, every refusal carrying its strict-decoding code. -/
def firingStimulusFromJson (json : Json) : Except String (String × Input × Option TimerFiring) :=
  (decodeStimulus json).mapError coded

/-- One scenario stimulus, every refusal carrying its strict-decoding code. -/
def stimulusFromJson (json : Json) : Except String (String × Input) :=
  (firingStimulusFromJson json).map fun (commandId, input, _) => (commandId, input)

/-- The refusal or failure code a failure carries. -/
def failureCode : Failure → String
  | .rejected code => code
  | .rolledBack code => code
  | .semanticFailure code => code
  | .unsupported code => code

def failureName : Failure → String
  | .rejected _ => "rejected"
  | .rolledBack _ => "rolledBack"
  | .semanticFailure _ => "semanticFailure"
  | .unsupported _ => "unsupported"

end Kernel.Codec
