import BpmnSemantics.SemanticProcess.InternalScopeCreationRuntimeValidity
import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparationFrames

/-! Complete preparation preservation under the declared scope-creation footprints from the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem scopeCreation_read_write_separate
    (left right : InternalScopeCreationSelection) (leftInstance rightInstance : SemanticId)
    (leftOwner rightOwner : RuntimeScopeOccurrence)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint left leftInstance leftOwner)
      (internalScopeCreationStateFootprint right rightInstance rightOwner) = true)
    (read written : InternalStateAtom)
    (reads : read ∈ (internalScopeCreationStateFootprint left leftInstance leftOwner).reads)
    (writes : written ∈ (internalScopeCreationStateFootprint right rightInstance rightOwner).writes) :
    written ≠ read := by
  simp only [localControlStateFootprintsNonInterfering, Bool.and_eq_true] at separated
  intro equal
  exact not_mem_right_of_listsDisjoint _ _ separated.1.2 read (equal ▸ writes) reads

theorem scopeCreation_census_read (selected : InternalScopeCreationSelection)
    (instanceId : SemanticId) (owner : RuntimeScopeOccurrence) :
    .tokenOwners selected.input ∈ (internalScopeCreationStateFootprint selected instanceId owner).reads := by
  simp [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy]

theorem scopeCreation_census_write (selected : InternalScopeCreationSelection)
    (instanceId : SemanticId) (owner : RuntimeScopeOccurrence) (place : ControlPlaceId)
    (member : place ∈ [selected.input, selected.entry]) :
    .tokenOwners place ∈ (internalScopeCreationStateFootprint selected instanceId owner).writes := by
  simp only [List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;>
    simp [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy]

theorem scopeCreation_token_read (selected : InternalScopeCreationSelection)
    (instanceId : SemanticId) (owner : RuntimeScopeOccurrence) (token : ControlToken)
    (member : token ∈ [{ placeId := selected.input, owner := selected.owner },
      { placeId := selected.entry, owner := selected.created.id }]) :
    .controlToken token.owner token.placeId ∈
      (internalScopeCreationStateFootprint selected instanceId owner).reads := by
  simp only [List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;>
    simp [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy]

theorem scopeCreation_token_write (selected : InternalScopeCreationSelection)
    (instanceId : SemanticId) (owner : RuntimeScopeOccurrence) (token : ControlToken)
    (member : token ∈ [{ placeId := selected.input, owner := selected.owner },
      { placeId := selected.entry, owner := selected.created.id }]) :
    .controlToken token.owner token.placeId ∈
      (internalScopeCreationStateFootprint selected instanceId owner).writes := by
  simp only [List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;>
    simp [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy]

theorem scopeCreation_creation_read (selected : InternalScopeCreationSelection)
    (instanceId : SemanticId) (owner : RuntimeScopeOccurrence) (atom : InternalStateAtom)
    (member : atom ∈ internalScopeCreationCreationAtoms selected) :
    atom ∈ (internalScopeCreationStateFootprint selected instanceId owner).reads := by
  simp only [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy,
    List.mem_eraseDups, List.mem_append]
  exact Or.inl (Or.inr member)

theorem scopeCreation_creation_write (selected : InternalScopeCreationSelection)
    (instanceId : SemanticId) (owner : RuntimeScopeOccurrence) (atom : InternalStateAtom)
    (member : atom ∈ internalScopeCreationCreationAtoms selected) :
    atom ∈ (internalScopeCreationStateFootprint selected instanceId owner).writes := by
  simp only [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy,
    List.mem_eraseDups, List.mem_append]
  exact Or.inr member

theorem scopeCreation_independent_bucket_frame (state : RuntimeState)
    (left right : InternalScopeCreationSelection) (leftInstance rightInstance : SemanticId)
    (leftOwner rightOwner : RuntimeScopeOccurrence)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint left leftInstance leftOwner)
      (internalScopeCreationStateFootprint right rightInstance rightOwner) = true)
    (token : ControlToken)
    (member : token ∈ [{ placeId := left.input, owner := left.owner },
      { placeId := left.entry, owner := left.created.id }]) :
    (right.apply state).tokens.filter (fun candidate =>
        decide (candidate.placeId = token.placeId && candidate.owner = token.owner)) =
      state.tokens.filter (fun candidate =>
        decide (candidate.placeId = token.placeId && candidate.owner = token.owner)) := by
  have rejected : ∀ (written : ControlToken), written ∈ [{ placeId := right.input, owner := right.owner },
      { placeId := right.entry, owner := right.created.id }] →
      decide (written.placeId = token.placeId && written.owner = token.owner) = false := by
    intro written present
    apply Bool.eq_false_iff.mpr
    intro matched
    simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
    have read := scopeCreation_token_read left leftInstance leftOwner token member
    have write := scopeCreation_token_write right rightInstance rightOwner written present
    apply scopeCreation_read_write_separate left right leftInstance rightInstance leftOwner rightOwner
      separated _ _ read write
    simp only [matched.1, matched.2]
  exact scopeCreation_apply_token_filter state right _ (rejected _ (by simp)) (rejected _ (by simp))

theorem scopeCreation_independent_child_keys
    (left right : InternalScopeCreationSelection) (leftInstance rightInstance : SemanticId)
    (leftOwner rightOwner : RuntimeScopeOccurrence)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint left leftInstance leftOwner)
      (internalScopeCreationStateFootprint right rightInstance rightOwner) = true)
    (leftChild : left.kind = .child) (rightChild : right.kind = .child) :
    right.created.id.definitionScopeId ≠ left.created.id.definitionScopeId := by
  have reads := scopeCreation_creation_read left leftInstance leftOwner
    (.activation .scope ⟨left.created.id.definitionScopeId.value⟩)
    (by simp [internalScopeCreationCreationAtoms, leftChild])
  have writes := scopeCreation_creation_write right rightInstance rightOwner
    (.activation .scope ⟨right.created.id.definitionScopeId.value⟩)
    (by simp [internalScopeCreationCreationAtoms, rightChild])
  intro same
  exact scopeCreation_read_write_separate left right leftInstance rightInstance leftOwner rightOwner
    separated _ _ reads writes (by rw [same])

theorem scopeCreation_independent_call_keys
    (left right : InternalScopeCreationSelection) (leftInstance rightInstance : SemanticId)
    (leftOwner rightOwner : RuntimeScopeOccurrence)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint left leftInstance leftOwner)
      (internalScopeCreationStateFootprint right rightInstance rightOwner) = true)
    (leftRecord rightRecord : CalledProcessOccurrence)
    (leftCalled : left.kind = .called leftRecord) (rightCalled : right.kind = .called rightRecord) :
    rightRecord.id.elementId.value ≠ leftRecord.id.elementId.value := by
  have reads := scopeCreation_creation_read left leftInstance leftOwner
    (.activation .call ⟨leftRecord.id.elementId.value⟩)
    (by simp [internalScopeCreationCreationAtoms, leftCalled])
  have writes := scopeCreation_creation_write right rightInstance rightOwner
    (.activation .call ⟨rightRecord.id.elementId.value⟩)
    (by simp [internalScopeCreationCreationAtoms, rightCalled])
  intro same
  exact scopeCreation_read_write_separate left right leftInstance rightInstance leftOwner rightOwner
    separated _ _ reads writes (by rw [same])

theorem scopeCreation_call_population_empty (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (predicate : CalledProcessOccurrence → Bool)
    (empty : (state.calledProcessOccurrences.filter predicate).length = 0)
    (rejected : ∀ record, selected.kind = .called record → predicate record = false) :
    ((selected.apply state).calledProcessOccurrences.filter predicate).length = 0 := by
  cases kind : selected.kind with
  | child => simpa [InternalScopeCreationSelection.apply, kind] using empty
  | called record =>
      simp only [InternalScopeCreationSelection.apply, kind]
      rw [((sortCallRecords_perm (record :: state.calledProcessOccurrences)).filter predicate).length_eq]
      simpa [rejected record kind] using empty

theorem prepareInternalScopeCreation_after_independent (program : Program) (instanceId : SemanticId) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalScopeCreation)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (leftFound : prepareInternalScopeCreation? program state leftOperation = some left)
    (rightFound : prepareInternalScopeCreation? program state rightOperation = some right)
    (separated : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    prepareInternalScopeCreation? program (right.selection.apply state) leftOperation = some left := by
  obtain ⟨leftSelected, leftInstance, leftOwner, leftOrigin, leftDefinition, leftStart, leftDelta,
    leftSelection, leftRunning, _, _, leftOwnerExact, _, leftDefinitionFound, leftChecks,
    _, _, rfl⟩ := prepareInternalScopeCreation_facts program state leftOperation left leftFound
  obtain ⟨rightSelected, rightInstance, rightOwner, rightOrigin, rightDefinition, rightStart, rightDelta,
    rightSelection, rightRunning, _, _, _, _, rightDefinitionFound, rightChecks,
    _, _, rfl⟩ := prepareInternalScopeCreation_facts program state rightOperation right rightFound
  dsimp only [makeInternalScopeCreationPreparation] at separated ⊢
  have position : runtimePositionValid program instanceId state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at stateWF
    exact stateWF.1
  have hosting := runtimePositionValid_running_instance program instanceId leftInstance state position leftRunning
  subst leftInstance
  have rightHosting : rightInstance = instanceId := by rw [leftRunning] at rightRunning; exact ProcessControl.running.inj rightRunning.symm
  subst rightInstance
  have leftParent := scopeCreation_definition_parent state leftOperation leftSelected leftDefinition leftSelection
    (internalScopeCreationPredecessorChecks_facts program state leftOperation leftSelected leftOrigin leftDefinition leftChecks).2.1
  have rightParent := scopeCreation_definition_parent state rightOperation rightSelected rightDefinition rightSelection
    (internalScopeCreationPredecessorChecks_facts program state rightOperation rightSelected rightOrigin rightDefinition rightChecks).2.1
  have childKeys : leftSelected.kind = .child →
      rightSelected.created.id.definitionScopeId ≠ leftSelected.created.id.definitionScopeId := by
    intro leftChild
    cases rightKind : rightSelected.kind with
    | child =>
        exact scopeCreation_independent_child_keys leftSelected rightSelected instanceId instanceId
          leftOwner rightOwner separated leftChild rightKind
    | called record =>
        intro same
        rw [same, leftDefinitionFound] at rightDefinitionFound
        have sameDefinitions := Option.some.inj rightDefinitionFound
        rw [← sameDefinitions] at rightParent
        simp [leftChild] at leftParent
        simp [rightKind] at rightParent
        simp [leftParent] at rightParent
  have callKeys : ∀ leftRecord rightRecord,
      leftSelected.kind = .called leftRecord → rightSelected.kind = .called rightRecord →
      rightRecord.id.elementId.value ≠ leftRecord.id.elementId.value := by
    intro leftRecord rightRecord leftCalled rightCalled
    exact scopeCreation_independent_call_keys leftSelected rightSelected instanceId instanceId
      leftOwner rightOwner separated leftRecord rightRecord leftCalled rightCalled
  have ownerMember : leftOwner ∈ state.scopeOccurrences ∧ leftOwner.id = leftSelected.owner := by
    have member : leftOwner ∈ state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = leftSelected.owner)) := by
      rw [leftOwnerExact]; simp
    simpa only [List.mem_filter, decide_eq_true_eq] using member
  have ownerFrame := scopeCreation_apply_scope_filter state rightSelected
    (fun occurrence => decide (occurrence.id = leftSelected.owner)) (by
      simp only [decide_eq_false_iff_not]
      intro same
      exact selectInternalScopeCreation_fresh state rightOperation rightSelected rightSelection
        leftOwner ownerMember.1 (ownerMember.2.trans same.symm))
  have inputFrame := scopeCreation_independent_bucket_frame state leftSelected rightSelected instanceId instanceId
    leftOwner rightOwner separated { placeId := leftSelected.input, owner := leftSelected.owner } (by simp)
  have entryFrame := scopeCreation_independent_bucket_frame state leftSelected rightSelected instanceId instanceId
    leftOwner rightOwner separated { placeId := leftSelected.entry, owner := leftSelected.created.id } (by simp)
  have censusFrame : tokenOwners (rightSelected.apply state) leftSelected.input = tokenOwners state leftSelected.input := by
    have different : ∀ place ∈ [rightSelected.input, rightSelected.entry], place ≠ leftSelected.input := by
      intro place member
      intro same
      have reads := scopeCreation_census_read leftSelected instanceId leftOwner
      have writes := scopeCreation_census_write rightSelected instanceId rightOwner place member
      exact scopeCreation_read_write_separate leftSelected rightSelected instanceId instanceId
        leftOwner rightOwner separated _ _ reads writes (by rw [same])
    exact scopeCreation_apply_census state rightSelected leftSelected.input (different _ (by simp))
      (different _ (by simp))
  have childCounter := fun child => scopeCreation_scope_counter_population state rightSelected
    leftSelected.created.id.definitionScopeId (fun _ => childKeys child)
  have callCounter := fun record called => scopeCreation_call_counter_population state rightSelected
    record.id.elementId.value (fun other otherCalled => callKeys record other called otherCalled)
  have selectionAfter : selectInternalScopeCreation? (rightSelected.apply state) leftOperation = some leftSelected := by
    apply selectInternalScopeCreation_read_frame state (rightSelected.apply state) leftOperation leftSelected
      leftSelection (scopeCreation_apply_control state rightSelected) censusFrame inputFrame ownerFrame
    · intro child
      refine ⟨?_, scopeActivationCount_population_frame state (rightSelected.apply state) _ (childCounter child)⟩
      apply scopeCreation_any_population_frame
      apply scopeCreation_apply_scope_filter
      simpa using childKeys child
    · intro leftRecord leftCalled
      obtain ⟨leftHosting, leftCaller, _, leftRoot, leftDerived, callerEmpty, scopeEmpty, collisionEmpty⟩ :=
        scopeCreation_selection_call_facts state leftOperation leftSelected leftRecord instanceId
          leftRunning leftSelection leftCalled
      have associations := prepareInternalScopeCreation_preserves_callAssociations program state rightOperation _
        programWF (scopeCreation_selection_call_associations state leftOperation leftSelected leftRecord
          leftSelection leftCalled) rightFound
      have notHosting : leftSelected.created.id.processInstanceId ≠ instanceId := by
        intro same
        have present : leftOwner ∈ state.scopeOccurrences.filter (fun occurrence =>
            decide (occurrence.id.processInstanceId = leftSelected.created.id.processInstanceId)) := by
          apply List.mem_filter.mpr
          exact ⟨ownerMember.1, by simp [ownerMember.2, leftHosting, same]⟩
        rw [List.length_eq_zero_iff.mp scopeEmpty] at present
        contradiction
      have callInstances : ∀ rightRecord, rightSelected.kind = .called rightRecord →
          rightSelected.created.id.processInstanceId ≠ leftSelected.created.id.processInstanceId := by
        intro rightRecord rightCalled same
        obtain ⟨_, _, _, rightRoot, rightDerived, _⟩ :=
          scopeCreation_selection_call_facts state rightOperation rightSelected rightRecord instanceId
            rightRunning rightSelection rightCalled
        have derivedEqual : deriveCalledProcessInstanceId instanceId ⟨rightRecord.id.elementId.value⟩ rightRecord.id.activation =
            deriveCalledProcessInstanceId instanceId ⟨leftRecord.id.elementId.value⟩ leftRecord.id.activation := by
          rw [← rightDerived, ← leftDerived, ← rightRoot, ← leftRoot]
          exact same
        have keysEqual := (calledProcessIdentityTuple_injective _ _ _ _ _ _ derivedEqual).2.1
        exact callKeys leftRecord rightRecord leftCalled rightCalled (congrArg NodeId.value keysEqual)
      have newInstanceDifferent : rightSelected.created.id.processInstanceId ≠ leftSelected.created.id.processInstanceId := by
        cases kind : rightSelected.kind with
        | child =>
            have facts := scopeCreation_selection_child_facts state rightOperation rightSelected instanceId
              rightRunning rightSelection kind
            rw [facts.2.1]
            exact Ne.symm notHosting
        | called record => exact callInstances record kind
      refine ⟨associations, callActivationCount_population_frame state (rightSelected.apply state)
        ⟨leftRecord.id.elementId.value⟩ (callCounter leftRecord leftCalled), ?_, ?_, ?_⟩
      · apply scopeCreation_call_population_empty state rightSelected _ callerEmpty
        intro rightRecord rightCalled
        simp [callKeys leftRecord rightRecord leftCalled rightCalled]
      · rw [scopeCreation_apply_scope_filter state rightSelected _ (by simpa using newInstanceDifferent)]
        exact scopeEmpty
      · apply scopeCreation_call_population_empty state rightSelected _ collisionEmpty
        intro rightRecord rightCalled
        have keysDifferent := callKeys leftRecord rightRecord leftCalled rightCalled
        have idsDifferent : rightRecord.id ≠ leftRecord.id := by
          intro same
          exact keysDifferent (congrArg (fun id : OccurrenceId => id.elementId.value) same)
        have root := (scopeCreation_selection_call_facts state rightOperation rightSelected rightRecord instanceId
          rightRunning rightSelection rightCalled).2.2.2.1
        simp [idsDifferent, ← root, newInstanceDifferent]
  exact prepareInternalScopeCreation_read_frame program state (rightSelected.apply state) leftOperation _
    leftFound selectionAfter (scopeCreation_apply_control state rightSelected) (scopeCreation_apply_time state rightSelected)
    ownerFrame inputFrame entryFrame (scopeCreation_counter_read_frame state (rightSelected.apply state)
      leftSelected childCounter callCounter)

theorem prepared_scope_creation_pair_preserves_preparation
    (program : Program) (instanceId : SemanticId) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalScopeCreation)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (leftFound : prepareInternalScopeCreation? program state leftOperation = some left)
    (rightFound : prepareInternalScopeCreation? program state rightOperation = some right)
    (separated : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    prepareInternalScopeCreation? program (right.selection.apply state) leftOperation = some left ∧
      prepareInternalScopeCreation? program (left.selection.apply state) rightOperation = some right := by
  exact ⟨prepareInternalScopeCreation_after_independent program instanceId state leftOperation rightOperation
    left right programWF stateWF leftFound rightFound separated,
    prepareInternalScopeCreation_after_independent program instanceId state rightOperation leftOperation
      right left programWF stateWF rightFound leftFound (localControlStateFootprintsNonInterfering_symm _ _ separated)⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
