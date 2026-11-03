module

public import BpmnSemantics.SemanticProcessContract
public import BpmnSemantics.StrictJson
public import Lean.Data.Json.Printer
meta import BpmnSemantics.PrivateEquationLemmas

/-! # Simple Boolean expression language

This module independently parses and evaluates the project-owned Simple Boolean v1 language used by condition-bearing BPMN elements. The language is deliberately smaller than XPath or JUEL and consumes only complete Process-scope string/null bindings.
-/

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open Lean

def simpleBooleanExpressionLanguage : String :=
  "urn:bpmn-lean:expression:simple-boolean:v1"

def asciiLetter (character : Char) : Bool :=
  ('A' ≤ character && character ≤ 'Z') ||
    ('a' ≤ character && character ≤ 'z')

def identifierFirst (character : Char) : Bool :=
  asciiLetter character || character = '_'

def identifierRest (character : Char) : Bool :=
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

def stripPrefixChars : List Char → List Char → Option (List Char)
  | [], source => some source
  | expected :: remainingPrefix, actual :: source =>
      if expected = actual then
        stripPrefixChars remainingPrefix source
      else
        none
  | _ :: _, [] => none

def callBody (name source : String) : Option String := do
  let rest ← stripPrefixChars (name ++ "(").toList source.toList
  match rest.reverse with
  | ')' :: reversedBody => some (String.ofList reversedBody.reverse)
  | _ => none

def splitAtComma : List Char → Option (List Char × List Char)
  | [] => none
  | ',' :: rest => some ([], rest)
  | character :: rest => do
      let (left, right) ← splitAtComma rest
      pure (character :: left, right)

def parseCanonicalString (token : String) : Option String := do
  let json ← (BpmnSemantics.StrictJson.parse token).toOption
  match json with
  | .str value =>
      if json.compress = token && value.toUTF8.size ≤ 128 then
        some value
      else
        none
  | _ => none

def parseVariableCall
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
      | [{ value := .boolean _, .. }] => some false
      | [{ value := .integer _, .. }] => some false
      | [{ value := .stringList _, .. }] => some false
      | [{ value := .decimal _ _, .. }] => some false
      | [{ value := .list _, .. }] => some false
      | [{ value := .map _, .. }] => some false
      | _ => none
  | .stringEquals name expected =>
      match bindings.filter fun binding => decide (binding.name = name) with
      | [] => some false
      | [{ value := .string actual, .. }] => some (actual = expected)
      | [{ value := .null, .. }] => some false
      | [{ value := .boolean _, .. }] => some false
      | [{ value := .integer _, .. }] => some false
      | [{ value := .stringList _, .. }] => some false
      | [{ value := .decimal _ _, .. }] => some false
      | [{ value := .list _, .. }] => some false
      | [{ value := .map _, .. }] => some false
      | _ => none

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess #[`evaluateSimpleBooleanExpression]

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

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`selectConditionalOutput]

/-- XND-ROUTE-01: the first true candidate of a Choice without a default, in declaration order; `none` when none holds
or evaluation fails (Exclusive Choice without a default proposal). -/
def selectFirstTrueOutput (candidates : List ConditionalCandidate) (bindings : List VariableBinding) :
    Option ControlPlaceId :=
  match candidates with
  | [] => none
  | candidate :: rest =>
      match evaluateSimpleBooleanExpression candidate.condition bindings with
      | some true => some candidate.output
      | some false => selectFirstTrueOutput rest bindings
      | none => none

/-- The output a Choice selects, dispatching on whether its source declares a default; a present default keeps
`selectConditionalOutput` and every law about it. -/
def selectChoiceOutput (candidates : List ConditionalCandidate) (defaultOutput : Option ControlPlaceId)
    (bindings : List VariableBinding) : Option ControlPlaceId :=
  match defaultOutput with
  | some output => selectConditionalOutput candidates output bindings
  | none => selectFirstTrueOutput candidates bindings

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`selectFirstTrueOutput]
run_meta privateEquations `BpmnSemantics.SemanticProcess #[`selectChoiceOutput]

theorem selectChoiceOutput_some (candidates : List ConditionalCandidate) (output : ControlPlaceId)
    (bindings : List VariableBinding) :
    selectChoiceOutput candidates (some output) bindings = selectConditionalOutput candidates output bindings := by
  simp [selectChoiceOutput]

/-- A selected Choice output is one of its declared outputs, with or without a default. -/
theorem selectChoiceOutput_declared (candidates : List ConditionalCandidate) (defaultOutput : Option ControlPlaceId)
    (bindings : List VariableBinding) (output : ControlPlaceId)
    (selected : selectChoiceOutput candidates defaultOutput bindings = some output) :
    output ∈ candidates.map (·.output) ++ defaultOutput.toList := by
  cases defaultOutput with
  | none =>
      simp only [selectChoiceOutput] at selected
      induction candidates with
      | nil => simp [selectFirstTrueOutput] at selected
      | cons candidate rest ih =>
          simp only [selectFirstTrueOutput] at selected
          split at selected <;> simp_all
  | some fallback =>
      simp only [selectChoiceOutput] at selected
      induction candidates with
      | nil => simp_all [selectConditionalOutput]
      | cons candidate rest ih =>
          simp only [selectConditionalOutput] at selected
          split at selected <;> simp_all

/-- XND-ROLLBACK-01: every candidate evaluates to `false`, not merely fails to hold, because CIB raises a different
failure for an evaluation error than for a no-match. -/
def choiceCandidatesAllFalse (candidates : List ConditionalCandidate) (bindings : List VariableBinding) : Bool :=
  candidates.all fun candidate => evaluateSimpleBooleanExpression candidate.condition bindings == some false

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`choiceCandidatesAllFalse]

/-- XND-ROLLBACK-01: when every candidate evaluates to `false`, a Choice without a default selects no flow. -/
theorem selectChoiceOutput_none_of_allFalse (candidates : List ConditionalCandidate)
    (bindings : List VariableBinding) (allFalse : choiceCandidatesAllFalse candidates bindings = true) :
    selectChoiceOutput candidates none bindings = none := by
  simp only [selectChoiceOutput]
  induction candidates with
  | nil => rfl
  | cons candidate rest ih =>
      simp only [choiceCandidatesAllFalse, List.all_cons, Bool.and_eq_true, beq_iff_eq] at allFalse
      simp [selectFirstTrueOutput, allFalse.1, ih (by simpa [choiceCandidatesAllFalse] using allFalse.2)]

/-- XND-ROUTE-01: a true candidate after only false ones is selected, whatever follows it. -/
private theorem selectChoiceOutput_none_first_true (before : List ConditionalCandidate) (candidate : ConditionalCandidate)
    (after : List ConditionalCandidate) (bindings : List VariableBinding)
    (falseBefore : choiceCandidatesAllFalse before bindings = true)
    (holds : evaluateSimpleBooleanExpression candidate.condition bindings = some true) :
    selectChoiceOutput (before ++ candidate :: after) none bindings = some candidate.output := by
  simp only [selectChoiceOutput]
  induction before with
  | nil => simp [selectFirstTrueOutput, holds]
  | cons first rest ih =>
      simp only [choiceCandidatesAllFalse, List.all_cons, Bool.and_eq_true, beq_iff_eq] at falseBefore
      simp [selectFirstTrueOutput, falseBefore.1,
        ih (by simpa [choiceCandidatesAllFalse] using falseBefore.2)]

end BpmnSemantics.SemanticProcess
