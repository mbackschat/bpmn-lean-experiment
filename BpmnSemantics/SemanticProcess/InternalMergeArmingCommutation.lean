import BpmnSemantics.SemanticProcess.InternalMergeCommutation
import BpmnSemantics.SemanticProcess.InternalLocalControlArmingCommutation

/-! Exact Merge and arming share the existing token-patch frame laws. The Merge preparation
retains the chosen bucket under the [complete-frontier account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalMerge_after_arming (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (alternative : InternalAlternative)
    (prepared : PreparedInternalMerge) (arm : PreparedInternalArming)
    (found : prepareInternalMerge? program state operation alternative = some prepared)
    (independent : localControlStateFootprintsNonInterfering prepared.footprint arm.stateFootprint = true) :
    prepareInternalMerge? program (arm.apply state) operation alternative = some prepared := by
  have view := prepareInternalMerge_patch_footprint program state operation alternative prepared found
  have separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state prepared.selection.localControlPatch prepared.runtimeInstanceId)
      arm.stateFootprint = true := by simpa only [view] using independent
  have projections := arming_local_read_projections state arm
  apply prepareInternalMerge_read_frame program state (arm.apply state) operation alternative prepared found
    projections.1 projections.2.1
  · rw [projections.2.2.1]
  · intro place member
    exact arming_local_bucket_frame state prepared.selection.localControlPatch prepared.runtimeInstanceId arm
      separated prepared.selection.owner place
      (localControl_token_read state prepared.selection.localControlPatch prepared.runtimeInstanceId place member)

/-- Complete artifacts survive both orders; equality includes canonical collection order. -/
theorem prepared_merge_arming_pair_commutes (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (alternative : InternalAlternative)
    (prepared : PreparedInternalMerge) (arm : PreparedInternalArming)
    (found : prepareInternalMerge? program state operation alternative = some prepared)
    (armFound : arm.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (independent : localControlStateFootprintsNonInterfering prepared.footprint arm.stateFootprint = true) :
    arm.Prepared program (prepared.selection.apply state) ∧
      prepareInternalMerge? program (arm.apply state) operation alternative = some prepared ∧
      arm.apply (prepared.selection.apply state) = prepared.selection.apply (arm.apply state) := by
  have view := prepareInternalMerge_patch_footprint program state operation alternative prepared found
  have patch := prepared_arming_after_local_patch program state prepared.selection.localControlPatch
    prepared.runtimeInstanceId arm armFound canonical (by simpa only [view] using independent)
  exact ⟨patch.1, prepareInternalMerge_after_arming program state operation alternative prepared arm found independent,
    patch.2⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
