import BpmnSemantics.SemanticProcess.InternalBoundedScopeOrdinaryFrames
import BpmnSemantics.SemanticProcess.InternalBoundedScopeTokenPairs
import BpmnSemantics.SemanticProcess.InternalSubscriptionPairExclusions
import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationOwnership
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationAcceptance

/-! The selected subscription child-entry pairs reuse complete raw preparation laws.
The immutable admission certificate excludes other composite and child declarations. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem subscription_nonroot_definition_unique (program : Program)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (left right : DefinitionScope) (leftMember : left ∈ program.definitionScopes)
    (rightMember : right ∈ program.definitionScopes)
    (leftChild : left.parentScopeId ≠ none) (rightChild : right.parentScopeId ≠ none) : left = right := by
  obtain ⟨_, root, rootMember, rootParent, _⟩ := repeatableSubscriptionProgramGraph_scope_forest program admitted
  simp only [repeatableSubscriptionProgramGraph, Bool.and_eq_true] at admitted
  have shape := admitted.1.1.1.1.1
  simp only [repeatableSubscriptionProgramShape, Bool.and_eq_true] at shape
  have sizes : program.definitionScopes.length = 1 ∨ program.definitionScopes.length = 2 := by
    simpa only [Bool.or_eq_true, beq_iff_eq] using shape.1.1.1.1.1.1
  generalize program.definitionScopes = scopes at sizes rootMember leftMember rightMember
  cases scopes with
  | nil => simp at leftMember
  | cons first rest =>
      cases rest with
      | nil => simp_all
      | cons second rest =>
          cases rest with
          | nil =>
              simp only [List.mem_cons, List.not_mem_nil, or_false] at rootMember leftMember rightMember
              rcases rootMember with rfl | rfl <;>
                rcases leftMember with rfl | rfl <;>
                rcases rightMember with rfl | rfl <;> simp_all
          | cons third rest => simp at sizes

private theorem bounded_subscription_live_scope_parentless (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (contract : InternalBoundedScopeContract) (bounded : PreparedInternalBoundedScope)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (found : (PreparedInternalTransition.boundedScope contract bounded).Prepared program state)
    (scope : RuntimeScopeOccurrence) (member : scope ∈ state.scopeOccurrences) : scope.parent = none := by
  have admitted := found.1.2.2
  obtain ⟨selected, hosting, owner, definition, start, delta, selection, running, _, _, _, definitionFound,
    checked, _, _, _, rfl⟩ := prepareInternalBoundedScope_facts program state contract bounded found.2
  have control : state.control = .running hosting := by
    cases control : state.control <;> simp_all [runningInstance?]
  have position : runtimePositionValid program instanceId state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  obtain ⟨_, liveDefinition, liveMember, liveId, parentBinding⟩ :=
    runtimePositionValid_scope_parent_binding program instanceId hosting state position control scope member
  rcases parentBinding with parentless | ⟨parent, scopeParent, definitionParent, _⟩
  · exact parentless.2
  · have fields := (internalScopeCreationPredecessorChecks_facts program state contract.entryOperation
      selected.creation contract.origin definition checked).2.1
    simp only [InternalBoundedScopeContract.entryOperation, internalScopeCreationDefinitionMatches,
      Bool.and_eq_true, decide_eq_true_eq] at fields
    have definitionMember : definition ∈ program.definitionScopes := by
      have census := definition_singleton program _ definition definitionFound
      exact (List.mem_filter.mp (show definition ∈ program.definitionScopes.filter
        (fun candidate => decide (candidate.id = selected.creation.created.id.definitionScopeId)) by rw [census]; simp)).1
    have same := subscription_nonroot_definition_unique program admitted definition liveDefinition
      definitionMember liveMember (by simp [fields.1.2]) (by simp [definitionParent])
    have id : scope.id.definitionScopeId = contract.definition := liveId.symm.trans (same ▸ fields.1.1)
    obtain ⟨entry, entryFound, _⟩ := selectInternalBoundedScope_facts state contract selected selection
    have refused := scopeCreation_child_definition_population_refused state contract.operationId contract.origin
      contract.input contract.entry contract.definition scope member id
    change selectInternalScopeCreation? state contract.entryOperation = none at refused
    rw [refused] at entryFound
    contradiction

private theorem bounded_subscription_regional_dependent (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (contract : InternalBoundedScopeContract) (bounded : PreparedInternalBoundedScope)
    (regional : PreparedInternalRegional) (valid : runtimeStateWellFormed program instanceId state = true)
    (found : (PreparedInternalTransition.boundedScope contract bounded).Prepared program state)
    (regionalFound : (PreparedInternalTransition.regional regional).Prepared program state)
    (independent : (PreparedInternalTransition.boundedScope contract bounded).Independent (.regional regional)) : False := by
  have allowed := prepared_subscription_operation_allowed program state (.regional regional) found.1 regionalFound
  have facts := prepareInternalRegional_facts program state regional.selection.operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program state regional.selection.operation regional.selection facts.2.2.2.1).1
  have rootMember := regionalSelection_root_member program state regional.selection.operation regional.selection selected
  have parentless := bounded_subscription_live_scope_parentless program state instanceId contract bounded
    valid found regional.selection.root rootMember
  have reverse := PreparedInternalTransition.independent_symm independent
  obtain ⟨selection, hosting, owner, _, _, _, _, running, _, _, ownerCensus, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found.2
  have control : state.control = .running hosting := by
    cases control : state.control <;> simp_all [runningInstance?]
  have footprint := facts.2.2.2.2.2.1
  have noWrite : .ordinary (.runtimeControl hosting) ∉ regional.footprint.writes := by
    intro written
    have read : .ordinary (.runtimeControl hosting) ∈ (boundedScopeStateFootprint selection hosting owner).reads := by
      simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem, liftRegionalStateFootprint,
        internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy, liftRegionalStateAtom]
    have conflict := regional_independent_read_write _ _ reverse _ _ written read
    simp [regionalStateAtomsConflict] at conflict
  cases operation : regional.selection.operation with
  | completeScope id origin definition output =>
      rw [operation] at selected
      obtain ⟨withdrawal, kind, _⟩ := regionalSelection_complete_census program state id origin definition output regional.selection selected
      exact (regional_completion_nonroot_of_control_read state hosting regional.selection regional.region
        regional.footprint control footprint noWrite withdrawal kind) parentless
  | terminateScope id origin input definition =>
      rw [operation] at selected
      have chosen := (regionalSelection_terminate_owner program state id origin input definition regional.selection selected).1
      have hostingRoot := selectedTerminateOwner_hosting program state hosting id origin input definition regional.selection.root.id control chosen
      have position := runtimeStateWellFormed_position program instanceId state valid
      have ownerMember : owner ∈ state.scopeOccurrences.filter (fun candidate => decide (candidate.id = selection.creation.owner)) := by
        rw [ownerCensus]; simp
      obtain ⟨ownerMember, ownerId⟩ := List.mem_filter.mp ownerMember
      have ownerId := of_decide_eq_true ownerId
      have inside := hosting_cancellation_covers_live_scope program state instanceId hosting position control
        regional.selection.root rootMember parentless hostingRoot owner ownerMember
      have outside := (scopeCreation_regional_outside state regional.selection regional.region regional.footprint
        selection.creation hosting owner footprint (boundedScope_other_child_independent _ selection hosting owner reverse)).1
      have live : selection.creation.owner ∈ state.scopeOccurrences.map (·.id) := List.mem_map.mpr ⟨owner, ownerMember, ownerId⟩
      have mask := regional_cancellation_mask program state instanceId hosting position control regional.selection.root.id
        regional.region facts.2.2.2.2.1 selection.creation.owner live
      rw [ownerId] at inside
      rw [inside, outside] at mask
      contradiction
  | returnProcess _ _ _ | throwError _ _ _ _ _ =>
      simp [PreparedInternalTransition.operation, operation, repeatableSubscriptionOperationAllowed] at allowed
  | _ => simp [operation, selectInternalRegional?] at selected

theorem prepared_bounded_scope_transition_pair (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (other : PreparedInternalTransition)
    (_programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (boundedFound : (PreparedInternalTransition.boundedScope contract bounded).Prepared program state)
    (otherFound : other.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (independent : (PreparedInternalTransition.boundedScope contract bounded).Independent other) :
    other.Prepared program (bounded.selection.apply state) ∧
      (PreparedInternalTransition.boundedScope contract bounded).Prepared program (other.apply program state) ∧
      other.apply program (bounded.selection.apply state) =
        bounded.selection.apply (other.apply program state) := by
  cases other with
  | timerTask timerContract patch =>
      have same := prepared_subscription_boundaries_same program state
        (.boundedScope contract bounded) (.timerTask timerContract patch) boundedFound.1 boundedFound otherFound
        (by cases disposition : contract.disposition <;> simp [PreparedInternalTransition.operation,
          InternalBoundedScopeContract.operation, disposition, repeatableSubscriptionBoundaryOperation])
        (by cases kind : timerContract.kind <;> simp [PreparedInternalTransition.operation,
          InternalTimerTaskContract.operation, kind, repeatableSubscriptionBoundaryOperation])
      cases disposition : contract.disposition <;> cases kind : timerContract.kind <;>
        simp [PreparedInternalTransition.operation, InternalBoundedScopeContract.operation,
          InternalTimerTaskContract.operation, disposition, kind] at same
  | messageTask messageContract patch =>
      exact False.elim (prepared_message_bounded_scope_impossible program state messageContract patch
        contract bounded otherFound boundedFound)
  | boundedScope otherContract other =>
      exact False.elim (prepared_bounded_scope_pair_dependent program state contract otherContract
        bounded other boundedFound otherFound independent)
  | arming arm =>
      cases arm with
      | ordinary operation patch =>
          have pair := prepared_bounded_scope_ordinary_pair program state contract bounded operation patch
            boundedFound.2 otherFound canonical independent
          exact ⟨pair.2.1, ⟨boundedFound.1, pair.1⟩, pair.2.2⟩
      | data dataContract patch =>
          exact False.elim (prepared_subscription_data_impossible program state dataContract patch boundedFound.1 otherFound)
  | localControl control =>
      have pair := prepared_bounded_scope_local_control_pair program state contract bounded control.operation control
        boundedFound.2 otherFound canonical independent
      exact ⟨pair.2.1, ⟨boundedFound.1, pair.1⟩, pair.2.2⟩
  | scopeCreation creation =>
      exact False.elim (prepared_bounded_scope_creation_impossible program state contract bounded creation
        boundedFound otherFound)
  | ordinaryEnd ending =>
      have pair := prepared_bounded_scope_end_pair program state contract bounded ending.operation ending
        boundedFound.2 otherFound canonical independent
      exact ⟨pair.2.1, ⟨boundedFound.1, pair.1⟩, pair.2.2⟩
  | mergeInput merge =>
      exact False.elim (prepared_subscription_merge_impossible program state merge boundedFound.1 otherFound)
  | regional regional =>
      exact False.elim (bounded_subscription_regional_dependent program state instanceId contract bounded regional
        stateValid boundedFound otherFound independent)

end BpmnSemantics.SemanticProcess.InternalCommutation
