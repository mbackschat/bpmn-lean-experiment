import BpmnSemantics.SemanticProcessContract
import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import BpmnSemantics.StrictJson
import Lean.Data.Json

/-! # Semantic Process JSON value support

This module owns the strict reusable decoders for safe wire integers, identities, Message channels, variables, and typed effect results. Document-role decoders and cross-artifact validation remain in `SemanticProcessJson`.
-/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics
open Lean

def maxSafeWireNat : Nat := 9007199254740991

def isSafeWireNat (value : Nat) : Bool :=
  value ≤ maxSafeWireNat

def parseWireJson (contents : String) : Except String Json :=
  BpmnSemantics.StrictJson.parse contents

def decodeSafeNat (json : Json) : Except String Nat := do
  let value ← json.getNat?
  if isSafeWireNat value then
    pure value
  else
    throw s!"wire integer exceeds {maxSafeWireNat}"

def requireObjectShape (json : Json) (keys : List String) :
    Except String Unit :=
  match json with
  | .obj object =>
      if object.size = keys.length &&
          keys.all fun key => (object.get? key).isSome then
        pure ()
      else
        throw s!"object fields do not match {keys}"
  | _ => throw "object expected"

def field (json : Json) (key : String) : Except String Json :=
  json.getObjVal? key

def optionalField (json : Json) (key : String) :
    Except String (Option Json) :=
  match json with
  | .obj object => pure (object.get? key)
  | _ => throw "object expected"

def stringField (json : Json) (key : String) : Except String String := do
  (← field json key).getStr?

/-- Decode one required string field whose empty value cannot denote an identity. -/
def decodeNonemptyStringField (json : Json) (key : String) :
    Except String String := do
  let value ← stringField json key
  if SemanticProcess.nonempty value then
    pure value
  else
    throw s!"{key} must be non-empty"

/-- Decode one semantic identity field whose empty string has no legal runtime meaning. -/
def decodeSemanticIdentityField (json : Json) (key : String) :
    Except String SemanticId := do
  pure ⟨← decodeNonemptyStringField json key⟩

def expectString (json : Json) (expected : String) :
    Except String Unit := do
  let actual ← json.getStr?
  if actual = expected then
    pure ()
  else
    throw s!"expected {expected}, got {actual}"

def expectStringField (json : Json) (key expected : String) :
    Except String Unit := do
  expectString (← field json key) expected

def decodeArray (decode : Json → Except String α) (json : Json) :
    Except String (List α) := do
  let values ← json.getArr?
  values.toList.mapM decode

def decodeOptionalString : Json → Except String (Option String)
  | .null => pure none
  | .str value => pure (some value)
  | _ => throw "string or null expected"

private def decodeUserTaskCandidate (json : Json) :
    Except String UserTaskCandidate := do
  requireObjectShape json ["id", "kind"]
  expectStringField json "kind" "group"
  pure { kind := .group, id := ← stringField json "id" }

private def decodeUserTaskFormField (json : Json) :
    Except String UserTaskFormField := do
  requireObjectShape json ["key", "type"]
  let fieldType ←
    match ← stringField json "type" with
    | "string" => pure UserTaskFormFieldType.string
    | "boolean" => pure UserTaskFormFieldType.boolean
    | value => throw s!"unsupported User Task field type {value}"
  pure { key := ← stringField json "key", type := fieldType }

/-- Strictly decode the exact neutral singleton metadata contract and its literal-domain predicate. -/
def decodeUserTaskMetadata (json : Json) : Except String UserTaskMetadata := do
  requireObjectShape json ["assignment", "form"]
  let assignment ← field json "assignment"
  requireObjectShape assignment ["candidates"]
  let form ← field json "form"
  requireObjectShape form ["fields"]
  let metadata : UserTaskMetadata :=
    { assignment :=
        { candidates :=
            ← decodeArray decodeUserTaskCandidate
              (← field assignment "candidates") }
      form :=
        { fields :=
            ← decodeArray decodeUserTaskFormField (← field form "fields") } }
  if metadata.wellFormed then pure metadata
  else throw "User Task metadata is not well formed"

/-- Decode an optional metadata member while preserving physical absence and refusing `null`. -/
def decodeOptionalUserTaskMetadataField (json : Json) :
    Except String (Option UserTaskMetadata) := do
  match ← optionalField json "metadata" with
  | none => pure none
  | some value => some <$> decodeUserTaskMetadata value

private def userTaskCandidateJson (candidate : UserTaskCandidate) : Json :=
  match candidate.kind with
  | .group =>
      Json.mkObj
        [ ("kind", toJson "group")
        , ("id", toJson candidate.id) ]

private def userTaskFormFieldJson (field : UserTaskFormField) : Json :=
  let type := match field.type with
    | .string => "string"
    | .boolean => "boolean"
  Json.mkObj
    [ ("key", toJson field.key)
    , ("type", toJson type) ]

/-- Canonically encode the exact neutral metadata shape without optional-field policy. -/
def encodeUserTaskMetadata (metadata : UserTaskMetadata) : Json :=
  Json.mkObj
    [ ("assignment",
        Json.mkObj
          [("candidates",
            .arr (metadata.assignment.candidates.map userTaskCandidateJson).toArray)])
    , ("form",
        Json.mkObj
          [("fields",
            .arr (metadata.form.fields.map userTaskFormFieldJson).toArray)]) ]

def decodeSourceOverlayIdentity : Json →
    Except String (Option SourceOverlayIdentity)
  | .null => pure none
  | json => do
      requireObjectShape json ["id", "sha256"]
      let id ← stringField json "id"
      let sha256 ← stringField json "sha256"
      if SemanticProcess.nonempty id &&
          SemanticProcess.lowercaseHexSha256 sha256 then
        pure (some { id := ⟨id⟩, sha256 })
      else
        throw "invalid source overlay identity"

def decodeStringArray (json : Json) :
    Except String (List String) :=
  decodeArray Json.getStr? json

def decodeResourceIdentity (json : Json) :
    Except String ResourceIdentity := do
  requireObjectShape json ["id", "relativePath", "sha256", "sourceOverlay"]
  pure
    { id := ⟨← stringField json "id"⟩
      relativePath := ← stringField json "relativePath"
      sha256 := ← stringField json "sha256"
      sourceOverlay :=
        ← decodeSourceOverlayIdentity (← field json "sourceOverlay") }

def decodeOccurrenceId (json : Json) :
    Except String OccurrenceId := do
  requireObjectShape json
    ["activation", "elementId", "processInstanceId"]
  let activation ← decodeSafeNat (← field json "activation")
  if activation = 0 then
    throw "occurrence activation must be positive"
  pure
    { processInstanceId := ⟨← stringField json "processInstanceId"⟩
      elementId := ⟨← stringField json "elementId"⟩
      activation }

def decodeMessageChannel (json : Json) :
    Except String MessageChannel := do
  match ← stringField json "kind" with
  | "operationMessage" =>
      requireObjectShape json
        ["interfaceId", "interfaceOperationId", "kind", "messageId"]
      pure (.operationMessage
        (← decodeSemanticIdentityField json "interfaceId")
        (← decodeSemanticIdentityField json "interfaceOperationId")
        (← decodeSemanticIdentityField json "messageId"))
  | "directMessage" =>
      requireObjectShape json ["kind", "messageId"]
      pure (.directMessage (← decodeSemanticIdentityField json "messageId"))
  | kind => throw s!"unsupported Message channel {kind}"

/-- Decode the exact operation-addressed channel used by Message Start and operation-bound catches. -/
def decodeOperationMessageChannel (json : Json) :
    Except String MessageChannel := do
  let channel ← decodeMessageChannel json
  match channel with
  | .operationMessage .. => pure channel
  | .directMessage .. => throw "operation-addressed Message channel expected"

def decodeVariableValue (json : Json) :
    Except String VariableValue := do
  match ← stringField json "kind" with
  | "string" =>
      requireObjectShape json ["kind", "value"]
      pure (.string (← stringField json "value"))
  | "boolean" =>
      requireObjectShape json ["kind", "value"]
      pure (.boolean (← (← field json "value").getBool?))
  | "null" =>
      requireObjectShape json ["kind"]
      pure .null
  | kind => throw s!"unsupported variable value {kind}"

/-- Encode one typed variable value without collapsing Boolean, String, and null identities. -/
def encodeVariableValue : VariableValue → Json
  | .string value =>
      Json.mkObj
        [ ("kind", toJson "string")
        , ("value", toJson value) ]
  | .boolean value =>
      Json.mkObj
        [ ("kind", toJson "boolean")
        , ("value", toJson value) ]
  | .null =>
      Json.mkObj [("kind", toJson "null")]

def decodeVariableBinding (json : Json) :
    Except String VariableBinding := do
  requireObjectShape json ["name", "value"]
  let name ← stringField json "name"
  if name.isEmpty then
    throw "variable binding name must be non-empty"
  pure
    { name
      value := ← decodeVariableValue (← field json "value") }

def bindingNamesStrictlyIncrease : List VariableBinding → Bool
  | []
  | [_] => true
  | left :: right :: remaining =>
      decide (left.name < right.name) &&
        bindingNamesStrictlyIncrease (right :: remaining)

def decodeCanonicalVariableBindings (json : Json) :
    Except String (List VariableBinding) := do
  let bindings ← decodeArray decodeVariableBinding json
  if bindingNamesStrictlyIncrease bindings then
    pure bindings
  else
    throw "variable bindings must have unique names in canonical order"

def decodeEffectExecutionResult (json : Json) :
    Except String EffectExecutionResult := do
  match ← stringField json "kind" with
  | "success" =>
      requireObjectShape json ["kind", "localPatch"]
      pure
        (.success
          (← decodeArray decodeVariableBinding (← field json "localPatch")))
  | "bpmnError" =>
      requireObjectShape json ["code", "kind", "localPatch", "message"]
      let code ← stringField json "code"
      let message ← decodeOptionalString (← field json "message")
      if code.isEmpty then
        throw "BPMN Error code must be non-empty"
      if message = some "" then
        throw "BPMN Error message must be null or non-empty"
      pure
        (.bpmnError
          code
          message
          (← decodeArray decodeVariableBinding (← field json "localPatch")))
  | kind => throw s!"unsupported effect result {kind}"

end BpmnSemantics.SemanticProcessJson
