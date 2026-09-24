import BpmnSemantics.SemanticProcess.InternalEndCommutation
import BpmnSemantics.SemanticProcess.InternalRegionalSelectionFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPositionAlgebra
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionalPreparationFrame

/-! End/regional frames preserve complete predecessor artifacts through token removal and
ownership-closed regional execution. Protected owner, input and control reads exclude removal
of the End's context; the derived region and its publication retain their original values. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem InternalEndSelection.region_frame (state : RuntimeState) (ending : InternalEndSelection)
    (root : ScopeOccurrenceId) :
    deriveInternalOccurrenceRegion? (ending.apply state) root = deriveInternalOccurrenceRegion? state root := by
  have members (seed : List ScopeOccurrenceId) (fuel : Nat) :
      occurrenceRegionMembersWithin (ending.apply state) seed fuel = occurrenceRegionMembersWithin state seed fuel := by
    induction fuel generalizing seed with
    | zero => rfl
    | succ fuel ih =>
        have expanded : expandOccurrenceRegionMembers (ending.apply state) seed = expandOccurrenceRegionMembers state seed := rfl
        simp only [occurrenceRegionMembersWithin, expanded, ih]
  simp only [deriveInternalOccurrenceRegion?, members]
  rfl

private theorem regional_publication_end_frame (program : Program) (state : RuntimeState)
    (ending : InternalEndSelection) (instanceId : SemanticId)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (template : InternalRegionalPublicationTemplate)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (live : exactLiveOccurrence state ending.owner = true)
    (running : state.control = .running instanceId)
    (found : regionalPublicationTemplate? program state selected region = some template)
    (outside : region.contains ending.owner = false) :
    regionalPublicationTemplate? program (ending.apply state) selected region = some template := by
  have afterPosition := runtimeStateWellFormed_position program instanceId _
    (ending.preserves_runtimeStateWellFormed program state instanceId valid live)
  have openFrame := ending.open_occurrences_frame program state instanceId running
  have tokens : (ending.apply state).tokens.filter (fun token => region.contains token.owner) =
      state.tokens.filter (fun token => region.contains token.owner) :=
    filter_removeToken_of_rejected state.tokens ending.input ending.owner _ outside
  obtain ⟨hosting, positions, current, delta, identities, ends,
    selectedRunning, projected, opened, positioned, lifecycle, rfl⟩ :=
    regionalPublicationTemplate_facts program state selected region template found
  have sameHosting : hosting = instanceId := by
    simpa [runningInstance?, running] using selectedRunning.symm
  subst hosting
  unfold projectControlPosition? at projected
  split at projected
  · cases projected
    have tokenProjection : (projectTokens program (ending.apply state).tokens).filter
        (fun token => region.contains token.owner) =
      (projectTokens program state.tokens).filter (fun token => region.contains token.owner) := by
      rw [← projectTokens_filter_by_owner, ← projectTokens_filter_by_owner]
      exact congrArg (projectTokens program) tokens
    have deltaFrame : regionalPositionDelta? program selected region
        { controlTokens := projectTokens program (ending.apply state).tokens
          scopes := projectScopes program state.scopeOccurrences } = some delta := by
      simpa only [regionalPositionDelta?, tokenProjection] using positioned
    have lifecycleFrame : regionalLifecycleTemplate? program (ending.apply state) selected region current =
        regionalLifecycleTemplate? program state selected region current := rfl
    have afterRunning : runningInstance? (ending.apply state) = some instanceId := by
      simp [runningInstance?, InternalEndSelection.apply, running]
    have afterProjection : projectControlPosition? program instanceId (ending.apply state) =
        some { controlTokens := projectTokens program (ending.apply state).tokens
               scopes := projectScopes program state.scopeOccurrences } := by
      rw [projectControlPosition?, afterPosition]
      rfl
    simp only [regionalPublicationTemplate?, afterRunning, afterProjection, openFrame, opened,
      deltaFrame, lifecycleFrame, lifecycle, Option.bind_eq_bind, Option.bind_some]
    rfl
  · contradiction

theorem prepareInternalRegional_after_independent_end (program : Program) (state : RuntimeState)
    (regionalOperation endOperation : SemanticOperation) (regional : PreparedInternalRegional)
    (ending : PreparedInternalEnd)
    (valid : runtimeStateWellFormed program ending.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state regionalOperation = some regional)
    (endFound : prepareInternalEnd? program state endOperation = some ending)
    (independent : regionalStateFootprintsIndependent regional.footprint ending.footprint = true) :
    prepareInternalRegional? program (ending.selection.apply state) regionalOperation = some regional := by
  obtain ⟨_, ending, _, instanceId, _, _, _, _, running, live, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program state endOperation ending endFound
  obtain ⟨snapshots, declared, time, closed, derived, footprint, publication⟩ :=
    prepareInternalRegional_facts program state regionalOperation regional regionalFound
  have selection := (ownershipClosedSelection_facts program state regionalOperation regional.selection closed).1
  have ownerRead : .ordinary (.scopeOccurrence ending.owner) ∈
      (internalEndStateFootprint ending instanceId).reads := by
    simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem]
  have outside := regional_pair_read_owner_outside state regional.selection regional.region regional.footprint
    (internalEndStateFootprint ending instanceId) footprint independent ending.owner ownerRead
  have rootInside : regional.region.contains regional.selection.root.id = true :=
    List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec state _ _ derived).2.1
  have otherOwner : ending.owner ≠ regional.selection.root.id := by
    intro same
    rw [same, rootInside] at outside
    contradiction
  have quiet : scopeQuiescent (ending.apply state) regional.selection.root.id =
      scopeQuiescent state regional.selection.root.id := by
    have filtered := filter_removeToken_of_rejected state.tokens ending.input ending.owner
      (fun token => token.owner == regional.selection.root.id) (by simpa using otherOwner)
    have population := scopeCreation_any_population_frame _ _ _ filtered
    change ((ending.apply state).tokens.any (fun token => token.owner == regional.selection.root.id)) =
      state.tokens.any (fun token => token.owner == regional.selection.root.id) at population
    simp only [scopeQuiescent, population]
    rfl
  have inputDistinct (input : ControlPlaceId) (read : .ordinary (.tokenOwners input) ∈ regional.footprint.reads) :
      input ≠ ending.input := by
    have written : .ordinary (.tokenOwners ending.input) ∈ (internalEndStateFootprint ending instanceId).writes := by
      simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem]
    have conflict := regional_independent_write_read _ _ independent _ _ written read
    intro same
    simp [regionalStateAtomsConflict, same] at conflict
  have selectionAfter : selectInternalRegional? program (ending.apply state) regionalOperation = some regional.selection := by
    apply regionalSelection_read_frame program state (ending.apply state) regionalOperation regional.selection
      selection rfl rfl rfl rfl quiet (fun _ _ _ chosen => chosen)
    have read := regionalStateFootprint_selector_read state regional.selection regional.region regional.footprint footprint
    rw [regionalSelection_operation program state regionalOperation regional.selection selection] at read
    cases regionalOperation with
    | throwError id origin input error handler =>
        have different := inputDistinct input read
        refine ⟨ending.tokens.owner_selection_frame state input
          (by simpa [InternalEndSelection.tokens] using different) (by simp [InternalEndSelection.tokens]), ?_⟩
        exact filter_removeToken_of_rejected state.tokens ending.input ending.owner _ (by simp [Ne.symm different])
    | terminateScope id origin input definition =>
        have different := inputDistinct input read
        have owners := ending.tokens.owner_census_frame state input
          (by simpa [InternalEndSelection.tokens] using different) (by simp [InternalEndSelection.tokens])
        change tokenOwners (ending.apply state) input = tokenOwners state input at owners
        change selectedTerminateOwner? program (ending.apply state) id origin input definition =
          selectedTerminateOwner? program state id origin input definition
        unfold selectedTerminateOwner?
        rw [owners]
        rfl
    | _ => trivial
  have closureAfter : selectInternalOwnershipClosedRegional? program (ending.apply state) regionalOperation =
      some regional.selection := by
    unfold selectInternalOwnershipClosedRegional? at closed ⊢
    obtain ⟨selected, _, closed⟩ := Option.bind_eq_some_iff.mp closed
    split at closed
    · rename_i valid
      cases closed
      rw [selectionAfter]
      exact if_pos valid
    · contradiction
  have tokenFrame : (ending.apply state).tokens.filter (fun token => regional.region.contains token.owner) =
      state.tokens.filter (fun token => regional.region.contains token.owner) :=
    filter_removeToken_of_rejected state.tokens ending.input ending.owner _ outside
  have base (hosting : SemanticId) : regionalBaseFootprint? (ending.apply state) hosting regional.selection regional.region =
      regionalBaseFootprint? state hosting regional.selection regional.region := by
    simp only [regionalBaseFootprint?, regionalCensusWrites, tokenFrame]
    rfl
  have footprintAfter : regionalStateFootprint? (ending.apply state) regional.selection regional.region =
      regionalStateFootprint? state regional.selection regional.region := by
    have activities : regionalWithdrawnActivityWrites (ending.apply state) regional.selection =
        regionalWithdrawnActivityWrites state regional.selection := rfl
    have control : runningInstance? (ending.apply state) = runningInstance? state := rfl
    simp only [regionalStateFootprint?, base, activities, control]
  have result := prepareInternalRegional_of_components program (ending.apply state) regionalOperation
    regional.selection regional.region regional.footprint regional.publicationTemplate snapshots declared time closureAfter
    ((ending.region_frame state regional.selection.root.id).trans derived) (footprintAfter.trans footprint)
    (regional_publication_end_frame program state ending instanceId regional.selection regional.region
      regional.publicationTemplate valid live running publication outside)
  cases regional
  exact result

theorem prepareInternalEnd_after_independent_regional (program : Program) (before after : RuntimeState)
    (regionalOperation endOperation : SemanticOperation) (regional : PreparedInternalRegional)
    (ending : PreparedInternalEnd)
    (valid : runtimeStateWellFormed program ending.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (endFound : prepareInternalEnd? program before endOperation = some ending)
    (independent : regionalStateFootprintsIndependent regional.footprint ending.footprint = true)
    (applied : applyPreparedInternalRegional? program before regional = some after) :
    prepareInternalEnd? program after endOperation = some ending := by
  obtain ⟨_, selected, _, instanceId, identity, delta, _, _, running, _, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program before endOperation ending endFound
  obtain ⟨_, _, _, _, _, footprint, _⟩ :=
    prepareInternalRegional_facts program before regionalOperation regional regionalFound
  have read (atom : InternalStateAtom)
      (member : atom ∈ [.tokenOwners selected.input, .runtimeControl instanceId, .scopeOccurrence selected.owner]) :
      .ordinary atom ∈ (internalEndStateFootprint selected instanceId).reads := by
    simp only [List.mem_cons, List.not_mem_nil, or_false] at member
    rcases member with rfl | rfl | rfl <;> simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem]
  have outside := regional_pair_read_owner_outside before regional.selection regional.region regional.footprint
    (internalEndStateFootprint selected instanceId) footprint independent selected.owner (read _ (by simp))
  have noControl := regional_pair_read_key_not_written _ _ independent _ (read (.runtimeControl instanceId) (by simp))
  have noInput := regional_pair_read_key_not_written _ _ independent _ (read (.tokenOwners selected.input) (by simp))
  have removed := (preparedRegional_removed_censuses program before regionalOperation regional regionalFound).1
  have frame := preparedRegional_control_filters program before after instanceId regionalOperation regional
    valid running regionalFound applied
    (fun scope => decide (scope.id = selected.owner))
    (fun token => decide (token.placeId = selected.input)) (fun _ => false)
    (by intro scope _ named; simpa only [of_decide_eq_true named] using outside)
    (by
      intro token present named
      apply Bool.eq_false_iff.mpr
      intro inside
      exact noInput (by simpa only [of_decide_eq_true named] using removed token present inside))
    (by simp)
    (by
      intro owner output _ written
      apply Bool.eq_false_iff.mpr
      intro named
      have same : output = selected.input := of_decide_eq_true named
      exact noInput (same ▸ written)) noControl
  apply prepareInternalEnd_read_frame program before after endOperation
    (makeInternalEndPreparation before selected instanceId identity delta) endFound frame.1 _ frame.2.1 frame.2.2.2.2.1
  exact congrArg (fun population : List RuntimeScopeOccurrence => decide (population.length = 1)) frame.2.2.2.1

end BpmnSemantics.SemanticProcess.InternalCommutation
