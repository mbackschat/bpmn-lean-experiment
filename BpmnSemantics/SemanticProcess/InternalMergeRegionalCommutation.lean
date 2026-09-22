import BpmnSemantics.SemanticProcess.InternalMergeCommutation
import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlCommutation

/-! Regional execution reuses the local patch account for exact Merge. Complete preparations,
valid intermediate state, and cancellation equality follow from predecessor facts under the
[complete-frontier account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalRegional_after_independent_merge (program : Program) (state : RuntimeState)
    (regionalOperation operation : SemanticOperation) (alternative : InternalAlternative)
    (regional : PreparedInternalRegional) (prepared : PreparedInternalMerge)
    (valid : runtimeStateWellFormed program prepared.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state regionalOperation = some regional)
    (found : prepareInternalMerge? program state operation alternative = some prepared)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint prepared.selection.owner prepared.footprint) = true) :
    prepareInternalRegional? program (prepared.selection.apply state) regionalOperation = some regional := by
  have view := prepareInternalMerge_patch_footprint program state operation alternative prepared found
  have separated : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint prepared.selection.localControlPatch.owner
        (internalLocalControlStateFootprint state prepared.selection.localControlPatch prepared.runtimeInstanceId)) = true := by
    rw [view]
    exact independent
  have afterWF := prepareInternalMerge_preserves_runtimeStateWellFormed program state operation alternative prepared
    prepared.runtimeInstanceId valid found
  have afterPosition : runtimePositionValid program prepared.runtimeInstanceId (prepared.selection.apply state) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterWF
    exact afterWF.1
  obtain ⟨_, selected, hosting, identity, delta, _, running, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMerge_facts program state operation alternative prepared found
  exact prepareInternalRegional_after_independent_localPatch program state regionalOperation regional
    selected.localControlPatch hosting running afterPosition (selected.open_occurrences_frame program state hosting running)
    regionalFound separated

theorem prepareInternalMerge_after_independent_regional (program : Program) (before after : RuntimeState)
    (regionalOperation operation : SemanticOperation) (alternative : InternalAlternative)
    (regional : PreparedInternalRegional) (prepared : PreparedInternalMerge)
    (valid : runtimeStateWellFormed program prepared.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (found : prepareInternalMerge? program before operation alternative = some prepared)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint prepared.selection.owner prepared.footprint) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after) :
    prepareInternalMerge? program after operation alternative = some prepared := by
  have view := prepareInternalMerge_patch_footprint program before operation alternative prepared found
  have separated : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint prepared.selection.localControlPatch.owner
        (internalLocalControlStateFootprint before prepared.selection.localControlPatch prepared.runtimeInstanceId)) = true := by
    rw [view]
    exact independent
  obtain ⟨_, selected, hosting, identity, delta, _, running, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMerge_facts program before operation alternative prepared found
  obtain ⟨_, _, _, _, _, footprint, _⟩ := prepareInternalRegional_facts program before regionalOperation regional regionalFound
  have outside := localControl_regional_scope_outside before regional.selection regional.region regional.footprint
    selected.localControlPatch hosting footprint separated
  change regional.region.contains selected.owner = false at outside
  have noControl := localControl_regional_control_not_written before regional.footprint selected.localControlPatch hosting separated
  have frame := preparedRegional_control_filters program before after hosting regionalOperation regional valid running
    regionalFound applied (fun scope => decide (scope.id = selected.owner)) (fun _ => false) (fun _ => false)
    (by intro scope _ seen; simpa only [of_decide_eq_true seen] using outside)
    (by simp) (by simp) (by simp) noControl
  apply prepareInternalMerge_read_frame program before after operation alternative _ found
    frame.1 frame.2.1 frame.2.2.2.1
  intro place member
  exact localPatch_regional_bucket_frame program before after regionalOperation regional selected.localControlPatch hosting
    valid running regionalFound separated applied selected.owner place
    (localControl_token_read before selected.localControlPatch hosting place member)

/-- Both complete artifacts and the actual regional result are derived without intermediate-state assumptions. -/
theorem prepared_regional_merge_pair_commutes (program : Program) (before : RuntimeState)
    (regionalOperation operation : SemanticOperation) (alternative : InternalAlternative)
    (regional : PreparedInternalRegional) (prepared : PreparedInternalMerge)
    (valid : runtimeStateWellFormed program prepared.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (found : prepareInternalMerge? program before operation alternative = some prepared)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint prepared.selection.owner prepared.footprint) = true) :
    prepareInternalRegional? program (prepared.selection.apply before) regionalOperation = some regional ∧
      ∃ afterRegional,
        applyPreparedInternalRegional? program before regional = some afterRegional ∧
        prepareInternalMerge? program afterRegional operation alternative = some prepared ∧
        applyPreparedInternalRegional? program (prepared.selection.apply before) regional =
          some (prepared.selection.apply afterRegional) := by
  have regionalFrame := prepareInternalRegional_after_independent_merge program before regionalOperation operation alternative
    regional prepared valid regionalFound found independent
  obtain ⟨after, _, applied⟩ := prepareInternalRegional_executes program before regionalOperation regional regionalFound
  obtain ⟨afterMerge, _, mergeApplied⟩ := prepareInternalRegional_executes program (prepared.selection.apply before)
    regionalOperation regional regionalFrame
  have mergeFrame := prepareInternalMerge_after_independent_regional program before after regionalOperation operation
    alternative regional prepared valid regionalFound found independent applied
  have afterWF := prepareInternalMerge_preserves_runtimeStateWellFormed program before operation alternative prepared
    prepared.runtimeInstanceId valid found
  have view := prepareInternalMerge_patch_footprint program before operation alternative prepared found
  have separated : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint prepared.selection.localControlPatch.owner
        (internalLocalControlStateFootprint before prepared.selection.localControlPatch prepared.runtimeInstanceId)) = true := by
    rw [view]
    exact independent
  obtain ⟨_, selected, hosting, identity, delta, _, running, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMerge_facts program before operation alternative prepared found
  have equality := regional_localPatch_successors_equal program before after afterMerge regionalOperation regional
    selected.localControlPatch hosting valid afterWF running regionalFound regionalFrame separated applied mergeApplied
  exact ⟨regionalFrame, after, applied, mergeFrame,
    by simpa only [equality, makeInternalMergePreparation, InternalMergeSelection.localControlPatch_apply] using mergeApplied⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
