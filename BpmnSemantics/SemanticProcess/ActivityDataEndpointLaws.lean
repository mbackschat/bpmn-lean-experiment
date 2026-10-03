import BpmnSemantics.SemanticProcess.ActivityDataEndpointRuntime
import BpmnSemantics.SemanticProcess.ProcessInterfaceData

/-! # Typed Activity data endpoint laws

The selected complete owner governs data access across the Call boundary (CDATA-OWNER-01).
Routing relates exact source and successor stores independently of the evaluator; scalar values,
caller isolation, immutable inputs and sibling frames remain explicit obligations.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

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

theorem writeActivityDataOutput_preserves_activities {state : RuntimeState} {owner : ScopeOccurrenceId}
    {before after : ScopedVariables} {output : DirectActivityDataOutput} {filled : VariableBinding}
    (written : writeActivityDataOutput? state owner before output filled = some after) :
    after.activities = before.activities := by
  have routed := (writeActivityDataOutput_sound written).2
  cases endpoint : output.target <;> simp only [endpoint] at routed
  · rcases routed with ⟨_, rfl⟩; rfl
  · rcases routed with ⟨_, _, _, rfl⟩; rfl

theorem writeActivityDataOutput_property {state : RuntimeState} {owner : ScopeOccurrenceId}
    {before after : ScopedVariables} {output : DirectActivityDataOutput} {filled : VariableBinding}
    {propertyId : String} (endpoint : output.target = .property propertyId)
    (written : writeActivityDataOutput? state owner before output filled = some after) :
    after.process.bindings = mergeProcessVariableBindings before.process.bindings
      [{ name := propertyId, value := filled.value }] ∧
      after.processInterfaces = before.processInterfaces := by
  have routed := (writeActivityDataOutput_sound written).2
  simp only [endpoint] at routed
  rcases routed with ⟨_, rfl⟩
  exact ⟨rfl, rfl⟩

theorem writeActivityDataOutput_interface_preserves_caller {state : RuntimeState}
    {owner : ScopeOccurrenceId} {before after : ScopedVariables}
    {output : DirectActivityDataOutput} {filled : VariableBinding} {dataOutputId : String}
    (endpoint : output.target = .processDataOutput dataOutputId)
    (written : writeActivityDataOutput? state owner before output filled = some after) :
    after.process = before.process := by
  have routed := (writeActivityDataOutput_sound written).2
  simp only [endpoint] at routed
  rcases routed with ⟨_, _, _, rfl⟩
  rfl

theorem writeActivityDataOutput_interface_evaluator {state : RuntimeState}
    {owner : ScopeOccurrenceId} {before after : ScopedVariables}
    {output : DirectActivityDataOutput} {filled : VariableBinding} {dataOutputId : String}
    (endpoint : output.target = .processDataOutput dataOutputId)
    (written : writeActivityDataOutput? state owner before output filled = some after) :
    writeProcessInterfaceOutput? before owner { name := dataOutputId, value := filled.value } = some after := by
  unfold writeActivityDataOutput? at written
  split at written
  · simpa only [endpoint] using written
  · simp at written

theorem readActivityDataInput_called_property_refused
    {state : RuntimeState} {owner : ScopeOccurrenceId} {input : DirectActivityDataInput}
    {host : SemanticId} {propertyId : String}
    (running : state.control = .running host) (called : owner.processInstanceId ≠ host)
    (endpoint : input.source = .property propertyId) :
    readActivityDataInput? state owner input = none := by
  simp [readActivityDataInput?, endpoint, activityDataPropertyOwner, running, called]

theorem writeActivityDataOutput_called_property_refused
    {state : RuntimeState} {owner : ScopeOccurrenceId} {output : DirectActivityDataOutput}
    {host : SemanticId} {propertyId : String}
    (running : state.control = .running host) (called : owner.processInstanceId ≠ host)
    (endpoint : output.target = .property propertyId) (variables : ScopedVariables)
    (filled : VariableBinding) : writeActivityDataOutput? state owner variables output filled = none := by
  simp [writeActivityDataOutput?, endpoint, activityDataPropertyOwner, running, called]

theorem readActivityDataInput_interface_exact {state : RuntimeState} {owner : ScopeOccurrenceId}
    {input : DirectActivityDataInput} {dataInputId : String}
    (endpoint : input.source = .processDataInput dataInputId) :
    readActivityDataInput? state owner input =
      readProcessInterfaceInput? state.variables owner dataInputId := by
  simp [readActivityDataInput?, endpoint]

theorem readActivityDataInput_duplicate_interfaces_refused
    {state : RuntimeState} {owner : ScopeOccurrenceId} {input : DirectActivityDataInput}
    {dataInputId : String} {first second : ProcessInterfaceScope} {rest : List ProcessInterfaceScope}
    (endpoint : input.source = .processDataInput dataInputId)
    (duplicates : state.variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) =
      first :: second :: rest) : readActivityDataInput? state owner input = none := by
  rw [readActivityDataInput_interface_exact endpoint]
  exact (processInterface_reads_refuse_unselected
    (selectProcessInterface_ambiguous_refused duplicates) dataInputId).1


theorem activityDataLocalRemoval_preserves_processInterfaces
    {before after : ScopedVariables} {owner : ActivityOccurrenceId}
    (removed : removeActivityOccurrenceVariableScope before owner = some after) :
    after.processInterfaces = before.processInterfaces := by
  unfold removeActivityOccurrenceVariableScope at removed
  split at removed
  · cases removed; rfl
  · simp at removed

theorem readActivityDataInput_root_property
    {state : RuntimeState} {owner : ScopeOccurrenceId} {input : DirectActivityDataInput}
    {propertyId : String} {binding : VariableBinding}
    (running : state.control = .running owner.processInstanceId)
    (endpoint : input.source = .property propertyId)
    (unique : state.variables.process.bindings.filter
      (fun candidate => decide (candidate.name = propertyId)) = [binding])
    (scalar : processInterfaceScalar binding.value = true) :
    readActivityDataInput? state owner input = some binding := by
  simp [readActivityDataInput?, endpoint, activityDataPropertyOwner, running, unique, scalar]


theorem readActivityDataInput_scalar {state : RuntimeState} {owner : ScopeOccurrenceId}
    {input : DirectActivityDataInput} {binding : VariableBinding}
    (read : readActivityDataInput? state owner input = some binding) :
    processInterfaceScalar binding.value = true := by
  unfold readActivityDataInput? at read
  cases endpoint : input.source with
  | property propertyId =>
      simp only [endpoint] at read
      split at read
      · split at read
        · split at read
          · cases read; assumption
          · simp at read
        · simp at read
      · simp at read
  | processDataInput port =>
      simp only [endpoint] at read
      obtain ⟨_, _, _, scalar⟩ := readProcessInterfaceInput_iff.mp read
      exact scalar

end BpmnSemantics.SemanticProcess
