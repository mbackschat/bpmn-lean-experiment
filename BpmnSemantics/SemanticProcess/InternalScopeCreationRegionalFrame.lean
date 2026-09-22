import BpmnSemantics.SemanticProcess.InternalScopeCreationFootprintFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionalPreparationFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairRegionFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairExecutionFrame

/-! Regional removal preserves complete independent scope-creation preparations. Protected
owner and token reads retain exact populations, while definition and Call freshness survive
the actual removal filters required by the Internal Commutation account. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedRegional_scope_creation_counters (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting) (afterRunning : after.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after) :
    after.scopeActivations = before.scopeActivations ∧ after.callActivations = before.callActivations := by
  have update := preparedRegional_execution_fields program before after hosting operation prepared
    valid running afterRunning found applied
  cases operation with
  | returnProcess id origin process definition output =>
      cases kind : prepared.selection.kind <;> simp only [kind] at update <;> try contradiction
      rw [update]
      exact ⟨rfl, rfl⟩
  | completeScope id origin definition output =>
      cases kind : prepared.selection.kind <;> simp only [kind] at update <;> try contradiction
      rename_i withdrawal
      cases parent : prepared.selection.root.parent <;> cases output <;>
        simp only [parent] at update <;> try contradiction
      cases withdrawal <;> simp only at update <;> rw [update] <;> exact ⟨rfl, rfl⟩
  | throwError id origin input error handler =>
      cases kind : prepared.selection.kind <;> simp only [kind] at update <;> try contradiction
      rw [update]
      exact ⟨rfl, rfl⟩
  | terminateScope id origin input definition =>
      cases kind : prepared.selection.kind <;> simp only [kind] at update <;> try contradiction
      rw [update]
      exact ⟨rfl, rfl⟩
  | _ => simp at update

private theorem filtered_empty_of_subset (before after : List α) (predicate : α → Bool)
    (included : after ⊆ before) (empty : (before.filter predicate).length = 0) :
    (after.filter predicate).length = 0 := by
  apply List.length_eq_zero_iff.mpr
  apply List.filter_eq_nil_iff.mpr
  intro value member matched
  have present := List.mem_filter.mpr ⟨included member, matched⟩
  rw [List.length_eq_zero_iff.mp empty] at present
  contradiction

/-- The selector and its read populations survive independent retirement. Both ordinary and
bounded child preparation consume these facts without inventing a Program declaration. -/
theorem scopeCreation_after_regional_reads
    (program : Program) (before after : RuntimeState)
    (regionalOperation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (selected : InternalScopeCreationSelection)
    (hosting : SemanticId) (ownerRecord : RuntimeScopeOccurrence)
    (beforeWF : runtimeStateWellFormed program hosting before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (selection : selectInternalScopeCreation? before creationOperation = some selected)
    (running : before.control = .running hosting)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint selected.owner (internalScopeCreationStateFootprint selected hosting ownerRecord)) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after) :
    selectInternalScopeCreation? after creationOperation = some selected ∧
      after.control = before.control ∧ after.logicalTimeMs = before.logicalTimeMs ∧
      after.scopeOccurrences.filter (fun scope => decide (scope.id = selected.owner)) =
        before.scopeOccurrences.filter (fun scope => decide (scope.id = selected.owner)) ∧
      after.tokens.filter (fun token => decide (token.placeId = selected.input && token.owner = selected.owner)) =
        before.tokens.filter (fun token => decide (token.placeId = selected.input && token.owner = selected.owner)) ∧
      after.tokens.filter (fun token => decide (token.placeId = selected.entry && token.owner = selected.created.id)) =
        before.tokens.filter (fun token => decide (token.placeId = selected.entry && token.owner = selected.created.id)) ∧
      internalScopeCreationCounterSafe after selected = internalScopeCreationCounterSafe before selected := by
  have footprint := (prepareInternalRegional_facts program before regionalOperation regional regionalFound).2.2.2.2.2.1
  have liftedRead (atom : InternalStateAtom)
      (read : atom ∈ (internalScopeCreationStateFootprint selected hosting ownerRecord).reads)
      (ordinary : liftRegionalStateAtom selected.owner atom = .ordinary atom) :
      .ordinary atom ∈ (liftRegionalStateFootprint selected.owner
        (internalScopeCreationStateFootprint selected hosting ownerRecord)).reads :=
    List.mem_map.mpr ⟨atom, read, ordinary⟩
  have ownerRead := liftedRead (.scopeOccurrence selected.owner)
    (by simp [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy]) rfl
  have controlRead := liftedRead (.runtimeControl hosting)
    (by simp [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy]) rfl
  have scopeOutside := regional_pair_read_owner_outside before regional.selection regional.region regional.footprint _
    footprint independent selected.owner ownerRead
  have noControl := regional_pair_read_key_not_written _ _ independent _ controlRead
  have frame := preparedRegional_control_filters program before after hosting regionalOperation regional
    beforeWF running regionalFound applied
  have untouched := frame (fun _ => false) (fun _ => false) (fun _ => false)
    (by simp) (by simp) (by simp) (by simp) noControl
  have scopeFrame := frame (fun scope => decide (scope.id = selected.owner)) (fun _ => false) (fun _ => false)
    (by intro scope _ seen; simpa only [of_decide_eq_true seen] using scopeOutside)
    (by simp) (by simp) (by simp) noControl
  have bucketFrame (owner : ScopeOccurrenceId) (place : ControlPlaceId)
      (read : .controlToken owner place ∈ (internalScopeCreationStateFootprint selected hosting ownerRecord).reads) :
      after.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) =
        before.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) := by
    have read := liftedRead _ read rfl
    have separated := regional_independent_read_write _ _ independent _ _
      (regionalStateFootprint_region_write before regional.selection regional.region regional.footprint footprint) read
    have outside : regional.region.contains owner = false := by
      simpa [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using separated
    have absent := regional_pair_read_key_not_written _ _ independent _ read
    have observed := frame (fun _ => false)
      (fun token => decide (token.placeId = place && token.owner = owner)) (fun _ => false)
      (by simp)
      (by intro token _ seen; simp only [decide_eq_true_eq, Bool.and_eq_true] at seen; simpa only [seen.2] using outside)
      (by simp)
      (by
        intro emittedOwner output written _
        apply Bool.eq_false_iff.mpr
        intro seen
        simp only [decide_eq_true_eq, Bool.and_eq_true] at seen
        exact absent (by simpa only [seen.1, seen.2] using written)) noControl
    exact observed.2.2.2.2.1
  have inputFrame := bucketFrame selected.owner selected.input
    (scopeCreation_token_read selected hosting ownerRecord { placeId := selected.input, owner := selected.owner } (by simp))
  have entryFrame := bucketFrame selected.created.id selected.entry
    (scopeCreation_token_read selected hosting ownerRecord { placeId := selected.entry, owner := selected.created.id } (by simp))
  have censusRead := liftedRead (.tokenOwners selected.input)
    (scopeCreation_census_read selected hosting ownerRecord) rfl
  have censusAbsent := regional_pair_read_key_not_written _ _ independent _ censusRead
  have removedCensus := (preparedRegional_removed_censuses program before regionalOperation regional regionalFound).1
  have censusFrame : tokenOwners after selected.input = tokenOwners before selected.input := by
    have observed := frame (fun _ => false) (fun token => decide (token.placeId = selected.input)) (fun _ => false)
      (by simp)
      (by
        intro token member seen
        apply Bool.eq_false_iff.mpr
        intro inside
        exact censusAbsent (by simpa only [of_decide_eq_true seen] using removedCensus token member inside))
      (by simp)
      (by
        intro owner output _ written
        apply Bool.eq_false_iff.mpr
        intro seen
        have same : output = selected.input := of_decide_eq_true seen
        exact censusAbsent (by simpa only [same] using written)) noControl
    unfold tokenOwners
    rw [observed.2.2.2.2.1]
  have afterRunning := untouched.1.trans running
  have counters := preparedRegional_scope_creation_counters program before after hosting regionalOperation regional
    beforeWF running afterRunning regionalFound applied
  obtain ⟨keepScope, keepCall, scopes, calls, _, _⟩ := preparedRegional_graph_filters program before after hosting
    regionalOperation regional beforeWF running regionalFound applied noControl
  have scopeSubset : after.scopeOccurrences ⊆ before.scopeOccurrences := by
    rw [scopes]; exact List.filter_sublist.subset
  have callSubset : after.calledProcessOccurrences ⊆ before.calledProcessOccurrences := by
    rw [calls]; exact List.filter_sublist.subset
  obtain ⟨actual, actualApplied, afterWF⟩ := preparedRegional_preserves_runtimeStateWellFormed program before hosting
    regionalOperation regional beforeWF regionalFound
  have same : actual = after := Option.some.inj (actualApplied.symm.trans applied)
  subst actual
  have afterPosition : runtimePositionValid program hosting after = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterWF
    exact afterWF.1
  have selectionAfter : selectInternalScopeCreation? after creationOperation = some selected := by
    apply selectInternalScopeCreation_read_frame before after creationOperation selected selection
      untouched.1 censusFrame inputFrame scopeFrame.2.2.2.1
    · intro child
      have empty := (scopeCreation_selection_child_facts before creationOperation selected hosting running selection child).2.2.2
      have afterEmpty : after.scopeOccurrences.any (fun occurrence =>
          occurrence.id.definitionScopeId == selected.created.id.definitionScopeId) = false :=
        List.any_eq_false.mpr (fun occurrence member => List.any_eq_false.mp empty occurrence (scopeSubset member))
      exact ⟨afterEmpty.trans empty.symm, by simp only [scopeActivationCount, counters.1]⟩
    · intro record called
      obtain ⟨_, _, _, _, _, callerEmpty, scopeEmpty, collisionEmpty⟩ :=
        scopeCreation_selection_call_facts before creationOperation selected record hosting running selection called
      exact ⟨runtimePositionValid_called_associations program hosting hosting after afterPosition afterRunning,
        by simp only [callActivationCount, counters.2],
        filtered_empty_of_subset _ _ _ callSubset callerEmpty,
        filtered_empty_of_subset _ _ _ scopeSubset scopeEmpty,
        filtered_empty_of_subset _ _ _ callSubset collisionEmpty⟩
  exact ⟨selectionAfter, untouched.1, untouched.2.1, scopeFrame.2.2.2.1, inputFrame, entryFrame,
    (scopeCreation_counter_read_frame before after selected
      (by intro _; rw [counters.1]) (by intro _ _; rw [counters.2]))⟩

/-- Complete preparation retains the literal artifact, including its publication payload. -/
theorem prepareInternalScopeCreation_after_independent_regional
    (program : Program) (before after : RuntimeState)
    (regionalOperation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (beforeWF : runtimeStateWellFormed program creation.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (creationFound : prepareInternalScopeCreation? program before creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after) :
    prepareInternalScopeCreation? program after creationOperation = some creation := by
  obtain ⟨selected, hosting, ownerRecord, _, _, _, _, selection, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program before creationOperation creation creationFound
  obtain ⟨selectionAfter, control, time, owner, input, entry, counters⟩ :=
    scopeCreation_after_regional_reads program before after regionalOperation creationOperation regional selected
      hosting ownerRecord beforeWF regionalFound selection running independent applied
  exact prepareInternalScopeCreation_read_frame program before after creationOperation _ creationFound selectionAfter
    control time owner input entry counters

end BpmnSemantics.SemanticProcess.InternalCommutation
