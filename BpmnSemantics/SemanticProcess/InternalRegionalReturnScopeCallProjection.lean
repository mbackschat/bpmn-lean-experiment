import BpmnSemantics.SemanticProcess.InternalRegionalReturnProjectionValidity

/-! Quiescent Return preserves all open child scopes and removes exactly its selected
Call anchor. The Call identity injection and parent-instance binding connect actual
Process-tree cleanup to those independently projected occurrence populations. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem quiescent_return_call_filter (state : RuntimeState) (hosting : SemanticId)
    (selected : CalledProcessOccurrence) (root : RuntimeScopeOccurrence)
    (running : state.control = .running hosting) (valid : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences)
    (rootMember : root ∈ state.scopeOccurrences) (rootId : root.id = selected.calledRoot)
    (parentless : root.parent = none) (quiet : scopeQuiescent state root.id = true) :
    (removeCalledProcessTree state selected).calledProcessOccurrences =
      state.calledProcessOccurrences.filter (fun record => decide (record.id ≠ selected.id)) := by
  let removed := processInstanceClosureWithin state.calledProcessOccurrences [selected.calledRoot.processInstanceId]
    (state.calledProcessOccurrences.length + 1)
  have membership (process : SemanticId) : process ∈ removed ↔ process = root.id.processInstanceId := by
    simpa only [rootId] using quiescent_root_call_closure_membership state hosting running valid root rootMember
      parentless quiet (state.calledProcessOccurrences.length + 1) process
  change state.calledProcessOccurrences.filter (fun record => decide (record.id ≠ selected.id) &&
    !removed.contains record.caller.processInstanceId && !removed.contains record.calledRoot.processInstanceId) = _
  apply List.filter_congr
  intro record member
  by_cases same : record.id = selected.id
  · simp [same]
  · have callerOutside : record.caller.processInstanceId ∉ removed := by
      rw [membership]
      exact quiescent_root_excludes_call_caller state hosting running valid root rootMember parentless quiet record member
    have targetOutside : record.calledRoot.processInstanceId ∉ removed := by
      intro inside
      have target := (membership _).mp inside
      exact same (calledProcessAssociationsValid_called_instance_injective state record selected running valid member
        selectedMember (target.trans (congrArg ScopeOccurrenceId.processInstanceId rootId)))
    simp [same, callerOutside, targetOutside]

theorem quiescent_return_call_projection (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (selected : CalledProcessOccurrence) (root : RuntimeScopeOccurrence)
    (output : ControlPlaceId) (projected : List OpenSemanticFlowNodeOccurrence)
    (running : before.control = .running hosting) (valid : calledProcessAssociationsValid before = true)
    (selectedMember : selected ∈ before.calledProcessOccurrences)
    (rootMember : root ∈ before.scopeOccurrences) (rootId : root.id = selected.calledRoot)
    (parentless : root.parent = none) (quiet : scopeQuiescent before root.id = true)
    (actual : after = { removeCalledProcessTree before selected with tokens := addToken before.tokens output selected.caller })
    (prior : before.calledProcessOccurrences.mapM (callStart? program before) = some projected) :
    after.calledProcessOccurrences.mapM (callStart? program after) =
      some (projected.filter fun entry => decide (entry.anchor ≠ .callActivity selected.id)) := by
  have calls : after.calledProcessOccurrences =
      before.calledProcessOccurrences.filter (fun record => decide (record.id ≠ selected.id)) := by
    rw [actual]
    exact quiescent_return_call_filter before hosting selected root running valid selectedMember rootMember rootId parentless quiet
  rw [calls]
  apply mapM_filter_preserves_success before.calledProcessOccurrences
    (callStart? program before) (callStart? program after) (fun record => decide (record.id ≠ selected.id))
    (fun entry => decide (entry.anchor ≠ .callActivity selected.id)) projected prior
  · intro record member entry found
    rw [call_start_anchor program before record entry found]
    simp
  · intro record member entry found _
    have outside : record.caller.processInstanceId ∉ processInstanceClosureWithin before.calledProcessOccurrences
        [selected.calledRoot.processInstanceId] (before.calledProcessOccurrences.length + 1) := by
      rw [← rootId, quiescent_root_call_closure_membership before hosting running valid root rootMember parentless quiet]
      exact quiescent_root_excludes_call_caller before hosting running valid root rootMember parentless quiet record member
    rw [actual]
    exact (removeCalledProcessTree_call_start_frame program before selected record valid selectedMember outside).trans found

theorem quiescent_return_scope_projection (program : Program) (before after : RuntimeState)
    (expected hosting : SemanticId) (selected : CalledProcessOccurrence) (root : RuntimeScopeOccurrence)
    (output : ControlPlaceId)
    (position : runtimePositionValid program expected before = true)
    (running : before.control = .running hosting) (valid : calledProcessAssociationsValid before = true)
    (selectedMember : selected ∈ before.calledProcessOccurrences)
    (parentless : root.parent = none)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id = root.id)) = [root])
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ root.id)))
    (actual : after = { removeCalledProcessTree before selected with tokens := addToken before.tokens output selected.caller }) :
    (after.scopeOccurrences.filter fun scope => scope.parent.isSome).mapM (scopeStart? program after) =
      (before.scopeOccurrences.filter fun scope => scope.parent.isSome).mapM (scopeStart? program before) := by
  have population := regional_return_scope_filter_frame before after root (fun scope => scope.parent.isSome)
    census scopes (by simp [parentless])
  rw [population]
  have frame : ∀ scope ∈ before.scopeOccurrences.filter (fun scope => scope.parent.isSome),
      scopeStart? program after scope = scopeStart? program before scope := by
    intro scope member
    have survived : scope ∈ after.scopeOccurrences :=
      (List.mem_filter.mp (show scope ∈ after.scopeOccurrences.filter (fun scope => scope.parent.isSome) from by
        rw [population]; exact member)).1
    have retained : scope ∈ (removeCalledProcessTree before selected).scopeOccurrences := by
      simpa only [actual] using survived
    obtain ⟨beforeMember, kept⟩ := List.mem_filter.mp retained
    rw [actual]
    apply removeCalledProcessTree_scope_start_frame program before selected scope valid selectedMember
    intro parent parentEq
    obtain ⟨_, definition, _, _, binding⟩ := runtimePositionValid_scope_parent_binding program expected hosting before
      position running scope beforeMember
    rcases binding with ⟨_, parentless⟩ | ⟨owner, ownerEq, _, sameInstance, _⟩
    · simp [parentless] at parentEq
    · have equal := Option.some.inj (ownerEq.symm.trans parentEq)
      rw [← equal, sameInstance]
      simpa only [Bool.not_eq_true', Bool.eq_false_iff, ne_eq, List.contains_iff_mem] using kept
  generalize before.scopeOccurrences.filter (fun scope => scope.parent.isSome) = values at frame ⊢
  induction values with
  | nil => rfl
  | cons head tail ih =>
      simp only [List.mapM_cons, frame head List.mem_cons_self]
      rw [ih (fun value member => frame value (List.mem_cons_of_mem head member))]

end BpmnSemantics.SemanticProcess.InternalCommutation
