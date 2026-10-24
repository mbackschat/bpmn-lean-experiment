module

public import BpmnSemantics.SemanticProcess.ActivityDataEndpointRuntime
public import BpmnSemantics.SemanticProcess.ProcessInterfaceData

/-! # Typed Activity data endpoint laws

The selected complete owner governs data access across the Call boundary (CDATA-OWNER-01).
Routing relates exact source and successor stores independently of the evaluator; admitted values,
caller isolation, immutable inputs and sibling frames remain explicit obligations.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem writeActivityDataOutput_preserves_activities {policy : PropertyPathValuePolicy} {state : RuntimeState}
    {owner : ScopeOccurrenceId}
    {before after : ScopedVariables} {output : DirectActivityDataOutput} {filled : VariableBinding}
    (written : writeActivityDataOutput? policy state owner before output filled = some after) :
    after.activities = before.activities := by
  have routed := (writeActivityDataOutput_sound written).2
  cases endpoint : output.target <;> simp only [endpoint] at routed
  · rcases routed with ⟨_, rfl⟩; rfl
  · rcases routed with ⟨_, _, _, rfl⟩; rfl

theorem writeActivityDataOutput_property {policy : PropertyPathValuePolicy} {state : RuntimeState}
    {owner : ScopeOccurrenceId}
    {before after : ScopedVariables} {output : DirectActivityDataOutput} {filled : VariableBinding}
    {propertyId : String} (endpoint : output.target = .property propertyId)
    (written : writeActivityDataOutput? policy state owner before output filled = some after) :
    after.process.bindings = mergeProcessVariableBindings before.process.bindings
      [{ name := propertyId, value := filled.value }] ∧
      after.processInterfaces = before.processInterfaces := by
  have routed := (writeActivityDataOutput_sound written).2
  simp only [endpoint] at routed
  rcases routed with ⟨_, rfl⟩
  exact ⟨rfl, rfl⟩

theorem writeActivityDataOutput_interface_preserves_caller {policy : PropertyPathValuePolicy}
    {state : RuntimeState}
    {owner : ScopeOccurrenceId} {before after : ScopedVariables}
    {output : DirectActivityDataOutput} {filled : VariableBinding} {dataOutputId : String}
    (endpoint : output.target = .processDataOutput dataOutputId)
    (written : writeActivityDataOutput? policy state owner before output filled = some after) :
    after.process = before.process := by
  have routed := (writeActivityDataOutput_sound written).2
  simp only [endpoint] at routed
  rcases routed with ⟨_, _, _, rfl⟩
  rfl

theorem writeActivityDataOutput_interface_evaluator {policy : PropertyPathValuePolicy}
    {state : RuntimeState}
    {owner : ScopeOccurrenceId} {before after : ScopedVariables}
    {output : DirectActivityDataOutput} {filled : VariableBinding} {dataOutputId : String}
    (endpoint : output.target = .processDataOutput dataOutputId)
    (written : writeActivityDataOutput? policy state owner before output filled = some after) :
    writeProcessInterfaceOutput? before owner { name := dataOutputId, value := filled.value } = some after := by
  unfold writeActivityDataOutput? at written
  split at written
  · simpa only [endpoint] using written
  · simp at written

theorem readActivityDataInput_called_property_refused
    {policy : PropertyPathValuePolicy} {state : RuntimeState}
    {owner : ScopeOccurrenceId} {input : DirectActivityDataInput}
    {host : SemanticId} {propertyId : String}
    (running : state.control = .running host) (called : owner.processInstanceId ≠ host)
    (endpoint : input.source = .property propertyId) :
    readActivityDataInput? policy state owner input = none := by
  simp [readActivityDataInput?, endpoint, activityDataPropertyOwner, running, called]

theorem writeActivityDataOutput_called_property_refused
    {policy : PropertyPathValuePolicy} {state : RuntimeState}
    {owner : ScopeOccurrenceId} {output : DirectActivityDataOutput}
    {host : SemanticId} {propertyId : String}
    (running : state.control = .running host) (called : owner.processInstanceId ≠ host)
    (endpoint : output.target = .property propertyId) (variables : ScopedVariables)
    (filled : VariableBinding) : writeActivityDataOutput? policy state owner variables output filled = none := by
  simp [writeActivityDataOutput?, endpoint, activityDataPropertyOwner, running, called]

theorem readActivityDataInput_interface_exact {policy : PropertyPathValuePolicy} {state : RuntimeState}
    {owner : ScopeOccurrenceId}
    {input : DirectActivityDataInput} {dataInputId : String}
    (endpoint : input.source = .processDataInput dataInputId) :
    readActivityDataInput? policy state owner input =
      readProcessInterfaceInput? state.variables owner dataInputId := by
  simp [readActivityDataInput?, endpoint]

theorem readActivityDataInput_duplicate_interfaces_refused
    {policy : PropertyPathValuePolicy} {state : RuntimeState}
    {owner : ScopeOccurrenceId} {input : DirectActivityDataInput}
    {dataInputId : String} {first second : ProcessInterfaceScope} {rest : List ProcessInterfaceScope}
    (endpoint : input.source = .processDataInput dataInputId)
    (duplicates : state.variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) =
      first :: second :: rest) : readActivityDataInput? policy state owner input = none := by
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
    {policy : PropertyPathValuePolicy} {state : RuntimeState}
    {owner : ScopeOccurrenceId} {input : DirectActivityDataInput}
    {propertyId : String} {binding : VariableBinding}
    (running : state.control = .running owner.processInstanceId)
    (endpoint : input.source = .property propertyId)
    (unique : state.variables.process.bindings.filter
      (fun candidate => decide (candidate.name = propertyId)) = [binding])
    (admitted : policy.admits binding.value = true) :
    readActivityDataInput? policy state owner input = some binding := by
  simp [readActivityDataInput?, endpoint, activityDataPropertyOwner, running, unique, admitted]


theorem readActivityDataInput_scalar {state : RuntimeState} {owner : ScopeOccurrenceId}
    {input : DirectActivityDataInput} {binding : VariableBinding}
    (read : readActivityDataInput? .scalar state owner input = some binding) :
    processInterfaceScalar binding.value = true := by
  unfold readActivityDataInput? at read
  cases endpoint : input.source with
  | property propertyId =>
      simp only [endpoint] at read
      split at read
      · split at read
        · split at read
          · next admitted => cases read; simpa using admitted
          · simp at read
        · simp at read
      · simp at read
  | processDataInput port =>
      simp only [endpoint] at read
      obtain ⟨_, _, _, scalar⟩ := readProcessInterfaceInput_iff.mp read
      exact scalar

end BpmnSemantics.SemanticProcess
