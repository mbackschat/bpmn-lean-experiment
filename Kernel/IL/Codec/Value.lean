module

public import Kernel.IL.Types
public import Lean.Data.Json

/-! # Identifier and value codecs

Element and flow identifiers travel as plain strings, and a `Value` in the scenario contract's `variableValue`
form. Part of `Kernel.Codec`, which re-exports it.
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

end Kernel.Codec
