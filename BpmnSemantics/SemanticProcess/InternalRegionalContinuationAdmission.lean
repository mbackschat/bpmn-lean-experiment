import BpmnSemantics.SemanticProcess.InternalRegionalReturnPositionValidity

/-! # Regional continuation admission

Program graph ownership and the open-occurrence Call census discharge the static continuation
bindings required by the raw Return preservation theorem. A selected runtime Call identity alone
cannot justify the continuation's definition-scope owner.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

/-- The recorded caller's declaring invocation and its unique paired Return establish the
complete output declaration and ownership censuses used by position validation. -/
theorem declaredReturn_continuation_binding (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (process : ProcessId)
    (root : DefinitionScopeId) (output : ControlPlaceId) (record : CalledProcessOccurrence)
    (programValid : programWellFormed program = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (returning : .returnProcess id origin process root output ∈ program.operations)
    (member : record ∈ state.calledProcessOccurrences)
    (selected : record.returnOperationId = id) :
    (∃ declared, program.controlPlaces.filter (fun candidate => decide (candidate.id = output)) = [declared]) ∧
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = output)) =
        [{ controlPlaceId := output, scopeId := record.caller.definitionScopeId }] := by
  obtain ⟨invokeId, invokeOrigin, input, calledProcess, calledRoot, entry, returned,
    invocation, owned, _, _, _, returnedEq⟩ :=
      flowNodeOccurrenceStructuralProgramValidity_call_declarer program state record structural member
  have caller : (program.operationScopes.find? fun binding => decide (binding.operationId = invokeId)).map
      (·.scopeId) = some record.caller.definitionScopeId := by
    unfold operationOwnedBy at owned
    split at owned
    · rename_i binding bindings
      change program.operationScopes.filter (fun candidate => decide (candidate.operationId = invokeId)) = [binding] at bindings
      rw [← List.head?_filter, bindings]
      exact congrArg some (of_decide_eq_true owned)
    · contradiction
  rw [returnedEq, selected] at invocation
  have paired : callOperationsPaired program = true := by
    simp only [programWellFormed, Bool.and_eq_true] at programValid
    grind
  have outputScope := callOperationsPaired_return_caller_scope program invokeId invokeOrigin input
    calledProcess calledRoot entry id origin process root output record.caller.definitionScopeId
    paired invocation returning caller
  have unique : (program.controlPlaces.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted program programValid)
  exact programGraphWellFormed_exactPlaceBinding program output record.caller.definitionScopeId
    (programWellFormed_graph program programValid) unique outputScope

/-- Actual declared Return preserves position from predecessor position and structural
open-occurrence validity; output ownership and caller survival are conclusions, not extra premises. -/
theorem declaredReturn_preserves_position (program : Program) (before after : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (process : ProcessId) (root : DefinitionScopeId) (output : ControlPlaceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (running : before.control = .running instanceId)
    (member : .returnProcess id origin process root output ∈ program.operations)
    (result : returnProcessState? before id origin process root output = some after) :
    runtimePositionValid program expectedInstanceId after = true := by
  have programValid : programWellFormed program = true := by
    simp only [runtimePositionValid, Bool.and_eq_true] at valid
    exact valid.1.1
  have bindings (record : CalledProcessOccurrence) (present : record ∈ before.calledProcessOccurrences)
      (selected : record.returnOperationId = id) :=
    declaredReturn_continuation_binding program before id origin process root output record programValid structural member present selected
  obtain ⟨record, _, selected, _⟩ := return_step_removes_exact_association_and_emits_one_continuation
    before after id origin process root output (returnProcessState_sound before after id origin process root output result)
  have selectedMember : record ∈ before.calledProcessOccurrences.filter (fun candidate =>
      decide (candidate.returnOperationId = id && candidate.id.elementId.value = origin.elementId.value)) := by
    rw [selected]; simp
  obtain ⟨recordMember, selectedFields⟩ := List.mem_filter.mp selectedMember
  simp only [decide_eq_true_eq, Bool.and_eq_true] at selectedFields
  exact returnProcessState_preserves_position program before after expectedInstanceId instanceId id origin process root output
    valid running (bindings record recordMember selectedFields.1).1
    (fun candidate present selected _ => (bindings candidate present selected).2) result

end BpmnSemantics.SemanticProcess
