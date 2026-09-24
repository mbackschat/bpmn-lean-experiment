import BpmnSemantics.SemanticProcess.InternalMessageTaskOrdinaryFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlArmingCommutation

/-! Message-task arming and local control share only token dependencies. Complete regional
separation protects the full place census and every selected-join readiness bucket.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem messageTask_local_input_untouched (state : RuntimeState) (message : InternalMessageTaskPatch)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint selected.owner
        (internalLocalControlStateFootprint state selected instanceId)) = true) :
    message.arm.input ∉ selected.tokens.consumed ++ selected.tokens.produced := by
  intro member
  have written := localControl_tokenOwners_write state selected instanceId message.arm.input member
  have conflict := regional_independent_write_write _ _ independent
    (.ordinary (.tokenOwners message.arm.input)) (.ordinary (.tokenOwners message.arm.input))
    (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    (List.mem_map.mpr ⟨_, written, rfl⟩)
  simp [regionalStateAtomsConflict] at conflict

theorem messageTask_local_census_frame (state : RuntimeState) (message : InternalMessageTaskPatch)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint selected.owner
        (internalLocalControlStateFootprint state selected instanceId)) = true)
    (place : ControlPlaceId) (read : place ∈ selected.censusReads) :
    tokenOwners (applyInternalMessageTaskPatch state message) place = tokenOwners state place := by
  have different : message.arm.input ≠ place := by
    intro same
    have conflict := regional_independent_read_write _ _ independent
      (.ordinary (.tokenOwners message.arm.input)) (.ordinary (.tokenOwners place))
      (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (List.mem_map.mpr ⟨_, localControl_tokenOwners_read state selected instanceId place read, rfl⟩)
    simp [regionalStateAtomsConflict, same] at conflict
  cases write : message.arm.write <;>
    simp only [tokenOwners, applyInternalMessageTaskPatch, applyInternalArmingPatch, write,
      filterTokens_removeToken_other _ _ _ _ different]

theorem messageTask_local_bucket_frame (state : RuntimeState) (message : InternalMessageTaskPatch)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint selected.owner
        (internalLocalControlStateFootprint state selected instanceId)) = true)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (read : .controlToken owner place ∈ (internalLocalControlStateFootprint state selected instanceId).reads) :
    (applyInternalMessageTaskPatch state message).tokens.filter
        (fun token => decide (token.placeId = place && token.owner = owner)) =
      state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) := by
  have tokens : (applyInternalMessageTaskPatch state message).tokens =
      removeToken state.tokens message.arm.input message.arm.owner := by
    cases write : message.arm.write <;> simp only [applyInternalMessageTaskPatch, applyInternalArmingPatch, write]
  rw [tokens]
  let patch : TokenPatch := { owner := message.arm.owner, consumed := [message.arm.input], produced := [] }
  change (patch.apply state.tokens).filter _ = _
  apply patch.filter_untouched
  · intro input member
    have sameInput : input = message.arm.input := List.mem_singleton.mp member
    apply Bool.eq_false_iff.mpr
    intro matched
    simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
    have conflict := regional_independent_read_write _ _ independent
      (.ordinary (.controlToken message.arm.owner message.arm.input)) (.ordinary (.controlToken owner place))
      (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (List.mem_map.mpr ⟨_, read, rfl⟩)
    have placeEq := sameInput.symm.trans matched.1
    have ownerEq : message.arm.owner = owner := matched.2
    simp [regionalStateAtomsConflict, placeEq, ownerEq] at conflict
  · simp [patch]

theorem prepareInternalLocalControl_after_message_task (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (control : PreparedInternalLocalControl)
    (contract : InternalMessageTaskContract) (message : InternalMessageTaskPatch)
    (controlFound : prepareInternalLocalControl? program state operation = some control)
    (messageFound : prepareInternalMessageTaskContract? program state contract = some message)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint control.selection.owner control.footprint) = true) :
    prepareInternalLocalControl? program (applyInternalMessageTaskPatch state message) operation = some control := by
  obtain ⟨selected, origin, instanceId, identity, delta, selection,
    _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state operation control controlFound
  obtain ⟨_, messageOwner, messageInstance, messageOrigin, messageProcess, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract message messageFound
  let message := makeInternalMessageTaskPatch program state contract messageOwner messageInstance messageProcess messageOrigin
  apply prepareInternalLocalControl_read_frame program state (applyInternalMessageTaskPatch state message)
    operation _ controlFound
  · rfl
  · rfl
  · rfl
  · intro place member
    exact messageTask_local_census_frame state message selected instanceId independent place member
  · intro place member
    exact messageTask_local_bucket_frame state message selected instanceId independent selected.owner place
      (localControl_token_read state selected instanceId place member)
  · intro name member
    rfl
  · intro key selectedKey
    rfl
  · intro chosen selectedBranch record present key place member
    exact messageTask_local_bucket_frame state message selected instanceId independent record.owner place
      (localControl_selectedJoin_bucket_read state selected instanceId chosen record place
        (localControl_selectedJoin_patch state operation selected selection chosen selectedBranch)
        present key member)

theorem prepareInternalMessageTaskContract_after_local_control
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (message : InternalMessageTaskPatch) (selected : InternalLocalControlSelection)
    (found : prepareInternalMessageTaskContract? program state contract = some message)
    (untouched : contract.input ∉ selected.tokens.consumed ++ selected.tokens.produced) :
    prepareInternalMessageTaskContract? program (selected.apply state) contract = some message := by
  have owners := selected.tokens.owner_selection_frame state contract.input
    (fun member => untouched (List.mem_append_left _ member))
    (fun member => untouched (List.mem_append_right _ member))
  have frame : prepareInternalMessageTaskContract? program (selected.apply state) contract =
      prepareInternalMessageTaskContract? program state contract := by
    unfold prepareInternalMessageTaskContract?
    have ownerFrame : onlyTokenOwner? (selected.apply state) contract.input =
        onlyTokenOwner? state contract.input := owners
    rw [ownerFrame]
    rfl
  exact frame.trans found

theorem local_control_message_task_patches_commute (state : RuntimeState)
    (selected : InternalLocalControlSelection) (message : InternalMessageTaskPatch)
    (canonical : canonicalCollectionOrder state = true)
    (untouched : message.arm.input ∉ selected.tokens.produced) :
    applyInternalMessageTaskPatch (selected.apply state) message =
      selected.apply (applyInternalMessageTaskPatch state message) := by
  have arm := local_control_arm_patches_commute state selected message.arm canonical untouched
  unfold applyInternalMessageTaskPatch
  rw [arm]
  rfl

theorem prepared_message_task_local_control_pair
    (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (control : PreparedInternalLocalControl)
    (contract : InternalMessageTaskContract) (message : InternalMessageTaskPatch)
    (controlFound : prepareInternalLocalControl? program state operation = some control)
    (messageFound : prepareInternalMessageTaskContract? program state contract = some message)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint control.selection.owner control.footprint) = true) :
    prepareInternalMessageTaskContract? program (control.selection.apply state) contract = some message ∧
      prepareInternalLocalControl? program (applyInternalMessageTaskPatch state message) operation = some control ∧
      applyInternalMessageTaskPatch (control.selection.apply state) message =
        control.selection.apply (applyInternalMessageTaskPatch state message) := by
  have localAfter := prepareInternalLocalControl_after_message_task program state operation control
    contract message controlFound messageFound independent
  obtain ⟨selected, origin, instanceId, identity, delta, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalLocalControl_facts program state operation control controlFound
  have untouched := messageTask_local_input_untouched state message selected instanceId independent
  have inputEq : message.arm.input = contract.input := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalMessageTaskContract_facts program state contract message messageFound
    rfl
  refine ⟨prepareInternalMessageTaskContract_after_local_control program state contract message selected
    messageFound (by simpa [inputEq] using untouched), localAfter, ?_⟩
  exact local_control_message_task_patches_commute state selected message canonical
    (fun member => untouched (List.mem_append_right _ member))

end BpmnSemantics.SemanticProcess.InternalCommutation
