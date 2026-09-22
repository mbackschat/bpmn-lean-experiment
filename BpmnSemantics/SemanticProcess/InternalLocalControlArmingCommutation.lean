import BpmnSemantics.SemanticProcess.InternalLocalControlArmingFrames

/-! Mixed prepared pairs use the equality-keyed state footprint selected in the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def PreparedInternalArming.stateFootprint (prepared : PreparedInternalArming) :
    InternalTransitionStateFootprint :=
  { reads := prepared.footprint.reads, writes := prepared.footprint.writes }

private def armingPatch : PreparedInternalArming → InternalArmingPatch
  | .ordinary _ patch => patch
  | .data _ patch => patch.arm

private theorem arming_input_read (arm : PreparedInternalArming) :
    .tokenOwners (armingPatch arm).input ∈ arm.stateFootprint.reads := by
  cases arm with
  | ordinary operation patch => exact tokenOwners_mem_footprint_reads patch
  | data contract patch =>
      exact ordinary_reads_subset_data_reads contract patch (tokenOwners_mem_footprint_reads patch.arm)

private theorem arming_input_write (arm : PreparedInternalArming) :
    .tokenOwners (armingPatch arm).input ∈ arm.stateFootprint.writes := by
  cases arm with
  | ordinary operation patch => exact tokenOwners_mem_footprint_writes patch
  | data contract patch =>
      exact ordinary_writes_subset_data_writes contract patch (tokenOwners_mem_footprint_writes patch.arm)

private theorem arming_token_write (arm : PreparedInternalArming) :
    .controlToken (armingPatch arm).owner (armingPatch arm).input ∈ arm.stateFootprint.writes := by
  have ordinary (patch : InternalArmingPatch) :
      .controlToken patch.owner patch.input ∈ (footprintOfPatch patch).writes := by
    simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]
  cases arm with
  | ordinary operation patch => exact ordinary patch
  | data contract patch => exact ordinary_writes_subset_data_writes contract patch (ordinary patch.arm)

theorem arming_local_read_projections (state : RuntimeState) (arm : PreparedInternalArming) :
    (arm.apply state).control = state.control ∧
      (arm.apply state).logicalTimeMs = state.logicalTimeMs ∧
      (arm.apply state).scopeOccurrences = state.scopeOccurrences ∧
      (arm.apply state).variables.process = state.variables.process ∧
      (arm.apply state).selectedBranchSets = state.selectedBranchSets ∧
      (arm.apply state).tokens = removeToken state.tokens (armingPatch arm).input (armingPatch arm).owner := by
  cases arm with
  | ordinary operation patch =>
      cases write : patch.write <;> simp [PreparedInternalArming.apply, armingPatch,
        applyInternalArmingPatch, write]
  | data contract patch =>
      cases write : patch.arm.write <;> simp [PreparedInternalArming.apply, armingPatch,
        applyInternalDataArmingPatch, applyInternalArmingPatch, write,
        addActivityOccurrenceVariableScope]

private theorem local_control_arming_input_untouched (state : RuntimeState)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId) (arm : PreparedInternalArming)
    (separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state selected instanceId) arm.stateFootprint = true) :
    (armingPatch arm).input ∉ selected.tokens.consumed ++ selected.tokens.produced := by
  intro member
  simp only [localControlStateFootprintsNonInterfering, Bool.and_eq_true] at separated
  exact not_mem_right_of_listsDisjoint _ _ separated.1.1.1 _
    (localControl_tokenOwners_write state selected instanceId _ member) (arming_input_read arm)

/-- A foreign-owner write still conflicts at the full input census, even when owned token keys differ. -/
theorem local_control_writing_arming_input_conflicts (state : RuntimeState)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (written : patch.input ∈ selected.tokens.consumed ++ selected.tokens.produced) :
    localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state selected instanceId)
      (PreparedInternalArming.ordinary operation patch).stateFootprint = false := by
  let arm := PreparedInternalArming.ordinary operation patch
  cases separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state selected instanceId) arm.stateFootprint with
  | false => rfl
  | true =>
      exact False.elim (local_control_arming_input_untouched state selected instanceId arm separated written)

private theorem arming_local_census_frame (state : RuntimeState)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId) (arm : PreparedInternalArming)
    (separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state selected instanceId) arm.stateFootprint = true)
    (place : ControlPlaceId) (read : place ∈ selected.censusReads) :
    tokenOwners (arm.apply state) place = tokenOwners state place := by
  have different : (armingPatch arm).input ≠ place := by
    intro same
    simp only [localControlStateFootprintsNonInterfering, Bool.and_eq_true] at separated
    have written := arming_input_write arm
    rw [same] at written
    exact not_mem_right_of_listsDisjoint _ _ separated.1.2 _ written
      (localControl_tokenOwners_read state selected instanceId place read)
  unfold tokenOwners
  rw [(arming_local_read_projections state arm).2.2.2.2.2,
    filterTokens_removeToken_other _ _ _ _ different]

theorem arming_local_bucket_frame (state : RuntimeState)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId) (arm : PreparedInternalArming)
    (separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state selected instanceId) arm.stateFootprint = true)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (read : .controlToken owner place ∈ (internalLocalControlStateFootprint state selected instanceId).reads) :
    (arm.apply state).tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) =
      state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) := by
  rw [(arming_local_read_projections state arm).2.2.2.2.2]
  let patch : TokenPatch := { owner := (armingPatch arm).owner, consumed := [(armingPatch arm).input], produced := [] }
  change (patch.apply state.tokens).filter _ = _
  apply patch.filter_untouched
  · intro input member
    have inputEq : input = (armingPatch arm).input := List.mem_singleton.mp member
    apply Bool.eq_false_iff.mpr
    intro matched
    simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
    simp only [localControlStateFootprintsNonInterfering, Bool.and_eq_true] at separated
    have written := arming_token_write arm
    have placeEq : (armingPatch arm).input = place := inputEq.symm.trans matched.1
    have ownerEq : (armingPatch arm).owner = owner := matched.2
    rw [placeEq, ownerEq] at written
    exact not_mem_right_of_listsDisjoint _ _ separated.1.2 _ written read
  · simp [patch]

/-- The actual arming update preserves the complete local artifact, including same-key competing
selected-join readiness. Separation supplies every token dependency used by the read frame. -/
theorem prepareInternalLocalControl_after_arming (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl) (arm : PreparedInternalArming)
    (found : prepareInternalLocalControl? program state operation = some prepared)
    (separated : localControlStateFootprintsNonInterfering prepared.footprint arm.stateFootprint = true) :
    prepareInternalLocalControl? program (arm.apply state) operation = some prepared := by
  obtain ⟨selected, origin, instanceId, identity, delta, selection,
    _, _, _, _, _, _, _, _, _, rfl⟩ := prepareInternalLocalControl_facts program state operation prepared found
  have projections := arming_local_read_projections state arm
  apply prepareInternalLocalControl_read_frame program state (arm.apply state) operation _ found
  · exact projections.1
  · exact projections.2.1
  · rw [projections.2.2.1]
  · intro place member
    exact arming_local_census_frame state selected instanceId arm separated place member
  · intro place member
    exact arming_local_bucket_frame state selected instanceId arm separated selected.owner place
      (localControl_token_read state selected instanceId place member)
  · intro name member
    rw [projections.2.2.2.1]
  · intro key selectedKey
    rw [projections.2.2.2.2.1]
  · intro chosen selectedBranch record present key place member
    exact arming_local_bucket_frame state selected instanceId arm separated record.owner place
      (localControl_selectedJoin_bucket_read state selected instanceId chosen record place
        (localControl_selectedJoin_patch state operation selected selection chosen selectedBranch)
        present key member)

/-- Arming depends on the local patch footprint, independently of the operation's selector. -/
theorem prepared_arming_after_local_patch (program : Program) (state : RuntimeState)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId) (arm : PreparedInternalArming)
    (armFound : arm.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering
      (internalLocalControlStateFootprint state selected instanceId) arm.stateFootprint = true) :
    arm.Prepared program (selected.apply state) ∧
      arm.apply (selected.apply state) = selected.apply (arm.apply state) := by
  have untouched := local_control_arming_input_untouched state selected instanceId arm separated
  constructor
  · cases arm with
    | ordinary operation patch =>
        exact prepareInternalArm_after_local_control program state operation patch selected armFound untouched
    | data contract patch =>
        have input : contract.input = patch.arm.input := by
          obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
            prepareInternalDataArmingContract_facts program state contract patch armFound
          rfl
        apply prepareInternalDataArm_after_local_control program state contract patch selected armFound
        rw [input]
        exact untouched
  · cases arm with
    | ordinary operation patch =>
        exact local_control_arm_patches_commute state selected patch canonical
          (fun member => untouched (List.mem_append_right _ member))
    | data contract patch =>
        exact local_control_data_arm_patches_commute state selected patch canonical
          (fun member => untouched (List.mem_append_right _ member))

/-- Computed state separation derives both complete preparations and exact canonical mixed
commutation for all five local families and ordinary or composed-data arms. -/
theorem prepared_local_control_arming_pair (program : Program) (state : RuntimeState)
    (localOperation : SemanticOperation) (preparedLocal : PreparedInternalLocalControl) (arm : PreparedInternalArming)
    (localFound : prepareInternalLocalControl? program state localOperation = some preparedLocal)
    (armFound : arm.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering preparedLocal.footprint arm.stateFootprint = true) :
    arm.Prepared program (preparedLocal.selection.apply state) ∧
      prepareInternalLocalControl? program (arm.apply state) localOperation = some preparedLocal ∧
      arm.apply (preparedLocal.selection.apply state) = preparedLocal.selection.apply (arm.apply state) := by
  have localAfter := prepareInternalLocalControl_after_arming program state localOperation preparedLocal arm localFound separated
  obtain ⟨selected, origin, instanceId, identity, delta, selection,
    _, _, _, _, _, _, _, _, _, rfl⟩ := prepareInternalLocalControl_facts program state localOperation preparedLocal localFound
  have armAfter := prepared_arming_after_local_patch program state selected instanceId arm armFound canonical separated
  exact ⟨armAfter.1, localAfter, armAfter.2⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
