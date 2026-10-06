import BpmnSemantics.SemanticProcess.ParallelScopeRuntime
import BpmnSemantics.SemanticProcess.MultiInstanceScopeWrite
import BpmnSemantics.SemanticProcess.EffectCompletion

/-! PMIS-DATA-01: occurrence-bound input evaluation for parallel repeated bodies. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def hasParallelScopeDefinition (program : Program) (owner : ScopeOccurrenceId) : Bool :=
  (program.operations.filterMap parallelScopeEntry?).any (·.childScopeId == owner.definitionScopeId)

/-- PMIS-DATA-01 binds the exact live body before resolving local presence, captured item and Process fallback. -/
def evaluateParallelScopeInputs? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping) : Option (List VariableBinding) := do
  let [entry] := (program.operations.filterMap parallelScopeEntry?).filter
    (·.childScopeId == owner.definitionScopeId) | none
  let binding ← parallelScopeBinding? entry state owner
  let [iteration] := binding.iterations.filter (·.scope == owner) | none
  let itemContext := { state.variables with process := { bindings :=
    ⟨entry.itemName, .string iteration.item⟩ :: state.variables.process.bindings.filter (·.name != entry.itemName) } }
  let handlers := program.operations.filterMap fun operation => match operation with
    | .awaitEffect _ _ _ _ effect _ => some effect.descriptor.operation
    | _ => none
  evaluateInputMappings? (fun name => if handlers.contains name then none
    else readScopeVariable? itemContext owner name) mappings

/-- PMIS-DATA-01 validates the complete population before applying the shared nearest-scope write policy. -/
def writeParallelScopeValues? (program : Program) (state : RuntimeState) (owner : ScopeOccurrenceId)
    (values : List VariableBinding) (kind : MultiInstanceScopeWriteKind) : Option ScopedVariables := do
  let [entry] := (program.operations.filterMap parallelScopeEntry?).filter
    (·.childScopeId == owner.definitionScopeId) | none
  let _ ← parallelScopeBinding? entry state owner
  let handlers := program.operations.filterMap fun operation => match operation with
    | .awaitEffect _ _ _ _ effect _ => some effect.descriptor.operation
    | _ => none
  writeBoundMultiInstanceScopeValues? state.variables owner entry.collectionName entry.itemName
    entry.completionBooleanName handlers values kind

/-- PMIS-DATA-01 commits exact effect disposal, explicit result mapping and body continuation together. -/
def completeParallelScopeEffect? (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult) : Option RuntimeState := do
  let [wait] := state.effectWaits.filter (effectOccurrenceMatches effectId) | none
  let .success patch := result | none
  if wait.processInstanceId != wait.owner.processInstanceId || wait.bpmnErrorRoute.isSome then none
  else
    let [activity] := state.variables.activities.filter (activityScopeMatches effectId) | none
    let projected ← applyEffectPatch activity.bindings wait.outputMappings [] patch true
    let variables ← writeParallelScopeValues? program state wait.owner (mergeProcessVariableBindings [] projected) .serviceTask
    some { state with
      variables := { variables with activities := variables.activities.filter fun scope => !activityScopeMatches effectId scope }
      effectWaits := state.effectWaits.erase wait
      tokens := addToken state.tokens wait.output wait.owner }

/-- PMIS-DATA-01 binds human writes and continuation to one exact live wait and body. -/
def completeParallelScopeUserTask? (program : Program) (state : RuntimeState)
    (taskId : UserTaskInstanceId) (values : List VariableBinding) : Option RuntimeState := do
  let [wait] := state.waits.filter (fun wait => wait.processInstanceId == taskId.processInstanceId &&
    wait.task.id.value == taskId.elementId.value && wait.activation == taskId.activation) | none
  if wait.processInstanceId != wait.owner.processInstanceId then none
  else
    let variables ← writeParallelScopeValues? program state wait.owner values .userTask
    some { state with waits := state.waits.erase wait, variables, tokens := addToken state.tokens wait.output wait.owner }

/-- PMIS-DATA-01 extends sibling isolation to the actual population-bound write entry point. -/
theorem writeParallelScopeValues_preserves_other_scopes {program : Program} {state : RuntimeState}
    {owner : ScopeOccurrenceId} {values : List VariableBinding} {kind : MultiInstanceScopeWriteKind} {result : ScopedVariables}
    (written : writeParallelScopeValues? program state owner values kind = some result) :
    result.scopes.filter (fun scope => decide (scope.owner ≠ owner)) =
      state.variables.scopes.filter (fun scope => decide (scope.owner ≠ owner)) := by
  unfold writeParallelScopeValues? at written
  split at written <;> try contradiction
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  exact writeBoundMultiInstanceScopeValues_preserves_other_scopes written

end BpmnSemantics.SemanticProcess
