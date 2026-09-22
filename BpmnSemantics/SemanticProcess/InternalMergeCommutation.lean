import BpmnSemantics.SemanticProcess.InternalMergePreparation
import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation

/-! Exact Merge uses the existing local token-patch algebra without inheriting its unique-owner
selector. The [complete-frontier account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome)
keeps preparation tied to the chosen owned input.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- This is a patch view for existing frame laws, not a local-control selection or preparation claim. -/
def InternalMergeSelection.localControlPatch (selected : InternalMergeSelection) : InternalLocalControlSelection :=
  { operation := selected.operation, tokens := selected.tokens }

@[simp] theorem InternalMergeSelection.localControlPatch_apply (selected : InternalMergeSelection) (state : RuntimeState) :
    selected.localControlPatch.apply state = selected.apply state := rfl

theorem InternalMergeSelection.localControlPatch_footprint (selected : InternalMergeSelection)
    (state : RuntimeState) (instanceId : SemanticId) (merge : selected.operation.kind = .mergeExclusive) :
    internalLocalControlStateFootprint state selected.localControlPatch instanceId =
      internalMergeStateFootprint selected instanceId := by
  cases operation : selected.operation <;>
    simp_all [SemanticOperation.kind, InternalMergeSelection.localControlPatch, InternalMergeSelection.tokens,
      internalLocalControlStateFootprint, internalMergeStateFootprint, InternalLocalControlSelection.censusReads,
      InternalLocalControlSelection.owner, internalLocalControlExtraReads, internalLocalControlExtraWrites,
      InternalLocalControlSelection.variableReads]

private theorem merge_kind (state : RuntimeState) (operation : SemanticOperation)
    (alternative : InternalAlternative) (selected : InternalMergeSelection)
    (found : selectInternalMerge? state operation alternative = some selected) :
    selected.operation.kind = .mergeExclusive := by
  obtain ⟨operationEq, _, _, _, _, shape, _, _⟩ := selectInternalMerge_facts state operation alternative selected found
  rw [operationEq, shape]
  rfl

theorem prepareInternalMerge_patch_footprint (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (alternative : InternalAlternative) (prepared : PreparedInternalMerge)
    (found : prepareInternalMerge? program state operation alternative = some prepared) :
    internalLocalControlStateFootprint state prepared.selection.localControlPatch prepared.runtimeInstanceId =
      prepared.footprint := by
  obtain ⟨_, selected, instanceId, identity, delta, selection, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMerge_facts program state operation alternative prepared found
  exact selected.localControlPatch_footprint state instanceId (merge_kind state operation alternative selected selection)

/-- Other local token patches preserve every exact Merge read, including multiplicity, without reading other offers. -/
theorem prepareInternalMerge_after_local_patch (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (alternative : InternalAlternative) (prepared : PreparedInternalMerge)
    (patch : InternalLocalControlSelection) (patchInstance : SemanticId)
    (found : prepareInternalMerge? program state operation alternative = some prepared)
    (independent : localControlStateFootprintsNonInterfering prepared.footprint
      (internalLocalControlStateFootprint state patch patchInstance) = true) :
    prepareInternalMerge? program (patch.apply state) operation alternative = some prepared := by
  obtain ⟨_, selected, instanceId, identity, delta, selection, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMerge_facts program state operation alternative prepared found
  have view := selected.localControlPatch_footprint state instanceId (merge_kind state operation alternative selected selection)
  have separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state selected.localControlPatch instanceId)
      (internalLocalControlStateFootprint state patch patchInstance) = true := by
    simpa only [view, makeInternalMergePreparation] using independent
  apply prepareInternalMerge_read_frame program state (patch.apply state) operation alternative _ found rfl rfl rfl
  intro place member
  exact localControl_independent_bucket_frame state selected.localControlPatch patch instanceId patchInstance
    separated selected.owner place (localControl_token_read state selected.localControlPatch instanceId place member)

/-- Both preparation directions and exact canonical equality follow from predecessor footprints. -/
theorem prepared_merge_local_control_pair_commutes (program : Program) (state : RuntimeState)
    (operation controlOperation : SemanticOperation) (alternative : InternalAlternative)
    (prepared : PreparedInternalMerge) (control : PreparedInternalLocalControl)
    (found : prepareInternalMerge? program state operation alternative = some prepared)
    (controlFound : prepareInternalLocalControl? program state controlOperation = some control)
    (canonical : canonicalCollectionOrder state = true)
    (independent : localControlStateFootprintsNonInterfering prepared.footprint control.footprint = true) :
    prepareInternalMerge? program (control.selection.apply state) operation alternative = some prepared ∧
      prepareInternalLocalControl? program (prepared.selection.apply state) controlOperation = some control ∧
      control.selection.apply (prepared.selection.apply state) = prepared.selection.apply (control.selection.apply state) := by
  obtain ⟨controlSelected, controlOrigin, controlInstance, controlIdentity, controlDelta,
    _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state controlOperation control controlFound
  have frame := prepareInternalMerge_after_local_patch program state operation alternative prepared controlSelected
    controlInstance found independent
  refine ⟨frame, ?_, ?_⟩
  all_goals
    obtain ⟨_, selected, instanceId, identity, delta, selection, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalMerge_facts program state operation alternative prepared found
    have view := selected.localControlPatch_footprint state instanceId (merge_kind state operation alternative selected selection)
    have separated : localControlStateFootprintsNonInterfering
        (internalLocalControlStateFootprint state selected.localControlPatch instanceId)
        (internalLocalControlStateFootprint state controlSelected controlInstance) = true := by
      simpa only [view, makeInternalMergePreparation, makeInternalLocalControlPreparation] using independent
  · simpa only [InternalMergeSelection.localControlPatch_apply, makeInternalMergePreparation] using
      prepareInternalLocalControl_after_independent_patch program state controlOperation _ selected.localControlPatch
        instanceId controlFound (localControlStateFootprintsNonInterfering_symm _ _ separated)
  · simpa only [InternalMergeSelection.localControlPatch_apply, makeInternalMergePreparation,
      makeInternalLocalControlPreparation] using
      localControl_independent_patches_commute state selected.localControlPatch controlSelected instanceId
        controlInstance canonical separated

/-- Different independent Merge operations commute without selecting an order between one operation's alternatives. -/
theorem prepared_merge_pair_commutes (program : Program) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (leftAlternative rightAlternative : InternalAlternative)
    (left right : PreparedInternalMerge)
    (leftFound : prepareInternalMerge? program state leftOperation leftAlternative = some left)
    (rightFound : prepareInternalMerge? program state rightOperation rightAlternative = some right)
    (canonical : canonicalCollectionOrder state = true)
    (independent : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    prepareInternalMerge? program (right.selection.apply state) leftOperation leftAlternative = some left ∧
      prepareInternalMerge? program (left.selection.apply state) rightOperation rightAlternative = some right ∧
      right.selection.apply (left.selection.apply state) = left.selection.apply (right.selection.apply state) := by
  have leftView := prepareInternalMerge_patch_footprint program state leftOperation leftAlternative left leftFound
  have rightView := prepareInternalMerge_patch_footprint program state rightOperation rightAlternative right rightFound
  refine ⟨?_, ?_, ?_⟩
  · simpa only [InternalMergeSelection.localControlPatch_apply] using
      prepareInternalMerge_after_local_patch program state leftOperation leftAlternative left
        right.selection.localControlPatch right.runtimeInstanceId leftFound (by simpa only [rightView] using independent)
  · simpa only [InternalMergeSelection.localControlPatch_apply] using
      prepareInternalMerge_after_local_patch program state rightOperation rightAlternative right
        left.selection.localControlPatch left.runtimeInstanceId rightFound
          (by simpa only [leftView] using localControlStateFootprintsNonInterfering_symm _ _ independent)
  · simpa only [InternalMergeSelection.localControlPatch_apply] using
      localControl_independent_patches_commute state left.selection.localControlPatch right.selection.localControlPatch
        left.runtimeInstanceId right.runtimeInstanceId canonical (by simpa only [leftView, rightView] using independent)

end BpmnSemantics.SemanticProcess.InternalCommutation
