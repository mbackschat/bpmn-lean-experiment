import BpmnSemantics.SemanticProcess.InternalEndCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingFrames

/-! End and ordinary or data arming exchange owned token removals. Protected input censuses
preserve both complete preparations while wait identities and publication remain unchanged. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalArm_after_end (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch) (ending : InternalEndSelection)
    (found : prepareInternalArm? program state operation = some patch)
    (different : patch.input ≠ ending.input) :
    prepareInternalArm? program (ending.apply state) operation = some patch := by
  have inputFound := prepareInternalArm_input program state operation patch found
  have owners := ending.tokens.owner_selection_frame state patch.input
    (by simpa [InternalEndSelection.tokens] using different) (by simp [InternalEndSelection.tokens])
  unfold prepareInternalArm? at found ⊢
  simp only [inputFound, bind, Option.bind] at found ⊢
  change onlyTokenOwner? (ending.apply state) patch.input = onlyTokenOwner? state patch.input at owners
  rw [owners]
  exact found

theorem prepareInternalDataArm_after_end (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch) (ending : InternalEndSelection)
    (found : prepareInternalDataArmingContract? program state contract = some patch)
    (different : contract.input ≠ ending.input) :
    prepareInternalDataArmingContract? program (ending.apply state) contract = some patch := by
  have owners := ending.tokens.owner_selection_frame state contract.input
    (by simpa [InternalEndSelection.tokens] using different) (by simp [InternalEndSelection.tokens])
  unfold prepareInternalDataArmingContract? at found ⊢
  change onlyTokenOwner? (ending.apply state) contract.input = onlyTokenOwner? state contract.input at owners
  rw [owners]
  exact found

theorem InternalEndSelection.arming_commutes (state : RuntimeState) (ending : InternalEndSelection)
    (arm : PreparedInternalArming) : arm.apply (ending.apply state) = ending.apply (arm.apply state) := by
  have tokens (patch : InternalArmingPatch) :=
    removeToken_commutes state.tokens ending.input patch.input ending.owner patch.owner
  cases arm with
  | ordinary operation patch =>
      cases write : patch.write <;>
        simp [PreparedInternalArming.apply, applyInternalArmingPatch, write,
          InternalEndSelection.apply, InternalEndSelection.tokens, TokenPatch.apply,
          removeTokens, addTokens, tokens]
  | data contract patch =>
      cases write : patch.arm.write <;>
        simp [PreparedInternalArming.apply, applyInternalDataArmingPatch, applyInternalArmingPatch, write,
          InternalEndSelection.apply, InternalEndSelection.tokens, TokenPatch.apply,
          removeTokens, addTokens, tokens]

theorem prepared_end_arming_pair_commutes (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (ending : PreparedInternalEnd) (arm : PreparedInternalArming)
    (found : prepareInternalEnd? program state operation = some ending)
    (armFound : arm.Prepared program state)
    (independent : regionalStateFootprintsIndependent ending.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    prepareInternalEnd? program (arm.apply state) operation = some ending ∧
      arm.Prepared program (ending.selection.apply state) ∧
      arm.apply (ending.selection.apply state) = ending.selection.apply (arm.apply state) := by
  obtain ⟨_, selected, _, instanceId, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program state operation ending found
  have endRead : .ordinary (.tokenOwners selected.input) ∈
      (internalEndStateFootprint selected instanceId).reads := by
    simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem]
  have different : arm.scopeFramePatch.input ≠ selected.input := by
    have conflict := regional_independent_write_read _ _ independent _ _
      (List.mem_map.mpr ⟨_, scopeArming_input_write arm, rfl⟩) endRead
    intro same
    simp [liftRegionalStateAtom, regionalStateAtomsConflict, same] at conflict
  refine ⟨?_, ?_, selected.arming_commutes state arm⟩
  · have fields := scopeArming_scope_read_projections state arm
    apply prepareInternalEnd_read_frame program state (arm.apply state) operation _ found fields.1
      (by simp only [exactLiveOccurrence, fields.2.2.1]) fields.2.1
    change (arm.apply state).tokens.filter (fun token => decide (token.placeId = selected.input)) = _
    rw [fields.2.2.2.2.2.2]
    exact filterTokens_removeToken_other _ _ _ _ different
  · cases arm with
    | ordinary operation patch => exact prepareInternalArm_after_end program state operation patch selected armFound different
    | data contract patch =>
        have input : contract.input = patch.arm.input := by
          obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
            prepareInternalDataArmingContract_facts program state contract patch armFound
          rfl
        apply prepareInternalDataArm_after_end program state contract patch selected armFound
        rw [input]
        exact different

end BpmnSemantics.SemanticProcess.InternalCommutation
