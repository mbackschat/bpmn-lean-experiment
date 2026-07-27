import BpmnSemantics.SemanticProcess.Lowering

/-! # Semantic Process bounded data mappings

This module owns the string-only mapping mechanisms admitted by the CreateDocument capsule. It deliberately implements only the empty payload-free effect and the exact one-literal-input/one-local-output shape.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def evaluateInputMappings : List VariableMapping →
    Option (List VariableBinding)
  | [] => some []
  | [{ target, expression := .stringLiteral value }] =>
      some [{ name := target, value := .string value }]
  | _ => none

def applyEffectPatch
    (_arguments : List VariableBinding)
    (outputMappings : List VariableMapping)
    (processVariables : List VariableBinding)
    (localPatch : List VariableBinding)
    (allowNull : Bool) : Option (List VariableBinding) :=
  match outputMappings, localPatch with
  | [], [] => some processVariables
  | [{ target, expression := .localVariable source }],
      [{ name, value }] =>
      if source = name &&
          (match value with
            | .string _ => true
            | .null => allowNull) then
        some
          ({ name := target, value } ::
            processVariables.filter fun binding =>
              decide (binding.name ≠ target))
      else
        none
  | _, _ => none

def applyEffectResult
    (arguments : List VariableBinding)
    (outputMappings : List VariableMapping)
    (processVariables : List VariableBinding)
    (result : EffectExecutionResult) : Option (List VariableBinding) :=
  match result with
  | .success localPatch =>
      applyEffectPatch arguments outputMappings processVariables
        localPatch false
  | .bpmnError _ _ localPatch =>
      applyEffectPatch arguments outputMappings processVariables
        localPatch true

end BpmnSemantics.SemanticProcess
