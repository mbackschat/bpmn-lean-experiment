import BpmnSemantics.SemanticProcess.ScopeVariableData
import BpmnSemantics.SemanticProcess.SerialBusinessTaskAdmission

/-! SMIS-DATA-01/PMIS-DATA-01: shared write policy after validating the exact repeated-body binding. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive MultiInstanceScopeWriteKind where
  | userTask | serviceTask
  deriving Repr, DecidableEq

/-- Protected iteration inputs and handler names are immutable; only human completion may set the Process condition. -/
def writeBoundMultiInstanceScopeValues? (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (collectionName itemName : String) (condition : Option String) (handlers : List String)
    (values : List VariableBinding) (kind : MultiInstanceScopeWriteKind) : Option ScopedVariables := do
  let permitted := values.all fun value =>
    SerialBusinessTask.identifier value.name && !handlers.contains value.name &&
      value.name != collectionName && value.name != itemName &&
      (if condition == some value.name then kind == .userTask &&
        (match value.value with | .boolean _ => true | _ => false)
      else scopeVariableScalar value.value)
  if !permitted || !decide (values.Pairwise fun left right => left.name < right.name) then none
  else
    let variables ← writeScopeVariables? variables owner (values.filter fun value => condition != some value.name)
    let processValues := values.filter fun value => condition == some value.name
    some { variables with process := { bindings := mergeProcessVariableBindings variables.process.bindings processValues } }

/-- Both writer kinds preserve every nonselected body frame, including its order and multiplicity. -/
theorem writeBoundMultiInstanceScopeValues_preserves_other_scopes
    {variables result : ScopedVariables} {owner : ScopeOccurrenceId} {collectionName itemName : String}
    {condition : Option String} {handlers : List String} {values : List VariableBinding} {kind : MultiInstanceScopeWriteKind}
    (written : writeBoundMultiInstanceScopeValues? variables owner collectionName itemName condition handlers values kind = some result) :
    result.scopes.filter (fun scope => decide (scope.owner ≠ owner)) =
      variables.scopes.filter (fun scope => decide (scope.owner ≠ owner)) := by
  unfold writeBoundMultiInstanceScopeValues? at written
  dsimp only at written
  split at written <;> try contradiction
  obtain ⟨bodyVariables, bodyWrite, written⟩ := Option.bind_eq_some_iff.mp written
  cases Option.some.inj written
  exact writeScopeVariables_preserves_other_scopes (result := bodyVariables) bodyWrite

end BpmnSemantics.SemanticProcess
