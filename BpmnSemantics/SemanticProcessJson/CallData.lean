module

public import BpmnSemantics.SemanticProcessJson.ActivityData
public import BpmnSemantics.SemanticProcessJson.Elements

/-! Closed Call data decoding preserves declarations; contextual admission owns correspondence. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics.SemanticProcess
open Lean

def decodeIdentity (json : Json) : Except String String := do
  let value ← json.getStr?
  if nonempty value then pure value else throw "Call data identity must be non-empty"

def decodePort (json : Json) : Except String ScalarIoPort := do
  requireObjectShape json ["id", "name"]
  pure { id := ← decodeNonemptyStringField json "id"
         name := ← decodeOptionalString (← field json "name") }

def decodeInputSet (json : Json) : Except String ScalarIoInputSet := do
  requireObjectShape json ["id", "name", "dataInputRefs"]
  pure { id := ← decodeNonemptyStringField json "id"
         name := ← decodeOptionalString (← field json "name")
         dataInputRefs := ← decodeArray decodeIdentity (← field json "dataInputRefs") }

def decodeOutputSet (json : Json) : Except String ScalarIoOutputSet := do
  requireObjectShape json ["id", "name", "dataOutputRefs"]
  pure { id := ← decodeNonemptyStringField json "id"
         name := ← decodeOptionalString (← field json "name")
         dataOutputRefs := ← decodeArray decodeIdentity (← field json "dataOutputRefs") }

def decodeIo (json : Json) : Except String ScalarIoSpecification := do
  requireObjectShape json ["ownerId", "id", "input", "output", "inputSet", "outputSet"]
  pure { ownerId := ← decodeNonemptyStringField json "ownerId"
         id := ← decodeNonemptyStringField json "id"
         input := ← decodePort (← field json "input")
         output := ← decodePort (← field json "output")
         inputSet := ← decodeInputSet (← field json "inputSet")
         outputSet := ← decodeOutputSet (← field json "outputSet") }

/-- Decode explicit variants without inferring correspondence or defaulting missing declarations. -/
def decodeCallDataInterface (json : Json) : Except String CallDataInterface := do
  match ← stringField json "kind" with
  | "empty" =>
      requireObjectShape json ["kind"]
      pure .empty
  | "scalar" =>
      requireObjectShape json ["kind", "callerProperties", "call", "called", "directInput", "directOutput"]
      let directInput ← decodeDirectActivityDataInput (← field json "directInput")
      let directOutput ← decodeDirectActivityDataOutput (← field json "directOutput")
      if ![directInput.associationId, directInput.source.id, directInput.targetDataInputId,
          directOutput.associationId, directOutput.sourceDataOutputId, directOutput.target.id].all nonempty then
        throw "Call association identities must be non-empty"
      pure (.scalar
        { callerProperties := ← decodeArray decodeIdentity (← field json "callerProperties")
          call := ← decodeIo (← field json "call")
          called := ← decodeIo (← field json "called")
          directInput, directOutput })
  | "variableMappings" =>
      requireObjectShape json ["kind", "inputs", "outputs"]
      pure (.variableMappings (← decodeArray decodeVariableMapping (← field json "inputs"))
        (← decodeArray decodeVariableMapping (← field json "outputs")))
  | kind => throw s!"unsupported Call data interface {kind}"

end BpmnSemantics.SemanticProcessJson
