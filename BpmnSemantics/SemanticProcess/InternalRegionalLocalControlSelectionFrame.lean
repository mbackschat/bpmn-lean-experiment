import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlDependencies
import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparationFrames
import BpmnSemantics.SemanticProcess.InternalRegionalSelectionFrame

/-! Regional selection observes token-owner censuses and quiescence. The existing patch filter
laws retain both observations when the regional footprint excludes local-control writes. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem localControl_region_token_frame (state : RuntimeState)
    (control : InternalLocalControlSelection) (region : InternalOccurrenceRegion)
    (outside : ∀ place ∈ control.tokens.consumed ++ control.tokens.produced,
      region.contains control.owner = false) :
    ((control.apply state).tokens.filter fun token => region.contains token.owner) =
      state.tokens.filter (fun token => region.contains token.owner) := by
  apply control.tokens.filter_untouched
  · intro place member
    exact outside place (List.mem_append_left _ member)
  · intro place member
    exact outside place (List.mem_append_right _ member)

theorem localControl_region_branch_frame (state : RuntimeState)
    (control : InternalLocalControlSelection) (region : InternalOccurrenceRegion)
    (outside : ∀ record, control.selectedBranch = .insert record ∨ control.selectedBranch = .remove record →
      region.contains record.owner = false) :
    ((control.apply state).selectedBranchSets.filter fun record => region.contains record.owner) =
      state.selectedBranchSets.filter (fun record => region.contains record.owner) :=
  control.selectedBranch.filter_untouched _ _ outside

theorem localControl_quiescent_frame (state : RuntimeState)
    (control : InternalLocalControlSelection) (owner : ScopeOccurrenceId)
    (tokens : ∀ place ∈ control.tokens.consumed ++ control.tokens.produced, control.owner ≠ owner)
    (branches : ∀ record, control.selectedBranch = .insert record ∨ control.selectedBranch = .remove record →
      record.owner ≠ owner) :
    scopeQuiescent (control.apply state) owner = scopeQuiescent state owner := by
  have tokenFilter := control.tokens.filter_untouched state.tokens (fun token => token.owner == owner)
    (fun place member => by simpa [InternalLocalControlSelection.owner] using tokens place (List.mem_append_left _ member))
    (fun place member => by simpa [InternalLocalControlSelection.owner] using tokens place (List.mem_append_right _ member))
  have branchFilter := control.selectedBranch.filter_untouched state.selectedBranchSets
    (fun record => record.owner == owner) (fun record changed => by simpa using branches record changed)
  have tokenAny := scopeCreation_any_population_frame _ _ _ tokenFilter
  have branchAny := scopeCreation_any_population_frame _ _ _ branchFilter
  simp only [scopeQuiescent, InternalLocalControlSelection.apply, tokenAny, branchAny]

theorem regionalSelection_localControl_frame (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (control : InternalLocalControlSelection)
    (found : selectInternalRegional? program state operation = some selected)
    (quiet : scopeQuiescent (control.apply state) selected.root.id = scopeQuiescent state selected.root.id)
    (inputs : match operation with
      | .throwError _ _ input _ _ | .terminateScope _ _ input _ =>
          input ∉ control.tokens.consumed ++ control.tokens.produced
      | _ => True) :
    selectInternalRegional? program (control.apply state) operation = some selected := by
  apply regionalSelection_read_frame program state (control.apply state) operation selected
    found rfl rfl rfl rfl quiet (fun _ _ _ chosen => chosen)
  cases operation with
  | throwError id origin input error handler =>
      have absent : input ∉ control.tokens.consumed ∧ input ∉ control.tokens.produced := by
        simpa only [List.mem_append, not_or] using inputs
      have owners := control.tokens.owner_selection_frame state input absent.1 absent.2
      refine ⟨owners, ?_⟩
      exact control.tokens.filter_untouched state.tokens
        (fun token => decide (token.placeId = input && token.owner = selected.root.id))
        (by intro place member; simp; intro same; exact False.elim (absent.1 (same ▸ member)))
        (by intro place member; simp; intro same; exact False.elim (absent.2 (same ▸ member)))
  | terminateScope id origin input definition =>
      have absent : input ∉ control.tokens.consumed ∧ input ∉ control.tokens.produced := by
        simpa only [List.mem_append, not_or] using inputs
      have owners := control.tokens.owner_census_frame state input absent.1 absent.2
      change tokenOwners (control.apply state) input = tokenOwners state input at owners
      change selectedTerminateOwner? program (control.apply state) id origin input definition =
        selectedTerminateOwner? program state id origin input definition
      unfold selectedTerminateOwner?
      rw [owners]
      rfl
  | _ => trivial

end BpmnSemantics.SemanticProcess.InternalCommutation
