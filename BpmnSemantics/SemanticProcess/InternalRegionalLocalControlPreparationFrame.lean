import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlSelectionFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPositionAlgebra

/-! An independent local-control patch preserves the entire regional preparation. Selection,
ownership closure, region membership, dependency censuses, and publication are derived separately
from the predecessor; no intermediate validity or retained-preparation premise is assumed. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem regional_ownership_localControl_frame (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (control : InternalLocalControlSelection)
    (found : selectInternalOwnershipClosedRegional? program state operation = some selected)
    (selection : selectInternalRegional? program (control.apply state) operation = some selected) :
    selectInternalOwnershipClosedRegional? program (control.apply state) operation = some selected := by
  unfold selectInternalOwnershipClosedRegional? at found ⊢
  obtain ⟨prior, _, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · rename_i valid
    cases found
    rw [selection]
    change (if regionalOwnershipClosed state (regionalSelectionReferenceRetention state selected) &&
        regionalRetainedLocalDataClosed state (regionalSelectionReferenceRetention state selected).activity
          (regionalSelectionLocalDataRetention state selected) &&
        regionalActivityOwnersClosed state (regionalSelectionReferenceRetention state selected) then
      some selected else none) = some selected
    exact if_pos valid
  · contradiction

private theorem regional_footprint_localControl_frame (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (control : InternalLocalControlSelection)
    (tokens : (control.apply state).tokens.filter (fun token => region.contains token.owner) =
      state.tokens.filter (fun token => region.contains token.owner))
    (branches : (control.apply state).selectedBranchSets.filter (fun record => region.contains record.owner) =
      state.selectedBranchSets.filter (fun record => region.contains record.owner)) :
    regionalStateFootprint? (control.apply state) selected region =
      regionalStateFootprint? state selected region := by
  have base (hosting : SemanticId) : regionalBaseFootprint? (control.apply state) hosting selected region =
      regionalBaseFootprint? state hosting selected region := by
    simp only [regionalBaseFootprint?, regionalCensusWrites, tokens, branches]
  have activities : regionalWithdrawnActivityWrites (control.apply state) selected =
      regionalWithdrawnActivityWrites state selected := rfl
  have running : runningInstance? (control.apply state) = runningInstance? state := rfl
  simp only [regionalStateFootprint?, base, activities, running]

private theorem regional_publication_localPatch_frame (program : Program) (state : RuntimeState)
    (patch : InternalLocalControlSelection) (hosting : SemanticId)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (template : InternalRegionalPublicationTemplate)
    (running : state.control = .running hosting)
    (afterValid : runtimePositionValid program hosting (patch.apply state) = true)
    (openFrame : projectOpenFlowNodeOccurrences? program (patch.apply state) =
      projectOpenFlowNodeOccurrences? program state)
    (found : regionalPublicationTemplate? program state selected region = some template)
    (tokens : (patch.apply state).tokens.filter (fun token => region.contains token.owner) =
      state.tokens.filter (fun token => region.contains token.owner)) :
    regionalPublicationTemplate? program (patch.apply state) selected region = some template := by
  obtain ⟨selectedHosting, positions, current, delta, identities, ends,
    selectedRunning, projected, opened, positioned, lifecycle, rfl⟩ :=
    regionalPublicationTemplate_facts program state selected region template found
  have sameHosting : selectedHosting = hosting := by
    simpa [runningInstance?, running] using selectedRunning.symm
  subst selectedHosting
  unfold projectControlPosition? at projected
  split at projected
  · cases projected
    have tokenProjection :
        (projectTokens program (patch.apply state).tokens).filter (fun token => region.contains token.owner) =
          (projectTokens program state.tokens).filter (fun token => region.contains token.owner) := by
      rw [← projectTokens_filter_by_owner, ← projectTokens_filter_by_owner]
      exact congrArg (projectTokens program) tokens
    have deltaFrame : regionalPositionDelta? program selected region
        { controlTokens := projectTokens program (patch.apply state).tokens
          scopes := projectScopes program state.scopeOccurrences } = some delta := by
      simpa only [regionalPositionDelta?, tokenProjection] using positioned
    have lifecycleFrame : regionalLifecycleTemplate? program (patch.apply state) selected region current =
        regionalLifecycleTemplate? program state selected region current := rfl
    change projectOpenFlowNodeOccurrences? program (patch.apply state) =
      projectOpenFlowNodeOccurrences? program state at openFrame
    have afterRunning : runningInstance? (patch.apply state) = some hosting := by
      simp [runningInstance?, InternalLocalControlSelection.apply, running]
    have afterProjection : projectControlPosition? program hosting (patch.apply state) =
        some { controlTokens := projectTokens program (patch.apply state).tokens
               scopes := projectScopes program state.scopeOccurrences } := by
      rw [projectControlPosition?, afterValid]
      rfl
    change regionalPublicationTemplate? program (patch.apply state) selected region = _
    simp only [regionalPublicationTemplate?, afterRunning, afterProjection, openFrame, opened,
      deltaFrame, lifecycleFrame, lifecycle, Option.bind_eq_bind, Option.bind_some]
    rfl
  · contradiction

theorem prepareInternalRegional_after_independent_localPatch (program : Program) (state : RuntimeState)
    (regionalOperation : SemanticOperation) (regional : PreparedInternalRegional)
    (patch : InternalLocalControlSelection) (hosting : SemanticId)
    (running : state.control = .running hosting)
    (afterValid : runtimePositionValid program hosting (patch.apply state) = true)
    (openFrame : projectOpenFlowNodeOccurrences? program (patch.apply state) =
      projectOpenFlowNodeOccurrences? program state)
    (regionalFound : prepareInternalRegional? program state regionalOperation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint patch.owner (internalLocalControlStateFootprint state patch hosting)) = true) :
    prepareInternalRegional? program (patch.apply state) regionalOperation = some regional := by
  obtain ⟨snapshots, declared, time, closed, derived, footprint, publication⟩ :=
    prepareInternalRegional_facts program state regionalOperation regional regionalFound
  have selected := (ownershipClosedSelection_facts program state regionalOperation regional.selection closed).1
  have tokenOutside := regional_localControl_token_outside state regional.selection regional.region
    regional.footprint patch hosting footprint independent
  have branchOutside := regional_localControl_branch_outside state regional.selection regional.region
    regional.footprint patch hosting footprint independent
  have rootInside : regional.region.contains regional.selection.root.id = true :=
    List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec state _ _ derived).2.1
  have quiet := localControl_quiescent_frame state patch regional.selection.root.id
    (by intro place member same; have outside := tokenOutside place member; rw [same, rootInside] at outside; contradiction)
    (by intro record changed same; have outside := branchOutside record changed; rw [same, rootInside] at outside; contradiction)
  have inputs : match regionalOperation with
      | .throwError _ _ input _ _ | .terminateScope _ _ input _ =>
          input ∉ patch.tokens.consumed ++ patch.tokens.produced
      | _ => True := by
    have operation := regionalSelection_operation program state regionalOperation regional.selection selected
    have read := regionalStateFootprint_selector_read state regional.selection regional.region regional.footprint footprint
    rw [operation] at read
    cases regionalOperation <;> try trivial
    all_goals exact regional_localControl_census_untouched state regional.footprint patch hosting _ read independent
  have selectionFrame : selectInternalRegional? program (patch.apply state) regionalOperation =
      some regional.selection := by
    apply regionalSelection_localControl_frame program state regionalOperation regional.selection patch selected quiet
    cases regionalOperation <;> exact inputs
  have closureFrame := regional_ownership_localControl_frame program state regionalOperation regional.selection patch
    closed selectionFrame
  have members (seed : List ScopeOccurrenceId) (fuel : Nat) :
      occurrenceRegionMembersWithin (patch.apply state) seed fuel = occurrenceRegionMembersWithin state seed fuel := by
    induction fuel generalizing seed with
    | zero => rfl
    | succ fuel ih =>
        have expanded : expandOccurrenceRegionMembers (patch.apply state) seed =
            expandOccurrenceRegionMembers state seed := rfl
        simp only [occurrenceRegionMembersWithin, expanded, ih]
  have regionFrame : deriveInternalOccurrenceRegion? (patch.apply state) regional.selection.root.id =
      deriveInternalOccurrenceRegion? state regional.selection.root.id := by
    simp only [deriveInternalOccurrenceRegion?, members]
    rfl
  have tokens := localControl_region_token_frame state patch regional.region tokenOutside
  have branches := localControl_region_branch_frame state patch regional.region branchOutside
  have dependencies := regional_footprint_localControl_frame state regional.selection regional.region patch tokens branches
  have published := regional_publication_localPatch_frame program state patch hosting
    regional.selection regional.region regional.publicationTemplate running afterValid openFrame publication tokens
  have result := prepareInternalRegional_of_components program (patch.apply state) regionalOperation
    regional.selection regional.region regional.footprint regional.publicationTemplate snapshots declared time
    closureFrame (regionFrame.trans derived) (dependencies.trans footprint) published
  cases regional
  exact result

theorem prepareInternalRegional_after_independent_localControl (program : Program) (state : RuntimeState)
    (regionalOperation localOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (control : PreparedInternalLocalControl)
    (beforeWF : runtimeStateWellFormed program control.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state regionalOperation = some regional)
    (localFound : prepareInternalLocalControl? program state localOperation = some control)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint control.selection.owner control.footprint) = true) :
    prepareInternalRegional? program (control.selection.apply state) regionalOperation = some regional := by
  obtain ⟨patch, origin, hosting, identity, delta, _, _, running, live,
    _, _, _, _, _, deltaFound, rfl⟩ :=
    prepareInternalLocalControl_facts program state localOperation control localFound
  have outputs := internalLocalControlPositionDelta?_output_bindings program patch.tokens delta deltaFound
  have beforePosition : runtimePositionValid program hosting state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at beforeWF
    exact beforeWF.1
  have afterValid := patch.tokens.preserves_position program hosting state
    beforePosition live
    (fun place member => (outputs place member).1) (fun place member => (outputs place member).2)
  have openFrame := prepareInternalLocalControl_open_occurrences_frame program state localOperation
    (makeInternalLocalControlPreparation state patch hosting identity delta) hosting beforeWF running localFound
  exact prepareInternalRegional_after_independent_localPatch program state regionalOperation regional patch hosting
    running afterValid openFrame regionalFound independent

end BpmnSemantics.SemanticProcess.InternalCommutation
