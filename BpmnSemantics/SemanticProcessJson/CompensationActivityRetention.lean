import BpmnSemantics.SemanticProcess.JsonSupport

/-! # Compensation Activity retention wire decoding

Strict decoding for the optional hidden Program declaration. Operation and root consistency remain a
semantic validation performed after the complete Program is available.
-/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics.SemanticProcess
open Lean

private def decodeBoundaryCompensationTarget (json : Json) :
    Except String BoundaryCompensationTarget := do
  requireObjectShape json
    ["activityElementId", "boundaryEventElementId", "compensationActivityElementId"]
  pure
    { activityElementId := ⟨← decodeNonemptyStringField json "activityElementId"⟩
      boundaryEventElementId := ⟨← decodeNonemptyStringField json "boundaryEventElementId"⟩
      compensationActivityElementId :=
        ⟨← decodeNonemptyStringField json "compensationActivityElementId"⟩ }

private def decodeCompensationActivityRetentionDeclaration (json : Json) :
    Except String CompensationActivityRetentionDeclaration := do
  requireObjectShape json ["definitionScopeId", "limits", "targets"]
  let limits ← field json "limits"
  requireObjectShape limits ["maxCanonicalBytes", "maxRecords"]
  let maxRecords ← decodeSafeNat (← field limits "maxRecords")
  let maxCanonicalBytes ← decodeSafeNat (← field limits "maxCanonicalBytes")
  if maxRecords = 0 then throw "compensation retention maxRecords must be positive"
  if maxCanonicalBytes < 2 || maxCanonicalBytes > 65536 then
    throw "compensation retention maxCanonicalBytes must be from 2 through 65536"
  let targets ← decodeArray decodeBoundaryCompensationTarget (← field json "targets")
  if targets.isEmpty then throw "compensation retention targets must be nonempty"
  pure
    { definitionScopeId := ⟨← decodeNonemptyStringField json "definitionScopeId"⟩
      targets
      maxRecords
      maxCanonicalBytes }

def decodeCompensationActivityRetentionField (json : Json) :
    Except String (Option CompensationActivityRetentionDeclaration) := do
  match ← optionalField json "compensationActivityRetention" with
  | none => pure none
  | some declaration => some <$> decodeCompensationActivityRetentionDeclaration declaration

end BpmnSemantics.SemanticProcessJson
