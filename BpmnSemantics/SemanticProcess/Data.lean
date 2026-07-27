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

def applyEffectResult
    (_arguments : List VariableBinding)
    (outputMappings : List VariableMapping)
    (processVariables : List VariableBinding)
    (result : EffectExecutionResult) : Option (List VariableBinding) :=
  match outputMappings, result with
  | [], .success [] => some processVariables
  | [{ target, expression := .localVariable source }],
      .success [{ name, value := .string value }] =>
      if source = name then
        some
          ({ name := target, value := .string value } ::
            processVariables.filter fun binding =>
              decide (binding.name ≠ target))
      else
        none
  | _, _ => none

end BpmnSemantics.SemanticProcess
