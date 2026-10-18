import BpmnSemantics.SemanticProcess.EffectMappingValuePolicy
import BpmnSemantics.SemanticProcess.Data

/-! # Policy-parameterized effect input mapping

The input-capture half of effect mapping, generalized over `EffectMappingValuePolicy`. Each
definition is the policy-parameterized form of the scalar definition in `Data` and a `_scalar`
theorem pins the `scalar` arm to that definition, so the legacy names and statements stay the
scalar specialization without rewriting the proofs that unfold them.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- SBT-INPUT-01 reads one immutable containing context; duplicate bindings are unavailable. -/
def enclosingVariableUnder? (policy : EffectMappingValuePolicy) (bindings : List VariableBinding)
    (name : String) : Option VariableValue :=
  match bindings.filter (·.name == name) with
  | [binding] => if policy.admits true binding.value then some binding.value else none
  | _ => none

def inputLookupUnder? (policy : EffectMappingValuePolicy) (read : String → Option VariableValue)
    (name : String) : Option VariableValue := do
  let value ← read name
  if policy.admits true value then some value else none

def evaluateInputMappingsInOrderUnder (policy : EffectMappingValuePolicy)
    (read : String → Option VariableValue) :
    List VariableMapping → Option (List VariableBinding)
  | [] => some []
  | mapping :: rest => do
      let value ← match mapping.expression with
        | .stringLiteral value => some (.string value)
        | .enclosingVariable name => inputLookupUnder? policy read name
        | .localVariable _ => none
      return { name := mapping.target, value } ::
        (← evaluateInputMappingsInOrderUnder policy read rest)

def orderedInputSnapshotMatchesUnder (policy : EffectMappingValuePolicy) :
    List VariableMapping → List VariableBinding → Bool
  | [], [] => true
  | mapping :: mappings, binding :: bindings =>
      mapping.target == binding.name &&
        (match mapping.expression with
        | .stringLiteral value => binding.value == .string value
        | .enclosingVariable _ => policy.admits true binding.value
        | .localVariable _ => false) && orderedInputSnapshotMatchesUnder policy mappings bindings
  | _, _ => false

/-- Immutable snapshots use canonical target order independently of declaration order. -/
def inputSnapshotMatchesUnder (policy : EffectMappingValuePolicy) (mappings : List VariableMapping)
    (bindings : List VariableBinding) : Bool :=
  match canonicalInputMappings? mappings with
  | some ordered => orderedInputSnapshotMatchesUnder policy ordered bindings
  | none => false

def evaluateInputMappingsUnder? (policy : EffectMappingValuePolicy)
    (read : String → Option VariableValue) (mappings : List VariableMapping) :
    Option (List VariableBinding) := do
  let ordered ← canonicalInputMappings? mappings
  evaluateInputMappingsInOrderUnder policy read ordered

def evaluateEnclosingInputMappingsUnder (policy : EffectMappingValuePolicy)
    (bindings : List VariableBinding) (mappings : List VariableMapping) :
    Option (List VariableBinding) :=
  evaluateInputMappingsUnder? policy (enclosingVariableUnder? policy bindings) mappings

/-! The `scalar` arm is the legacy definition. -/

theorem enclosingVariableUnder?_scalar (bindings : List VariableBinding) (name : String) :
    enclosingVariableUnder? .scalar bindings name = enclosingVariable? bindings name := by
  unfold enclosingVariableUnder? enclosingVariable?
  generalize bindings.filter (·.name == name) = found
  match found with
  | [] => rfl
  | [binding] => cases h : binding.value <;> simp [EffectMappingValuePolicy.admits, h]
  | _ :: _ :: _ => rfl

theorem inputLookupUnder?_scalar (read : String → Option VariableValue) (name : String) :
    inputLookupUnder? .scalar read name = scalarInputLookup? read name := by
  unfold inputLookupUnder? scalarInputLookup?
  cases read name with
  | none => rfl
  | some value => cases value <;> simp [EffectMappingValuePolicy.admits]

theorem evaluateInputMappingsInOrderUnder_scalar (read : String → Option VariableValue) :
    ∀ mappings, evaluateInputMappingsInOrderUnder .scalar read mappings =
      evaluateInputMappingsInOrder read mappings := by
  intro mappings
  induction mappings with
  | nil => rfl
  | cons mapping rest ih =>
      unfold evaluateInputMappingsInOrderUnder evaluateInputMappingsInOrder
      rw [ih]
      cases mapping.expression <;> simp [inputLookupUnder?_scalar]

theorem orderedInputSnapshotMatchesUnder_scalar :
    ∀ mappings bindings, orderedInputSnapshotMatchesUnder .scalar mappings bindings =
      orderedInputSnapshotMatches mappings bindings := by
  intro mappings
  induction mappings with
  | nil => intro bindings; cases bindings <;> rfl
  | cons mapping rest ih =>
      intro bindings
      cases bindings with
      | nil => rfl
      | cons binding tail =>
          simp only [orderedInputSnapshotMatchesUnder, orderedInputSnapshotMatches, ih]
          cases mapping.expression <;> cases binding.value <;> rfl

theorem inputSnapshotMatchesUnder_scalar (mappings : List VariableMapping)
    (bindings : List VariableBinding) :
    inputSnapshotMatchesUnder .scalar mappings bindings = inputSnapshotMatches mappings bindings := by
  unfold inputSnapshotMatchesUnder inputSnapshotMatches
  cases canonicalInputMappings? mappings with
  | none => rfl
  | some ordered => exact orderedInputSnapshotMatchesUnder_scalar ordered bindings

theorem evaluateInputMappingsUnder?_scalar (read : String → Option VariableValue)
    (mappings : List VariableMapping) :
    evaluateInputMappingsUnder? .scalar read mappings = evaluateInputMappings? read mappings := by
  unfold evaluateInputMappingsUnder? evaluateInputMappings?
  cases canonicalInputMappings? mappings with
  | none => rfl
  | some ordered => exact evaluateInputMappingsInOrderUnder_scalar read ordered

theorem evaluateEnclosingInputMappingsUnder_scalar (bindings : List VariableBinding)
    (mappings : List VariableMapping) :
    evaluateEnclosingInputMappingsUnder .scalar bindings mappings =
      evaluateEnclosingInputMappings bindings mappings := by
  have read : enclosingVariableUnder? .scalar bindings = enclosingVariable? bindings :=
    funext (enclosingVariableUnder?_scalar bindings)
  unfold evaluateEnclosingInputMappingsUnder evaluateEnclosingInputMappings
  rw [read]
  exact evaluateInputMappingsUnder?_scalar _ mappings

/-! Every evaluated snapshot matches its own declaration, whatever the policy. -/

theorem evaluateInputMappingsInOrderUnder_snapshot (policy : EffectMappingValuePolicy)
    (read : String → Option VariableValue) (mappings : List VariableMapping)
    (bindings : List VariableBinding)
    (evaluated : evaluateInputMappingsInOrderUnder policy read mappings = some bindings) :
    orderedInputSnapshotMatchesUnder policy mappings bindings = true := by
  induction mappings generalizing bindings with
  | nil => simp [evaluateInputMappingsInOrderUnder] at evaluated; subst bindings; rfl
  | cons mapping rest ih =>
      cases expression : mapping.expression with
      | localVariable name => simp [evaluateInputMappingsInOrderUnder, expression] at evaluated
      | stringLiteral value =>
          cases tailEq : evaluateInputMappingsInOrderUnder policy read rest with
          | none => simp [evaluateInputMappingsInOrderUnder, expression, tailEq] at evaluated
          | some tail =>
              simp [evaluateInputMappingsInOrderUnder, expression, tailEq] at evaluated
              subst bindings
              simpa [orderedInputSnapshotMatchesUnder, expression] using ih tail tailEq
      | enclosingVariable name =>
          cases lookup : inputLookupUnder? policy read name with
          | none => simp [evaluateInputMappingsInOrderUnder, expression, lookup] at evaluated
          | some value =>
              cases tailEq : evaluateInputMappingsInOrderUnder policy read rest with
              | none => simp [evaluateInputMappingsInOrderUnder, expression, lookup, tailEq] at evaluated
              | some tail =>
                  simp [evaluateInputMappingsInOrderUnder, expression, lookup, tailEq] at evaluated
                  subst bindings
                  have admitted : policy.admits true value = true := by
                    unfold inputLookupUnder? at lookup
                    cases found : read name with
                    | none => simp [found] at lookup
                    | some source =>
                        rw [found] at lookup
                        by_cases accepted : policy.admits true source = true
                        · simp [accepted] at lookup
                          subst lookup
                          exact accepted
                        · simp [accepted] at lookup
                  simp [orderedInputSnapshotMatchesUnder, expression, admitted, ih tail tailEq]

theorem evaluateInputMappingsUnder?_snapshot (policy : EffectMappingValuePolicy)
    (read : String → Option VariableValue) (mappings : List VariableMapping)
    (bindings : List VariableBinding)
    (evaluated : evaluateInputMappingsUnder? policy read mappings = some bindings) :
    inputSnapshotMatchesUnder policy mappings bindings = true := by
  unfold evaluateInputMappingsUnder? at evaluated
  cases ordered : canonicalInputMappings? mappings with
  | none => simp [ordered] at evaluated
  | some mappings' =>
      simp only [ordered] at evaluated
      simpa only [inputSnapshotMatchesUnder, ordered] using
        evaluateInputMappingsInOrderUnder_snapshot policy read mappings' bindings evaluated

theorem evaluateEnclosingInputMappingsUnder_snapshot (policy : EffectMappingValuePolicy)
    (context : List VariableBinding) (mappings : List VariableMapping)
    (bindings : List VariableBinding)
    (evaluated : evaluateEnclosingInputMappingsUnder policy context mappings = some bindings) :
    inputSnapshotMatchesUnder policy mappings bindings = true := by
  unfold evaluateEnclosingInputMappingsUnder evaluateInputMappingsUnder? at evaluated
  cases ordered : canonicalInputMappings? mappings with
  | none => simp [ordered] at evaluated
  | some mappings' =>
      simp only [ordered] at evaluated
      simpa only [inputSnapshotMatchesUnder, ordered] using
        evaluateInputMappingsInOrderUnder_snapshot policy _ mappings' bindings evaluated

end BpmnSemantics.SemanticProcess
