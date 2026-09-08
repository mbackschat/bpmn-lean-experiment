import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation
import BpmnSemantics.SemanticProcess.InternalPreparedArming

/-! Mixed local-control and arming read frames follow the complete predecessor account in the
[Internal Commutation proposal](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalArm_local_control_read_frame (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalLocalControlSelection)
    (owners : ∀ input, internalArmInput? operation = some input →
      onlyTokenOwner? (selected.apply state) input = onlyTokenOwner? state input) :
    prepareInternalArm? program (selected.apply state) operation =
      prepareInternalArm? program state operation := by
  unfold prepareInternalArm?
  cases inputFound : internalArmInput? operation with
  | none => rfl
  | some input =>
      simp only [bind, Option.bind]
      rw [owners input inputFound]
      rfl

theorem prepareInternalArm_input (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (found : prepareInternalArm? program state operation = some patch) :
    internalArmInput? operation = some patch.input := by
  unfold prepareInternalArm? at found
  obtain ⟨input, inputFound, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨origin, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
  by_cases blocked : (!exactProgramSelection program operation owner ||
      !exactLiveOccurrence state owner) = true
  · simp [blocked] at found
  · simp only [blocked, bind, Option.bind] at found
    obtain ⟨inputOrigin, _, found⟩ := Option.bind_eq_some_iff.mp found
    cases control : state.control <;> simp only [control] at found
    all_goals try contradiction
    all_goals
      repeat' first
        | (replace found := found.2)
        | (split at found <;> try simp_all)
      all_goals cases found; rfl

/-- Local control touches only tokens and selected records; the complete arming artifact survives
when its full input-owner census is untouched, including correlation and effect-local checks. -/
theorem prepareInternalArm_after_local_control (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (selected : InternalLocalControlSelection)
    (found : prepareInternalArm? program state operation = some patch)
    (untouched : patch.input ∉ selected.tokens.consumed ++ selected.tokens.produced) :
    prepareInternalArm? program (selected.apply state) operation = some patch := by
  rw [prepareInternalArm_local_control_read_frame program state operation selected]
  · exact found
  · intro input inputFound
    have same : input = patch.input := Option.some.inj
      (inputFound.symm.trans (prepareInternalArm_input program state operation patch found))
    subst input
    exact selected.tokens.owner_selection_frame state patch.input
      (fun member => untouched (List.mem_append_left _ member))
      (fun member => untouched (List.mem_append_right _ member))

theorem prepareInternalDataArm_after_local_control (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (selected : InternalLocalControlSelection)
    (found : prepareInternalDataArmingContract? program state contract = some patch)
    (untouched : contract.input ∉ selected.tokens.consumed ++ selected.tokens.produced) :
    prepareInternalDataArmingContract? program (selected.apply state) contract = some patch := by
  have owners := selected.tokens.owner_selection_frame state contract.input
    (fun member => untouched (List.mem_append_left _ member))
    (fun member => untouched (List.mem_append_right _ member))
  have frame : prepareInternalDataArmingContract? program (selected.apply state) contract =
      prepareInternalDataArmingContract? program state contract := by
    unfold prepareInternalDataArmingContract?
    have ownerFrame : onlyTokenOwner? (selected.apply state) contract.input =
        onlyTokenOwner? state contract.input := owners
    rw [ownerFrame]
    rfl
  exact frame.trans found

theorem local_control_arm_patches_commute (state : RuntimeState)
    (selected : InternalLocalControlSelection) (patch : InternalArmingPatch)
    (canonical : canonicalCollectionOrder state = true)
    (untouched : patch.input ∉ selected.tokens.produced) :
    applyInternalArmingPatch (selected.apply state) patch =
      selected.apply (applyInternalArmingPatch state patch) := by
  let armTokens : TokenPatch := { owner := patch.owner, consumed := [patch.input], produced := [] }
  have tokens := selected.tokens.commutes state.tokens armTokens
    (canonicalCollectionOrder_tokens state canonical)
    (by
      intro produced member consumed consumedMember same
      have input : consumed = patch.input := List.mem_singleton.mp consumedMember
      have place : produced = consumed := congrArg ControlToken.placeId same
      exact untouched ((place.trans input) ▸ member))
    (by simp [armTokens])
  change removeToken (selected.tokens.apply state.tokens) patch.input patch.owner =
    selected.tokens.apply (removeToken state.tokens patch.input patch.owner) at tokens
  cases write : patch.write <;>
    simp only [applyInternalArmingPatch, write, InternalLocalControlSelection.apply, tokens]

theorem local_control_data_arm_patches_commute (state : RuntimeState)
    (selected : InternalLocalControlSelection) (patch : InternalDataArmingPatch)
    (canonical : canonicalCollectionOrder state = true)
    (untouched : patch.arm.input ∉ selected.tokens.produced) :
    applyInternalDataArmingPatch (selected.apply state) patch =
      selected.apply (applyInternalDataArmingPatch state patch) := by
  have arm := local_control_arm_patches_commute state selected patch.arm canonical untouched
  unfold applyInternalDataArmingPatch
  rw [arm]
  rfl

end BpmnSemantics.SemanticProcess.InternalCommutation
