import BpmnSemantics.SemanticProcessContract
import BpmnSemantics.SemanticProcess.CanonicalBusinessValue
import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import BpmnSemantics.StrictJson
import BpmnSemantics.WireNatural
import Lean.Data.Json

/-! # Semantic Process JSON value support

This module owns the strict reusable decoders for safe wire integers, identities, Message channels, variables, and typed effect results. Document-role decoders and cross-artifact validation remain in `SemanticProcessJson`.
-/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics
open Lean

private inductive WireLexicalMode where
  | value
  | string
  | escaped

private def wireDigit (c : Char) : Bool := '0' ≤ c && c ≤ '9'

private def wireNumberDelimiter (c : Char) : Bool :=
  c = ',' || c = ']' || c = '}' || c = ' ' || c = '\t' || c = '\r' || c = '\n'

private def canonicalWireDigits (digits : List Char) : Bool :=
  match digits with
  | [] => false
  | '0' :: rest => rest.isEmpty
  | _ => (digits.foldlM (fun value c =>
      let next := 10 * value + (c.toNat - '0'.toNat)
      if isSafeWireNat next then some next else none) 0).isSome

private def wireNumeralsValid : WireLexicalMode → List Char → Bool
  | _, [] => true
  | .escaped, _ :: rest => wireNumeralsValid .string rest
  | .string, '\\' :: rest => wireNumeralsValid .escaped rest
  | .string, '"' :: rest => wireNumeralsValid .value rest
  | .string, _ :: rest => wireNumeralsValid .string rest
  | .value, '"' :: rest => wireNumeralsValid .string rest
  | .value, '-' :: _ => false
  | .value, c :: rest =>
      if wireDigit c then
        let digits := rest.takeWhile wireDigit
        let remaining := rest.dropWhile wireDigit
        canonicalWireDigits (c :: digits) &&
          (remaining.head?.all wireNumberDelimiter) &&
          wireNumeralsValid .value remaining
      else wireNumeralsValid .value rest
termination_by _ chars => chars.length
decreasing_by
  all_goals simp_wf
  exact Nat.lt_succ_of_le (List.dropWhile_suffix wireDigit).length_le

/-- The portable-value wire contract selects canonical safe natural tokens. Validate their original spelling before JSON normalization; string contents and narrower typed field bounds keep their existing owners. -/
def parseWireJson (contents : String) : Except String Json := do
  if !wireNumeralsValid .value contents.toList then
    throw "wire integers require canonical unsigned safe integer tokens"
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

/-- Strictly decode the closed assignment-only or legacy assignment-plus-form metadata union. -/
def decodeUserTaskMetadata (json : Json) : Except String UserTaskMetadata := do
  let assignment ← field json "assignment"
  requireObjectShape assignment ["candidates"]
  let form ← match ← optionalField json "form" with
    | none =>
        requireObjectShape json ["assignment"]
        pure none
    | some form =>
        requireObjectShape json ["assignment", "form"]
        requireObjectShape form ["fields"]
        pure (some
          { fields :=
              ← decodeArray decodeUserTaskFormField (← field form "fields") })
  let metadata : UserTaskMetadata :=
    { assignment :=
        { candidates :=
            ← decodeArray decodeUserTaskCandidate
              (← field assignment "candidates") }
      form }
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

/-- Canonically encode either exact neutral metadata arm, physically omitting an absent form block. -/
def encodeUserTaskMetadata (metadata : UserTaskMetadata) : Json :=
  let assignment :=
    ("assignment",
      Json.mkObj
        [("candidates",
          .arr (metadata.assignment.candidates.map userTaskCandidateJson).toArray)])
  match metadata.form with
  | none => Json.mkObj [assignment]
  | some form =>
      Json.mkObj
        [ assignment
        , ("form",
            Json.mkObj
              [("fields",
                .arr (form.fields.map userTaskFormFieldJson).toArray)]) ]

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

mutual
/-- Encode one portable value; this owns the wire spelling of every portable arm. -/
def encodeBusinessValue : BusinessValue → Json
  | .string value =>
      Json.mkObj
        [ ("kind", toJson "string")
        , ("value", toJson value) ]
  | .null =>
      Json.mkObj [("kind", toJson "null")]
  | .boolean value =>
      Json.mkObj
        [ ("kind", toJson "boolean")
        , ("value", toJson value) ]
  | .integer value =>
      Json.mkObj
        [ ("kind", toJson "integer")
        , ("value", toJson value) ]
  | .decimal coefficient scale =>
      Json.mkObj
        [ ("kind", toJson "decimal")
        , ("coefficient", toJson (toString coefficient))
        , ("scale", toJson scale) ]
  | .list members =>
      Json.mkObj
        [ ("kind", toJson "list")
        , ("value", Json.arr (encodeBusinessMembers members).toArray) ]
  | .map entries =>
      Json.mkObj
        [ ("kind", toJson "map")
        , ("value", Json.arr (encodeBusinessEntries entries).toArray) ]

def encodeBusinessMembers : List BusinessValue → List Json
  | [] => []
  | member :: members => encodeBusinessValue member :: encodeBusinessMembers members

def encodeBusinessEntries : List (String × BusinessValue) → List Json
  | [] => []
  | (name, value) :: entries =>
      Json.mkObj [("name", toJson name), ("value", encodeBusinessValue value)] ::
        encodeBusinessEntries entries
end

/-- Encode one typed variable value without collapsing any generic value identity. -/
def encodeVariableValue : VariableValue → Json
  | .stringList value =>
      Json.mkObj
        [ ("kind", toJson "stringList")
        , ("value", toJson value) ]
  | .string value => encodeBusinessValue (.string value)
  | .null => encodeBusinessValue .null
  | .boolean value => encodeBusinessValue (.boolean value)
  | .integer value => encodeBusinessValue (.integer value)
  | .decimal coefficient scale => encodeBusinessValue (.decimal coefficient scale)
  | .list members => encodeBusinessValue (.list members)
  | .map entries => encodeBusinessValue (.map entries)

def minDecimalCoefficient : Int := -9223372036854775808
def maxDecimalCoefficient : Int := 9223372036854775807

/-- One exact spelling per Decimal: in range, scale at most six, zero only at scale zero, and no
trailing coefficient zero at a positive scale (`123450/3` is rejected, not normalized). -/
def decimalCanonical (coefficient : Int) (scale : Nat) : Bool :=
  minDecimalCoefficient ≤ coefficient && coefficient ≤ maxDecimalCoefficient && scale ≤ 6 &&
    if coefficient = 0 then scale = 0 else scale = 0 || coefficient % 10 != 0

mutual
/-- Local rules of every node: member strings and keys at most 1,024 UTF-8 bytes, safe integers,
canonical Decimals, at most 32 children, and Map keys strictly increasing in Unicode scalar order. -/
def businessNodesValid : BusinessValue → Bool
  | .string value => value.utf8ByteSize ≤ 1024
  | .null | .boolean _ => true
  | .integer value => isSafeWireNat value
  | .decimal coefficient scale => decimalCanonical coefficient scale
  | .list members => members.length ≤ 32 && businessMembersValid members
  | .map entries => entries.length ≤ 32 && businessEntriesValid none entries

def businessMembersValid : List BusinessValue → Bool
  | [] => true
  | member :: members => businessNodesValid member && businessMembersValid members

def businessEntriesValid (previous : Option String) : List (String × BusinessValue) → Bool
  | [] => true
  | (name, value) :: entries =>
      name.utf8ByteSize ≤ 1024 && previous.all (fun earlier => decide (earlier < name)) &&
        businessNodesValid value && businessEntriesValid (some name) entries
end

/-- The complete finite domain of one portable root: local rules, at most four containers on any
path, at most 256 nodes, and at most 16,384 canonical UTF-8 bytes. -/
def businessValueWellFormed (value : BusinessValue) : Bool :=
  businessNodesValid value && value.containerDepth ≤ 4 && value.nodeCount ≤ 256 &&
    SemanticProcess.canonicalBusinessValueUtf8Bytes value ≤ 16384

/-- Exact structural and canonical-byte bounds for the bounded generic value arms. -/
def variableValueWellFormed : VariableValue → Bool
  | .integer value => isSafeWireNat value
  | .stringList values =>
      values.length ≤ 32 &&
        values.all (fun value => value.toUTF8.size ≤ 1024) &&
        (encodeVariableValue (.stringList values)).compress.toUTF8.size ≤ 16384
  | .string _
  | .boolean _
  | .null => true
  | .decimal coefficient scale => businessValueWellFormed (.decimal coefficient scale)
  | .list members => businessValueWellFormed (.list members)
  | .map entries => businessValueWellFormed (.map entries)

/-- Decimal coefficient text `0|-?[1-9][0-9]*` with at most 19 digits; range is a value rule. -/
def decodeDecimalCoefficient (text : String) : Except String Int :=
  let (negative, digits) := match text.toList with
    | '-' :: rest => (true, rest)
    | rest => (false, rest)
  match digits with
  | [] => throw "Decimal coefficient requires digits"
  | first :: _ =>
      if digits.length ≤ 19 && digits.all Char.isDigit &&
          ((digits == ['0'] && !negative) || first != '0') then
        let magnitude := digits.foldl (fun total c => total * 10 + (c.toNat - '0'.toNat)) 0
        pure (if negative then -(magnitude : Int) else magnitude)
      else
        throw "Decimal coefficient is not canonical"

/-- Decode one portable value. `containerBudget` counts the List/Map levels still admitted, so
recursion is bounded by the depth limit before any count or byte check runs. -/
def decodeBusinessValue : Nat → Json → Except String BusinessValue
  | containerBudget, json => do
    match ← stringField json "kind" with
    | "string" =>
        requireObjectShape json ["kind", "value"]
        pure (.string (← stringField json "value"))
    | "null" =>
        requireObjectShape json ["kind"]
        pure .null
    | "boolean" =>
        requireObjectShape json ["kind", "value"]
        pure (.boolean (← (← field json "value").getBool?))
    | "integer" =>
        requireObjectShape json ["kind", "value"]
        pure (.integer (← decodeSafeNat (← field json "value")))
    | "decimal" =>
        requireObjectShape json ["kind", "coefficient", "scale"]
        pure (.decimal (← decodeDecimalCoefficient (← stringField json "coefficient"))
          (← decodeSafeNat (← field json "scale")))
    | "list" =>
        match containerBudget with
        | 0 => throw "portable value exceeds its container depth"
        | remaining + 1 =>
            requireObjectShape json ["kind", "value"]
            let members ← (← field json "value").getArr?
            pure (.list (← members.toList.mapM (decodeBusinessValue remaining)))
    | "map" =>
        match containerBudget with
        | 0 => throw "portable value exceeds its container depth"
        | remaining + 1 =>
            requireObjectShape json ["kind", "value"]
            let entries ← (← field json "value").getArr?
            pure (.map (← entries.toList.mapM fun entry => do
              requireObjectShape entry ["name", "value"]
              pure (← stringField entry "name",
                ← decodeBusinessValue remaining (← field entry "value"))))
    | kind => throw s!"unsupported portable value {kind}"

def decodeVariableValue (json : Json) :
    Except String VariableValue := do
  let value ← match ← stringField json "kind" with
    | "string" =>
        requireObjectShape json ["kind", "value"]
        pure (.string (← stringField json "value"))
    | "boolean" =>
        requireObjectShape json ["kind", "value"]
        pure (.boolean (← (← field json "value").getBool?))
    | "integer" =>
        requireObjectShape json ["kind", "value"]
        pure (.integer (← decodeSafeNat (← field json "value")))
    | "stringList" =>
        requireObjectShape json ["kind", "value"]
        pure (.stringList (← decodeArray Json.getStr? (← field json "value")))
    | "null" =>
        requireObjectShape json ["kind"]
        pure .null
    | "decimal" | "list" | "map" => pure (.ofBusiness (← decodeBusinessValue 4 json))
    | kind => throw s!"unsupported variable value {kind}"
  if variableValueWellFormed value then pure value
  else throw "variable value exceeds its structural or canonical-byte limit"

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
          (← decodeCanonicalVariableBindings (← field json "localPatch")))
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
          (← decodeCanonicalVariableBindings (← field json "localPatch")))
  | kind => throw s!"unsupported effect result {kind}"

end BpmnSemantics.SemanticProcessJson
