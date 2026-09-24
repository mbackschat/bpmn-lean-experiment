import BpmnSemantics.SemanticProcess.InternalMessageTaskLocalControl
import BpmnSemantics.SemanticProcess.InternalEndCommutation

/-! The selected None End pair uses token removal while preserving the complete Message-host
preparation. The subscription admission certificate excludes Merge from this pair domain. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalMessageTaskContract_after_end
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (message : InternalMessageTaskPatch) (ending : InternalEndSelection)
    (found : prepareInternalMessageTaskContract? program state contract = some message)
    (different : contract.input ≠ ending.input) :
    prepareInternalMessageTaskContract? program (ending.apply state) contract = some message := by
  have owners := ending.tokens.owner_selection_frame state contract.input
    (by simpa [InternalEndSelection.tokens] using different) (by simp [InternalEndSelection.tokens])
  have ownerFrame : onlyTokenOwner? (ending.apply state) contract.input =
      onlyTokenOwner? state contract.input := owners
  unfold prepareInternalMessageTaskContract? at found ⊢
  rw [ownerFrame]
  exact found

theorem prepared_message_task_end_pair_commutes
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (ending : PreparedInternalEnd) (contract : InternalMessageTaskContract) (message : InternalMessageTaskPatch)
    (endFound : prepareInternalEnd? program state operation = some ending)
    (messageFound : prepareInternalMessageTaskContract? program state contract = some message)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message) ending.footprint = true) :
    prepareInternalEnd? program (applyInternalMessageTaskPatch state message) operation = some ending ∧
      prepareInternalMessageTaskContract? program (ending.selection.apply state) contract = some message ∧
      applyInternalMessageTaskPatch (ending.selection.apply state) message =
        ending.selection.apply (applyInternalMessageTaskPatch state message) := by
  obtain ⟨_, selected, _, instanceId, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program state operation ending endFound
  have different : message.arm.input ≠ selected.input := by
    have conflict := regional_independent_read_write _ _ independent
      (.ordinary (.tokenOwners message.arm.input)) (.ordinary (.tokenOwners selected.input))
      (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (by simp [makeInternalEndPreparation, internalEndStateFootprint, canonicalRegionalStateAtoms_mem])
    intro same
    simp [regionalStateAtomsConflict, same] at conflict
  obtain ⟨_, owner, hosting, origin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract message messageFound
  refine ⟨?_, prepareInternalMessageTaskContract_after_end program state contract _ selected messageFound different, ?_⟩
  · apply prepareInternalEnd_read_frame program state
      (applyInternalMessageTaskPatch state (makeInternalMessageTaskPatch program state contract owner hosting processId origin))
      operation _ endFound rfl rfl rfl
    exact filterTokens_removeToken_other state.tokens contract.input selected.input owner different
  · simp only [applyInternalMessageTaskPatch, makeInternalMessageTaskPatch, applyInternalArmingPatch,
      InternalEndSelection.apply, InternalEndSelection.tokens, TokenPatch.apply, removeTokens, addTokens]
    congr 1
    exact removeToken_commutes state.tokens selected.input contract.input selected.owner owner

end BpmnSemantics.SemanticProcess.InternalCommutation
