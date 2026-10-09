import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Occurrence-owned embedded scope data

SMIS-DATA-01 fixes pre-entry Process evaluation, present-null shadowing and nearest-existing writes.
These storage operations establish no body lifecycle, source admission or command-policy claim.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- SMIS-DATA-01 selects a unique complete owner before inspecting any binding. -/
def selectScopeVariables? (variables : ScopedVariables) (owner : ScopeOccurrenceId) :
    Option ScopeVariableScope :=
  match variables.scopes.filter fun scope => decide (scope.owner = owner) with
  | [scope] => some scope
  | _ => none

/-- String/null is the selected body-local domain; Boolean condition writes belong to command policy. -/
def scopeVariableScalar : VariableValue → Bool
  | .string _ | .null => true
  | .boolean _ | .integer _ | .stringList _ => false

def scopeVariableNamesUnique (bindings : List VariableBinding) : Bool :=
  decide (bindings.map (·.name)).Nodup

/-- All declarations see the unchanged enclosing Process, including same-named input targets. -/
def initializeScopeVariables? (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (mappings : List VariableMapping) : Option ScopedVariables := do
  if variables.scopes.any (fun scope => decide (scope.owner = owner)) then none
  else
    let bindings ← evaluateEnclosingInputMappings variables.process.bindings mappings
    if !scopeVariableNamesUnique bindings then none
    else some { variables with scopes :=
      (canonicalInsertBy (fun left right => scopeOwnerBefore left.owner right.owner)
        { owner, bindings := mergeProcessVariableBindings [] bindings } variables.scopes) }

private def readScopeScalar? (bindings : List VariableBinding) (name : String) :
    Option VariableValue :=
  match bindings.filter (·.name == name) with
  | [binding] => if scopeVariableScalar binding.value then some binding.value else none
  | _ => none

/-- Owner ambiguity and a malformed present local refuse; only an absent local consults Process data. -/
def readScopeVariable? (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (name : String) : Option VariableValue := do
  let scope ← selectScopeVariables? variables owner
  match scope.bindings.filter (·.name == name) with
  | [] => readScopeScalar? variables.process.bindings name
  | [binding] => if scopeVariableScalar binding.value then some binding.value else none
  | _ => none

/-- Patches update declared body names; other names merge into Process without inventing locals. -/
def writeScopeVariables? (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (patch : List VariableBinding) : Option ScopedVariables := do
  let scope ← selectScopeVariables? variables owner
  if !scopeVariableNamesUnique scope.bindings || !scopeVariableNamesUnique patch ||
      !(patch.all fun binding => scopeVariableScalar binding.value) then none
  else
    let localNames := scope.bindings.map (·.name)
    let localPatch := patch.filter fun binding => localNames.contains binding.name
    let processPatch := patch.filter fun binding => !localNames.contains binding.name
    some { variables with
      process := { bindings := mergeProcessVariableBindings variables.process.bindings processPatch }
      scopes := variables.scopes.map fun candidate =>
        if candidate.owner = owner then
          { candidate with bindings := mergeProcessVariableBindings candidate.bindings localPatch }
        else candidate }

/-- Body disposal requires one exact frame; duplicated owners cannot be silently repaired. -/
def removeScopeVariables? (variables : ScopedVariables) (owner : ScopeOccurrenceId) :
    Option ScopedVariables := do
  let _ ← selectScopeVariables? variables owner
  some { variables with scopes := variables.scopes.filter fun scope => decide (scope.owner ≠ owner) }

theorem selectScopeVariables_iff {variables : ScopedVariables} {owner : ScopeOccurrenceId}
    {scope : ScopeVariableScope} :
    selectScopeVariables? variables owner = some scope ↔
      variables.scopes.filter (fun candidate => decide (candidate.owner = owner)) = [scope] := by
  unfold selectScopeVariables?
  split <;> simp_all

theorem selectScopeVariables_exact_owner {variables : ScopedVariables}
    {owner : ScopeOccurrenceId} {scope : ScopeVariableScope}
    (selected : selectScopeVariables? variables owner = some scope) : scope.owner = owner := by
  have singleton := selectScopeVariables_iff.mp selected
  have member : scope ∈ variables.scopes.filter (fun candidate => decide (candidate.owner = owner)) := by
    rw [singleton]
    simp
  exact of_decide_eq_true (List.mem_filter.mp member).2

theorem scopeVariable_operations_refuse_unselected {variables : ScopedVariables}
    {owner : ScopeOccurrenceId} (unselected : selectScopeVariables? variables owner = none)
    (name : String) (patch : List VariableBinding) :
    readScopeVariable? variables owner name = none ∧
      writeScopeVariables? variables owner patch = none ∧ removeScopeVariables? variables owner = none := by
  simp [readScopeVariable?, writeScopeVariables?, removeScopeVariables?, unselected]

theorem scopeVariable_duplicate_owner_refused (variables : ScopedVariables)
    (owner : ScopeOccurrenceId) (first second : ScopeVariableScope)
    (firstOwner : first.owner = owner) (secondOwner : second.owner = owner) :
    selectScopeVariables? { variables with scopes := [first, second] } owner = none := by
  simp [selectScopeVariables?, firstOwner, secondOwner]

theorem scopeVariable_present_null_shadows_process {variables : ScopedVariables}
    {owner : ScopeOccurrenceId} {scope : ScopeVariableScope} {name : String}
    (selected : selectScopeVariables? variables owner = some scope)
    (localNull : scope.bindings.filter (·.name == name) = [{ name, value := .null }]) :
    readScopeVariable? variables owner name = some .null := by
  simp [readScopeVariable?, selected, localNull, scopeVariableScalar]

theorem removeScopeVariables_success_iff {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} :
    removeScopeVariables? variables owner = some result ↔
      (∃ scope, selectScopeVariables? variables owner = some scope) ∧
      result = { variables with scopes := variables.scopes.filter fun scope => decide (scope.owner ≠ owner) } := by
  cases selected : selectScopeVariables? variables owner <;>
    simp [removeScopeVariables?, selected, eq_comm]

theorem removeScopeVariables_preserves_other_data {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} (removed : removeScopeVariables? variables owner = some result) :
    result.process = variables.process ∧ result.activities = variables.activities ∧
      result.processInterfaces = variables.processInterfaces := by
  obtain ⟨_, rfl⟩ := removeScopeVariables_success_iff.mp removed
  exact ⟨rfl, rfl, rfl⟩

theorem removeScopeVariables_exact_disposal {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} (removed : removeScopeVariables? variables owner = some result) :
    result.scopes.filter (fun scope => decide (scope.owner = owner)) = [] ∧
      result.scopes.filter (fun scope => decide (scope.owner ≠ owner)) =
        variables.scopes.filter (fun scope => decide (scope.owner ≠ owner)) := by
  obtain ⟨_, rfl⟩ := removeScopeVariables_success_iff.mp removed
  simp [List.filter_filter]

theorem initializeScopeVariables_preserves_other_data {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {mappings : List VariableMapping}
    (initialized : initializeScopeVariables? variables owner mappings = some result) :
    result.process = variables.process ∧ result.activities = variables.activities ∧
      result.processInterfaces = variables.processInterfaces := by
  unfold initializeScopeVariables? at initialized
  split at initialized
  · simp at initialized
  · cases evaluated : evaluateEnclosingInputMappings variables.process.bindings mappings with
    | none => simp [evaluated] at initialized
    | some bindings =>
      simp [evaluated] at initialized
      rcases initialized with ⟨_, rfl⟩
      exact ⟨rfl, rfl, rfl⟩

theorem writeScopeVariables_preserves_other_data {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {patch : List VariableBinding}
    (written : writeScopeVariables? variables owner patch = some result) :
    result.activities = variables.activities ∧ result.processInterfaces = variables.processInterfaces := by
  unfold writeScopeVariables? at written
  cases selected : selectScopeVariables? variables owner with
  | none => simp [selected] at written
  | some scope =>
    simp [selected] at written
    rcases written with ⟨_, rfl⟩
    exact ⟨rfl, rfl⟩

private theorem insert_scope_filter_other (owner : ScopeOccurrenceId)
    (bindings : List VariableBinding) (scopes : List ScopeVariableScope) :
    (canonicalInsertBy (fun left right => scopeOwnerBefore left.owner right.owner)
      { owner, bindings } scopes).filter (fun scope => decide (scope.owner ≠ owner)) =
        scopes.filter (fun scope => decide (scope.owner ≠ owner)) := by
  induction scopes with
  | nil => simp [canonicalInsertBy]
  | cons first rest ih =>
    simp only [canonicalInsertBy]
    split <;> simp_all [List.filter_cons]

theorem initializeScopeVariables_preserves_other_scopes {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {mappings : List VariableMapping}
    (initialized : initializeScopeVariables? variables owner mappings = some result) :
    result.scopes.filter (fun scope => decide (scope.owner ≠ owner)) =
      variables.scopes.filter (fun scope => decide (scope.owner ≠ owner)) := by
  unfold initializeScopeVariables? at initialized
  split at initialized
  · simp at initialized
  · cases evaluated : evaluateEnclosingInputMappings variables.process.bindings mappings with
    | none => simp [evaluated] at initialized
    | some bindings =>
      simp [evaluated] at initialized
      rcases initialized with ⟨_, rfl⟩
      exact insert_scope_filter_other owner _ _

private theorem write_scope_filter_other (owner : ScopeOccurrenceId)
    (patch : List VariableBinding) (scopes : List ScopeVariableScope) :
    (scopes.map fun candidate => if candidate.owner = owner then
      { candidate with bindings := mergeProcessVariableBindings candidate.bindings patch }
      else candidate).filter (fun scope => decide (scope.owner ≠ owner)) =
        scopes.filter (fun scope => decide (scope.owner ≠ owner)) := by
  induction scopes with
  | nil => rfl
  | cons first rest ih =>
    by_cases same : first.owner = owner <;> simp_all

theorem writeScopeVariables_preserves_other_scopes {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {patch : List VariableBinding}
    (written : writeScopeVariables? variables owner patch = some result) :
    result.scopes.filter (fun scope => decide (scope.owner ≠ owner)) =
      variables.scopes.filter (fun scope => decide (scope.owner ≠ owner)) := by
  unfold writeScopeVariables? at written
  cases selected : selectScopeVariables? variables owner with
  | none => simp [selected] at written
  | some scope =>
    simp [selected] at written
    rcases written with ⟨_, rfl⟩
    exact write_scope_filter_other owner _ _

/-- SMIS-DATA-01 routes values without creating, dropping or reidentifying any body-local owner. -/
theorem writeScopeVariables_preserves_owner_census {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {patch : List VariableBinding}
    (written : writeScopeVariables? variables owner patch = some result) :
    result.scopes.map (·.owner) = variables.scopes.map (·.owner) := by
  unfold writeScopeVariables? at written
  obtain ⟨scope, _, written⟩ := Option.bind_eq_some_iff.mp written
  split at written <;> try contradiction
  cases Option.some.inj written
  simp only [List.map_map]
  apply List.map_congr_left
  intro candidate _
  simp only [Function.comp_def]
  split <;> rfl

/-- Unique frame selection depends on owner multiplicity, not mutable local values. -/
theorem selectScopeVariables_owner_census (before after : ScopedVariables) (owner : ScopeOccurrenceId)
    (owners : after.scopes.map (·.owner) = before.scopes.map (·.owner))
    (selected : ∃ frame, selectScopeVariables? before owner = some frame) :
    ∃ frame, selectScopeVariables? after owner = some frame := by
  obtain ⟨frame, selected⟩ := selected
  have lengths := congrArg (fun values : List ScopeOccurrenceId =>
    (values.filter (fun candidate => decide (candidate = owner))).length) owners
  simp only [List.filter_map, List.length_map, Function.comp_def] at lengths
  rw [selectScopeVariables_iff.mp selected] at lengths
  obtain ⟨nextFrame, census⟩ := List.length_eq_one_iff.mp lengths
  exact ⟨nextFrame, selectScopeVariables_iff.mpr census⟩

/-- Scope and Process writes leave separate Activity-local frames unchanged. -/
theorem writeScopeVariables_preserves_activities {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {patch : List VariableBinding}
    (written : writeScopeVariables? variables owner patch = some result) :
    result.activities = variables.activities := by
  unfold writeScopeVariables? at written
  obtain ⟨scope, _, written⟩ := Option.bind_eq_some_iff.mp written
  split at written <;> try contradiction
  cases Option.some.inj written
  rfl

end BpmnSemantics.SemanticProcess
