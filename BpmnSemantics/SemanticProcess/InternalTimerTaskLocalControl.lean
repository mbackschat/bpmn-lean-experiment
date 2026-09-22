import BpmnSemantics.SemanticProcess.InternalTimerTaskPreparationFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlArmingCommutation

/-! Timer-task arming and local control share only token dependencies. Complete regional
separation protects the full place census and every selected-join readiness bucket.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem timerTask_local_input_untouched (state : RuntimeState) (timer : InternalTimerTaskPatch)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint selected.owner
        (internalLocalControlStateFootprint state selected instanceId)) = true) :
    timer.arm.input ∉ selected.tokens.consumed ++ selected.tokens.produced := by
  intro member
  have written := localControl_tokenOwners_write state selected instanceId timer.arm.input member
  have conflict := regional_independent_write_write _ _ independent
    (.ordinary (.tokenOwners timer.arm.input)) (.ordinary (.tokenOwners timer.arm.input))
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    (List.mem_map.mpr ⟨_, written, rfl⟩)
  simp [regionalStateAtomsConflict] at conflict

theorem timerTask_local_census_frame (state : RuntimeState) (timer : InternalTimerTaskPatch)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint selected.owner
        (internalLocalControlStateFootprint state selected instanceId)) = true)
    (place : ControlPlaceId) (read : place ∈ selected.censusReads) :
    tokenOwners (applyInternalTimerTaskPatch state timer) place = tokenOwners state place := by
  have different : timer.arm.input ≠ place := by
    intro same
    have conflict := regional_independent_read_write _ _ independent
      (.ordinary (.tokenOwners timer.arm.input)) (.ordinary (.tokenOwners place))
      (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (List.mem_map.mpr ⟨_, localControl_tokenOwners_read state selected instanceId place read, rfl⟩)
    simp [regionalStateAtomsConflict, same] at conflict
  cases write : timer.arm.write <;>
    simp only [tokenOwners, applyInternalTimerTaskPatch, applyInternalArmingPatch, write,
      filterTokens_removeToken_other _ _ _ _ different]

theorem timerTask_local_bucket_frame (state : RuntimeState) (timer : InternalTimerTaskPatch)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint selected.owner
        (internalLocalControlStateFootprint state selected instanceId)) = true)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (read : .controlToken owner place ∈ (internalLocalControlStateFootprint state selected instanceId).reads) :
    (applyInternalTimerTaskPatch state timer).tokens.filter
        (fun token => decide (token.placeId = place && token.owner = owner)) =
      state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) := by
  have tokens : (applyInternalTimerTaskPatch state timer).tokens =
      removeToken state.tokens timer.arm.input timer.arm.owner := by
    cases write : timer.arm.write <;> simp only [applyInternalTimerTaskPatch, applyInternalArmingPatch, write]
  rw [tokens]
  let patch : TokenPatch := { owner := timer.arm.owner, consumed := [timer.arm.input], produced := [] }
  change (patch.apply state.tokens).filter _ = _
  apply patch.filter_untouched
  · intro input member
    have sameInput : input = timer.arm.input := List.mem_singleton.mp member
    apply Bool.eq_false_iff.mpr
    intro matched
    simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
    have conflict := regional_independent_read_write _ _ independent
      (.ordinary (.controlToken timer.arm.owner timer.arm.input)) (.ordinary (.controlToken owner place))
      (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (List.mem_map.mpr ⟨_, read, rfl⟩)
    have placeEq := sameInput.symm.trans matched.1
    have ownerEq : timer.arm.owner = owner := matched.2
    simp [regionalStateAtomsConflict, placeEq, ownerEq] at conflict
  · simp [patch]

theorem prepareInternalLocalControl_after_timer_task (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (control : PreparedInternalLocalControl)
    (contract : InternalTimerTaskContract) (timer : InternalTimerTaskPatch)
    (controlFound : prepareInternalLocalControl? program state operation = some control)
    (timerFound : prepareInternalTimerTaskContract? program state contract = some timer)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint control.selection.owner control.footprint) = true) :
    prepareInternalLocalControl? program (applyInternalTimerTaskPatch state timer) operation = some control := by
  obtain ⟨selected, origin, instanceId, identity, delta, selection,
    _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state operation control controlFound
  obtain ⟨_, timerOwner, timerInstance, timerOrigin, timerProcess, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract timer timerFound
  let timer := makeInternalTimerTaskPatch program state contract timerOwner timerInstance timerProcess timerOrigin
  apply prepareInternalLocalControl_read_frame program state (applyInternalTimerTaskPatch state timer)
    operation _ controlFound
  · rfl
  · rfl
  · rfl
  · intro place member
    exact timerTask_local_census_frame state timer selected instanceId independent place member
  · intro place member
    exact timerTask_local_bucket_frame state timer selected instanceId independent selected.owner place
      (localControl_token_read state selected instanceId place member)
  · intro name member
    rfl
  · intro key selectedKey
    rfl
  · intro chosen selectedBranch record present key place member
    exact timerTask_local_bucket_frame state timer selected instanceId independent record.owner place
      (localControl_selectedJoin_bucket_read state selected instanceId chosen record place
        (localControl_selectedJoin_patch state operation selected selection chosen selectedBranch)
        present key member)

theorem prepareInternalTimerTaskContract_after_local_control
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (timer : InternalTimerTaskPatch) (selected : InternalLocalControlSelection)
    (found : prepareInternalTimerTaskContract? program state contract = some timer)
    (untouched : contract.input ∉ selected.tokens.consumed ++ selected.tokens.produced) :
    prepareInternalTimerTaskContract? program (selected.apply state) contract = some timer := by
  have owners := selected.tokens.owner_selection_frame state contract.input
    (fun member => untouched (List.mem_append_left _ member))
    (fun member => untouched (List.mem_append_right _ member))
  have frame : prepareInternalTimerTaskContract? program (selected.apply state) contract =
      prepareInternalTimerTaskContract? program state contract := by
    unfold prepareInternalTimerTaskContract?
    have ownerFrame : onlyTokenOwner? (selected.apply state) contract.input =
        onlyTokenOwner? state contract.input := owners
    rw [ownerFrame]
    rfl
  exact frame.trans found

theorem local_control_timer_task_patches_commute (state : RuntimeState)
    (selected : InternalLocalControlSelection) (timer : InternalTimerTaskPatch)
    (canonical : canonicalCollectionOrder state = true)
    (untouched : timer.arm.input ∉ selected.tokens.produced) :
    applyInternalTimerTaskPatch (selected.apply state) timer =
      selected.apply (applyInternalTimerTaskPatch state timer) := by
  have arm := local_control_arm_patches_commute state selected timer.arm canonical untouched
  unfold applyInternalTimerTaskPatch
  rw [arm]
  rfl

theorem prepared_timer_task_local_control_pair
    (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (control : PreparedInternalLocalControl)
    (contract : InternalTimerTaskContract) (timer : InternalTimerTaskPatch)
    (controlFound : prepareInternalLocalControl? program state operation = some control)
    (timerFound : prepareInternalTimerTaskContract? program state contract = some timer)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint control.selection.owner control.footprint) = true) :
    prepareInternalTimerTaskContract? program (control.selection.apply state) contract = some timer ∧
      prepareInternalLocalControl? program (applyInternalTimerTaskPatch state timer) operation = some control ∧
      applyInternalTimerTaskPatch (control.selection.apply state) timer =
        control.selection.apply (applyInternalTimerTaskPatch state timer) := by
  have localAfter := prepareInternalLocalControl_after_timer_task program state operation control
    contract timer controlFound timerFound independent
  obtain ⟨selected, origin, instanceId, identity, delta, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state operation control controlFound
  have untouched := timerTask_local_input_untouched state timer selected instanceId independent
  have inputEq : timer.arm.input = contract.input := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalTimerTaskContract_facts program state contract timer timerFound
    rfl
  refine ⟨prepareInternalTimerTaskContract_after_local_control program state contract timer selected
    timerFound (by simpa [inputEq] using untouched), localAfter, ?_⟩
  exact local_control_timer_task_patches_commute state selected timer canonical
    (fun member => untouched (List.mem_append_right _ member))

end BpmnSemantics.SemanticProcess.InternalCommutation
