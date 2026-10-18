import BpmnSemantics.SemanticProcess.NestedScopeData
import BpmnSemantics.SemanticProcess.NestedScopeDataAdmission
import BpmnSemantics.SemanticProcess.CanonicalBusinessValue
import BpmnSemantics.SemanticProcess.CompensationActivityRetentionProducers
import BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import BpmnSemantics.SemanticProcess.WaitCompletion

/-! # Nested scope-data command writes

User Task and Service Task completion for `nestedScopeDataProfileId`: both write through the scope
chain of the completed wait's owner (`NSD-WRITE-01`) instead of merging into Process data. A
completion patch may name only frame-declared names on that chain (`NSD-TASK-01`), which is a
profile admission restriction: CIB would create a root binding for an undeclared name.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace NestedScopeData

def businessValue? : VariableValue → Option BusinessValue
  | .string value => some (.string value)
  | .null => some .null
  | .boolean value => some (.boolean value)
  | .integer value => some (.integer value)
  | .decimal coefficient scale => some (.decimal coefficient scale)
  | .list members => some (.list members)
  | .map entries => some (.map entries)
  | .stringList _ => none

/-- NSD-TASK-01's measure; `none` for a value outside the portable value arms. -/
def patchUtf8Bytes? (patch : List VariableBinding) : Option Nat := do
  let entries ← patch.mapM fun binding => do
    let value ← businessValue? binding.value
    some (binding.name, value)
  some (canonicalNamedValueArrayUtf8Bytes entries)

/-- One value allowance: the patch limit equals the per-value limit of the portable value contract. -/
def patchByteLimit : Nat := 16384

def declaredNames (program : Program) (variables : ScopedVariables) (owner : ScopeOccurrenceId) :
    List String :=
  (definitionChain program.definitionScopes owner.definitionScopeId).flatMap fun scopeId =>
    (framesOf variables.scopes owner.processInstanceId scopeId).flatMap fun frame => frame.bindings.map (·.name)

/-- NSD-TASK-01: distinct names in canonical order, each declared on the owner's chain, each an
admitted `SingletonBusinessItem`, and the whole patch within one value allowance. -/
def patchAdmitted (program : Program) (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (patch : List VariableBinding) : Bool :=
  strictlySortedStrings (patch.map (·.name)) &&
    patch.all (fun binding => (declaredNames program variables owner).contains binding.name &&
      EffectMappingValuePolicy.singletonBusinessItem.admits true binding.value) &&
    (patchUtf8Bytes? patch).any (· ≤ patchByteLimit)

/-- Both completions re-check Program admission, as the parallel Multi-Instance stimulus gate does, so
a Program of this profile that admission refuses completes no task. -/
def completeUserTask? (program : Program) (state : RuntimeState) (taskId : UserTaskInstanceId)
    (values : List VariableBinding) : Option RuntimeState := do
  let [wait] := state.waits.filter (taskIdNamesWait taskId) | none
  if (programAnalysis program).isNone || wait.processInstanceId != wait.owner.processInstanceId ||
      !patchAdmitted program state.variables wait.owner values then none
  else
    let successor ← completeOrdinaryUserTaskWithCompensation? completeUserTask program state taskId
    let variables ← writeAll? program successor.variables wait.owner.processInstanceId
      wait.owner.definitionScopeId values
    some { successor with variables }

theorem completeUserTask?_unadmitted (program : Program) (state : RuntimeState) (taskId : UserTaskInstanceId)
    (values : List VariableBinding) (unadmitted : programAnalysis program = none) :
    completeUserTask? program state taskId values = none := by
  unfold completeUserTask?
  split <;> simp [unadmitted]

/-- The result patch is validated and projected exactly as for the structured effect-data profile;
only the landing owner of each output differs. -/
def completeEffect? (program : Program) (state : RuntimeState) (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult) : Option RuntimeState := do
  let [wait] := state.effectWaits.filter (effectIdNamesWait effectId) | none
  let .success patch := result | none
  if (programAnalysis program).isNone || wait.processInstanceId != wait.owner.processInstanceId || wait.bpmnErrorRoute.isSome then none
  else
    let [_] := state.variables.activities.filter (activityScopeMatches effectId) | none
    let writes ← serialEffectPatchUnder? .singletonBusinessItem (SerialBusinessTask.programHandlers program)
      wait.outputMappings [] patch
    let released := { state.variables with
      activities := state.variables.activities.filter fun scope => !activityScopeMatches effectId scope }
    let variables ← writeAll? program released wait.owner.processInstanceId wait.owner.definitionScopeId writes
    some { state with
      effectWaits := state.effectWaits.erase wait
      variables
      tokens := addToken state.tokens wait.output wait.owner }

theorem completeEffect?_without_success (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (failure : ∀ patch, result ≠ .success patch) :
    completeEffect? program state effectId result = none := by
  unfold completeEffect?
  split
  · cases result with
    | success patch => exact absurd rfl (failure patch)
    | _ => rfl
  · rfl

end NestedScopeData
end BpmnSemantics.SemanticProcess
