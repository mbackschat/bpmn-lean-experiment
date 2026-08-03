import BpmnSemantics.SemanticProcess.JsonSupport

/-! # Semantic-element wire decoders shared by both definition representations

A checked BPMN graph and a Semantic Process program describe the same data-mapping, effect, error, and
scope elements, so these decoders have exactly two callers and one meaning. They are public because
that sharing crosses a module boundary, not because the wire shape is an extension point. -/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open Lean

def decodeMappingExpression (json : Json) :
    Except String MappingExpression := do
  let kind ← stringField json "kind"
  match kind with
  | "stringLiteral" =>
      requireObjectShape json ["kind", "value"]
      pure (.stringLiteral (← stringField json "value"))
  | "localVariable" =>
      requireObjectShape json ["kind", "name"]
      pure (.localVariable (← stringField json "name"))
  | _ => throw s!"unsupported mapping expression {kind}"

def decodeVariableMapping (json : Json) :
    Except String VariableMapping := do
  requireObjectShape json ["expression", "target"]
  pure
    { target := ← stringField json "target"
      expression := ← decodeMappingExpression (← field json "expression") }

def decodeEffectDescriptor (json : Json) :
    Except String EffectDescriptor := do
  requireObjectShape json ["operation", "protocol"]
  pure
    { protocol := ← stringField json "protocol"
      operation := ← stringField json "operation" }

def decodeErrorReference (json : Json) :
    Except String ErrorReference := do
  requireObjectShape json ["code", "errorDefinitionId", "errorElementId"]
  pure
    { errorDefinitionId := ⟨← stringField json "errorDefinitionId"⟩
      errorElementId := ⟨← stringField json "errorElementId"⟩
      code := ← stringField json "code" }

def decodeDefinitionScope (json : Json) : Except String DefinitionScope := do
  requireObjectShape json ["id", "originElementId", "parentScopeId"]
  pure
    { id := ⟨← stringField json "id"⟩
      parentScopeId :=
        (← decodeOptionalString (← field json "parentScopeId")).map
          DefinitionScopeId.mk
      originElementId := ⟨← stringField json "originElementId"⟩ }

end BpmnSemantics.SemanticProcessJson
