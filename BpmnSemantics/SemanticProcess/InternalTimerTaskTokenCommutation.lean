import BpmnSemantics.SemanticProcess.InternalTimerTaskLocalControl
import BpmnSemantics.SemanticProcess.InternalMergeCommutation
import BpmnSemantics.SemanticProcess.InternalEndCommutation

/-! Exact Merge and ordinary End reuse token-removal frames beside Timer-task arming.
The Merge choice remains explicit; these laws do not choose between competing offers.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalMerge_after_timer_task
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (alternative : InternalAlternative) (merge : PreparedInternalMerge)
    (contract : InternalTimerTaskContract) (timer : InternalTimerTaskPatch)
    (mergeFound : prepareInternalMerge? program state operation alternative = some merge)
    (timerFound : prepareInternalTimerTaskContract? program state contract = some timer)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint merge.selection.owner merge.footprint) = true) :
    prepareInternalMerge? program (applyInternalTimerTaskPatch state timer) operation alternative = some merge := by
  have view := prepareInternalMerge_patch_footprint program state operation alternative merge mergeFound
  have separated : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint merge.selection.localControlPatch.owner
        (internalLocalControlStateFootprint state merge.selection.localControlPatch merge.runtimeInstanceId)) = true := by
    rw [view]
    exact independent
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract timer timerFound
  apply prepareInternalMerge_read_frame program state
    (applyInternalTimerTaskPatch state (makeInternalTimerTaskPatch program state contract owner instanceId processId origin))
    operation alternative merge mergeFound rfl rfl rfl
  intro place member
  exact timerTask_local_bucket_frame state _ merge.selection.localControlPatch merge.runtimeInstanceId
    separated merge.selection.owner place
    (localControl_token_read state merge.selection.localControlPatch merge.runtimeInstanceId place member)

theorem prepared_timer_task_merge_pair_commutes
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (alternative : InternalAlternative) (merge : PreparedInternalMerge)
    (contract : InternalTimerTaskContract) (timer : InternalTimerTaskPatch)
    (mergeFound : prepareInternalMerge? program state operation alternative = some merge)
    (timerFound : prepareInternalTimerTaskContract? program state contract = some timer)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint merge.selection.owner merge.footprint) = true) :
    prepareInternalTimerTaskContract? program (merge.selection.apply state) contract = some timer ∧
      prepareInternalMerge? program (applyInternalTimerTaskPatch state timer) operation alternative = some merge ∧
      applyInternalTimerTaskPatch (merge.selection.apply state) timer =
        merge.selection.apply (applyInternalTimerTaskPatch state timer) := by
  have view := prepareInternalMerge_patch_footprint program state operation alternative merge mergeFound
  have separated : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint merge.selection.localControlPatch.owner
        (internalLocalControlStateFootprint state merge.selection.localControlPatch merge.runtimeInstanceId)) = true := by
    rw [view]
    exact independent
  have untouched := timerTask_local_input_untouched state timer merge.selection.localControlPatch
    merge.runtimeInstanceId separated
  have inputEq : timer.arm.input = contract.input := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalTimerTaskContract_facts program state contract timer timerFound
    rfl
  refine ⟨?_, prepareInternalMerge_after_timer_task program state operation alternative merge contract timer
    mergeFound timerFound independent, ?_⟩
  · exact prepareInternalTimerTaskContract_after_local_control program state contract timer
      merge.selection.localControlPatch timerFound (by simpa [inputEq] using untouched)
  · exact local_control_timer_task_patches_commute state merge.selection.localControlPatch timer canonical
      (fun member => untouched (List.mem_append_right _ member))

theorem prepareInternalTimerTaskContract_after_end
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (timer : InternalTimerTaskPatch) (ending : InternalEndSelection)
    (found : prepareInternalTimerTaskContract? program state contract = some timer)
    (different : contract.input ≠ ending.input) :
    prepareInternalTimerTaskContract? program (ending.apply state) contract = some timer := by
  have owners := ending.tokens.owner_selection_frame state contract.input
    (by simpa [InternalEndSelection.tokens] using different) (by simp [InternalEndSelection.tokens])
  have ownerFrame : onlyTokenOwner? (ending.apply state) contract.input =
      onlyTokenOwner? state contract.input := owners
  unfold prepareInternalTimerTaskContract? at found ⊢
  rw [ownerFrame]
  exact found

theorem prepared_timer_task_end_pair_commutes
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (ending : PreparedInternalEnd) (contract : InternalTimerTaskContract) (timer : InternalTimerTaskPatch)
    (endFound : prepareInternalEnd? program state operation = some ending)
    (timerFound : prepareInternalTimerTaskContract? program state contract = some timer)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer) ending.footprint = true) :
    prepareInternalEnd? program (applyInternalTimerTaskPatch state timer) operation = some ending ∧
      prepareInternalTimerTaskContract? program (ending.selection.apply state) contract = some timer ∧
      applyInternalTimerTaskPatch (ending.selection.apply state) timer =
        ending.selection.apply (applyInternalTimerTaskPatch state timer) := by
  obtain ⟨_, selected, _, instanceId, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program state operation ending endFound
  have different : timer.arm.input ≠ selected.input := by
    have conflict := regional_independent_read_write _ _ independent
      (.ordinary (.tokenOwners timer.arm.input)) (.ordinary (.tokenOwners selected.input))
      (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (by simp [makeInternalEndPreparation, internalEndStateFootprint, canonicalRegionalStateAtoms_mem])
    intro same
    simp [regionalStateAtomsConflict, same] at conflict
  obtain ⟨_, owner, hosting, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract timer timerFound
  refine ⟨?_, prepareInternalTimerTaskContract_after_end program state contract _ selected timerFound different, ?_⟩
  · apply prepareInternalEnd_read_frame program state
      (applyInternalTimerTaskPatch state (makeInternalTimerTaskPatch program state contract owner hosting processId origin))
      operation _ endFound rfl rfl rfl
    exact filterTokens_removeToken_other state.tokens contract.input selected.input owner different
  · simp only [applyInternalTimerTaskPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch,
      InternalEndSelection.apply, InternalEndSelection.tokens, TokenPatch.apply, removeTokens, addTokens]
    congr 1
    exact removeToken_commutes state.tokens selected.input contract.input selected.owner owner

end BpmnSemantics.SemanticProcess.InternalCommutation
