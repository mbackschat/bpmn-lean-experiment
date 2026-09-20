import BpmnSemantics.SemanticProcess.InternalRegionalCallPositionValidity
import BpmnSemantics.SemanticProcess.InternalRegionalOpenOwnership

/-! Return preserves complete lookup results for owners outside its selected Call tree.
Incoming Call records are retained by target Process, including all matching records;
the association invariant excludes an equal selected identity with a different target. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem removeCalledProcessTree_process_call_census (state : RuntimeState)
    (selected : CalledProcessOccurrence) (process : SemanticId)
    (valid : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences)
    (outside : process ∉ processInstanceClosureWithin state.calledProcessOccurrences
      [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)) :
    (removeCalledProcessTree state selected).calledProcessOccurrences.filter
        (fun record => decide (record.calledRoot.processInstanceId = process)) =
      state.calledProcessOccurrences.filter (fun record => decide (record.calledRoot.processInstanceId = process)) := by
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
  let keep := fun record : CalledProcessOccurrence =>
    decide (record.id ≠ selected.id) && !removed.contains record.caller.processInstanceId &&
      !removed.contains record.calledRoot.processInstanceId
  change process ∉ removed at outside
  change (state.calledProcessOccurrences.filter keep).filter _ = _
  rw [List.filter_filter]
  apply List.filter_congr
  intro record member
  by_cases same : record.calledRoot.processInstanceId = process
  · have targetOutside : record.calledRoot.processInstanceId ∉ removed := by simpa only [same] using outside
    obtain ⟨different, callerOutside⟩ := removeCalledProcessTree_keeps_outside_target state selected record
      valid selectedMember member targetOutside
    change record.caller.processInstanceId ∉ removed at callerOutside
    simp [keep, same, different, callerOutside, outside]
  · simp [same]

theorem removeCalledProcessTree_process_lookup_frame (program : Program) (state : RuntimeState)
    (selected : CalledProcessOccurrence) (owner : ScopeOccurrenceId)
    (valid : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences)
    (outside : owner.processInstanceId ∉ processInstanceClosureWithin state.calledProcessOccurrences
      [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)) :
    processIdForOwner? program (removeCalledProcessTree state selected) owner =
      processIdForOwner? program state owner := by
  have scopes := removeCalledProcessTree_preserves_scope_census state selected owner (fun _ => true) outside
  simp only [Bool.and_true] at scopes
  have calls := removeCalledProcessTree_process_call_census state selected owner.processInstanceId valid selectedMember outside
  have control : (removeCalledProcessTree state selected).control = state.control := rfl
  simp only [processIdForOwner?, hostingInstanceId?, control, flowNodeOccurrenceOwnerLiveUnique, scopes, calls]
  rfl

theorem removeCalledProcessTree_wait_start_frame (program : Program) (state : RuntimeState)
    (selected : CalledProcessOccurrence) (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat)
    (valid : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences)
    (outside : owner.processInstanceId ∉ processInstanceClosureWithin state.calledProcessOccurrences
      [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)) :
    waitStart? program (removeCalledProcessTree state selected) owner element activation =
      waitStart? program state owner element activation := by
  simp only [waitStart?, removeCalledProcessTree_process_lookup_frame program state selected owner valid selectedMember outside]

theorem removeCalledProcessTree_scope_start_frame (program : Program) (state : RuntimeState)
    (selected : CalledProcessOccurrence) (scope : RuntimeScopeOccurrence)
    (valid : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences)
    (outside : ∀ parent, scope.parent = some parent → parent.processInstanceId ∉
      processInstanceClosureWithin state.calledProcessOccurrences [selected.calledRoot.processInstanceId]
        (state.calledProcessOccurrences.length + 1)) :
    scopeStart? program (removeCalledProcessTree state selected) scope = scopeStart? program state scope := by
  unfold scopeStart?
  cases parent : scope.parent with
  | none => simp
  | some owner =>
      simp only [bind, Option.bind,
        removeCalledProcessTree_process_lookup_frame program state selected owner valid selectedMember (outside owner parent)]

theorem removeCalledProcessTree_call_start_frame (program : Program) (state : RuntimeState)
    (selected record : CalledProcessOccurrence)
    (valid : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences)
    (outside : record.caller.processInstanceId ∉ processInstanceClosureWithin state.calledProcessOccurrences
      [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)) :
    callStart? program (removeCalledProcessTree state selected) record = callStart? program state record := by
  simp only [callStart?, removeCalledProcessTree_process_lookup_frame program state selected record.caller valid selectedMember outside]

end BpmnSemantics.SemanticProcess.InternalCommutation
