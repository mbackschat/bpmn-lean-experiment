import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingFrames

/-! Exact mixed scope/arming commutation uses the distinct consumed and created owners required
by the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- The complete input census rejects a collision even when the arming owner differs from
both scope token owners, as required by the retained predecessor selection. -/
theorem scope_creation_writing_arming_input_conflicts
    (selected : InternalScopeCreationSelection) (instanceId : SemanticId)
    (owner : RuntimeScopeOccurrence) (arm : PreparedInternalArming)
    (written : arm.scopeFramePatch.input ∈ [selected.input, selected.entry]) :
    localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint selected instanceId owner) arm.stateFootprint = false := by
  cases separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint selected instanceId owner) arm.stateFootprint with
  | false => rfl
  | true =>
      have untouched := scopeArming_untouched_input selected instanceId owner arm separated
      simp only [List.mem_cons, List.not_mem_nil, or_false] at written
      exact False.elim (written.elim (fun same => untouched.1 same.symm)
        (fun same => untouched.2 same.symm))

theorem scope_creation_arm_patches_commute (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (patch : InternalArmingPatch)
    (canonical : canonicalCollectionOrder state = true)
    (untouched : selected.entry ≠ patch.input) :
    applyInternalArmingPatch (selected.apply state) patch =
      selected.apply (applyInternalArmingPatch state patch) := by
  have tokens : removeToken
      (addToken (removeToken state.tokens selected.input selected.owner)
        selected.entry selected.created.id) patch.input patch.owner =
      addToken (removeToken (removeToken state.tokens patch.input patch.owner)
        selected.input selected.owner) selected.entry selected.created.id := by
    rw [addToken_removeToken_commute _ _ _ _ _
      (orderedBy_removeToken _ _ _ (canonicalCollectionOrder_tokens state canonical))
      (fun same => untouched (congrArg ControlToken.placeId same)), removeToken_commutes]
  cases kind : selected.kind <;> cases write : patch.write <;>
    simp only [InternalScopeCreationSelection.apply, kind, applyInternalArmingPatch, write,
      tokens, setCallActivationCount]

theorem scope_creation_data_arm_patches_commute (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (patch : InternalDataArmingPatch)
    (canonical : canonicalCollectionOrder state = true)
    (untouched : selected.entry ≠ patch.arm.input) :
    applyInternalDataArmingPatch (selected.apply state) patch =
      selected.apply (applyInternalDataArmingPatch state patch) := by
  have arm := scope_creation_arm_patches_commute state selected patch.arm canonical untouched
  unfold applyInternalDataArmingPatch
  rw [arm]
  cases kind : selected.kind <;> cases write : patch.arm.write <;>
    simp only [InternalScopeCreationSelection.apply, kind, applyInternalArmingPatch, write,
      setCallActivationCount]

/-- Complete predecessor preparations and computed separation derive both opposite preparations
and exact raw-state equality; no successor validity or publication equality is a premise. -/
theorem prepared_scope_creation_arming_pair (program : Program) (state : RuntimeState)
    (scopeOperation : SemanticOperation) (scope : PreparedInternalScopeCreation)
    (arm : PreparedInternalArming)
    (scopeFound : prepareInternalScopeCreation? program state scopeOperation = some scope)
    (armFound : arm.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering scope.footprint arm.stateFootprint = true) :
    arm.Prepared program (scope.selection.apply state) ∧
      prepareInternalScopeCreation? program (arm.apply state) scopeOperation = some scope ∧
      arm.apply (scope.selection.apply state) = scope.selection.apply (arm.apply state) := by
  have scopeAfter := prepareInternalScopeCreation_after_arming program state scopeOperation
    scope arm scopeFound separated
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state scopeOperation scope scopeFound
  have untouched := scopeArming_untouched_input selected instanceId ownerRecord arm separated
  refine ⟨?_, scopeAfter, ?_⟩
  · cases arm with
    | ordinary operation patch =>
        exact prepareInternalArm_after_scope_creation program state operation scopeOperation patch
          selected armFound selection untouched.1 untouched.2
    | data contract patch =>
        have input : contract.input = patch.arm.input := by
          obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
            prepareInternalDataArmingContract_facts program state contract patch armFound
          rfl
        apply prepareInternalDataArm_after_scope_creation program state contract patch
          scopeOperation selected armFound selection
        · simpa only [input, PreparedInternalArming.scopeFramePatch] using untouched.1
        · simpa only [input, PreparedInternalArming.scopeFramePatch] using untouched.2
  · cases arm with
    | ordinary operation patch =>
        exact scope_creation_arm_patches_commute state selected patch canonical untouched.2
    | data contract patch =>
        exact scope_creation_data_arm_patches_commute state selected patch canonical untouched.2

end BpmnSemantics.SemanticProcess.InternalCommutation
