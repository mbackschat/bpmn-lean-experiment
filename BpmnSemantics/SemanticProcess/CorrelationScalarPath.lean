import BpmnSemantics.Scenario

/-! # Closed scalar paths for Message correlation

This module owns the deliberately tiny path language selected by the Message key-correlation
profile. Decoding is exact: neither whitespace nor another spelling is normalized into a valid
selector.
-/

namespace BpmnSemantics.SemanticProcess

/-- The sole language URI admitted for both correlation selectors. -/
def correlationScalarPathLanguage : String :=
  "urn:bpmn-lean:correlation-scalar-path:v1"

/-- The Message-side selector. Its fields mirror the checked and Semantic Process contracts. -/
structure CorrelationMessagePath where
  language : String
  body : String
  deriving Repr, DecidableEq

/-- The Process-side selector retains the resolved Property identity separately from its exact
source body, so a name lookup cannot satisfy delivery revalidation. -/
structure CorrelationProcessPropertyPath where
  language : String
  body : String
  propertyId : String
  deriving Repr, DecidableEq

/-- Decode only the complete delivered scalar payload selector. -/
def decodeCorrelationMessagePath? (language body : String) :
    Option CorrelationMessagePath :=
  if language = correlationScalarPathLanguage && body = "payload" then
    some { language, body }
  else none

/-- Decode only `property:<resolved-id>` for the exact separately resolved Process Property. -/
def decodeCorrelationProcessPropertyPath? (language body propertyId : String) :
    Option CorrelationProcessPropertyPath :=
  if !propertyId.isEmpty && language = correlationScalarPathLanguage &&
      body = "property:" ++ propertyId then
    some { language, body, propertyId }
  else none

def correlationMessagePathValid (path : CorrelationMessagePath) : Bool :=
  decodeCorrelationMessagePath? path.language path.body = some path

def correlationProcessPropertyPathValid
    (path : CorrelationProcessPropertyPath) : Bool :=
  decodeCorrelationProcessPropertyPath? path.language path.body path.propertyId = some path

/-- Evaluate the only Message-side scalar selector. Invalid selectors and empty runtime keys fail. -/
def evaluateCorrelationMessagePath? (path : CorrelationMessagePath)
    (payload : String) : Option String :=
  if correlationMessagePathValid path && !payload.isEmpty then some payload else none

/-- Evaluate the only Process-side selector against one exact current Process binding. -/
def evaluateCorrelationProcessPropertyPath? (path : CorrelationProcessPropertyPath)
    (bindings : List VariableBinding) : Option String :=
  if correlationProcessPropertyPathValid path then
    match bindings.filter fun binding => binding.name = path.propertyId with
    | [binding] => match binding.value with
      | .string value => if value.isEmpty then none else some value
      | _ => none
    | _ => none
  else none

theorem evaluateCorrelationMessagePath?_exact (path : CorrelationMessagePath)
    (payload value : String) :
    evaluateCorrelationMessagePath? path payload = some value ↔
      correlationMessagePathValid path = true ∧ payload = value ∧
        (!payload.isEmpty) = true := by
  simp [evaluateCorrelationMessagePath?, Bool.and_eq_true, and_comm, and_assoc]

theorem evaluateCorrelationProcessPropertyPath?_exact
    (path : CorrelationProcessPropertyPath) (bindings : List VariableBinding)
    (value : String) :
    evaluateCorrelationProcessPropertyPath? path bindings = some value ↔
      correlationProcessPropertyPathValid path = true ∧
        ∃ binding, bindings.filter (fun candidate => candidate.name = path.propertyId) = [binding] ∧
          binding.value = .string value ∧ (!value.isEmpty) = true := by
  unfold evaluateCorrelationProcessPropertyPath?
  by_cases valid : correlationProcessPropertyPathValid path = true
  · simp [valid]
    generalize filteredEq : bindings.filter
      (fun candidate => candidate.name = path.propertyId) = filtered
    cases filtered with
    | nil => simp
    | cons binding rest =>
      cases rest with
      | cons _ _ => simp
      | nil =>
        cases valueEq : binding.value with
        | string current =>
          by_cases empty : current.isEmpty = true
          · simp_all
          · simp_all
            intro currentEqValue valueEmpty
            exact empty (currentEqValue.trans valueEmpty)
        | boolean _ => simp [valueEq]
        | integer _ => simp [valueEq]
        | stringList _ => simp [valueEq]
        | null => simp [valueEq]
  · have invalid : correlationProcessPropertyPathValid path = false :=
      by cases value : correlationProcessPropertyPathValid path <;> simp_all
    simp [invalid]

theorem decodeCorrelationMessagePath?_exact (language body : String)
    (path : CorrelationMessagePath)
    (decoded : decodeCorrelationMessagePath? language body = some path) :
    language = correlationScalarPathLanguage ∧ body = "payload" ∧
      path = { language, body } := by
  unfold decodeCorrelationMessagePath? at decoded
  split at decoded
  · rename_i accepted
    simp only [Bool.and_eq_true, decide_eq_true_eq] at accepted
    obtain ⟨languageEq, bodyEq⟩ := accepted
    exact ⟨languageEq, bodyEq, Option.some.inj decoded |>.symm⟩
  · contradiction

theorem decodeCorrelationProcessPropertyPath?_exact
    (language body propertyId : String) (path : CorrelationProcessPropertyPath)
    (decoded : decodeCorrelationProcessPropertyPath? language body propertyId = some path) :
    (!propertyId.isEmpty) = true ∧ language = correlationScalarPathLanguage ∧
      body = "property:" ++ propertyId ∧ path = { language, body, propertyId } := by
  unfold decodeCorrelationProcessPropertyPath? at decoded
  split at decoded
  · rename_i accepted
    simp only [Bool.and_eq_true, decide_eq_true_eq] at accepted
    obtain ⟨⟨nonempty, languageEq⟩, bodyEq⟩ := accepted
    exact ⟨nonempty, languageEq, bodyEq, Option.some.inj decoded |>.symm⟩
  · contradiction

end BpmnSemantics.SemanticProcess
