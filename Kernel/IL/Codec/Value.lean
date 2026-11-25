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
  | .double bits => Json.mkObj [("kind", "double"), ("bits", toString bits)]
  | .date epochMs => Json.mkObj [("kind", "date"), ("epochMs", toString epochMs)]
  | .string value => Json.mkObj [("kind", "string"), ("value", Json.str value)]
  | .stringList items => Json.mkObj [("kind", "stringList"), ("value", toJson items)]
  | .list items => Json.mkObj [("kind", "list"), ("value", Json.arr (items.map valueToJson).toArray)]
  | .map entries =>
    Json.mkObj [("kind", "map"), ("value", Json.arr (entries.map fun (name, value) =>
      Json.mkObj [("name", Json.str name), ("value", valueToJson value)]).toArray)]

/-- The bound of a wire number: TypeScript reads a JSON number as a double, exact only up to `2^53 − 1`, and its
decoders refuse a larger magnitude. These instances outrank Lean's own `FromJson Nat` and `FromJson Int`, so every
decode that reaches a number through `FromJson` (the derived IL decoders, `getObjValAs?` and `fromJson?`) refuses it
too and both kernels decode the same wire; a raw `Json.getNat?` or `Json.getInt?` would bypass them, which guard 11 refuses. -/
def maxSafeInteger : Nat := 9007199254740991

instance (priority := high) boundedNat : FromJson Nat := ⟨fun json => do
  -- guard-exception(11): the bounded decoder itself reads the raw number.
  let value ← json.getNat?
  if value ≤ maxSafeInteger then pure value else throw s!"Natural number expected, got {value}"⟩

instance (priority := high) boundedInt : FromJson Int := ⟨fun json => do
  -- guard-exception(11): the bounded decoder itself reads the raw number.
  let value ← json.getInt?
  if value.natAbs ≤ maxSafeInteger then pure value else throw s!"Integer expected, got {value}"⟩

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
  | "double" =>
    let bits ← json.getObjValAs? String "bits"
    match bits.toInt? with
    | some value => if 0 ≤ value && value < 2 ^ 64 then pure (.double value.toNat.toUInt64) else
        throw s!"invalid double bits {bits}"
    | none => throw s!"invalid double bits {bits}"
  | "date" =>
    let epochMs ← json.getObjValAs? String "epochMs"
    match epochMs.toInt? with
    | some value => if -2 ^ 63 ≤ value && value < 2 ^ 63 then pure (.date value) else throw s!"invalid date {epochMs}"
    | none => throw s!"invalid date {epochMs}"
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
