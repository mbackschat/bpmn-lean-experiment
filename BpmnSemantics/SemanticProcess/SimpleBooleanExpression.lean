import BpmnSemantics.SemanticProcessContract
import BpmnSemantics.StrictJson

/-! # Simple Boolean expression language

This module independently parses and evaluates the project-owned Simple Boolean v1 language used by condition-bearing BPMN elements. The language is deliberately smaller than XPath or JUEL and consumes only complete Process-scope string/null bindings.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open Lean

def simpleBooleanExpressionLanguage : String :=
  "urn:bpmn-lean:expression:simple-boolean:v1"

private def asciiLetter (character : Char) : Bool :=
  ('A' ≤ character && character ≤ 'Z') ||
    ('a' ≤ character && character ≤ 'z')

private def identifierFirst (character : Char) : Bool :=
  asciiLetter character || character = '_'

private def identifierRest (character : Char) : Bool :=
  identifierFirst character ||
    ('0' ≤ character && character ≤ '9') ||
    character = '.' ||
    character = '-'

def simpleBooleanIdentifierValid (value : String) : Bool :=
  match value.toList with
  | [] => false
  | first :: rest =>
      value.toUTF8.size ≤ 64 &&
        identifierFirst first &&
        rest.all identifierRest

private def stripPrefixChars : List Char → List Char → Option (List Char)
  | [], source => some source
  | expected :: remainingPrefix, actual :: source =>
      if expected = actual then
        stripPrefixChars remainingPrefix source
      else
        none
  | _ :: _, [] => none

private def callBody (name source : String) : Option String := do
  let rest ← stripPrefixChars (name ++ "(").toList source.toList
  match rest.reverse with
  | ')' :: reversedBody => some (String.ofList reversedBody.reverse)
  | _ => none

private def splitAtComma : List Char → Option (List Char × List Char)
  | [] => none
  | ',' :: rest => some ([], rest)
  | character :: rest => do
      let (left, right) ← splitAtComma rest
      pure (character :: left, right)

private def parseCanonicalString (token : String) : Option String := do
  let json ← (BpmnSemantics.StrictJson.parse token).toOption
  match json with
  | .str value =>
      if json.compress = token && value.toUTF8.size ≤ 128 then
        some value
      else
        none
  | _ => none

private def parseVariableCall
    (constructor : String → SimpleBooleanExpression)
    (name source : String) : Option SimpleBooleanExpression := do
  let identifier ← callBody name source
  if simpleBooleanIdentifierValid identifier then
    some (constructor identifier)
  else
    none

/-- Parse one exact Simple Boolean v1 source. Outer whitespace, aliases, and non-canonical JSON strings are rejected. -/
def parseSimpleBooleanExpression (source : String) :
    Option SimpleBooleanExpression :=
  if source.toUTF8.size > 256 then
    none
  else if source = "true" then
    some (.literal true)
  else if source = "false" then
    some (.literal false)
  else
    parseVariableCall .isPresent "isPresent" source <|>
      parseVariableCall .isNull "isNull" source <|>
      (do
        let body ← callBody "stringEquals" source
        let (identifierCharacters, valueCharacters) ←
          splitAtComma body.toList
        let identifier := String.ofList identifierCharacters
        let value ← parseCanonicalString (String.ofList valueCharacters)
        if simpleBooleanIdentifierValid identifier then
          some (.stringEquals identifier value)
        else
          none)

def simpleBooleanExpressionValid : SimpleBooleanExpression → Bool
  | .literal _ => true
  | .isPresent name
  | .isNull name => simpleBooleanIdentifierValid name
  | .stringEquals name value =>
      simpleBooleanIdentifierValid name && value.toUTF8.size ≤ 128

/-- Evaluate an admitted expression. `none` reports an invalid duplicate binding for the referenced Process variable. -/
def evaluateSimpleBooleanExpression
    (expression : SimpleBooleanExpression)
    (bindings : List VariableBinding) : Option Bool :=
  match expression with
  | .literal value => some value
  | .isPresent name =>
      match bindings.filter fun binding => decide (binding.name = name) with
      | [] => some false
      | [_] => some true
      | _ => none
  | .isNull name =>
      match bindings.filter fun binding => decide (binding.name = name) with
      | [] => some false
      | [{ value := .null, .. }] => some true
      | [{ value := .string _, .. }] => some false
      | _ => none
  | .stringEquals name expected =>
      match bindings.filter fun binding => decide (binding.name = name) with
      | [] => some false
      | [{ value := .string actual, .. }] => some (actual = expected)
      | [{ value := .null, .. }] => some false
      | _ => none

/-- Select the first true candidate in declaration order, or the default when every candidate is false. -/
def selectConditionalOutput
    (candidates : List ConditionalCandidate)
    (defaultOutput : ControlPlaceId)
    (bindings : List VariableBinding) : Option ControlPlaceId :=
  match candidates with
  | [] => some defaultOutput
  | candidate :: rest =>
      match evaluateSimpleBooleanExpression candidate.condition bindings with
      | some true => some candidate.output
      | some false => selectConditionalOutput rest defaultOutput bindings
      | none => none

end BpmnSemantics.SemanticProcess
