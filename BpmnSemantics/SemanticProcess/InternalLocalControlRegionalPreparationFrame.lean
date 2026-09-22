import BpmnSemantics.SemanticProcess.InternalRegionalControlFields

/-! Complete local-control preparation survives an independent regional execution. The frame
includes competing selected-join populations, exact token buckets, and index-free publication. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedRegional_removed_censuses (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program before operation = some prepared) :
    (∀ token ∈ before.tokens, prepared.region.contains token.owner = true →
      .ordinary (.tokenOwners token.placeId) ∈ prepared.footprint.writes) ∧
    (∀ record ∈ before.selectedBranchSets, prepared.region.contains record.owner = true →
      .ordinary (.selectedBranchOwners record.selectionKey) ∈ prepared.footprint.writes) := by
  obtain ⟨snapshots, _, _, closed, derived, footprint, _⟩ :=
    prepareInternalRegional_facts program before operation prepared found
  have selected := (ownershipClosedSelection_facts program before operation prepared.selection closed).1
  have operationEq := regionalSelection_operation program before operation prepared.selection selected
  have census := regionalStateFootprint_census_writes before prepared.selection prepared.region prepared.footprint footprint
  rw [operationEq] at census
  have ofCensus (outputs : List ControlPlaceId)
      (writes : ∀ atom ∈ regionalCensusWrites before prepared.region outputs, atom ∈ prepared.footprint.writes) :
      (∀ token ∈ before.tokens, prepared.region.contains token.owner = true →
        .ordinary (.tokenOwners token.placeId) ∈ prepared.footprint.writes) ∧
      (∀ record ∈ before.selectedBranchSets, prepared.region.contains record.owner = true →
        .ordinary (.selectedBranchOwners record.selectionKey) ∈ prepared.footprint.writes) := by
    exact ⟨fun token member inside => writes _ (regionalCensusWrites_contains_removed_token before prepared.region outputs token member inside),
      fun record member inside => writes _ (regionalCensusWrites_contains_removed_selection before prepared.region outputs record member inside)⟩
  cases operation with
  | returnProcess id origin process definition output =>
      obtain ⟨record, kind, _, _⟩ := regionalSelection_return_record program before id origin process definition output prepared.selection selected
      rw [kind] at census
      exact ofCensus [output] census
  | throwError id origin input error handler =>
      obtain ⟨after, fired, _⟩ := prepareInternalRegional_executes program before _ prepared found
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨parent, kind, _, _⟩ := regionalSelection_error_execution program before after id origin input error handler prepared.selection selected raw
      rw [kind] at census
      exact ofCensus [handler.output] census
  | terminateScope id origin input definition =>
      have kind := (regionalSelection_terminate_owner program before id origin input definition prepared.selection selected).2
      rw [kind] at census
      exact ofCensus [] census
  | completeScope id origin definition output =>
      obtain ⟨_, _, selectedScope⟩ := regionalSelection_complete_census program before id origin definition output prepared.selection selected
      obtain ⟨after, fired, _⟩ := prepareInternalRegional_executes program before _ prepared found
      have raw : completeBoundedScope? program before definition output = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨ordinary, completed, _⟩ := completeBoundedScope_position_fields program before after definition output raw
      have quiet := (completeScopeState_selected_update before ordinary definition output prepared.selection.root selectedScope completed).1
      have singleton := quiescent_prepared_region_singleton before prepared.selection.root.id prepared.region derived quiet
      simp only [scopeQuiescent, Bool.and_eq_true, and_assoc] at quiet
      have tokenFilter := quiescent_region_owned_filter before.tokens (·.owner) prepared.selection.root.id prepared.region singleton quiet.1
      have branchFilter := quiescent_region_owned_filter before.selectedBranchSets (·.owner) prepared.selection.root.id prepared.region singleton quiet.2.2.2.2.2.2.1
      constructor
      · intro token member inside
        have outside := List.filter_eq_self.mp tokenFilter token member
        simp [inside] at outside
      · intro record member inside
        have outside := List.filter_eq_self.mp branchFilter record member
        simp [inside] at outside
  | _ => simp [selectInternalRegional?] at selected

theorem localPatch_regional_bucket_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (patch : InternalLocalControlSelection) (hosting : SemanticId)
    (beforeWF : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint patch.owner (internalLocalControlStateFootprint before patch hosting)) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (read : .controlToken owner place ∈ (internalLocalControlStateFootprint before patch hosting).reads) :
    after.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) =
      before.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) := by
  obtain ⟨_, _, _, _, _, footprint, _⟩ := prepareInternalRegional_facts program before operation regional found
  have outside := localControl_regional_bucket_outside before regional.selection regional.region regional.footprint
    patch hosting footprint independent owner place read
  have absent := localControl_regional_bucket_not_written before regional.footprint patch hosting independent owner place read
  have noControl := localControl_regional_control_not_written before regional.footprint patch hosting independent
  have observations := preparedRegional_control_filters program before after hosting operation regional
    beforeWF running found applied (fun _ => false)
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
  exact observations.2.2.2.2.1

/-- The actual regional successor retains the full prepared local-control artifact. Every read
frame follows from predecessor validity and footprint independence, including other-owner joins. -/
theorem prepareInternalLocalControl_after_independent_regional (program : Program) (before after : RuntimeState)
    (regionalOperation localOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (control : PreparedInternalLocalControl)
    (beforeWF : runtimeStateWellFormed program control.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (localFound : prepareInternalLocalControl? program before localOperation = some control)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint control.selection.owner control.footprint) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after) :
    prepareInternalLocalControl? program after localOperation = some control := by
  obtain ⟨patch, origin, hosting, identity, delta, selection, _, running, _,
    _, _, _, _, _, _, rfl⟩ := prepareInternalLocalControl_facts program before localOperation control localFound
  obtain ⟨_, _, _, _, _, footprint, _⟩ := prepareInternalRegional_facts program before regionalOperation regional regionalFound
  have scopeOutside := localControl_regional_scope_outside before regional.selection regional.region regional.footprint patch hosting footprint independent
  have noControl := localControl_regional_control_not_written before regional.footprint patch hosting independent
  obtain ⟨tokenWrites, branchWrites⟩ := preparedRegional_removed_censuses program before regionalOperation regional regionalFound
  have frame := preparedRegional_control_filters program before after hosting regionalOperation regional
    beforeWF running regionalFound applied
  have untouched := frame (fun _ => false) (fun _ => false) (fun _ => false)
    (by simp) (by simp) (by simp) (by simp) noControl
  have scopeFrame := frame (fun scope => decide (scope.id = patch.owner)) (fun _ => false) (fun _ => false)
    (by intro scope _ seen; simpa only [of_decide_eq_true seen] using scopeOutside)
    (by simp) (by simp) (by simp) noControl
  have bucketFrame := localPatch_regional_bucket_frame program before after regionalOperation regional patch hosting
    beforeWF running regionalFound independent applied
  apply prepareInternalLocalControl_read_frame program before after localOperation
    (makeInternalLocalControlPreparation before patch hosting identity delta) localFound
    untouched.1 untouched.2.1 scopeFrame.2.2.2.1
  · intro place member
    have absent := localControl_regional_census_not_written before regional.footprint patch hosting independent place member
    have observations := frame (fun _ => false) (fun token => decide (token.placeId = place)) (fun _ => false)
      (by simp)
      (by
        intro token present seen
        apply Bool.eq_false_iff.mpr
        intro inside
        exact absent (by simpa only [of_decide_eq_true seen] using tokenWrites token present inside))
      (by simp)
      (by
        intro owner output _ written
        apply Bool.eq_false_iff.mpr
        intro seen
        have same : output = place := of_decide_eq_true seen
        exact absent (by simpa only [same] using written)) noControl
    unfold tokenOwners
    rw [observations.2.2.2.2.1]
  · intro place member
    exact bucketFrame patch.owner place (localControl_token_read before patch hosting place member)
  · intro name _
    rw [untouched.2.2.1]
  · intro key changed
    have absent := localControl_regional_selectedKey_not_written before regional.footprint patch hosting independent key changed
    have observations := frame (fun _ => false) (fun _ => false) (fun record => decide (record.selectionKey = key))
      (by simp) (by simp)
      (by
        intro record member seen
        apply Bool.eq_false_iff.mpr
        intro inside
        exact absent (by simpa only [of_decide_eq_true seen] using branchWrites record member inside))
      (by simp) noControl
    exact observations.2.2.2.2.2
  · intro chosen branch record member key input expected
    exact bucketFrame record.owner input (localControl_selectedJoin_bucket_read before patch hosting chosen record input
      (localControl_selectedJoin_patch before localOperation patch selection chosen branch) member key expected)

end BpmnSemantics.SemanticProcess.InternalCommutation
