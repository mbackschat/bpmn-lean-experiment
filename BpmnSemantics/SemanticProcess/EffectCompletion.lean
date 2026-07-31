import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Semantic Process effect completion

This module owns external effect-occurrence matching, successful typed result routing, the executable completion transition, and its declarative soundness bridge. Command admission and internal closure remain in `Execution`.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def effectOccurrenceMatches (effectId : EffectOccurrenceId)
    (wait : EffectWait) : Bool :=
  decide (
    wait.processInstanceId = effectId.processInstanceId &&
      wait.elementId.value = effectId.elementId.value &&
      wait.activation = effectId.activation)

def effectResultOutput (wait : EffectWait) :
    EffectExecutionResult → Option ControlPlaceId
  | .success _ => some wait.output
  | .bpmnError code _ _ =>
      match wait.bpmnErrorRoute with
      | some route => if route.code = code then some route.output else none
      | none => none

/-- Declarative account of one successful effect-result transition. It exposes occurrence matching and mapping validation as separate premises rather than defining validity through the executable transition. -/
inductive EffectCompletionStep :
    RuntimeState → EffectOccurrenceId → EffectExecutionResult →
      RuntimeState → Prop where
  | commit
      (state : RuntimeState)
      (effectId : EffectOccurrenceId)
      (result : EffectExecutionResult)
      (wait : EffectWait)
      (variables : ScopedVariables)
      (output : ControlPlaceId)
      (occurrence :
        state.effectWaits.find? (effectOccurrenceMatches effectId) = some wait)
      (mapping :
        completeActivityVariableScope state.variables effectId
          wait.outputMappings result = some variables)
      (route : effectResultOutput wait result = some output) :
      EffectCompletionStep state effectId result
        { state with
          effectWaits := state.effectWaits.erase wait
          variables
          tokens := addToken state.tokens output wait.owner }

def completeEffect (state : RuntimeState) (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult) : Option RuntimeState :=
  match state.effectWaits.find? (effectOccurrenceMatches effectId) with
  | none => none
  | some wait =>
      match completeActivityVariableScope state.variables effectId
          wait.outputMappings result with
      | none => none
      | some variables =>
          match effectResultOutput wait result with
          | none => none
          | some output =>
              some
                { state with
                  effectWaits := state.effectWaits.erase wait
                  variables
                  tokens := addToken state.tokens output wait.owner }

/-- Every successful executable effect completion is permitted by the separately stated effect-result relation. -/
theorem completeEffect_sound
    (state successor : RuntimeState)
    (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult)
    (success : completeEffect state effectId result = some successor) :
    EffectCompletionStep state effectId result successor := by
  unfold completeEffect at success
  split at success
  · contradiction
  · rename_i wait occurrence
    split at success
    · contradiction
    · rename_i variables mapping
      split at success
      · contradiction
      · rename_i output route
        cases success
        exact .commit state effectId result wait variables output
          occurrence mapping route

end BpmnSemantics.SemanticProcess
