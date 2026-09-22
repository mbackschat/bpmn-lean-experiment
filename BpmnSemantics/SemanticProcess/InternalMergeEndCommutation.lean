import BpmnSemantics.SemanticProcess.InternalMergeCommutation
import BpmnSemantics.SemanticProcess.InternalEndLocalControlCommutation

/-! Exact Merge reuses End's local patch laws without inheriting the unique-owner selector.
The [complete-frontier account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome)
keeps the End input census separate from the chosen Merge bucket.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_merge_end_pair_commutes (program : Program) (state : RuntimeState)
    (operation endOperation : SemanticOperation) (alternative : InternalAlternative)
    (prepared : PreparedInternalMerge) (ending : PreparedInternalEnd)
    (found : prepareInternalMerge? program state operation alternative = some prepared)
    (endFound : prepareInternalEnd? program state endOperation = some ending)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent ending.footprint
      (liftRegionalStateFootprint prepared.selection.owner prepared.footprint) = true) :
    prepareInternalMerge? program (ending.selection.apply state) operation alternative = some prepared ∧
      prepareInternalEnd? program (prepared.selection.apply state) endOperation = some ending ∧
      prepared.selection.apply (ending.selection.apply state) = ending.selection.apply (prepared.selection.apply state) := by
  have view := prepareInternalMerge_patch_footprint program state operation alternative prepared found
  have separated : regionalStateFootprintsIndependent ending.footprint
      (liftRegionalStateFootprint prepared.selection.localControlPatch.owner
        (internalLocalControlStateFootprint state prepared.selection.localControlPatch prepared.runtimeInstanceId)) = true := by
    rw [view]
    exact independent
  have endAfter := prepareInternalEnd_after_local_patch program state endOperation ending
    prepared.selection.localControlPatch prepared.runtimeInstanceId endFound separated
  obtain ⟨_, selected, _, instanceId, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program state endOperation ending endFound
  refine ⟨?_, endAfter, ?_⟩
  · apply prepareInternalMerge_read_frame program state (selected.apply state) operation alternative prepared found rfl rfl rfl
    intro place member
    exact end_local_bucket_frame state selected prepared.selection.localControlPatch instanceId
      prepared.runtimeInstanceId separated prepared.selection.owner place
      (localControl_token_read state prepared.selection.localControlPatch prepared.runtimeInstanceId place member)
  · exact end_local_patches_commute state selected prepared.selection.localControlPatch instanceId
      prepared.runtimeInstanceId canonical separated

end BpmnSemantics.SemanticProcess.InternalCommutation
