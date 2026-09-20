import BpmnSemantics.SemanticProcess.InternalRegionalPositionValidity
import BpmnSemantics.SemanticProcess.InternalRegionalOpenOwnership

/-! Child cancellation preserves Process lookup outside the cancelled region. The
current Call account has parentless endpoints, so a child seed removes no Call record;
this is a bounded profile fact, not a general BPMN restriction on nested Calls. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem cancelScopeSubtree_child_process_lookup_frame (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (owner : ScopeOccurrenceId)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (outside : (occurrenceInSubtree state.scopeOccurrences root.id owner ||
      (calledInstanceClosure state root.id).contains owner.processInstanceId) = false) :
    processIdForOwner? program (cancelScopeSubtree state root.id disposition) owner =
      processIdForOwner? program state owner := by
  have scopes := cancelScopeSubtree_uncancelled_owner_census state root.id disposition owner outside
  have calls := cancellation_child_calls_frame program state expected hosting valid running root rootMember child disposition
  have control : (cancelScopeSubtree state root.id disposition).control = state.control := rfl
  simp only [processIdForOwner?, hostingInstanceId?, control, flowNodeOccurrenceOwnerLiveUnique, scopes, calls]
  rfl

theorem cancelScopeSubtree_child_wait_start_frame (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (outside : (occurrenceInSubtree state.scopeOccurrences root.id owner ||
      (calledInstanceClosure state root.id).contains owner.processInstanceId) = false) :
    waitStart? program (cancelScopeSubtree state root.id disposition) owner element activation =
      waitStart? program state owner element activation := by
  simp only [waitStart?, cancelScopeSubtree_child_process_lookup_frame program state expected hosting root disposition
    owner valid running rootMember child outside]

theorem cancelScopeSubtree_child_scope_start_frame (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root scope : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (outside : ∀ parent, scope.parent = some parent →
      (occurrenceInSubtree state.scopeOccurrences root.id parent ||
        (calledInstanceClosure state root.id).contains parent.processInstanceId) = false) :
    scopeStart? program (cancelScopeSubtree state root.id disposition) scope = scopeStart? program state scope := by
  unfold scopeStart?
  cases parentEq : scope.parent with
  | none => simp
  | some parent =>
      simp only [bind, Option.bind, cancelScopeSubtree_child_process_lookup_frame program state expected hosting root
        disposition parent valid running rootMember child (outside parent parentEq)]

theorem cancelScopeSubtree_child_call_start_frame (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (record : CalledProcessOccurrence)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (member : record ∈ state.calledProcessOccurrences) :
    callStart? program (cancelScopeSubtree state root.id disposition) record = callStart? program state record := by
  have calls := cancellation_child_calls_frame program state expected hosting valid running root rootMember child disposition
  have retained : record ∈ (cancelScopeSubtree state root.id disposition).calledProcessOccurrences := by rw [calls]; exact member
  have kept := (List.mem_filter.mp retained).2
  simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
  simp only [callStart?, cancelScopeSubtree_child_process_lookup_frame program state expected hosting root disposition
    record.caller valid running rootMember child kept.1]

theorem cancelScopeSubtree_child_call_projection (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none) :
    (cancelScopeSubtree state root.id disposition).calledProcessOccurrences.mapM
        (callStart? program (cancelScopeSubtree state root.id disposition)) =
      state.calledProcessOccurrences.mapM (callStart? program state) := by
  rw [cancellation_child_calls_frame program state expected hosting valid running root rootMember child disposition]
  have frame := fun record member => cancelScopeSubtree_child_call_start_frame program state expected hosting root disposition
    record valid running rootMember child member
  generalize state.calledProcessOccurrences = values at frame ⊢
  induction values with
  | nil => rfl
  | cons head tail ih =>
      simp only [List.mapM_cons, frame head List.mem_cons_self]
      rw [ih (fun value member => frame value (List.mem_cons_of_mem head member))]

end BpmnSemantics.SemanticProcess.InternalCommutation
