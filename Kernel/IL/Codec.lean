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

deriving instance FromJson, ToJson for SimpleBoolean, Expression, ValueSource, MappingDialect, Mapping, CycleDialect,
  TimerSchedule, TimerTrigger, CorrelationCriterion, MessageTrigger, SignalTrigger, ConditionTrigger, ErrorTrigger,
  EscalationTrigger, Trigger, Subscription, Boundary, EffectBinding, MessageThrow, SignalThrow, ErrorThrow,
  EscalationThrow, CompensationThrow, Throw, UserWork, ReceiveWork, ServiceWork, SendWork, ScriptWork, CallBinding,
  DecisionResultMapping, RuleWork, CallWork, Work, MultiInstanceMode, InstanceCount, CollectionRead, MultiInstance,
  Envelope, ActivityPayload, TransactionMethod, TransactionScope, ScopeKind, ScopePayload, Placement, EventRole,
  EventPayload, GatewayKind, GatewayPayload, StartPayload, DefinitionRef, ElementOrigin, Header, Element,
  Flow, ProgramIdentity, SubmissionRule, UndeclaredWrite, ErrorPathOutputs, TechnicalFailure, ContinuationFailure,
  MessageCorrelation, DeliveryVariables, MultiInstanceFinalBody, MultiInstanceOutputs, CompensationOrder,
  CompensationHandlerFailure, AbnormalScopeEnd, UnhandledError, ErrorCatchVariables, CallBindingTime, Evaluator, ConditionOrder,
  MultiInstanceBinding, ResultValues, ProfileOptions, CalledProcess, Program

/-- `[{name, value}]`, the scenario contract's variable bindings. -/
def bindingsFromJson (json : Json) : Except String (List (String × Value)) := do
  let entries ← fromJson? (α := Array Json) json
  entries.toList.mapM fun entry => do
    pure (← entry.getObjValAs? String "name", ← valueFromJson (← entry.getObjVal? "value"))

/-! ## Strict decoding

Lean's derived decoders ignore unknown keys and read an absent field as `null`, and `Json.parse` keeps the last of
repeated keys. A codec input is therefore accepted only when its text repeats no key and its JSON is exactly the
canonical encoding of the value it decodes to; every refusal begins with one of these stable codes. -/

def duplicateField : String := "codec.duplicateField"
def unknownField : String := "codec.unknownField"
def missingField : String := "codec.missingField"
def malformed : String := "codec.malformed"

/-- Prefix a refusal that carries no code with `codec.malformed`. -/
def coded (refusal : String) : String :=
  if refusal.startsWith "codec." then refusal else s!"{malformed}: {refusal}"

/-- Object members in `text`: each member has the one `:` outside a string. -/
def textMembers (text : String) : Nat :=
  let (count, _, _) := text.foldl (fun (count, inString, escaped) char =>
    if inString then
      if escaped then (count, true, false)
      else if char == '\\' then (count, true, true)
      else (count, char != '"', false)
    else if char == '"' then (count, true, false)
    else if char == ':' then (count + 1, false, false)
    else (count, false, false)) (0, false, false)
  count

partial def jsonMembers : Json → Nat
  | .obj members => members.foldl (fun count _ value => count + jsonMembers value) members.size
  | .arr items => items.foldl (fun count item => count + jsonMembers item) 0
  | _ => 0

/-- `Json.parse`, refusing a text whose objects repeat a key: parsing keeps one member per key, so the text then has
more members than the parsed JSON. -/
def parseStrict (text : String) : Except String Json := do
  let json ← (Json.parse text).mapError coded
  if textMembers text == jsonMembers json then pure json
  else throw s!"{duplicateField}: an object repeats a key"

/-- The first place `input` departs from the key structure of `canonical`, in key order, else `none`. -/
partial def shapeRefusal (path : String) (input canonical : Json) : Option String :=
  match input, canonical with
  | .obj given, .obj expected =>
    match given.keys.find? (fun key => !(expected.keys.contains key)) with
    | some key => some s!"{unknownField}: {path}.{key}"
    | none =>
      match expected.keys.find? (fun key => !(given.keys.contains key)) with
      | some key => some s!"{missingField}: {path}.{key}"
      | none => expected.keys.findSome? fun key =>
          shapeRefusal s!"{path}.{key}" (input.getObjValD key) (canonical.getObjValD key)
  | .arr given, .arr expected =>
    (List.range (min given.size expected.size)).findSome? fun index =>
      shapeRefusal s!"{path}[{index}]" given[index]! expected[index]!
  | .obj _, _ => some s!"{malformed}: {path} is an object"
  | _, _ => none

/-- Decode `json` through `decode` and accept it only in the canonical encoding `encode` gives. -/
def strictly {α : Type} (decode : Json → Except String α) (encode : α → Json) (json : Json) : Except String α := do
  let value ← (decode json).mapError coded
  match shapeRefusal "$" json (encode value) with
  | some refusal => throw refusal
  | none => pure value

/-- A kernel IL program, strictly. -/
def programFromJson (json : Json) : Except String Program :=
  strictly (fromJson? (α := Program)) toJson json

def bindingsToJson (bindings : List (String × Value)) : Json :=
  Json.arr (bindings.map fun (name, value) =>
    Json.mkObj [("name", Json.str name), ("value", valueToJson value)]).toArray

end Kernel.Codec
