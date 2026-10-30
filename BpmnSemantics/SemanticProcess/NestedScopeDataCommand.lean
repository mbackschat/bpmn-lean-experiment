module

public import BpmnSemantics.SemanticProcess.NestedScopeData
public import BpmnSemantics.SemanticProcess.NestedScopeDataAdmission
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
public import BpmnSemantics.SemanticProcess.CompensationActivityRetentionProducers
public import BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
public import BpmnSemantics.SemanticProcess.WaitCompletion
meta import BpmnSemantics.PrivateEquationLemmas

/-! # Nested scope-data command writes

User Task and Service Task completion for `nestedScopeDataProfileId` and for data-bearing embedded
completion Programs (CSD-CHAIN-01): both write through the scope
chain of the completed wait's owner (`NSD-WRITE-01`) instead of merging into Process data. A
completion patch may name only frame-declared names on that chain (`NSD-TASK-01`), which is a
profile admission restriction: CIB would create a root binding for an undeclared name.
-/

public section

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

/-- The names declared on the owner's chain; at a called root, CVM-TASK-01 adds the output sources,
which the callee may set before return although no input copied them. The sources are those of the
Call whose live record created this instance's called root (CALLN-FRAME-01). -/
def declaredNames (program : Program) (state : RuntimeState) (owner : ScopeOccurrenceId) :
    List String :=
  let chain := (occurrenceChain state.scopeOccurrences owner).getD []
  let framed := chain.flatMap fun occurrence =>
    (framesAt state.variables.scopes occurrence).flatMap fun frame => frame.bindings.map (·.name)
  let mappings := calledRootOf? program chain >>= calledRootMappings? program state.calledProcessOccurrences
  let sources := match mappings with
    | some (_, outputs) => outputs.filterMap fun mapping => match mapping.expression with
        | .localVariable name => some name
        | _ => none
    | none => []
  framed ++ sources

/-- NSD-TASK-01: distinct names in canonical order, each declared on the owner's chain, each within the
Program's effect policy, and the whole patch within one value allowance. -/
def patchAdmitted (program : Program) (state : RuntimeState) (owner : ScopeOccurrenceId)
    (patch : List VariableBinding) : Bool :=
  strictlySortedStrings (patch.map (·.name)) &&
    patch.all (fun binding => (declaredNames program state owner).contains binding.name &&
      (programEffectMappingValuePolicy program).admits true binding.value) &&
    (patchUtf8Bytes? patch).any (· ≤ patchByteLimit)

/-- CVM-REFUSE-01: besides the running root, a task may belong to a called instance that a live Call
record of the root created; a task of any other instance is refused. -/
def calledTaskOfHost (state : RuntimeState) (host : SemanticId) (taskId : UserTaskInstanceId) : Bool :=
  state.calledProcessOccurrences.any fun record =>
    record.caller.processInstanceId == host && record.calledRoot.processInstanceId == taskId.processInstanceId

/-- The admission both completions re-check: the nested scope-control analysis for a data-bearing
embedded completion Program (CSD-ADMIT-01), otherwise the nested scope-data profile's serial analysis. -/
def programAdmitted (program : Program) : Bool :=
  if embeddedScopeDataBearing program then (NestedScopeControl.programAnalysis program).isSome
  else (programAnalysis program).isSome

run_meta privateEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`programAdmitted]

/-- Neither analysis admits a single scope, so a one-scope Program completes no task through this path. -/
theorem programAdmitted_one_scope (program : Program) (one : program.definitionScopes.length = 1) :
    programAdmitted program = false := by
  simp [programAdmitted, programAnalysis_one_scope program one, NestedScopeControl.programAnalysis_one_scope program one]

/-- Both completions re-check Program admission, as the parallel Multi-Instance stimulus gate does, so
a Program that admission refuses completes no task. -/
def completeUserTask? (program : Program) (state : RuntimeState) (taskId : UserTaskInstanceId)
    (values : List VariableBinding) : Option RuntimeState := do
  let [wait] := state.waits.filter (taskIdNamesWait taskId) | none
  if !programAdmitted program || wait.processInstanceId != wait.owner.processInstanceId ||
      !patchAdmitted program state wait.owner values then none
  else
    let successor ← completeOrdinaryUserTaskWithCompensation? completeUserTask program state taskId
    let variables ← writeAll? program successor.scopeOccurrences successor.variables wait.owner values
    some { successor with variables }

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`completeUserTask?]

theorem completeUserTask?_unadmitted (program : Program) (state : RuntimeState) (taskId : UserTaskInstanceId)
    (values : List VariableBinding) (unadmitted : programAdmitted program = false) :
    completeUserTask? program state taskId values = none := by
  unfold completeUserTask?
  split <;> simp [unadmitted]

/-- The result patch is validated and projected exactly as for the structured effect-data profile, under
the Program's effect policy; only the landing owner of each output differs. -/
def completeEffect? (program : Program) (state : RuntimeState) (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult) : Option RuntimeState := do
  let [wait] := state.effectWaits.filter (effectIdNamesWait effectId) | none
  let .success patch := result | none
  if !programAdmitted program || wait.processInstanceId != wait.owner.processInstanceId || wait.bpmnErrorRoute.isSome then none
  else
    let [_] := state.variables.activities.filter (activityScopeMatches effectId) | none
    let writes ← serialEffectPatchUnder? (programEffectMappingValuePolicy program) (SerialBusinessTask.programHandlers program)
      wait.outputMappings [] patch
    let released := { state.variables with
      activities := state.variables.activities.filter fun scope => !activityScopeMatches effectId scope }
    let variables ← writeAll? program state.scopeOccurrences released wait.owner writes
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
