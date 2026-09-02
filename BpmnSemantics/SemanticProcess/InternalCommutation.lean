import BpmnSemantics.SemanticProcess.InternalCommutationOpenProjection

/-! # Classified internal commutation

Defines the public exact-two independence classifier and proves exact state and canonical-order commutation for every admitted classified pair.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open InternalCommutation

namespace InternalCommutation

theorem not_mem_right_of_listsDisjoint [DecidableEq α] (left right : List α)
    (separated : listsDisjoint left right = true) (value : α)
    (present : value ∈ left) : value ∉ right := by
  unfold listsDisjoint at separated
  rw [List.all_eq_true] at separated
  have absent := separated value present
  simpa [List.contains_eq_mem] using absent

theorem flowNodeLifecycle_mem_footprint_publications (patch : InternalArmingPatch) :
    .flowNodeLifecycle patch.write.occurrence ∈ (footprintOfPatch patch).publications := by
  simp [footprintOfPatch, canonicalPublicationAtomSet, mem_sortBy]

theorem activation_mem_footprint_writes (patch : InternalArmingPatch) :
    .activation patch.write.kind patch.write.elementId ∈ (footprintOfPatch patch).writes := by
  simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]

theorem activation_mem_footprint_reads (patch : InternalArmingPatch) :
    .activation patch.write.kind patch.write.elementId ∈ (footprintOfPatch patch).reads := by
  simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]

theorem noninterfering_occurrence_ne (left right : InternalArmingPatch) (separated : footprintsNonInterfering (footprintOfPatch left) (footprintOfPatch right) = true) :
    left.write.occurrence ≠ right.write.occurrence := by
  intro same
  simp only [footprintsNonInterfering, Bool.and_eq_true] at separated
  have excluded := not_mem_right_of_listsDisjoint
    (footprintOfPatch left).publications (footprintOfPatch right).publications
    separated.2 (.flowNodeLifecycle left.write.occurrence)
    (flowNodeLifecycle_mem_footprint_publications left)
  apply excluded
  simpa [same] using flowNodeLifecycle_mem_footprint_publications right

theorem noninterfering_same_kind_element_ne (left right : InternalArmingPatch) (sameKind : left.write.kind = right.write.kind) (separated : footprintsNonInterfering (footprintOfPatch left) (footprintOfPatch right) = true) :
    left.write.elementId ≠ right.write.elementId := by
  intro same
  simp only [footprintsNonInterfering, Bool.and_eq_true] at separated
  have excluded := not_mem_right_of_listsDisjoint
    (footprintOfPatch left).writes (footprintOfPatch right).reads separated.1.1.1
    (.activation left.write.kind left.write.elementId)
    (activation_mem_footprint_writes left)
  apply excluded
  simpa [sameKind, same] using activation_mem_footprint_reads right

theorem applyInternalArmingPatches_commute (state : RuntimeState) (left right : InternalArmingPatch) (canonical : canonicalCollectionOrder state = true) (separated : footprintsNonInterfering (footprintOfPatch left) (footprintOfPatch right) = true) :
    applyInternalArmingPatch (applyInternalArmingPatch state left) right =
      applyInternalArmingPatch (applyInternalArmingPatch state right) left := by
  have elementDistinct : left.write.kind = right.write.kind → left.write.elementId ≠ right.write.elementId := fun sameKind => noninterfering_same_kind_element_ne left right sameKind separated
  have occurrenceDistinct := noninterfering_occurrence_ne left right separated
  have updateOrders := canonicalCollectionOrder_internalArmingOrders state canonical
  clear separated
  cases left with
  | mk leftOperation _ _ leftOrigin leftRuntimeInstanceId leftLogicalTimeMs leftInput leftInputOrigin leftOwner leftWrite =>
      cases right with
      | mk rightOperation _ _ rightOrigin rightRuntimeInstanceId rightLogicalTimeMs rightInput rightInputOrigin rightOwner rightWrite =>
          cases leftWrite <;> cases rightWrite <;>
            simp_all [applyInternalArmingPatch, canonicalCollectionOrder,
              InternalArmingWrite.kind, InternalArmingWrite.elementId,
              InternalArmingWrite.occurrence, removeToken_commutes]
          all_goals
            constructor
            · apply Eq.symm
              first | apply insertUserTaskWait_commutes | apply insertMessageWait_commutes | apply insertTimerWait_commutes | apply insertEffectWait_commutes
              intro same; first | exact elementDistinct same | exact elementDistinct (congrArg (fun id => id.value) same)
          all_goals
            first | apply setActivationCount_commutes_of_ordered | apply setMessageActivationCount_commutes_of_ordered | apply setTimerActivationCount_commutes_of_ordered | skip
          all_goals
            first | exact elementDistinct | (intro same; exact elementDistinct (congrArg (fun id => id.value) same)) | exact updateOrders.1 | exact updateOrders.2.1 | exact updateOrders.2.2.1 | skip
          all_goals
            constructor
            · apply insertActivityVariableScope_commutes
              intro same; simp_all
            · exact setEffectActivationCount_commutes_of_ordered _ _ _ _ elementDistinct _ updateOrders.2.2.2.1

theorem filterTokens_removeToken_other (tokens : List ControlToken) (removed queried : ControlPlaceId) (owner : ScopeOccurrenceId) (different : removed ≠ queried) : (removeToken tokens removed owner).filter (fun token => decide (token.placeId = queried)) = tokens.filter (fun token => decide (token.placeId = queried)) := by
  induction tokens with
  | nil => rfl
  | cons token rest ih =>
      by_cases removedHere : token.placeId = removed ∧ token.owner = owner
      · have notQueried : token.placeId ≠ queried := fun same => different (removedHere.1.symm.trans same)
        have removeTrue : (decide (token.placeId = removed) && decide (token.owner = owner)) = true := by simp [removedHere]
        simp [removeToken, removeTrue, notQueried]
      · have removeFalse : (decide (token.placeId = removed) && decide (token.owner = owner)) = false := by simpa [Bool.and_eq_true] using removedHere
        simp [removeToken, removeFalse, List.filter_cons, ih]

theorem armingOwnerRead_frame (state : RuntimeState) (left : InternalArmingPatch) (queried : ControlPlaceId) (different : left.input ≠ queried) : onlyTokenOwner? (applyInternalArmingPatch state left) queried = onlyTokenOwner? state queried := by
  cases left with | mk _ _ _ _ _ _ input _ owner write => cases write <;> simp only [applyInternalArmingPatch] <;> unfold onlyTokenOwner? tokenOwners <;> rw [filterTokens_removeToken_other state.tokens input queried owner different]

theorem taskActivationRead_set_other (state : RuntimeState) (target : TaskDefinitionId) (query : NodeId) (count : Nat) (different : (⟨target.value⟩ : NodeId) ≠ query) : taskActivationCount (setActivationCount state.activations target count) ⟨query.value⟩ = taskActivationCount state.activations ⟨query.value⟩ := by
  have other : (⟨query.value⟩ : TaskDefinitionId) ≠ target := by intro same; apply different; cases target; cases query; simp_all
  simpa [activationCount] using activationCount_setActivationCount_other state target ⟨query.value⟩ count other
theorem messageActivationRead_set_other (state : RuntimeState) (target query : NodeId) (count : Nat) (different : target ≠ query) : elementActivationCount ((setMessageActivationCount state.messageActivations target count).map fun value => (value.elementId, value.count)) query = elementActivationCount (state.messageActivations.map fun value => (value.elementId, value.count)) query := by
  simpa [messageActivationCount] using messageActivationCount_set_other state target query count (Ne.symm different)
theorem timerActivationRead_set_other (state : RuntimeState) (target query : NodeId) (count : Nat) (different : target ≠ query) : elementActivationCount ((setTimerActivationCount state.timerActivations target count).map fun value => (value.elementId, value.count)) query = elementActivationCount (state.timerActivations.map fun value => (value.elementId, value.count)) query := by
  simpa [timerActivationCount] using timerActivationCount_set_other state target query count (Ne.symm different)
theorem effectActivationRead_set_other (state : RuntimeState) (target query : NodeId) (count : Nat) (different : target ≠ query) : elementActivationCount ((setEffectActivationCount state.effectActivations target count).map fun value => (value.elementId, value.count)) query = elementActivationCount (state.effectActivations.map fun value => (value.elementId, value.count)) query := by
  simpa [effectActivationCount] using effectActivationCount_set_other state target query count (Ne.symm different)

def internalActivationCount (state : RuntimeState) (kind : InternalWaitKind) (element : NodeId) : Nat := match kind with | .userTask => activationCount state ⟨element.value⟩ | .message => messageActivationCount state element | .timer => timerActivationCount state element | .effect => effectActivationCount state element

theorem armingActivationRead_frame (state : RuntimeState) (left : InternalArmingPatch) (queryKind : InternalWaitKind) (queryElement : NodeId) (different : left.write.kind = queryKind → left.write.elementId ≠ queryElement) : internalActivationCount (applyInternalArmingPatch state left) queryKind queryElement = internalActivationCount state queryKind queryElement := by
  cases left with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> cases queryKind <;> simp_all [internalActivationCount, applyInternalArmingPatch, InternalArmingWrite.kind, InternalArmingWrite.elementId, activationCount, messageActivationCount, timerActivationCount, effectActivationCount, taskActivationRead_set_other, messageActivationRead_set_other, timerActivationRead_set_other, effectActivationRead_set_other]

theorem armingOpenAnchorRead_frame (state : RuntimeState) (left : InternalArmingPatch) (queried : OccurrenceId) (different : left.write.occurrence ≠ queried) : openWaitAnchorAbsent (applyInternalArmingPatch state left) queried = openWaitAnchorAbsent state queried := by
  cases left with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> simp_all [applyInternalArmingPatch, InternalArmingWrite.occurrence, openWaitAnchorAbsent, openWaitAnchors, List.contains_eq_mem, insertUserTaskWait_eq_canonicalInsertBy, insertMessageWait, insertTimerWait, insertEffectWait, mem_canonicalInsertBy]

theorem effectAvailableRead_frame (state : RuntimeState) (left : InternalArmingPatch) (queried : EffectWait) (bindings : List VariableBinding) (different : left.write.occurrence ≠ effectWaitOccurrence queried) : (InternalArmingWrite.effect queried bindings).available (applyInternalArmingPatch state left) = (InternalArmingWrite.effect queried bindings).available state := by
  cases left with | mk _ _ _ _ _ _ _ _ _ write =>
      cases write with
      | userTask _ | message _ | timer _ => rfl
      | effect inserted _ =>
          have fields := occurrence_fields_differ (effectWaitOccurrence inserted) (effectWaitOccurrence queried) different
          have ownerDifferent :
              LocalDataOwner.effectOccurrence (effectWaitOccurrence queried) ≠
                LocalDataOwner.effectOccurrence (effectWaitOccurrence inserted) := by
            intro same
            apply different
            exact (LocalDataOwner.effectOccurrence.inj same).symm
          have reverseFields := occurrence_fields_differ
            (effectWaitOccurrence queried) (effectWaitOccurrence inserted)
            (fun same => ownerDifferent (congrArg LocalDataOwner.effectOccurrence same))
          have reverseFields' :
              queried.processInstanceId ≠ inserted.processInstanceId ∨
                queried.elementId.value ≠ inserted.elementId.value ∨
                  queried.activation ≠ inserted.activation := by
            rcases reverseFields with (process | element) | activation
            · exact Or.inl process
            · exact Or.inr (Or.inl element)
            · exact Or.inr (Or.inr activation)
          simp_all [InternalArmingWrite.available, InternalArmingWrite.occurrence,
            effectWaitOccurrence, applyInternalArmingPatch,
            List.not_any_eq_all_not, insertActivityVariableScope_eq_canonicalInsertBy,
            all_canonicalInsertBy, activityScopeMatches, localDataOwnerMatches]

theorem armingControlRead_frame (state : RuntimeState) (patch : InternalArmingPatch) : (applyInternalArmingPatch state patch).control = state.control := by cases patch with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl
theorem armingTimeRead_frame (state : RuntimeState) (patch : InternalArmingPatch) : (applyInternalArmingPatch state patch).logicalTimeMs = state.logicalTimeMs := by cases patch with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl
theorem armingLiveOwnerRead_frame (state : RuntimeState) (patch : InternalArmingPatch) (owner : ScopeOccurrenceId) : exactLiveOccurrence (applyInternalArmingPatch state patch) owner = exactLiveOccurrence state owner := by cases patch with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl
theorem armingProcessVariablesRead_frame (state : RuntimeState)
    (patch : InternalArmingPatch) :
    (applyInternalArmingPatch state patch).variables.process = state.variables.process := by
  cases patch with
  | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl

theorem noninterfering_prepared_inputs_ne (program : Program) (state : RuntimeState) (leftOperation rightOperation : SemanticOperation) (left right : InternalArmingPatch)
    (leftPrepared : prepareInternalArm? program state leftOperation = some left) (rightPrepared : prepareInternalArm? program state rightOperation = some right)
    (separated : footprintsNonInterfering (footprintOfPatch left) (footprintOfPatch right) = true) : left.input ≠ right.input := by
  intro sameInput
  have leftLookup := prepared_owner_lookup program state leftOperation left leftPrepared
  have rightLookup := prepared_owner_lookup program state rightOperation right rightPrepared
  rw [sameInput, rightLookup] at leftLookup
  have sameOwner := Option.some.inj leftLookup
  simp_all [footprintsNonInterfering, listsDisjoint, footprintOfPatch,
    canonicalStateAtomSet, mem_sortBy]

theorem prepared_patch_frame (program : Program) (state : RuntimeState) (leftOperation rightOperation : SemanticOperation) (left right : InternalArmingPatch) (leftPrepared : prepareInternalArm? program state leftOperation = some left) (rightPrepared : prepareInternalArm? program state rightOperation = some right)
    (separated : footprintsNonInterfering (footprintOfPatch left) (footprintOfPatch right) = true) : prepareInternalArm? program (applyInternalArmingPatch state left) rightOperation = some right := by
  have occurrenceDistinct := noninterfering_occurrence_ne left right separated
  have elementDistinct := fun same => noninterfering_same_kind_element_ne left right same separated
  have inputDistinct := noninterfering_prepared_inputs_ne program state leftOperation rightOperation left right leftPrepared rightPrepared separated
  have activationFrame := armingActivationRead_frame state left right.write.kind right.write.elementId elementDistinct; have anchorFrame := armingOpenAnchorRead_frame state left right.write.occurrence occurrenceDistinct
  have availableFrame : right.write.available (applyInternalArmingPatch state left) = right.write.available state := by
    cases writeEq : right.write <;> simp [InternalArmingWrite.available]
    case effect wait bindings => simpa [InternalArmingWrite.available] using effectAvailableRead_frame state left wait bindings (by rw [writeEq] at occurrenceDistinct; exact occurrenceDistinct)
  have processVariablesFrame := armingProcessVariablesRead_frame state left
  clear leftPrepared separated
  cases rightOperation
  case awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
      correlationPropertyId payloadSelector processPropertySelector =>
    simp [prepareInternalArm?, internalArmInput?, internalArmOrigin?] at rightPrepared
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp rightPrepared
    split at prepared
    · simp at prepared
    · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
        Option.bind_eq_some_iff.mp prepared
      cases controlEq : state.control with
      | notStarted => simp [controlEq] at prepared
      | completed _ => simp [controlEq] at prepared
      | cancelled _ => simp [controlEq] at prepared
      | failed _ _ => simp [controlEq] at prepared
      | running instanceId =>
        simp only [controlEq] at prepared
        cases filteredEq : state.variables.process.bindings.filter fun candidate =>
            candidate.name = processPropertySelector.propertyId with
        | nil => simp [filteredEq] at prepared
        | cons binding rest =>
          cases rest with
          | cons _ _ => simp [filteredEq] at prepared
          | nil =>
            cases valueEq : binding.value with
            | string value =>
              by_cases empty : value = ""
              · simp [filteredEq, valueEq, empty] at prepared
              · simp [filteredEq, valueEq, empty] at prepared
                have correlatedAnchorFrame := anchorFrame
                rw [← prepared.2] at correlatedAnchorFrame
                simp only [InternalArmingWrite.occurrence] at correlatedAnchorFrame
                have anchorAfter := correlatedAnchorFrame.trans prepared.1.1.2
                have correlatedInputDistinct := inputDistinct
                rw [← prepared.2] at correlatedInputDistinct
                have ownerFrame := armingOwnerRead_frame state left input
                  correlatedInputDistinct
                have correlatedActivationFrame := activationFrame
                rw [← prepared.2] at correlatedActivationFrame
                simp only [InternalArmingWrite.kind, InternalArmingWrite.elementId,
                  internalActivationCount] at correlatedActivationFrame
                have correlatedAvailableFrame := availableFrame
                rw [← prepared.2] at correlatedAvailableFrame
                have availableAfter := correlatedAvailableFrame.trans prepared.1.2
                simp only [InternalArmingWrite.kind, InternalArmingWrite.elementId,
                  InternalArmingWrite.occurrence] at activationFrame anchorFrame
                simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?,
                  internalActivationCount, armingControlRead_frame, armingTimeRead_frame,
                  armingLiveOwnerRead_frame]
                simpa only [InternalArmingWrite.occurrence] using anchorAfter
            | boolean _ => simp [filteredEq, valueEq] at prepared
            | integer _ => simp [filteredEq, valueEq] at prepared
            | stringList _ => simp [filteredEq, valueEq] at prepared
            | null => simp [filteredEq, valueEq] at prepared
  all_goals simp [prepareInternalArm?, internalArmInput?, internalArmOrigin?] at rightPrepared
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp rightPrepared
    split at prepared
    · simp at prepared
    · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
      cases controlEq : state.control <;> simp_all
      all_goals
        rcases rightPrepared with ⟨guards, patchEq⟩
        first | subst right | (rcases patchEq with ⟨extraGuard, patchEq⟩; subst right)
        simp only [InternalArmingWrite.kind, InternalArmingWrite.elementId,
          InternalArmingWrite.occurrence] at activationFrame anchorFrame
        simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?, internalActivationCount,
          armingOwnerRead_frame, armingControlRead_frame, armingTimeRead_frame,
          armingLiveOwnerRead_frame, InternalArmingWrite.kind,
          InternalArmingWrite.elementId, InternalArmingWrite.occurrence]


end InternalCommutation

def internalOperationPairIndependent? (program : Program) (state : RuntimeState) : List SemanticOperation → Bool
  | [left, right] =>
      left.id ≠ right.id &&
        (fire? program left state).isSome &&
        (fire? program right state).isSome &&
        match internalTransitionFootprint? program state left,
            internalTransitionFootprint? program state right with
        | some leftFootprint, some rightFootprint =>
            footprintsNonInterfering leftFootprint rightFootprint &&
              footprintsNonInterfering rightFootprint leftFootprint
        | _, _ => false
  | _ => false

private def internalOperationIndependentFrom? (program : Program)
    (state : RuntimeState) (left : SemanticOperation) :
    List SemanticOperation → Bool
  | [] => true
  | right :: rest =>
      internalOperationPairIndependent? program state [left, right] &&
        internalOperationIndependentFrom? program state left rest

private def internalOperationPairsIndependent? (program : Program)
    (state : RuntimeState) : List SemanticOperation → Bool
  | [] => true
  | left :: rest =>
      internalOperationIndependentFrom? program state left rest &&
        internalOperationPairsIndependent? program state rest

/-- A complete finite frontier is independent exactly when it has at least two members and every unordered pair passes the exact pre-state footprint classifier. -/
def internalOperationFrontierPairwiseIndependent? (program : Program)
    (state : RuntimeState) : List SemanticOperation → Bool
  | operations@(_ :: _ :: _) =>
      internalOperationPairsIndependent? program state operations
  | _ => false

private def operationBefore (left right : SemanticOperation) : Bool := left.id.value < right.id.value

def canonicalInternalOperations (operations : List SemanticOperation) : List SemanticOperation := sortBy operationBefore operations

def canonicalEnabledInternalTransitions (transitions : List (SemanticOperation × RuntimeState)) : List (SemanticOperation × RuntimeState) :=
  sortBy (fun left right => operationBefore left.1 right.1) transitions

def fireInternalPair? (program : Program) (state : RuntimeState) (first second : SemanticOperation) : Option RuntimeState := do
  let intermediate ← fire? program first state
  fire? program second intermediate

theorem classified_internal_pair_commutes (program : Program) (state : RuntimeState) (left right : SemanticOperation) (instanceId : SemanticId)
    (programAdmitted : programWellFormed program = true) (stateAdmitted : runtimeStateWellFormed program instanceId state = true) (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (classified : internalOperationPairIndependent? program state [left, right] = true) :
    ∃ leftAfter rightAfter final,
      fire? program left state = some leftAfter ∧
      fire? program right state = some rightAfter ∧
      runtimeStateWellFormed program instanceId leftAfter = true ∧
      runtimeStateWellFormed program instanceId rightAfter = true ∧
      (projectOpenFlowNodeOccurrences? program leftAfter).isSome = true ∧
      (projectOpenFlowNodeOccurrences? program rightAfter).isSome = true ∧
      fire? program right leftAfter = some final ∧
      fire? program left rightAfter = some final ∧
      canonicalCollectionOrder final = true := by
  simp only [internalOperationPairIndependent?, Bool.and_eq_true] at classified
  obtain ⟨⟨⟨_, leftEnabled⟩, rightEnabled⟩, separated⟩ := classified
  have snapshotAbsent := fire_isSome_snapshotDeclaration_is_absent
    program left state leftEnabled
  unfold internalTransitionFootprint? at separated
  generalize leftPrepared : prepareInternalArm? program state left = leftPatch at separated
  generalize rightPrepared : prepareInternalArm? program state right = rightPatch at separated
  cases leftPatch with
  | none => simp at separated
  | some leftPatch =>
      cases rightPatch with
      | none => simp at separated
      | some rightPatch =>
          simp only [Option.map_some, Bool.and_eq_true] at separated
          have canonical := runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateAdmitted
          have leftApplied := prepareInternalArm_applies program state left leftPatch
            snapshotAbsent leftPrepared
          have rightApplied := prepareInternalArm_applies program state right rightPatch
            snapshotAbsent rightPrepared
          have leftPreserved := prepared_arm_preserves_runtime_and_open_set program state left
            leftPatch instanceId programAdmitted stateAdmitted openBefore leftPrepared
          have rightPreserved := prepared_arm_preserves_runtime_and_open_set program state right
            rightPatch instanceId programAdmitted stateAdmitted openBefore rightPrepared
          have rightFrame := prepared_patch_frame program state left right leftPatch rightPatch
            leftPrepared rightPrepared separated.1
          have leftFrame := prepared_patch_frame program state right left rightPatch leftPatch
            rightPrepared leftPrepared separated.2
          have finalPreserved := prepared_arm_preserves_runtime_and_open_set program (applyInternalArmingPatch state leftPatch) right rightPatch instanceId programAdmitted leftPreserved.1 leftPreserved.2 rightFrame
          let final := applyInternalArmingPatch (applyInternalArmingPatch state leftPatch) rightPatch
          refine ⟨applyInternalArmingPatch state leftPatch,
            applyInternalArmingPatch state rightPatch, final, leftApplied, rightApplied,
            leftPreserved.1, rightPreserved.1, leftPreserved.2, rightPreserved.2, ?_, ?_, ?_⟩
          · simpa [final] using prepareInternalArm_applies program
              (applyInternalArmingPatch state leftPatch) right rightPatch snapshotAbsent rightFrame
          · have fired := prepareInternalArm_applies program
              (applyInternalArmingPatch state rightPatch) left leftPatch snapshotAbsent leftFrame
            rw [← applyInternalArmingPatches_commute state leftPatch rightPatch canonical separated.1] at fired
            simpa [final] using fired
          · exact runtimeStateWellFormed_canonicalCollectionOrder program instanceId final finalPreserved.1

end BpmnSemantics.SemanticProcess
