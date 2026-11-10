module

public import Kernel.IL.Types.Decision
public import Lean.Data.Json

/-! # Decision codecs

The DMN decision tables' wire form (`Kernel.IL.Types.Decision`): Lean's derived encoding, except a FEEL number,
whose coefficient travels as decimal text. Part of `Kernel.Codec`, which re-exports it.
-/

public section

namespace Kernel.Codec

open Lean (Json FromJson ToJson fromJson? toJson)

/-- A FEEL number's coefficient travels as decimal text, as a `decimal` value's does, so the TypeScript codec reads a
literal beyond the safe integers exactly; admission refuses it (`decision.number`). -/
def feelLiteralToJson : FeelLiteral → Json
  | .null => "null"
  | .bool value => Json.mkObj [("bool", Json.mkObj [("value", toJson value)])]
  | .number coefficient scale =>
    Json.mkObj [("number", Json.mkObj [("coefficient", toString coefficient), ("scale", toJson scale)])]
  | .string value => Json.mkObj [("string", Json.mkObj [("value", Json.str value)])]

def feelLiteralFromJson (json : Json) : Except String FeelLiteral := do
  match json with
  | .str "null" => pure .null
  | _ =>
    if let .ok payload := json.getObjVal? "bool" then .bool <$> payload.getObjValAs? Bool "value"
    else if let .ok payload := json.getObjVal? "string" then .string <$> payload.getObjValAs? String "value"
    else
      let payload ← json.getObjVal? "number"
      let coefficient ← payload.getObjValAs? String "coefficient"
      match coefficient.toInt? with
      | some value => .number value <$> payload.getObjValAs? Nat "scale"
      | none => throw s!"invalid number coefficient {coefficient}"

instance : ToJson FeelLiteral := ⟨feelLiteralToJson⟩
instance : FromJson FeelLiteral := ⟨feelLiteralFromJson⟩

deriving instance FromJson, ToJson for TypeRef, Comparison, Interval, UnaryTest, TestList, ForeignText, InputEntry,
  OutputEntry, InputExpression, DecisionInput, DecisionOutput, DecisionRule, HitPolicy, CollectAggregator,
  DecisionTable, DecisionLogic, Decision, DecisionResource

end Kernel.Codec
