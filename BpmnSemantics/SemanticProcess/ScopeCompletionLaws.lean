module

public import BpmnSemantics.SemanticProcess.ScopeCompletion
import BpmnSemantics.SemanticProcess.ScopeAncestryLaws
public import BpmnSemantics.SemanticProcess.ScopeCancellation

/-! Quiescent scope completion has no live descendant or called-root closure to remove. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- With no immediate child, the actual parent traversal can reach only the selected scope. -/
theorem quiescent_scope_subtree_identity (state : RuntimeState) (owner candidate : ScopeOccurrenceId)
    (quiescent : scopeQuiescent state owner = true)
    (inside : occurrenceInSubtree state.scopeOccurrences owner candidate = true) : candidate = owner := by
  apply occurrenceInSubtreeWithin_least state.scopeOccurrences owner candidate _ (fun id => id = owner) rfl _ inside
  intro parent child same edge
  obtain ⟨occurrence, member, parentEq, _⟩ := edge
  exact False.elim (quiescent_scope_has_no_child state owner quiescent occurrence member (by simpa [same] using parentEq))

/-- Every Call seed would have an exact caller at the quiescent root; the actual closure is empty. -/
theorem quiescent_scope_called_closure_empty (state : RuntimeState) (owner : ScopeOccurrenceId)
    (quiescent : scopeQuiescent state owner = true) : calledInstanceClosure state owner = [] := by
  have seeds : (state.calledProcessOccurrences.filterMap fun record =>
      if occurrenceInSubtree state.scopeOccurrences owner record.caller then
        some record.calledRoot.processInstanceId else none) = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro record member
    by_cases inside : occurrenceInSubtree state.scopeOccurrences owner record.caller = true
    · have same := quiescent_scope_subtree_identity state owner record.caller quiescent inside
      have present : (state.calledProcessOccurrences.any fun candidate => candidate.caller == owner) = true :=
        List.any_eq_true.mpr ⟨record, member, by simp [same]⟩
      simp [scopeQuiescent, present] at quiescent
    · simp [inside]
  unfold calledInstanceClosure
  rw [seeds]
  have noEdges : (state.calledProcessOccurrences.filterMap (fun _ => (none : Option SemanticId))) = [] :=
    List.filterMap_eq_nil_iff.mpr (by intros; rfl)
  simp [processInstanceClosureWithin, noEdges]

end BpmnSemantics.SemanticProcess
