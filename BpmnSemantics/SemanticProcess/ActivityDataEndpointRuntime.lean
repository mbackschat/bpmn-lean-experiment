import BpmnSemantics.SemanticProcess.ProcessInterfaceRuntime

/-! # Owned Activity data endpoints

These pure selectors and writers implement CDATA-OWNER-01 and CDATA-OUTPUT-01. Caller Properties
are available only to the hosting instance; Process ports belong to the complete selected scope.
No endpoint falls back to another store, and no write changes Activity-local bindings.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def activityDataPropertyOwner (state : RuntimeState) (owner : ScopeOccurrenceId) : Bool :=
  match state.control with
  | .running instanceId => decide (owner.processInstanceId = instanceId)
  | _ => false

def readActivityDataInput? (state : RuntimeState) (owner : ScopeOccurrenceId)
    (input : DirectActivityDataInput) : Option VariableBinding :=
  match input.source with
  | .property propertyId =>
      if activityDataPropertyOwner state owner then
        match state.variables.process.bindings.filter fun binding => decide (binding.name = propertyId) with
        | [binding] => if processInterfaceScalar binding.value then some binding else none
        | _ => none
      else none
  | .processDataInput dataInputId =>
      readProcessInterfaceInput? state.variables owner dataInputId

/-- The destination variables may already have their selected Activity local removed. The original
state supplies only hosting ownership; returning `none` commits neither routing nor disposal. -/
def writeActivityDataOutput? (state : RuntimeState) (owner : ScopeOccurrenceId)
    (variables : ScopedVariables) (output : DirectActivityDataOutput)
    (filled : VariableBinding) : Option ScopedVariables :=
  if processInterfaceScalar filled.value then
    match output.target with
    | .property propertyId =>
        if activityDataPropertyOwner state owner then
          some { variables with process := { bindings :=
            (mergeProcessVariableBindings variables.process.bindings
              [{ name := propertyId, value := filled.value }]) } }
        else none
    | .processDataOutput dataOutputId =>
        writeProcessInterfaceOutput? variables owner { name := dataOutputId, value := filled.value }
  else none

/-- Direct output routing describes the declared destination, without consulting the evaluator. -/
def ActivityDataOutputRouting (state : RuntimeState) (owner : ScopeOccurrenceId)
    (before : ScopedVariables) (output : DirectActivityDataOutput) (filled : VariableBinding)
    (after : ScopedVariables) : Prop :=
  processInterfaceScalar filled.value = true ∧
  match output.target with
  | .property propertyId =>
      activityDataPropertyOwner state owner = true ∧
      after = { before with process := { bindings :=
        (mergeProcessVariableBindings before.process.bindings
          [{ name := propertyId, value := filled.value }]) } }
  | .processDataOutput dataOutputId =>
      ∃ scope, before.processInterfaces.filter
          (fun candidate => decide (candidate.owner = owner)) = [scope] ∧
        (scope.outputs = [] ∨ ∃ previous,
          scope.outputs = [previous] ∧ previous.name = dataOutputId) ∧
        after = { before with processInterfaces := before.processInterfaces.map fun candidate =>
          if candidate.owner = owner then
            { candidate with outputs := [{ name := dataOutputId, value := filled.value }] }
          else candidate }

theorem writeActivityDataOutput_sound {state : RuntimeState} {owner : ScopeOccurrenceId}
    {before after : ScopedVariables} {output : DirectActivityDataOutput} {filled : VariableBinding}
    (written : writeActivityDataOutput? state owner before output filled = some after) :
    ActivityDataOutputRouting state owner before output filled after := by
  unfold writeActivityDataOutput? at written
  split at written
  · next scalar =>
    refine ⟨scalar, ?_⟩
    cases endpoint : output.target with
    | property propertyId =>
        simp only [endpoint] at written ⊢
        split at written
        · next hosted => cases written; exact ⟨hosted, rfl⟩
        · simp at written
    | processDataOutput dataOutputId =>
        simp only [endpoint] at written ⊢
        obtain ⟨scope, selected, _, slot, result⟩ := writeProcessInterfaceOutput_success_iff.mp written
        exact ⟨scope, selectProcessInterface_iff.mp selected, slot, result⟩
  · simp at written

end BpmnSemantics.SemanticProcess
