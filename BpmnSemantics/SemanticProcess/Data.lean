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

/-- Private bindings owned by one complete semantic effect occurrence. -/
structure ActivityVariableScope where
  owner : EffectOccurrenceId
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

def activityScopeMatches (owner : EffectOccurrenceId)
    (scope : ActivityVariableScope) : Bool :=
  decide (
    scope.owner.processInstanceId = owner.processInstanceId &&
      scope.owner.elementId.value = owner.elementId.value &&
      scope.owner.activation = owner.activation)

/-- Add the input-mapping scope for one newly activated effect occurrence. Reachable runtime states supply a fresh complete owner. -/
def addActivityVariableScope (variables : ScopedVariables)
    (owner : EffectOccurrenceId)
    (bindings : List VariableBinding) : ScopedVariables :=
  { variables with
    activities := variables.activities ++ [{ owner, bindings }] }

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
