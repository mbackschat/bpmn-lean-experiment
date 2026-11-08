module

public import Kernel.State
public import Lean.Data.Json

/-! # Kernel codecs

The kernel IL's wire form is Lean's derived JSON encoding of `Kernel.IL.Types`: a structure is an object, a nullary
constructor a string, any other constructor `{"<name>": {<arguments>}}`. Identifiers are plain strings, and a
`Value` uses the scenario contract's `variableValue` form. The TypeScript kernel mirrors this encoding, and a
round-trip fixture per schema variant keeps the two equal.
-/

public section

namespace Kernel.Codec

open Lean (Json FromJson ToJson fromJson? toJson)

instance : ToJson ElementId := ⟨fun id => Json.str id.value⟩
instance : FromJson ElementId := ⟨fun json => (ElementId.mk ·) <$> json.getStr?⟩
instance : ToJson FlowId := ⟨fun id => Json.str id.value⟩
instance : FromJson FlowId := ⟨fun json => (FlowId.mk ·) <$> json.getStr?⟩

partial def valueToJson : Value → Json
  | .null => Json.mkObj [("kind", "null")]
  | .bool value => Json.mkObj [("kind", "boolean"), ("value", toJson value)]
  | .int value => Json.mkObj [("kind", "integer"), ("value", toJson value)]
  | .decimal coefficient scale =>
    Json.mkObj [("kind", "decimal"), ("coefficient", toString coefficient), ("scale", toJson scale)]
  | .string value => Json.mkObj [("kind", "string"), ("value", Json.str value)]
  | .stringList items => Json.mkObj [("kind", "stringList"), ("value", toJson items)]
  | .list items => Json.mkObj [("kind", "list"), ("value", Json.arr (items.map valueToJson).toArray)]
  | .map entries =>
    Json.mkObj [("kind", "map"), ("value", Json.arr (entries.map fun (name, value) =>
      Json.mkObj [("name", Json.str name), ("value", valueToJson value)]).toArray)]

partial def valueFromJson (json : Json) : Except String Value := do
  match ← json.getObjValAs? String "kind" with
  | "null" => pure .null
  | "boolean" => .bool <$> json.getObjValAs? Bool "value"
  | "integer" => .int <$> json.getObjValAs? Int "value"
  | "decimal" =>
    let coefficient ← json.getObjValAs? String "coefficient"
    match coefficient.toInt? with
    | some value => .decimal value <$> json.getObjValAs? Nat "scale"
    | none => throw s!"invalid decimal coefficient {coefficient}"
  | "string" => .string <$> json.getObjValAs? String "value"
  | "stringList" => .stringList <$> json.getObjValAs? (List String) "value"
  | "list" => do
    let items ← json.getObjValAs? (Array Json) "value"
    .list <$> (items.toList.mapM valueFromJson)
  | "map" => do
    let entries ← json.getObjValAs? (Array Json) "value"
    .map <$> entries.toList.mapM fun entry => do
      pure (← entry.getObjValAs? String "name", ← valueFromJson (← entry.getObjVal? "value"))
  | other => throw s!"unknown value kind {other}"

instance : ToJson Value := ⟨valueToJson⟩
instance : FromJson Value := ⟨valueFromJson⟩

deriving instance FromJson, ToJson for SimpleBoolean, Expression, ValueSource, Mapping, CycleDialect,
  TimerSchedule, TimerTrigger, CorrelationCriterion, MessageTrigger, SignalTrigger, ConditionTrigger, ErrorTrigger,
  EscalationTrigger, Trigger, Subscription, Boundary, MessageThrow, SignalThrow, ErrorThrow, EscalationThrow,
  CompensationThrow, Throw, UserWork, ReceiveWork, ServiceWork, SendWork, ScriptWork, RuleWork, CallBinding,
  CallWork, Work, MultiInstanceMode, InstanceCount, MultiInstance, Envelope, ActivityPayload, ScopeKind,
  ScopePayload, Placement, EventRole, EventPayload, ConditionalFlow, EventArm, GatewayKind, GatewayPayload,
  StartPayload, Header, Element, Flow, ProgramIdentity, Program

/-- `[{name, value}]`, the scenario contract's variable bindings. -/
def bindingsFromJson (json : Json) : Except String (List (String × Value)) := do
  let entries ← fromJson? (α := Array Json) json
  entries.toList.mapM fun entry => do
    pure (← entry.getObjValAs? String "name", ← valueFromJson (← entry.getObjVal? "value"))

def bindingsToJson (bindings : List (String × Value)) : Json :=
  Json.arr (bindings.map fun (name, value) =>
    Json.mkObj [("name", Json.str name), ("value", valueToJson value)]).toArray

/-- One scenario stimulus: its command identifier and the kernel input, or `none` for a stimulus kind the kernel
does not accept yet. -/
def stimulusFromJson (json : Json) : Except String (String × Option Input) := do
  let commandId ← json.getObjValAs? String "commandId"
  match ← json.getObjValAs? String "kind" with
  | "startProcess" =>
    let instanceId ← json.getObjValAs? String "instanceId"
    let variables ← bindingsFromJson ((json.getObjVal? "initialVariables").toOption.getD (Json.arr #[]))
    pure (commandId, some (.start { instanceId, variables }))
  | "completeUserTaskInstance" =>
    let task ← json.getObjVal? "taskId"
    let element ← ElementId.mk <$> task.getObjValAs? String "elementId"
    let activation ← task.getObjValAs? Nat "activation"
    let values ← bindingsFromJson ((json.getObjVal? "submittedValues").toOption.getD (Json.arr #[]))
    pure (commandId, some (.command { occurrence := { element, activation }, action := .completeUserTask values }))
  | _ => pure (commandId, none)

def failureName : Failure → String
  | .rejected _ => "rejected"
  | .semanticFailure _ => "semanticFailure"
  | .unsupported _ => "unsupported"

end Kernel.Codec
