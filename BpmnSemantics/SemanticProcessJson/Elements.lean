import BpmnSemantics.SemanticProcess.JsonSupport

/-! # Semantic-element wire decoders shared by both definition representations

A checked BPMN graph and a Semantic Process program describe the same data-mapping, effect, error, and
scope elements, so these decoders have exactly two callers and one meaning. They are public because
that sharing crosses a module boundary, not because the wire shape is an extension point. -/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open Lean

def decodeProgramIdentity (json : Json) :
    Except String ProgramIdentity := do
  requireObjectShape json
    ["compiler", "semanticProfile", "sourceId", "sourceOverlay",
      "sourceSha256"]
  expectStringField json "compiler" "bpmn-source-semantic-process"
  pure
    { compiler := .bpmnSourceSemanticProcess
      semanticProfile := ⟨← stringField json "semanticProfile"⟩
      sourceId := ⟨← stringField json "sourceId"⟩
      sourceOverlay :=
        ← decodeSourceOverlayIdentity (← field json "sourceOverlay")
      sourceSha256 := ← stringField json "sourceSha256" }

def decodeCorrelationMessagePath (json : Json) :
    Except String CorrelationMessagePath := do
  requireObjectShape json ["body", "language"]
  let language ← stringField json "language"
  let body ← stringField json "body"
  match decodeCorrelationMessagePath? language body with
  | some path => pure path
  | none => throw "unsupported Message correlation payload selector"

def decodeCorrelationProcessPropertyPath (json : Json) :
    Except String CorrelationProcessPropertyPath := do
  requireObjectShape json ["body", "language", "propertyId"]
  let language ← stringField json "language"
  let body ← stringField json "body"
  let propertyId ← stringField json "propertyId"
  match decodeCorrelationProcessPropertyPath? language body propertyId with
  | some path => pure path
  | none => throw "unsupported Message correlation Process Property selector"

def decodeCorrelatedMessageAddress (json : Json) :
    Except String CorrelatedMessageAddress := do
  requireObjectShape json
    ["channel", "correlationKeyId", "definition", "processId"]
  let definition ← decodeProgramIdentity (← field json "definition")
  if definition.semanticProfile.value.isEmpty || definition.sourceId.value.isEmpty ||
      !lowercaseHexSha256 definition.sourceSha256 then
    throw "invalid correlated Message definition identity"
  pure
    { definition
      processId := ⟨← decodeNonemptyStringField json "processId"⟩
      channel := ← decodeOperationMessageChannel (← field json "channel")
      correlationKeyId := ← decodeNonemptyStringField json "correlationKeyId" }

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
