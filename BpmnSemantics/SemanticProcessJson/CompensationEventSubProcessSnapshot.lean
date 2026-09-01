import BpmnSemantics.SemanticProcess.JsonSupport

/-! # Compensation Event Sub-Process snapshot declaration decoding

Strict decoding for the optional hidden Program declaration. Structural scope and dormant-handler
validity remain semantic admission obligations over the complete Program.
-/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics.SemanticProcess
open Lean

private def decodeSnapshotTarget (json : Json) :
    Except String CompensationEventSubProcessSnapshotTarget := do
  requireObjectShape json ["handlerScopeId", "parentScopeId"]
  pure
    { parentScopeId := ⟨← decodeNonemptyStringField json "parentScopeId"⟩
      handlerScopeId := ⟨← decodeNonemptyStringField json "handlerScopeId"⟩ }

private def decodeSnapshotDeclaration (json : Json) :
    Except String CompensationEventSubProcessSnapshotDeclaration := do
  requireObjectShape json ["limits", "targets"]
  let limits ← field json "limits"
  requireObjectShape limits ["maxCanonicalBytes", "maxRecords"]
  let maxRecords ← decodeSafeNat (← field limits "maxRecords")
  let maxCanonicalBytes ← decodeSafeNat (← field limits "maxCanonicalBytes")
  if maxRecords = 0 then throw "snapshot maxRecords must be positive"
  if maxCanonicalBytes < 2 || maxCanonicalBytes > 65536 then
    throw "snapshot maxCanonicalBytes must be from 2 through 65536"
  let targets ← decodeArray decodeSnapshotTarget (← field json "targets")
  if targets.isEmpty then throw "snapshot targets must be nonempty"
  pure { targets, maxRecords, maxCanonicalBytes }

def decodeCompensationEventSubProcessSnapshotsField (json : Json) :
    Except String (Option CompensationEventSubProcessSnapshotDeclaration) := do
  match ← optionalField json "compensationEventSubProcessSnapshots" with
  | none => pure none
  | some declaration => some <$> decodeSnapshotDeclaration declaration

end BpmnSemantics.SemanticProcessJson
