import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationValidity
import BpmnSemantics.SemanticProcess.InternalCommutation

/-! The five local-control families use equality-keyed state atoms. Their complete predecessor
footprints supply the frames and unit separation required by the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

def localControlStateFootprintsNonInterfering
    (left right : InternalTransitionStateFootprint) : Bool :=
  listsDisjoint left.writes right.reads && listsDisjoint left.writes right.writes &&
    listsDisjoint right.writes left.reads && listsDisjoint right.writes left.writes

theorem localControlStateFootprintsNonInterfering_symm
    (left right : InternalTransitionStateFootprint)
    (separated : localControlStateFootprintsNonInterfering left right = true) :
    localControlStateFootprintsNonInterfering right left = true := by
  simpa only [localControlStateFootprintsNonInterfering, Bool.and_eq_true, and_assoc,
    and_left_comm, and_comm] using separated

private theorem localControlStateFootprintsNonInterfering_parts
    (left right : InternalTransitionStateFootprint)
    (separated : localControlStateFootprintsNonInterfering left right = true) :
    listsDisjoint left.writes right.reads = true ∧ listsDisjoint left.writes right.writes = true ∧
      listsDisjoint right.writes left.reads = true ∧ listsDisjoint right.writes left.writes = true := by
  simpa only [localControlStateFootprintsNonInterfering, Bool.and_eq_true, and_assoc] using separated

theorem localControl_tokenOwners_read (state : RuntimeState) (selected : InternalLocalControlSelection)
    (instanceId : SemanticId) (place : ControlPlaceId) (member : place ∈ selected.censusReads) :
    .tokenOwners place ∈ (internalLocalControlStateFootprint state selected instanceId).reads := by
  simp only [internalLocalControlStateFootprint, canonicalStateAtomSet, mem_sortBy,
    List.mem_eraseDups, List.mem_append, List.mem_map]
  exact Or.inl (Or.inl (Or.inl (Or.inl ⟨place, member, rfl⟩)))

theorem localControl_token_read (state : RuntimeState) (selected : InternalLocalControlSelection)
    (instanceId : SemanticId) (place : ControlPlaceId)
    (member : place ∈ selected.tokens.consumed ++ selected.tokens.produced) :
    .controlToken selected.owner place ∈ (internalLocalControlStateFootprint state selected instanceId).reads := by
  simp only [internalLocalControlStateFootprint, canonicalStateAtomSet, mem_sortBy,
    List.mem_eraseDups, List.mem_append, List.mem_map]
  exact Or.inl (Or.inl (Or.inr ⟨place, List.mem_append.mp member, rfl⟩))

theorem localControl_token_write (state : RuntimeState) (selected : InternalLocalControlSelection)
    (instanceId : SemanticId) (place : ControlPlaceId)
    (member : place ∈ selected.tokens.consumed ++ selected.tokens.produced) :
    .controlToken selected.owner place ∈ (internalLocalControlStateFootprint state selected instanceId).writes := by
  simp only [internalLocalControlStateFootprint, canonicalStateAtomSet, mem_sortBy,
    List.mem_eraseDups, List.mem_append]
  exact Or.inl (controlToken_mem_tokenPatchWriteAtoms selected.tokens place member)

theorem localControl_tokenOwners_write (state : RuntimeState) (selected : InternalLocalControlSelection)
    (instanceId : SemanticId) (place : ControlPlaceId)
    (member : place ∈ selected.tokens.consumed ++ selected.tokens.produced) :
    .tokenOwners place ∈ (internalLocalControlStateFootprint state selected instanceId).writes := by
  simp only [internalLocalControlStateFootprint, canonicalStateAtomSet, mem_sortBy,
    List.mem_eraseDups, List.mem_append]
  apply Or.inl
  simp only [tokenPatchWriteAtoms, canonicalStateAtomSet, mem_sortBy, List.mem_eraseDups, List.mem_flatMap]
  exact ⟨place, member, by simp⟩

theorem localControl_selectedKey_write (state : RuntimeState) (selected : InternalLocalControlSelection)
    (instanceId : SemanticId) (key : String) (changed : selected.selectedBranch.selectionKey = some key) :
    .selectedBranchOwners key ∈ (internalLocalControlStateFootprint state selected instanceId).writes := by
  simp only [internalLocalControlStateFootprint, canonicalStateAtomSet, mem_sortBy,
    List.mem_eraseDups, List.mem_append]
  apply Or.inr
  cases branch : selected.selectedBranch with
  | preserve => simp [branch, InternalSelectedBranchPatch.selectionKey] at changed
  | insert record | remove record =>
      simp only [branch, InternalSelectedBranchPatch.selectionKey, Option.some.injEq] at changed
      simp only [internalLocalControlExtraWrites, branch]
      rw [← changed]
      exact selectedBranchOwners_mem_selectedBranchWriteAtoms record.owner record.selectionKey

theorem localControl_selectedJoin_bucket_read (state : RuntimeState)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId)
    (chosen record : SelectedBranchSet) (place : ControlPlaceId)
    (removed : selected.selectedBranch = .remove chosen)
    (present : record ∈ state.selectedBranchSets) (key : record.selectionKey = chosen.selectionKey)
    (member : place ∈ record.expectedInputs) :
    .controlToken record.owner place ∈ (internalLocalControlStateFootprint state selected instanceId).reads := by
  simp only [internalLocalControlStateFootprint, canonicalStateAtomSet, mem_sortBy,
    List.mem_eraseDups, List.mem_append]
  apply Or.inl
  apply Or.inr
  simp only [internalLocalControlExtraReads, removed, List.mem_append]
  exact Or.inr (controlToken_mem_selectedJoinReadAtoms state chosen.selectionKey record place present key member)

theorem localControl_independent_census_untouched (state : RuntimeState)
    (left right : InternalLocalControlSelection) (leftInstance rightInstance : SemanticId)
    (separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state left leftInstance)
      (internalLocalControlStateFootprint state right rightInstance) = true)
    (place : ControlPlaceId) (read : place ∈ left.censusReads) :
    place ∉ right.tokens.consumed ++ right.tokens.produced := by
  intro written
  have parts := localControlStateFootprintsNonInterfering_parts _ _ separated
  exact not_mem_right_of_listsDisjoint _ _ parts.2.2.1 (.tokenOwners place)
    (localControl_tokenOwners_write state right rightInstance place written)
    (localControl_tokenOwners_read state left leftInstance place read)

theorem localControl_independent_read_bucket_untouched (state : RuntimeState)
    (left right : InternalLocalControlSelection) (leftInstance rightInstance : SemanticId)
    (separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state left leftInstance)
      (internalLocalControlStateFootprint state right rightInstance) = true)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (read : .controlToken owner place ∈ (internalLocalControlStateFootprint state left leftInstance).reads)
    (written : ControlPlaceId) (member : written ∈ right.tokens.consumed ++ right.tokens.produced) :
    ({ placeId := written, owner := right.owner } : ControlToken) ≠ { placeId := place, owner } := by
  intro same
  have placeEq : written = place := congrArg ControlToken.placeId same
  have ownerEq : right.owner = owner := congrArg ControlToken.owner same
  have parts := localControlStateFootprintsNonInterfering_parts _ _ separated
  have write := localControl_token_write state right rightInstance written member
  rw [placeEq, ownerEq] at write
  exact not_mem_right_of_listsDisjoint _ _ parts.2.2.1 _ write read

theorem localControl_independent_selected_keys (state : RuntimeState)
    (left right : InternalLocalControlSelection) (leftInstance rightInstance : SemanticId)
    (separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state left leftInstance)
      (internalLocalControlStateFootprint state right rightInstance) = true) :
    left.selectedBranch.Separated right.selectedBranch := by
  intro key leftKey rightKey
  have parts := localControlStateFootprintsNonInterfering_parts _ _ separated
  exact not_mem_right_of_listsDisjoint _ _ parts.2.1 (.selectedBranchOwners key)
    (localControl_selectedKey_write state left leftInstance key leftKey)
    (localControl_selectedKey_write state right rightInstance key rightKey)

theorem localControl_independent_bucket_frame (state : RuntimeState)
    (left right : InternalLocalControlSelection) (leftInstance rightInstance : SemanticId)
    (separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state left leftInstance)
      (internalLocalControlStateFootprint state right rightInstance) = true)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (read : .controlToken owner place ∈ (internalLocalControlStateFootprint state left leftInstance).reads) :
    (right.apply state).tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) =
      state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) := by
  apply right.tokens.filter_untouched
  all_goals
    intro written member
    apply Bool.eq_false_iff.mpr
    intro matched
    simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
    have same : ({ placeId := written, owner := right.owner } : ControlToken) =
        { placeId := place, owner } := by simp only [InternalLocalControlSelection.owner, matched.1, matched.2]
  · exact localControl_independent_read_bucket_untouched state left right leftInstance rightInstance
      separated owner place read written (List.mem_append_left _ member) same
  · exact localControl_independent_read_bucket_untouched state left right leftInstance rightInstance
      separated owner place read written (List.mem_append_right _ member) same

theorem localControl_selectedJoin_patch (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalLocalControlSelection)
    (found : selectInternalLocalControl? state operation = some selected)
    (chosen : SelectedBranchSet) (branch : selected.branchResult = some (.selectedJoin chosen)) :
    selected.selectedBranch = .remove chosen := by
  cases operation with
  | duplicate id origin input outputs =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      contradiction
  | synchronize id origin inputs output =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      contradiction
  | choose id origin input candidates defaultOutput defaultOrigin =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨selection, _, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      simp at branch
  | selectMany id origin input candidates defaultBranch key =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · contradiction
      · obtain ⟨selection, _, found⟩ := Option.bind_eq_some_iff.mp found
        split at found
        · contradiction
        · cases found
          simp at branch
  | synchronizeSelected id origin inputs output key =>
      simp only [selectInternalLocalControl?] at found
      split at found
      · cases found
        cases branch
        rfl
      · contradiction
  | _ => simp [selectInternalLocalControl?] at found

/-- Every complete predecessor read is framed by the opposite patch's declared footprint,
including the selected join's other-owner readiness buckets and whole-key record population. -/
theorem prepareInternalLocalControl_after_independent (program : Program) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalLocalControl)
    (leftFound : prepareInternalLocalControl? program state leftOperation = some left)
    (rightFound : prepareInternalLocalControl? program state rightOperation = some right)
    (separated : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    prepareInternalLocalControl? program (right.selection.apply state) leftOperation = some left := by
  obtain ⟨leftSelected, leftOrigin, leftInstance, leftIdentity, leftDelta, leftSelection,
    _, _, _, _, _, _, _, _, _, rfl⟩ := prepareInternalLocalControl_facts program state leftOperation left leftFound
  obtain ⟨rightSelected, rightOrigin, rightInstance, rightIdentity, rightDelta, rightSelection,
    _, _, _, _, _, _, _, _, _, rfl⟩ := prepareInternalLocalControl_facts program state rightOperation right rightFound
  apply prepareInternalLocalControl_read_frame program state (rightSelected.apply state) leftOperation _ leftFound
  · rfl
  · rfl
  · rfl
  · intro place member
    have untouched := localControl_independent_census_untouched state leftSelected rightSelected
      leftInstance rightInstance separated place member
    exact rightSelected.tokens.owner_census_frame state place
      (fun present => untouched (List.mem_append_left _ present))
      (fun present => untouched (List.mem_append_right _ present))
  · intro place member
    exact localControl_independent_bucket_frame state leftSelected rightSelected leftInstance rightInstance
      separated leftSelected.owner place (localControl_token_read state leftSelected leftInstance place member)
  · intro _ _
    rfl
  · intro key selectedKey
    exact rightSelected.selectedBranch.population_frame state.selectedBranchSets key
      (localControl_independent_selected_keys state leftSelected rightSelected leftInstance rightInstance
        separated key selectedKey)
  · intro chosen selectedBranch record present key place member
    exact localControl_independent_bucket_frame state leftSelected rightSelected leftInstance rightInstance
      separated record.owner place (localControl_selectedJoin_bucket_read state leftSelected leftInstance
        chosen record place (localControl_selectedJoin_patch state leftOperation leftSelected leftSelection
          chosen selectedBranch) present key member)

theorem localControl_independent_patches_commute (state : RuntimeState)
    (left right : InternalLocalControlSelection) (leftInstance rightInstance : SemanticId)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state left leftInstance)
      (internalLocalControlStateFootprint state right rightInstance) = true) :
    right.apply (left.apply state) = left.apply (right.apply state) := by
  have tokenOrder := canonicalCollectionOrder_tokens state canonical
  have recordOrder : orderedBy selectionBefore state.selectedBranchSets = true := by
    simp only [canonicalCollectionOrder, Bool.and_eq_true] at canonical
    simp_all
  have reverse := localControlStateFootprintsNonInterfering_symm _ _ separated
  have tokens := left.tokens.commutes state.tokens right.tokens tokenOrder
    (by
      intro produced inProduced consumed inConsumed
      exact localControl_independent_read_bucket_untouched state right left rightInstance leftInstance
        reverse right.owner consumed (localControl_token_read state right rightInstance consumed
          (List.mem_append_left _ inConsumed)) produced (List.mem_append_right _ inProduced))
    (by
      intro produced inProduced consumed inConsumed
      exact localControl_independent_read_bucket_untouched state left right leftInstance rightInstance
        separated left.owner consumed (localControl_token_read state left leftInstance consumed
          (List.mem_append_left _ inConsumed)) produced (List.mem_append_right _ inProduced))
  have records := left.selectedBranch.commute state.selectedBranchSets right.selectedBranch recordOrder
    (localControl_independent_selected_keys state left right leftInstance rightInstance separated)
  simp only [InternalLocalControlSelection.apply, tokens, records]

/-- Footprint independence derives opposite complete preparations and exact canonical state
commutation; neither intermediate preparation nor final-state equality is an assumption. -/
theorem prepared_local_control_pair_commutes (program : Program) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalLocalControl)
    (leftFound : prepareInternalLocalControl? program state leftOperation = some left)
    (rightFound : prepareInternalLocalControl? program state rightOperation = some right)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    prepareInternalLocalControl? program (right.selection.apply state) leftOperation = some left ∧
      prepareInternalLocalControl? program (left.selection.apply state) rightOperation = some right ∧
      right.selection.apply (left.selection.apply state) = left.selection.apply (right.selection.apply state) := by
  refine ⟨prepareInternalLocalControl_after_independent program state leftOperation rightOperation left right
    leftFound rightFound separated,
    prepareInternalLocalControl_after_independent program state rightOperation leftOperation right left
      rightFound leftFound (localControlStateFootprintsNonInterfering_symm _ _ separated), ?_⟩
  obtain ⟨leftSelected, _, leftInstance, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state leftOperation left leftFound
  obtain ⟨rightSelected, _, rightInstance, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state rightOperation right rightFound
  exact localControl_independent_patches_commute state leftSelected rightSelected leftInstance rightInstance canonical separated

end BpmnSemantics.SemanticProcess.InternalCommutation
