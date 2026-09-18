import BpmnSemantics.SemanticProcess.InternalScopeCreationSelection
import BpmnSemantics.SemanticProcess.ScopeInsertionValidity

/-! # Scope-creation freshness

The selector's definition-wide or instance-wide exclusion must imply complete-identity freshness
before the scope-insertion ownership laws can apply.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem selectInternalScopeCreation_fresh (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected) :
    ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ selected.created.id := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      dsimp only at found
      repeat first | contradiction | split at found
      all_goals cases found
      all_goals
        intro occurrence member same
        simp_all only [Bool.or_eq_true, Bool.not_eq_true, decide_eq_true_eq,
          List.length_eq_zero_iff, List.filter_eq_nil_iff, List.any_eq_true]
        grind

theorem selectInternalScopeCreation_created_live (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected) :
    exactLiveOccurrence (selected.apply state) selected.created.id = true := by
  have live := exactLiveOccurrence_insertScopeOccurrence_created state selected.created
    (selectInternalScopeCreation_fresh state operation selected found)
  cases kind : selected.kind <;>
    simpa [InternalScopeCreationSelection.apply, kind, exactLiveOccurrence] using live

theorem selectInternalScopeCreation_preserves_live (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (owner : ScopeOccurrenceId)
    (found : selectInternalScopeCreation? state operation = some selected)
    (live : exactLiveOccurrence state owner = true) :
    exactLiveOccurrence (selected.apply state) owner = true := by
  have preserved := exactLiveOccurrence_insertScopeOccurrence_preserves state selected.created owner
    (selectInternalScopeCreation_fresh state operation selected found) live
  cases kind : selected.kind <;>
    simpa [InternalScopeCreationSelection.apply, kind, exactLiveOccurrence] using preserved

end BpmnSemantics.SemanticProcess.InternalCommutation
