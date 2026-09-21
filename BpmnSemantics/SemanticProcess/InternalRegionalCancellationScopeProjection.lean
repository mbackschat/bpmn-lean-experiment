import BpmnSemantics.SemanticProcess.InternalRegionalCancellationProjectionFrames
import BpmnSemantics.SemanticProcess.InternalRegionalProjectionRemoval

/-! Scope projection follows actual cancellation retention. A retained selected child
still projects through its surviving parent; the shared position ancestry theorem
establishes that parent lookup is unchanged. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem cancelScopeSubtree_child_scope_projection (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (entries : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (projected : (state.scopeOccurrences.filter (·.parent.isSome)).mapM
      (scopeStart? program state) = some entries) :
    ((cancelScopeSubtree state root.id disposition).scopeOccurrences.filter (·.parent.isSome)).mapM
        (scopeStart? program (cancelScopeSubtree state root.id disposition)) =
      some (entries.filter fun entry =>
        (decide (disposition = .retain) && decide (entry.anchor = .scope root.id)) ||
          !flowNodeOccurrenceOwnedBySubtree program state root.id entry) := by
  let keep := fun scope : RuntimeScopeOccurrence =>
    (decide (disposition = .retain) && decide (scope.id = root.id)) ||
      !(occurrenceInSubtree state.scopeOccurrences root.id scope.id ||
        (calledInstanceClosure state root.id).contains scope.id.processInstanceId)
  have scopes : (cancelScopeSubtree state root.id disposition).scopeOccurrences =
      state.scopeOccurrences.filter keep := by
    cases disposition <;> rfl
  rw [scopes, List.filter_filter]
  rw [show (fun scope : RuntimeScopeOccurrence => scope.parent.isSome && keep scope) =
    (fun scope => keep scope && scope.parent.isSome) by funext scope; exact Bool.and_comm _ _]
  rw [← List.filter_filter]
  apply mapM_filter_preserves_success _ _ _ _ _ entries projected
  · intro scope member entry started
    unfold scopeStart? at started
    obtain ⟨parent, _, started⟩ := Option.bind_eq_some_iff.mp started
    obtain ⟨process, _, started⟩ := Option.bind_eq_some_iff.mp started
    split at started
    · cases started
      simp only [keep, flowNodeOccurrenceOwnedBySubtree, SemanticFlowNodeOccurrenceAnchor.scope.injEq]
    · contradiction
  · intro scope member entry started kept
    have retained : scope ∈ (cancelScopeSubtree state root.id disposition).scopeOccurrences := by
      rw [scopes]
      exact List.mem_filter.mpr ⟨(List.mem_filter.mp member).1, kept⟩
    rw [cancelScopeSubtree_child_scope_start_frame program state expected hosting root scope disposition
      valid running rootMember child (fun parent parentEq =>
        cancelScopeSubtree_child_parent_outside program state expected hosting valid running
          root rootMember child disposition scope retained parent parentEq)]
    exact started

theorem cancelScopeSubtree_child_call_projection_filtered (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (entries : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (projected : state.calledProcessOccurrences.mapM (callStart? program state) = some entries) :
    (cancelScopeSubtree state root.id disposition).calledProcessOccurrences.mapM
        (callStart? program (cancelScopeSubtree state root.id disposition)) =
      some (entries.filter fun entry =>
        (decide (disposition = .retain) && decide (entry.anchor = .scope root.id)) ||
          !flowNodeOccurrenceOwnedBySubtree program state root.id entry) := by
  rw [cancelScopeSubtree_child_call_projection program state expected hosting root disposition
    valid running rootMember child, projected]
  congr 1
  symm
  apply List.filter_eq_self.mpr
  intro entry member
  obtain ⟨record, present, started⟩ := mapM_output_member _ _ _ projected entry member
  have retained : record ∈ (cancelScopeSubtree state root.id disposition).calledProcessOccurrences := by
    rw [cancellation_child_calls_frame program state expected hosting valid running root rootMember child disposition]
    exact present
  have kept := (List.mem_filter.mp retained).2
  simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
  unfold callStart? at started
  obtain ⟨process, _, started⟩ := Option.bind_eq_some_iff.mp started
  cases started
  simpa only [flowNodeOccurrenceOwnedBySubtree, reduceCtorEq, decide_false,
    Bool.and_false, Bool.false_or, Bool.not_eq_true'] using kept.1

end BpmnSemantics.SemanticProcess.InternalCommutation
