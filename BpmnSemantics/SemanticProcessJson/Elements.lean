module

public import BpmnSemantics.SemanticProcess.JsonSupport
public import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants

/-! # Semantic-element wire decoders shared by both definition representations

A checked BPMN graph and a Semantic Process program describe the same data-mapping, effect, error, and
scope elements, so these decoders have exactly two callers and one meaning. They are public because
that sharing crosses a module boundary, not because the wire shape is an extension point. -/

@[expose] public section

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
  | "enclosingVariable" =>
      requireObjectShape json ["kind", "name"]
      pure (.enclosingVariable (← stringField json "name"))
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

def decodeScopeLocalData (json : Json) : Except String ScopeLocalData := do
  requireObjectShape json ["localInputs", "localOutputs", "scopeId"]
  pure
    { scopeId := ⟨← stringField json "scopeId"⟩
      localInputs := ← decodeArray decodeVariableMapping (← field json "localInputs")
      localOutputs := ← decodeArray decodeVariableMapping (← field json "localOutputs") }

/-- The optional `scopeLocalData` table is absent unless nonempty, so an empty array is a second
spelling of "no table" and is refused rather than normalized. -/
def decodeScopeLocalDataField (json : Json) : Except String (List ScopeLocalData) := do
  match ← optionalField json "scopeLocalData" with
  | none => pure []
  | some table =>
      let records ← decodeArray decodeScopeLocalData table
      if records.isEmpty then throw "scopeLocalData must be absent or nonempty" else pure records

def decodeDefinitionScope (json : Json) : Except String DefinitionScope := do
  requireObjectShape json ["id", "originElementId", "parentScopeId"]
  pure
    { id := ⟨← stringField json "id"⟩
      parentScopeId :=
        (← decodeOptionalString (← field json "parentScopeId")).map
          DefinitionScopeId.mk
      originElementId := ⟨← stringField json "originElementId"⟩ }

def decodeDirectCatchEventPayloadOutput (json : Json) :
    Except String DirectCatchEventPayloadOutput := do
  requireObjectShape json
    ["associationId", "sourceDataOutputId", "sourceDataOutputName", "targetPropertyId"]
  pure
    { associationId := ← stringField json "associationId"
      sourceDataOutputId := ← stringField json "sourceDataOutputId"
      sourceDataOutputName := ← decodeOptionalString (← field json "sourceDataOutputName")
      targetPropertyId := ← stringField json "targetPropertyId" }

def decodeSequentialMultiInstanceInput (json : Json) :
    Except String SequentialMultiInstanceInputDefinition := do
  requireObjectShape json
    ["collectionAssociationId", "collectionItemDefinitionId", "dataObjectId",
      "dataObjectReferenceId", "inputDataItemId", "itemAssociationId",
      "loopDataInputId", "scalarItemDefinitionId", "taskDataInputId"]
  pure
    { collectionItemDefinitionId := ← stringField json "collectionItemDefinitionId"
      scalarItemDefinitionId := ← stringField json "scalarItemDefinitionId"
      dataObjectId := ← stringField json "dataObjectId"
      dataObjectReferenceId := ← stringField json "dataObjectReferenceId"
      loopDataInputId := ← stringField json "loopDataInputId"
      inputDataItemId := ← stringField json "inputDataItemId"
      taskDataInputId := ← stringField json "taskDataInputId"
      collectionAssociationId := ← stringField json "collectionAssociationId"
      itemAssociationId := ← stringField json "itemAssociationId" }

def decodeSequentialMultiInstanceOutput (json : Json) :
    Except String SequentialMultiInstanceOutputDefinition := do
  requireObjectShape json
    ["collectionAssociationId", "dataObjectId", "dataObjectReferenceId",
      "itemAssociationId", "loopDataOutputId", "outputDataItemId",
      "taskDataOutputId"]
  pure
    { dataObjectId := ← stringField json "dataObjectId"
      dataObjectReferenceId := ← stringField json "dataObjectReferenceId"
      taskDataOutputId := ← stringField json "taskDataOutputId"
      outputDataItemId := ← stringField json "outputDataItemId"
      loopDataOutputId := ← stringField json "loopDataOutputId"
      itemAssociationId := ← stringField json "itemAssociationId"
      collectionAssociationId := ← stringField json "collectionAssociationId" }

end BpmnSemantics.SemanticProcessJson
