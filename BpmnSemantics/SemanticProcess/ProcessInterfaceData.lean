import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.ProcessInterfaceRuntime

/-! # Passive Process interface data

The Call data boundary selects a complete scope occurrence before examining ports (CDATA-OWNER-01).
These laws cover caller-Property and Activity-local preservation and distinguish unavailable output
from an available null. They establish no invocation, return, admission, or reachability claim.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem selectProcessInterface_iff {variables : ScopedVariables} {owner : ScopeOccurrenceId}
    {scope : ProcessInterfaceScope} :
    selectProcessInterface? variables owner = some scope ↔
      variables.processInterfaces.filter (fun candidate => decide (candidate.owner = owner)) = [scope] := by
  unfold selectProcessInterface?
  split <;> simp_all

theorem selectProcessInterface_exact_owner {variables : ScopedVariables}
    {owner : ScopeOccurrenceId} {scope : ProcessInterfaceScope}
    (selected : selectProcessInterface? variables owner = some scope) : scope.owner = owner := by
  have singleton := selectProcessInterface_iff.mp selected
  have member : scope ∈ variables.processInterfaces.filter
      (fun candidate => decide (candidate.owner = owner)) := by rw [singleton]; simp
  exact of_decide_eq_true (List.mem_filter.mp member).2

theorem selectProcessInterface_missing_refused {variables : ScopedVariables}
    {owner : ScopeOccurrenceId}
    (missing : variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) = []) :
    selectProcessInterface? variables owner = none := by
  simp [selectProcessInterface?, missing]

theorem selectProcessInterface_ambiguous_refused {variables : ScopedVariables}
    {owner : ScopeOccurrenceId} {first second : ProcessInterfaceScope} {rest : List ProcessInterfaceScope}
    (ambiguous : variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) =
      first :: second :: rest) : selectProcessInterface? variables owner = none := by
  simp [selectProcessInterface?, ambiguous]

theorem selectProcessInterface_duplicate_refused
    (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (first second : ProcessInterfaceScope)
    (firstOwner : first.owner = owner) (secondOwner : second.owner = owner) :
    selectProcessInterface? { variables with processInterfaces := [first, second] } owner = none := by
  simp [selectProcessInterface?, firstOwner, secondOwner]

private theorem readInterfaceBinding_iff {bindings : List VariableBinding} {name : String}
    {binding : VariableBinding} : readInterfaceBinding? bindings name = some binding ↔
    bindings.filter (fun candidate => decide (candidate.name = name)) = [binding] ∧
      processInterfaceScalar binding.value = true := by
  unfold readInterfaceBinding?
  split
  · split <;> simp_all <;> intro equal <;> subst binding <;> assumption
  · simp_all

theorem readProcessInterfaceInput_iff {variables : ScopedVariables} {owner : ScopeOccurrenceId}
    {name : String} {binding : VariableBinding} :
    readProcessInterfaceInput? variables owner name = some binding ↔
      ∃ scope, selectProcessInterface? variables owner = some scope ∧
        scope.inputs.filter (fun candidate => decide (candidate.name = name)) = [binding] ∧
        processInterfaceScalar binding.value = true := by
  simp [readProcessInterfaceInput?, Option.bind_eq_some_iff, readInterfaceBinding_iff]

theorem readProcessInterfaceOutput_iff {variables : ScopedVariables} {owner : ScopeOccurrenceId}
    {name : String} {binding : VariableBinding} :
    readProcessInterfaceOutput? variables owner name = some binding ↔
      ∃ scope, selectProcessInterface? variables owner = some scope ∧
        scope.outputs.filter (fun candidate => decide (candidate.name = name)) = [binding] ∧
        processInterfaceScalar binding.value = true := by
  simp [readProcessInterfaceOutput?, Option.bind_eq_some_iff, readInterfaceBinding_iff]

theorem processInterfaceScalar_iff (value : VariableValue) :
    processInterfaceScalar value = true ↔ value = .null ∨ ∃ text, value = .string text := by
  cases value <;> simp [processInterfaceScalar]

theorem processInterface_reads_refuse_unselected {variables : ScopedVariables}
    {owner : ScopeOccurrenceId} (unselected : selectProcessInterface? variables owner = none)
    (name : String) : readProcessInterfaceInput? variables owner name = none ∧
      readProcessInterfaceOutput? variables owner name = none := by
  simp [readProcessInterfaceInput?, readProcessInterfaceOutput?, unselected]

theorem addProcessInterface_existing_refused {variables : ScopedVariables} {owner : ScopeOccurrenceId}
    {existing : ProcessInterfaceScope} (member : existing ∈ variables.processInterfaces)
    (same : existing.owner = owner) (input : VariableBinding) :
    addProcessInterface? variables owner input = none := by
  have present : variables.processInterfaces.any (fun scope => decide (scope.owner = owner)) = true :=
    List.any_eq_true.mpr ⟨existing, member, by simp [same]⟩
  simp [addProcessInterface?, present]

theorem addProcessInterface_nonscalar_refused (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (input : VariableBinding) (unsupported : processInterfaceScalar input.value = false) :
    addProcessInterface? variables owner input = none := by
  simp [addProcessInterface?, unsupported]

theorem addProcessInterface_success_iff {variables result : ScopedVariables} {owner : ScopeOccurrenceId}
    {input : VariableBinding} : addProcessInterface? variables owner input = some result ↔
    variables.processInterfaces.any (fun scope => decide (scope.owner = owner)) = false ∧
      processInterfaceScalar input.value = true ∧
      result = { variables with processInterfaces :=
        (canonicalInsertBy (fun left right => scopeOwnerBefore left.owner right.owner)
          { owner, inputs := [input], outputs := [] } variables.processInterfaces) } := by
  cases fresh : variables.processInterfaces.any (fun scope => decide (scope.owner = owner)) <;>
    cases scalar : processInterfaceScalar input.value <;>
    simp [addProcessInterface?, fresh, scalar] <;> exact eq_comm

theorem addProcessInterface_preserves_caller {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {input : VariableBinding}
    (added : addProcessInterface? variables owner input = some result) :
    result.process = variables.process ∧ result.activities = variables.activities := by
  obtain ⟨_, _, rfl⟩ := addProcessInterface_success_iff.mp added
  exact ⟨rfl, rfl⟩

theorem writeProcessInterfaceOutput_missing_refused {variables : ScopedVariables} {owner : ScopeOccurrenceId}
    (missing : selectProcessInterface? variables owner = none) (output : VariableBinding) :
    writeProcessInterfaceOutput? variables owner output = none := by
  simp [writeProcessInterfaceOutput?, missing]

theorem writeProcessInterfaceOutput_nonscalar_refused (variables : ScopedVariables)
    (owner : ScopeOccurrenceId) (output : VariableBinding)
    (unsupported : processInterfaceScalar output.value = false) :
    writeProcessInterfaceOutput? variables owner output = none := by
  simp [writeProcessInterfaceOutput?, unsupported]

theorem writeProcessInterfaceOutput_success_iff {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {output : VariableBinding} :
    writeProcessInterfaceOutput? variables owner output = some result ↔
      ∃ scope, selectProcessInterface? variables owner = some scope ∧
        processInterfaceScalar output.value = true ∧
        (scope.outputs = [] ∨ ∃ previous, scope.outputs = [previous] ∧ previous.name = output.name) ∧
        result = { variables with processInterfaces := variables.processInterfaces.map fun candidate =>
          if candidate.owner = owner then { candidate with outputs := [output] } else candidate } := by
  cases selected : selectProcessInterface? variables owner with
  | none => simp [writeProcessInterfaceOutput?, selected]
  | some scope =>
      simp only [writeProcessInterfaceOutput?, selected, bind, Option.bind,
        Option.some.injEq, exists_eq_left']
      have slot : outputSlotAccepts scope.outputs output.name = true ↔
          scope.outputs = [] ∨ ∃ previous, scope.outputs = [previous] ∧ previous.name = output.name := by
        unfold outputSlotAccepts
        split <;> simp_all
      split
      · next accepted =>
        simp only [Bool.and_eq_true] at accepted
        have scalar := accepted.1
        have acceptedSlot := slot.mp accepted.2
        simp only [scalar, acceptedSlot, true_and, Option.some.injEq]
        exact eq_comm
      · next rejected =>
        have refused : ¬ (processInterfaceScalar output.value = true ∧
            (scope.outputs = [] ∨ ∃ previous, scope.outputs = [previous] ∧ previous.name = output.name)) := by
          intro accepted
          apply rejected
          simp [accepted.1, slot.mpr accepted.2]
        simp_all

theorem writeProcessInterfaceOutput_preserves_caller {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {output : VariableBinding}
    (written : writeProcessInterfaceOutput? variables owner output = some result) :
    result.process = variables.process ∧ result.activities = variables.activities := by
  obtain ⟨_, _, _, _, rfl⟩ := writeProcessInterfaceOutput_success_iff.mp written
  exact ⟨rfl, rfl⟩


theorem addProcessInterface_installs {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {input : VariableBinding}
    (added : addProcessInterface? variables owner input = some result) :
    selectProcessInterface? result owner = some { owner, inputs := [input], outputs := [] } := by
  obtain ⟨fresh, _, rfl⟩ := addProcessInterface_success_iff.mp added
  apply selectProcessInterface_iff.mpr
  have empty : variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro scope member kept
    have present : variables.processInterfaces.any (fun scope => decide (scope.owner = owner)) = true :=
      List.any_eq_true.mpr ⟨scope, member, kept⟩
    rw [fresh] at present
    contradiction
  have permutation := filter_canonicalInsertBy_perm
    (fun left right : ProcessInterfaceScope => scopeOwnerBefore left.owner right.owner)
    (fun scope => decide (scope.owner = owner))
    { owner, inputs := [input], outputs := [] } variables.processInterfaces (by simp)
  simpa [empty] using permutation

theorem addProcessInterface_frames_others {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {input : VariableBinding}
    (added : addProcessInterface? variables owner input = some result) :
    result.processInterfaces.filter (fun scope => decide (scope.owner ≠ owner)) =
      variables.processInterfaces.filter (fun scope => decide (scope.owner ≠ owner)) := by
  obtain ⟨_, _, rfl⟩ := addProcessInterface_success_iff.mp added
  exact filter_canonicalInsertBy_rejected _ _ _ _ (by simp)

theorem addProcessInterface_input_available_output_unavailable {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {input : VariableBinding}
    (added : addProcessInterface? variables owner input = some result) (outputName : String) :
    readProcessInterfaceInput? result owner input.name = some input ∧
      readProcessInterfaceOutput? result owner outputName = none := by
  have selected := addProcessInterface_installs added
  have scalar := (addProcessInterface_success_iff.mp added).2.1
  simp [readProcessInterfaceInput?, readProcessInterfaceOutput?, selected,
    readInterfaceBinding?, scalar]

private theorem write_filter_selected (scopes : List ProcessInterfaceScope)
    (owner : ScopeOccurrenceId) (output : VariableBinding) :
    ((scopes.map fun candidate =>
      if candidate.owner = owner then { candidate with outputs := [output] } else candidate).filter
        (fun candidate => decide (candidate.owner = owner))) =
      (scopes.filter fun candidate => decide (candidate.owner = owner)).map
        (fun candidate => { candidate with outputs := [output] }) := by
  induction scopes with
  | nil => rfl
  | cons first rest ih =>
      by_cases same : first.owner = owner <;> simp_all

private theorem write_filter_others (scopes : List ProcessInterfaceScope)
    (owner : ScopeOccurrenceId) (output : VariableBinding) :
    ((scopes.map fun candidate =>
      if candidate.owner = owner then { candidate with outputs := [output] } else candidate).filter
        (fun candidate => decide (candidate.owner ≠ owner))) =
      scopes.filter (fun candidate => decide (candidate.owner ≠ owner)) := by
  induction scopes with
  | nil => rfl
  | cons first rest ih =>
      by_cases same : first.owner = owner <;> simp_all

theorem writeProcessInterfaceOutput_installs {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {output : VariableBinding}
    (written : writeProcessInterfaceOutput? variables owner output = some result) :
    ∃ previous, selectProcessInterface? variables owner = some previous ∧
      selectProcessInterface? result owner = some { previous with outputs := [output] } := by
  obtain ⟨scope, selected, _, _, rfl⟩ := writeProcessInterfaceOutput_success_iff.mp written
  refine ⟨scope, selected, selectProcessInterface_iff.mpr ?_⟩
  change ((variables.processInterfaces.map _).filter _) = _
  rw [write_filter_selected, selectProcessInterface_iff.mp selected]
  rfl

theorem writeProcessInterfaceOutput_frames_others {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {output : VariableBinding}
    (written : writeProcessInterfaceOutput? variables owner output = some result) :
    result.processInterfaces.filter (fun scope => decide (scope.owner ≠ owner)) =
      variables.processInterfaces.filter (fun scope => decide (scope.owner ≠ owner)) := by
  obtain ⟨_, _, _, _, rfl⟩ := writeProcessInterfaceOutput_success_iff.mp written
  exact write_filter_others _ _ _

theorem writeProcessInterfaceOutput_preserves_all_inputs {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {output : VariableBinding}
    (written : writeProcessInterfaceOutput? variables owner output = some result) :
    result.processInterfaces.map (fun scope => (scope.owner, scope.inputs)) =
      variables.processInterfaces.map (fun scope => (scope.owner, scope.inputs)) := by
  obtain ⟨_, _, _, _, rfl⟩ := writeProcessInterfaceOutput_success_iff.mp written
  simp only [List.map_map]
  apply List.map_congr_left
  intro scope _
  dsimp only [Function.comp_def]
  split <;> rfl

theorem writeProcessInterfaceOutput_available {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {output : VariableBinding}
    (written : writeProcessInterfaceOutput? variables owner output = some result) :
    readProcessInterfaceOutput? result owner output.name = some output := by
  obtain ⟨_, _, selected⟩ := writeProcessInterfaceOutput_installs written
  obtain ⟨_, _, scalar, _, _⟩ := writeProcessInterfaceOutput_success_iff.mp written
  simp [readProcessInterfaceOutput?, selected, readInterfaceBinding?, scalar]


theorem processInterface_duplicate_reads_refused
    (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (first second : ProcessInterfaceScope) (name : String)
    (firstOwner : first.owner = owner) (secondOwner : second.owner = owner) :
    readProcessInterfaceInput? { variables with processInterfaces := [first, second] } owner name = none ∧
      readProcessInterfaceOutput? { variables with processInterfaces := [first, second] } owner name = none :=
  processInterface_reads_refuse_unselected
    (selectProcessInterface_duplicate_refused variables owner first second firstOwner secondOwner) name

theorem readProcessInterfaceInput_two_owners_isolated
    (variables : ScopedVariables) (owner otherOwner : ScopeOccurrenceId)
    (input otherInput : VariableBinding) (different : otherOwner ≠ owner)
    (scalar : processInterfaceScalar input.value = true) :
    readProcessInterfaceInput?
      { variables with processInterfaces :=
        [{ owner := otherOwner, inputs := [otherInput], outputs := [] },
          { owner, inputs := [input], outputs := [] }] } owner input.name = some input := by
  simp [readProcessInterfaceInput?, selectProcessInterface?, readInterfaceBinding?, different, scalar]

theorem processInterface_activation_distinguishes_owner
    (variables : ScopedVariables) (owner : ScopeOccurrenceId) (activation : Nat)
    (input otherInput : VariableBinding) (different : activation ≠ owner.activation)
    (scalar : processInterfaceScalar input.value = true) :
    readProcessInterfaceInput?
      { variables with processInterfaces :=
        [{ owner := { owner with activation }, inputs := [otherInput], outputs := [] },
          { owner, inputs := [input], outputs := [] }] } owner input.name = some input := by
  apply readProcessInterfaceInput_two_owners_isolated _ _ _ _ _ _ scalar
  intro same
  exact different (congrArg ScopeOccurrenceId.activation same)

theorem writeProcessInterfaceOutput_wrong_port_refused
    {variables : ScopedVariables} {owner : ScopeOccurrenceId} {scope : ProcessInterfaceScope}
    (selected : selectProcessInterface? variables owner = some scope)
    (previous output : VariableBinding) (existing : scope.outputs = [previous])
    (different : previous.name ≠ output.name) :
    writeProcessInterfaceOutput? variables owner output = none := by
  simp [writeProcessInterfaceOutput?, selected, outputSlotAccepts, existing, different]

theorem writeProcessInterfaceOutput_multiple_ports_refused
    {variables : ScopedVariables} {owner : ScopeOccurrenceId} {scope : ProcessInterfaceScope}
    (selected : selectProcessInterface? variables owner = some scope)
    (first second output : VariableBinding) (rest : List VariableBinding)
    (existing : scope.outputs = first :: second :: rest) :
    writeProcessInterfaceOutput? variables owner output = none := by
  simp [writeProcessInterfaceOutput?, selected, outputSlotAccepts, existing]

end BpmnSemantics.SemanticProcess
