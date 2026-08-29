import BpmnSemantics.SemanticProcessContract

/-! # Semantic Process bounded data mappings

This module owns the string-only mapping mechanisms admitted by mapped Service Task profiles. It deliberately implements only the empty payload-free effect and the exact one-literal-input/one-local-output shape.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Process-owned bindings that form the public variable projection. -/
structure ProcessVariableScope where
  bindings : List VariableBinding
  deriving Repr, DecidableEq

/-- Complete semantic owner identity for one private local-data scope. -/
inductive LocalDataOwner where
  | effectOccurrence (id : EffectOccurrenceId)
  | activityOccurrence (id : ActivityOccurrenceId)
  deriving Repr, DecidableEq

/-- Semantic Process instance named by either local-data owner arm. -/
def LocalDataOwner.processInstanceId : LocalDataOwner → SemanticId
  | .effectOccurrence id => id.processInstanceId
  | .activityOccurrence id => id.processInstanceId

/-- Private bindings owned by one complete semantic effect or Activity occurrence. -/
structure ActivityVariableScope where
  owner : LocalDataOwner
  bindings : List VariableBinding
  deriving Repr, DecidableEq

/-- The single runtime representation for Process and Activity-local data. -/
structure ScopedVariables where
  process : ProcessVariableScope
  activities : List ActivityVariableScope
  deriving Repr, DecidableEq

def emptyScopedVariables : ScopedVariables :=
  { process := { bindings := [] }
    activities := [] }

private def insertVariableBinding (binding : VariableBinding) :
    List VariableBinding → List VariableBinding
  | [] => [binding]
  | candidate :: remaining =>
      if binding.name < candidate.name then
        binding :: candidate :: remaining
      else
        candidate :: insertVariableBinding binding remaining

private def sortVariableBindings : List VariableBinding → List VariableBinding
  | [] => []
  | binding :: remaining =>
      insertVariableBinding binding (sortVariableBindings remaining)

/-- Canonically merge a User Task completion patch into Process scope, replacing equal names and retaining all unrelated bindings. -/
def mergeProcessVariableBindings
    (existing replacements : List VariableBinding) : List VariableBinding :=
  let replacedNames := replacements.map (·.name)
  sortVariableBindings
    (replacements ++ existing.filter fun binding =>
      !replacedNames.contains binding.name)

/-- Exact equality for discriminated local-data owners. -/
def localDataOwnerMatches (left right : LocalDataOwner) : Bool :=
  decide (left = right)

/-- Match only the effect-owned arm retained by the existing effect APIs. -/
def activityScopeMatches (owner : EffectOccurrenceId)
    (scope : ActivityVariableScope) : Bool :=
  localDataOwnerMatches (.effectOccurrence owner) scope.owner

/-- Canonical complete-identity order within the effect-owner arm. -/
def localEffectOwnerBefore
    (left right : EffectOccurrenceId) : Bool :=
  if left.processInstanceId.value ≠ right.processInstanceId.value then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.elementId.value ≠ right.elementId.value then
    left.elementId.value < right.elementId.value
  else
    left.activation < right.activation

/-- Canonical complete-identity order within the Activity-owner arm. -/
def localActivityOwnerBefore
    (left right : ActivityOccurrenceId) : Bool :=
  if left.processInstanceId.value ≠ right.processInstanceId.value then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.activityElementId.value ≠ right.activityElementId.value then
    left.activityElementId.value < right.activityElementId.value
  else
    left.activation < right.activation

/-- Canonical discriminator-first order for complete local-data ownership. -/
def localDataOwnerBefore (left right : LocalDataOwner) : Bool :=
  match left, right with
  | .effectOccurrence left, .effectOccurrence right =>
      localEffectOwnerBefore left right
  | .effectOccurrence _, .activityOccurrence _ => true
  | .activityOccurrence _, .effectOccurrence _ => false
  | .activityOccurrence left, .activityOccurrence right =>
      localActivityOwnerBefore left right

/-- Canonical order for complete discriminated local-data ownership. -/
def activityVariableScopeBefore (left right : ActivityVariableScope) : Bool :=
  localDataOwnerBefore left.owner right.owner

def insertActivityVariableScope (scope : ActivityVariableScope) :
    List ActivityVariableScope → List ActivityVariableScope
  | [] => [scope]
  | current :: rest =>
      if activityVariableScopeBefore scope current then
        scope :: current :: rest
      else
        current :: insertActivityVariableScope scope rest

/-- Add the input-mapping scope for one newly activated effect occurrence. Reachable runtime states supply a fresh complete owner. -/
def addActivityVariableScope (variables : ScopedVariables)
    (owner : EffectOccurrenceId)
    (bindings : List VariableBinding) : ScopedVariables :=
  { variables with
    activities := insertActivityVariableScope
      { owner := .effectOccurrence owner, bindings }
      variables.activities }

def evaluateInputMappings : List VariableMapping →
    Option (List VariableBinding)
  | [] => some []
  | [{ target, expression := .stringLiteral value }] =>
      some [{ name := target, value := .string value }]
  | _ => none

def singleStringLiteralMapping : List VariableMapping → Bool
  | [{ target, expression := .stringLiteral value }] =>
      !target.isEmpty && !value.isEmpty
  | _ => false

def singleLocalVariableMapping : List VariableMapping → Bool
  | [{ target, expression := .localVariable name }] =>
      !target.isEmpty && !name.isEmpty
  | _ => false

def applyEffectPatch
    (_arguments : List VariableBinding)
    (outputMappings : List VariableMapping)
    (processBindings : List VariableBinding)
    (localPatch : List VariableBinding)
    (allowNull : Bool) : Option (List VariableBinding) :=
  match outputMappings, localPatch with
  | [], [] => some processBindings
  | [{ target, expression := .localVariable source }],
      [{ name, value }] =>
      if source = name &&
          (match value with
            | .string _ => true
            | .boolean _ => false
            | .integer _ => false
            | .stringList _ => false
            | .null => allowNull) then
        some
          ({ name := target, value } ::
            processBindings.filter fun binding =>
              decide (binding.name ≠ target))
      else
        none
  | _, _ => none

def applyEffectResult
    (arguments : List VariableBinding)
    (outputMappings : List VariableMapping)
    (processBindings : List VariableBinding)
    (result : EffectExecutionResult) : Option (List VariableBinding) :=
  match result with
  | .success localPatch =>
      applyEffectPatch arguments outputMappings processBindings
        localPatch false
  | .bpmnError _ _ localPatch =>
      applyEffectPatch arguments outputMappings processBindings
        localPatch true

/-- Match only the Activity-occurrence-owned arm used by the direct data-input family. -/
def activityOccurrenceScopeMatches (owner : ActivityOccurrenceId)
    (scope : ActivityVariableScope) : Bool :=
  localDataOwnerMatches (.activityOccurrence owner) scope.owner

/-- Add the copied data-input scope for one newly activated Activity occurrence. Separate from the effect entry point because substituting one owner family for the other is the alias this discriminator exists to prevent. -/
def addActivityOccurrenceVariableScope (variables : ScopedVariables)
    (owner : ActivityOccurrenceId)
    (bindings : List VariableBinding) : ScopedVariables :=
  { variables with
    activities := insertActivityVariableScope
      { owner := .activityOccurrence owner, bindings }
      variables.activities }

/-- The bindings of one Activity occurrence's unique local scope, or `none`. -/
def activityOccurrenceVariableBindings (variables : ScopedVariables)
    (owner : ActivityOccurrenceId) : Option (List VariableBinding) :=
  match variables.activities.filter (activityOccurrenceScopeMatches owner) with
  | [scope] => some scope.bindings
  | _ => none

/-- Remove one Activity occurrence's local scope, preserving Process scope and every other owner. A missing or duplicated owner returns `none` rather than removing what it found, so a state that lost the join refuses instead of committing a partial disposal. -/
def removeActivityOccurrenceVariableScope (variables : ScopedVariables)
    (owner : ActivityOccurrenceId) : Option ScopedVariables :=
  match variables.activities.filter (activityOccurrenceScopeMatches owner) with
  | [_] =>
      some
        { variables with
          activities :=
            variables.activities.filter fun scope =>
              !activityOccurrenceScopeMatches owner scope }
  | _ => none

theorem filter_insertActivityVariableScope_of_rejected
    (predicate : ActivityVariableScope → Bool) (inserted : ActivityVariableScope)
    (rejected : predicate inserted = false) : ∀ values : List ActivityVariableScope,
    (insertActivityVariableScope inserted values).filter predicate = values.filter predicate := by
  intro values
  induction values with
  | nil => simp [insertActivityVariableScope, rejected]
  | cons current rest ih =>
      simp only [insertActivityVariableScope]
      split
      · simp [rejected]
      · simp only [List.filter_cons, ih]

theorem filter_insertActivityVariableScope_eq_singleton
    (predicate : ActivityVariableScope → Bool) (inserted : ActivityVariableScope)
    (accepted : predicate inserted = true)
    (rejected : ∀ value ∈ values, predicate value = false) :
    (insertActivityVariableScope inserted values).filter predicate = [inserted] := by
  induction values with
  | nil => simp [insertActivityVariableScope, accepted]
  | cons current rest ih =>
      simp only [insertActivityVariableScope]
      have currentRejected := rejected current (by simp)
      have restRejected : ∀ value ∈ rest, predicate value = false := by
        intro value member
        exact rejected value (by simp [member])
      have restEmpty : rest.filter predicate = [] := List.filter_eq_nil_iff.mpr (by
        intro value member acceptedValue
        rw [restRejected value member] at acceptedValue
        contradiction)
      split
      · simp [accepted, currentRejected, restEmpty]
      · simp [currentRejected, ih restRejected]

theorem all_insertActivityVariableScope (predicate : ActivityVariableScope → Bool)
    (inserted : ActivityVariableScope) : ∀ values : List ActivityVariableScope,
    (insertActivityVariableScope inserted values).all predicate =
      (predicate inserted && values.all predicate) := by
  intro values
  induction values with
  | nil => simp [insertActivityVariableScope]
  | cons current rest ih =>
      simp only [insertActivityVariableScope]
      split <;> simp_all [Bool.and_left_comm]

/-- Removing one Activity-local scope never touches Process scope. -/
theorem removeActivityOccurrenceVariableScope_preserves_process
    {variables result : ScopedVariables} {owner : ActivityOccurrenceId}
    (removed : removeActivityOccurrenceVariableScope variables owner = some result) :
    result.process = variables.process := by
  unfold removeActivityOccurrenceVariableScope at removed
  split at removed
  · cases removed
    rfl
  · exact absurd removed (by simp)

/-- A successful removal had exactly one scope for that owner and leaves none. -/
theorem removeActivityOccurrenceVariableScope_disposes
    {variables result : ScopedVariables} {owner : ActivityOccurrenceId}
    (removed : removeActivityOccurrenceVariableScope variables owner = some result) :
    (variables.activities.filter (activityOccurrenceScopeMatches owner)).length = 1 ∧
      result.activities.filter (activityOccurrenceScopeMatches owner) = [] := by
  unfold removeActivityOccurrenceVariableScope at removed
  split at removed
  · next singleton =>
      cases removed
      refine ⟨by rw [singleton]; rfl, ?_⟩
      simp [List.filter_filter]
  · exact absurd removed (by simp)

/-- Validate one effect result against its unique owned local scope, map into Process scope, and remove only that local scope. Missing or duplicate owners return `none`. -/
def completeActivityVariableScope
    (variables : ScopedVariables)
    (owner : EffectOccurrenceId)
    (outputMappings : List VariableMapping)
    (result : EffectExecutionResult) : Option ScopedVariables :=
  match variables.activities.filter (activityScopeMatches owner) with
  | [activity] =>
      match applyEffectResult activity.bindings outputMappings
          variables.process.bindings result with
      | none => none
      | some processBindings =>
          some
            { process := { bindings := processBindings }
              activities :=
                variables.activities.filter fun scope =>
                  !activityScopeMatches owner scope }
  | _ => none

end BpmnSemantics.SemanticProcess
