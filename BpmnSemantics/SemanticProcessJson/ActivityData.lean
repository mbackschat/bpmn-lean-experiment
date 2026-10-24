module

public import BpmnSemantics.SemanticProcess.JsonSupport

/-! Shared closed endpoint decoding keeps checked and executable Activity contracts aligned. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics.SemanticProcess
open Lean

def decodeActivityDataInputSource (json : Json) : Except String ActivityDataInputSource := do
  match ← stringField json "kind" with
  | "property" =>
      requireObjectShape json ["kind", "propertyId"]
      pure (.property (← stringField json "propertyId"))
  | "processDataInput" =>
      requireObjectShape json ["kind", "dataInputId"]
      pure (.processDataInput (← stringField json "dataInputId"))
  | kind => throw s!"unsupported Activity input source {kind}"

def decodeActivityDataOutputTarget (json : Json) : Except String ActivityDataOutputTarget := do
  match ← stringField json "kind" with
  | "property" =>
      requireObjectShape json ["kind", "propertyId"]
      pure (.property (← stringField json "propertyId"))
  | "processDataOutput" =>
      requireObjectShape json ["kind", "dataOutputId"]
      pure (.processDataOutput (← stringField json "dataOutputId"))
  | kind => throw s!"unsupported Activity output target {kind}"

/-- Both checked and executable wire forms use the same closed directional endpoint contract. -/
def decodeDirectActivityDataInput (json : Json) : Except String DirectActivityDataInput := do
  requireObjectShape json ["associationId", "source", "targetDataInputId", "targetDataInputName"]
  pure
    { associationId := ← stringField json "associationId"
      source := ← decodeActivityDataInputSource (← field json "source")
      targetDataInputId := ← stringField json "targetDataInputId"
      targetDataInputName := ← decodeOptionalString (← field json "targetDataInputName") }

/-- Port and Property IDs remain directional even when their display names coincide. -/
def decodeDirectActivityDataOutput (json : Json) : Except String DirectActivityDataOutput := do
  requireObjectShape json ["associationId", "sourceDataOutputId", "sourceDataOutputName", "target"]
  pure
    { associationId := ← stringField json "associationId"
      sourceDataOutputId := ← stringField json "sourceDataOutputId"
      sourceDataOutputName := ← decodeOptionalString (← field json "sourceDataOutputName")
      target := ← decodeActivityDataOutputTarget (← field json "target") }

end BpmnSemantics.SemanticProcessJson
