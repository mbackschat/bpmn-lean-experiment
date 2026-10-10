import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.RuntimeState
import BpmnSemantics.SemanticProcess.SerialBusinessTaskAdmission

/-! # Semantic Process effect completion

This module owns external effect-occurrence matching, successful typed result routing, the executable completion transition, and its declarative soundness bridge. Command admission and internal closure remain in `Execution`.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

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
        state.effectWaits.find? (effectIdNamesWait effectId) = some wait)
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
  match state.effectWaits.find? (effectIdNamesWait effectId) with
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

/-- SBT-REFUSE-01 checks root ownership and the complete declaration/wait/local join before ingress. -/
def serialRuntimeAssociationsValid (program : Program) (state : RuntimeState)
    (businessError : Bool := false) : Bool :=
  let ownerValid := fun (owner : ScopeOccurrenceId) =>
    state.control == .running owner.processInstanceId &&
      (state.scopeOccurrences.filter (·.id == owner)).length == 1 &&
      program.definitionScopes.any (·.id == owner.definitionScopeId)
  state.messageWaits.isEmpty && state.timerWaits.isEmpty && state.effectIncidents.isEmpty &&
    state.eventRaces.isEmpty && state.activityOccurrences.isEmpty &&
    state.calledProcessOccurrences.isEmpty && state.sequentialMultiInstanceControllers.isEmpty &&
    state.parallelMultiInstanceControllers.isEmpty && state.compensationHandlerEffectWaits.isEmpty &&
    state.waits.length + state.effectWaits.length + state.tokens.length +
      (if state.initiationPending then 1 else 0) ≤ 1 &&
    state.waits.all (fun wait => ownerValid wait.owner &&
      wait.processInstanceId == wait.owner.processInstanceId &&
      (program.operations.filter (fun operation => match operation with
        | .awaitUserTask _ _ _ output task => task == wait.task && output == wait.output &&
            wait.metadata == task.metadata
        | _ => false)).length == 1) &&
    state.effectWaits.all (fun wait => ownerValid wait.owner &&
      wait.processInstanceId == wait.owner.processInstanceId &&
      (program.operations.filter (fun operation => match operation with
        | .awaitEffect _ _ _ output effect none => effect.elementId == wait.elementId &&
            effect.descriptor == wait.descriptor && output == wait.output &&
            effect.outputMappings == wait.outputMappings && wait.bpmnErrorRoute.isNone &&
            inputSnapshotMatches effect.inputMappings wait.arguments
        | .awaitEffect _ _ _ output effect (some route) => businessError &&
            effect.elementId == wait.elementId && effect.descriptor == wait.descriptor &&
            output == wait.output && effect.outputMappings == wait.outputMappings &&
            wait.bpmnErrorRoute == some route &&
            inputSnapshotMatches effect.inputMappings wait.arguments
        | _ => false)).length == 1 &&
      match state.variables.activities.filter (activityScopeMatches
          ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩) with
      | [scope] => scope.bindings == wait.arguments
      | _ => false) &&
    state.variables.activities.all (fun scope =>
      (state.effectWaits.filter (fun wait => activityScopeMatches
        ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩ scope)).length == 1)

/-- SBT-RESULT-01 requires each distinct source exactly once before mapping any target. -/
def serialEffectPatch? (handlers : List String) (outputs : List VariableMapping)
    (bindings patch : List VariableBinding) : Option (List VariableBinding) := do
  if !(SerialBusinessTask.bindingsValid handlers patch) then none
  else do
    let sources ← outputs.mapM fun mapping => match mapping.expression with
      | .localVariable name => some name
      | _ => none
    if !(sources.eraseDups.length == patch.length &&
        sources.all (fun name => patch.any (·.name == name))) then none
    else do
      let writes ← outputs.mapM fun mapping => match mapping.expression with
        | .localVariable name => do
            let value ← enclosingVariable? patch name
            return { name := mapping.target, value : VariableBinding }
        | _ => none
      return mergeProcessVariableBindings bindings writes

/-- Only the selected occurrence loses its local scope; explicit result bindings take precedence over all parent and input bindings. -/
def completeSerialActivityScope? (handlers : List String) (variables : ScopedVariables)
    (owner : EffectOccurrenceId) (outputs : List VariableMapping)
    (result : EffectExecutionResult) : Option ScopedVariables := do
  match variables.activities.filter (activityScopeMatches owner), result with
  | [_], .success patch =>
      let bindings ← serialEffectPatch? handlers outputs variables.process.bindings patch
      return { variables with
        process := { bindings }
        activities := variables.activities.filter fun scope => !activityScopeMatches owner scope }
  | _, _ => none

def completeSerialEffect? (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult) : Option RuntimeState := do
  match state.effectWaits.filter (effectIdNamesWait effectId) with
  | [wait] =>
      let variables ← completeSerialActivityScope? (SerialBusinessTask.programHandlers program)
        state.variables effectId wait.outputMappings result
      return { state with
        effectWaits := state.effectWaits.erase wait
        variables
        tokens := addToken state.tokens wait.output wait.owner }
  | _ => none

/-- MBERR-MAP-01 combines exact local-result mapping with the active occurrence's attached route. -/
def completeBusinessEffect? (handlers : List String) (state : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult) : Option RuntimeState := do
  match state.effectWaits.filter (effectIdNamesWait effectId) with
  | [wait] =>
      let output ← effectResultOutput wait result
      let patch := match result with
        | .success patch | .bpmnError _ _ patch => patch
      let variables ← completeSerialActivityScope? handlers state.variables effectId
        wait.outputMappings (.success patch)
      return { state with
        effectWaits := state.effectWaits.erase wait
        variables
        tokens := addToken state.tokens output wait.owner }
  | _ => none

end BpmnSemantics.SemanticProcess
