import BpmnSemantics.SemanticProcess.InternalPreparedTransition

/-! The subscription proof-domain amendment excludes pairs through the immutable admitted
Program and exact predecessor preparation, without changing footprint independence. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_transition_operation_member (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (valid : programWellFormed program = true)
    (found : prepared.Prepared program state) : prepared.operation ∈ program.operations := by
  have fromCensus (operation : SemanticOperation) (predicate : SemanticOperation → Bool)
      (census : program.operations.filter predicate = [operation]) : operation ∈ program.operations :=
    (List.mem_filter.mp (show operation ∈ program.operations.filter predicate by rw [census]; simp)).1
  have fromSelection (operation : SemanticOperation) (owner : ScopeOccurrenceId)
      (selected : exactProgramSelection program operation owner = true) : operation ∈ program.operations := by
    obtain ⟨_, census, _⟩ := exactProgramSelection_parts program operation owner valid selected
    exact fromCensus operation _ census
  cases prepared with
  | arming arm =>
      cases arm with
      | ordinary operation patch =>
          have selected := (prepared_arm_selection_unique program state operation patch found).1
          rw [prepared_operation_eq program state operation patch found] at selected
          exact fromSelection operation patch.owner selected
      | data contract patch =>
          obtain ⟨owner, _, _, _, _, selected, _⟩ :=
            prepareInternalDataArmingContract_facts program state contract patch found
          exact fromSelection contract.operation owner selected
  | timerTask contract patch =>
      obtain ⟨_, owner, _, _, _, _, _, selected, _⟩ :=
        prepareInternalTimerTaskContract_facts program state contract patch found
      exact fromSelection contract.operation owner selected
  | messageTask contract patch =>
      obtain ⟨_, owner, _, _, _, _, _, selected, _⟩ :=
        prepareInternalMessageTaskContract_facts program state contract patch found.2
      exact fromSelection contract.operation owner selected
  | boundedScope contract scope =>
      obtain ⟨_, _, _, _, _, _, _, _, _, census, _⟩ :=
        prepareInternalBoundedScope_facts program state contract scope found.2
      exact fromCensus contract.operation _ census
  | localControl control =>
      obtain ⟨selection, origin, _, identity, _, _, _, _, _, _, _, _, _, selected, _, _⟩ :=
        prepareInternalLocalControl_facts program state control.operation control found
      exact candidateOperationFlowNodeIdentity?_operation_member program control.operation
        selection.owner selection.owner origin.elementId identity selected
  | scopeCreation scope =>
      obtain ⟨_, _, _, _, _, _, _, _, _, _, census, _⟩ :=
        prepareInternalScopeCreation_facts program state scope.selection.operation scope found
      exact fromCensus scope.selection.operation _ census
  | regional regional =>
      exact fromCensus regional.selection.operation _
        (prepareInternalRegional_facts program state regional.selection.operation regional found).2.1
  | ordinaryEnd ending =>
      obtain ⟨_, selection, origin, _, identity, _, _, _, _, _, _, _, selected, _, _⟩ :=
        prepareInternalEnd_facts program state ending.operation ending found
      exact candidateOperationFlowNodeIdentity?_operation_member program ending.operation
        selection.owner selection.owner origin.elementId identity selected
  | mergeInput merge =>
      obtain ⟨_, selection, _, identity, _, _, _, _, _, _, _, selected, _, _⟩ :=
        prepareInternalMerge_facts program state merge.selection.operation merge.selection.alternative merge found
      exact candidateOperationFlowNodeIdentity?_operation_member program merge.selection.operation
        selection.owner selection.owner merge.selection.operation.origin.elementId identity selected

theorem prepared_subscription_operation_allowed (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (admitted : subscriptionPreparationAdmitted program)
    (found : prepared.Prepared program state) : repeatableSubscriptionOperationAllowed prepared.operation = true :=
  repeatableSubscriptionProgramGraph_operation program admitted.2.2 prepared.operation
    (prepared_transition_operation_member program state prepared admitted.2.1 found)

theorem prepared_subscription_boundaries_same (program : Program) (state : RuntimeState)
    (left right : PreparedInternalTransition) (admitted : subscriptionPreparationAdmitted program)
    (leftFound : left.Prepared program state) (rightFound : right.Prepared program state)
    (leftBoundary : repeatableSubscriptionBoundaryOperation left.operation = true)
    (rightBoundary : repeatableSubscriptionBoundaryOperation right.operation = true) :
    left.operation = right.operation :=
  repeatableSubscriptionProgramGraph_boundary_unique program admitted.2.2 left.operation right.operation
    (prepared_transition_operation_member program state left admitted.2.1 leftFound)
    (prepared_transition_operation_member program state right admitted.2.1 rightFound) leftBoundary rightBoundary

theorem prepared_subscription_data_impossible (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (admitted : subscriptionPreparationAdmitted program)
    (found : prepareInternalDataArmingContract? program state contract = some patch) : False := by
  have allowed := prepared_subscription_operation_allowed program state (.arming (.data contract patch)) admitted found
  cases data : contract.data <;>
    simp [PreparedInternalTransition.operation, PreparedInternalArming.operation,
      InternalDataArmingContract.operation, data, repeatableSubscriptionOperationAllowed] at allowed

theorem prepared_subscription_merge_impossible (program : Program) (state : RuntimeState)
    (merge : PreparedInternalMerge) (admitted : subscriptionPreparationAdmitted program)
    (found : prepareInternalMerge? program state merge.selection.operation merge.selection.alternative = some merge) : False := by
  have allowed := prepared_subscription_operation_allowed program state (.mergeInput merge) admitted found
  obtain ⟨selected, _, _, _, selection, _⟩ := (prepareInternalMerge_facts program state
    merge.selection.operation merge.selection.alternative merge found).2
  obtain ⟨_, _, id, origin, inputs, operation, _⟩ :=
    selectInternalMerge_facts state merge.selection.operation merge.selection.alternative selected selection
  simp only [PreparedInternalTransition.operation, operation, repeatableSubscriptionOperationAllowed] at allowed
  contradiction

theorem prepared_message_task_pair_dependent (program : Program) (state : RuntimeState)
    (leftContract rightContract : InternalMessageTaskContract) (left right : InternalMessageTaskPatch)
    (leftFound : (PreparedInternalTransition.messageTask leftContract left).Prepared program state)
    (rightFound : (PreparedInternalTransition.messageTask rightContract right).Prepared program state) :
    ¬ (PreparedInternalTransition.messageTask leftContract left).Independent (.messageTask rightContract right) := by
  intro independent
  have same := prepared_subscription_boundaries_same program state
    (.messageTask leftContract left) (.messageTask rightContract right) leftFound.1 leftFound rightFound
    (by cases kind : leftContract.kind <;> simp [PreparedInternalTransition.operation,
      InternalMessageTaskContract.operation, kind, repeatableSubscriptionBoundaryOperation])
    (by cases kind : rightContract.kind <;> simp [PreparedInternalTransition.operation,
      InternalMessageTaskContract.operation, kind, repeatableSubscriptionBoundaryOperation])
  have contracts : leftContract = rightContract := by
    have equal := congrArg messageTaskContract? same
    simpa only [PreparedInternalTransition.operation, messageTaskContract_roundtrip, Option.some.injEq] using equal
  subst rightContract
  have patches : left = right := Option.some.inj (leftFound.2.symm.trans rightFound.2)
  subst right
  have written : .ordinary (.tokenOwners left.arm.input) ∈ (messageTaskStateFootprint left).writes := by
    simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem]
  have conflict := regional_independent_write_write _ _ independent _ _ written written
  simp [regionalStateAtomsConflict] at conflict

theorem prepared_bounded_scope_pair_dependent (program : Program) (state : RuntimeState)
    (leftContract rightContract : InternalBoundedScopeContract) (left right : PreparedInternalBoundedScope)
    (leftFound : (PreparedInternalTransition.boundedScope leftContract left).Prepared program state)
    (rightFound : (PreparedInternalTransition.boundedScope rightContract right).Prepared program state) :
    ¬ (PreparedInternalTransition.boundedScope leftContract left).Independent (.boundedScope rightContract right) := by
  intro independent
  have same := prepared_subscription_boundaries_same program state
    (.boundedScope leftContract left) (.boundedScope rightContract right) leftFound.1 leftFound rightFound
    (by cases disposition : leftContract.disposition <;> simp [PreparedInternalTransition.operation,
      InternalBoundedScopeContract.operation, disposition, repeatableSubscriptionBoundaryOperation])
    (by cases disposition : rightContract.disposition <;> simp [PreparedInternalTransition.operation,
      InternalBoundedScopeContract.operation, disposition, repeatableSubscriptionBoundaryOperation])
  have contracts : leftContract = rightContract := by
    have equal := congrArg boundedScopeContract? same
    simpa only [PreparedInternalTransition.operation, boundedScopeContract_roundtrip, Option.some.injEq] using equal
  subst rightContract
  have preparations : left = right := Option.some.inj (leftFound.2.symm.trans rightFound.2)
  subst right
  obtain ⟨selected, hosting, owner, _, _, _, _, _, _, _, _, _, _, _, _, _, preparedEq⟩ :=
    prepareInternalBoundedScope_facts program state leftContract left leftFound.2
  have written : .ordinary (.activation .timer selected.timer.elementId) ∈ left.footprint.writes := by
    simp [preparedEq, makeInternalBoundedScopePreparation, boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem]
  have conflict := regional_independent_write_write _ _ independent _ _ written written
  simp [regionalStateAtomsConflict] at conflict

theorem prepared_message_bounded_scope_impossible (program : Program) (state : RuntimeState)
    (messageContract : InternalMessageTaskContract) (message : InternalMessageTaskPatch)
    (scopeContract : InternalBoundedScopeContract) (scope : PreparedInternalBoundedScope)
    (messageFound : (PreparedInternalTransition.messageTask messageContract message).Prepared program state)
    (scopeFound : (PreparedInternalTransition.boundedScope scopeContract scope).Prepared program state) : False := by
  have same := prepared_subscription_boundaries_same program state
    (.messageTask messageContract message) (.boundedScope scopeContract scope) messageFound.1 messageFound scopeFound
    (by cases kind : messageContract.kind <;> simp [PreparedInternalTransition.operation,
      InternalMessageTaskContract.operation, kind, repeatableSubscriptionBoundaryOperation])
    (by cases disposition : scopeContract.disposition <;> simp [PreparedInternalTransition.operation,
      InternalBoundedScopeContract.operation, disposition, repeatableSubscriptionBoundaryOperation])
  cases kind : messageContract.kind <;> cases disposition : scopeContract.disposition <;>
    simp [PreparedInternalTransition.operation, InternalMessageTaskContract.operation,
      InternalBoundedScopeContract.operation, kind, disposition] at same

theorem prepared_subscription_scope_creation_is_child (program : Program) (state : RuntimeState)
    (creation : PreparedInternalScopeCreation) (admitted : subscriptionPreparationAdmitted program)
    (found : prepareInternalScopeCreation? program state creation.selection.operation = some creation) :
    (repeatableSubscriptionChildScope? creation.selection.operation).isSome = true := by
  have allowed := prepared_subscription_operation_allowed program state (.scopeCreation creation) admitted found
  obtain ⟨_, _, _, origin, _, _, _, _, _, _, _, _, originFound, _⟩ :=
    prepareInternalScopeCreation_facts program state creation.selection.operation creation found
  cases operation : creation.selection.operation <;>
    simp_all only [internalScopeCreationOrigin?, repeatableSubscriptionChildScope?,
      PreparedInternalTransition.operation, repeatableSubscriptionOperationAllowed, Option.isSome_some,
      Option.isSome_none, reduceCtorEq]

theorem prepared_bounded_scope_creation_impossible (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (bounded : PreparedInternalBoundedScope)
    (creation : PreparedInternalScopeCreation)
    (boundedFound : (PreparedInternalTransition.boundedScope contract bounded).Prepared program state)
    (creationFound : prepareInternalScopeCreation? program state creation.selection.operation = some creation) : False := by
  have member := prepared_transition_operation_member program state (.boundedScope contract bounded)
    boundedFound.1.2.1 boundedFound
  have otherMember := prepared_transition_operation_member program state (.scopeCreation creation)
    boundedFound.1.2.1 creationFound
  have child := prepared_subscription_scope_creation_is_child program state creation boundedFound.1 creationFound
  have same := repeatableSubscriptionProgramGraph_child_unique program boundedFound.1.2.2
    contract.operation creation.selection.operation member otherMember
    (by cases disposition : contract.disposition <;>
      simp [InternalBoundedScopeContract.operation, disposition, repeatableSubscriptionChildScope?]) child
  obtain ⟨_, _, _, origin, _, _, _, _, _, _, _, _, originFound, _⟩ :=
    prepareInternalScopeCreation_facts program state creation.selection.operation creation creationFound
  rw [← same] at originFound
  cases disposition : contract.disposition <;>
    simp [InternalBoundedScopeContract.operation, disposition, internalScopeCreationOrigin?] at originFound

end BpmnSemantics.SemanticProcess.InternalCommutation
