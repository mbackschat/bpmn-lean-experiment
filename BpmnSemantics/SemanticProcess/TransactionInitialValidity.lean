import BpmnSemantics.SemanticProcess.TransactionReachableFrontier
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormedInitialization
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleProofs
import BpmnSemantics.SemanticProcess.ScopeStorageOrder
import BpmnSemantics.SemanticProcess.TokenOrder

/-! # Transaction split-state validity

The admitted Transaction roles and nonempty instance identity derive complete runtime validity and
the exact open child occurrence at the split. The cancellation capsule's retained child register and
canonical scope/token identities supply the base case required by the existing arming laws.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics TransactionProgramRoles

private theorem transaction_scope_inventory (p : Program) (roles : TransactionAdmittedRoles p) :
    p.definitionScopes = [roles.root, roles.child] ∨
      p.definitionScopes = [roles.child, roles.root] := by
  have inventory := roles.scopesExact
  simp only [exactInventory_eq, Bool.and_eq_true, decide_eq_true_eq, beq_iff_eq] at inventory
  have length : p.definitionScopes.length = 2 := inventory.1.2
  cases scopes : p.definitionScopes with
  | nil => simp [scopes] at length
  | cons first rest =>
    cases rest with
    | nil => simp [scopes] at length
    | cons second tail =>
      have empty : tail = [] := by
        apply List.length_eq_zero_iff.mp
        have counted : tail.length + 1 + 1 = 0 + 1 + 1 := by
          simpa only [scopes, List.length_cons, List.length_nil] using length
        omega
      subst tail
      have members := inventory.2
      have distinct := inventory.1.1.1
      simp only [scopes, List.all_cons, List.all_nil, Bool.and_true,
        Bool.and_eq_true, List.contains_iff_mem, List.mem_cons, List.not_mem_nil, or_false] at members
      rcases members.1 with firstRoot | firstChild <;>
        rcases members.2 with secondRoot | secondChild <;>
        simp_all

private theorem transaction_scope_facts (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) :
    roles.root.parentScopeId = none ∧
    roles.root.originElementId ≠ roles.child.originElementId ∧
    p.definitionScopes.filter (fun scope => decide (scope.id = roles.root.id)) = [roles.root] ∧
    p.definitionScopes.filter (fun scope => decide (scope.id = roles.child.id)) = [roles.child] ∧
    uniqueDefinitionScope? p roles.root.id = some roles.root ∧
    uniqueDefinitionScope? p roles.child.id = some roles.child := by
  have root := (unique_filter_facts _ _ _ roles.rootSelected).2
  have parent : roles.root.parentScopeId = none := by simpa using root
  have different := roles.child_scope_ne_root wellFormed
  have originDifferent : roles.root.originElementId ≠ roles.child.originElementId := by
    intro same
    apply different
    apply congrArg DefinitionScopeId.mk
    rw [roles.canonicalRootScope, roles.canonicalChildScope, same]
  rcases transaction_scope_inventory p roles with scopes | scopes <;>
    simp [uniqueDefinitionScope?, scopes, parent, different, Ne.symm different,
      originDifferent, Ne.symm originDifferent]

private theorem transaction_place_filters (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (place : ControlPlace)
    (member : place ∈ p.controlPlaces) :
    p.controlPlaces.filter (fun candidate => decide (candidate.id = place.id)) = [place] ∧
    p.controlPlaces.filter (fun candidate => decide (candidate.origin = place.origin)) = [place] := by
  have unique : (p.controlPlaces.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted p wellFormed)
  constructor
  · exact filter_eq_singleton_of_key_nodup _ (·.id) _ place unique member (by simp)
      (fun _ _ accepted => of_decide_eq_true accepted)
  · apply filter_eq_singleton_of_key_nodup _ (·.id) _ place unique member (by simp)
    intro candidate candidateMember accepted
    have same := of_decide_eq_true accepted
    have left := List.all_eq_true.mp roles.canonicalPlaces candidate candidateMember
    have right := List.all_eq_true.mp roles.canonicalPlaces place member
    simp only [beq_iff_eq] at left right
    apply congrArg ControlPlaceId.mk
    rw [left, right, same]

private theorem transaction_split_scopes (p : Program) (roles : TransactionAdmittedRoles p)
    (instanceId : SemanticId) :
    (transactionSplitState roles instanceId []).scopeOccurrences.Perm
      [{ id := transactionChildOwner roles instanceId,
         parent := some ⟨instanceId, roles.root.id, 1⟩ },
       { id := ⟨instanceId, roles.root.id, 1⟩, parent := none }] := by
  change (canonicalInsertBy scopeOccurrenceBefore _ [_]).Perm _
  simp only [canonicalInsertBy]
  split
  · exact List.Perm.refl _
  · exact List.Perm.swap ..

private theorem transaction_split_scope_filters (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId) :
    let state := transactionSplitState roles instanceId []
    let root : ScopeOccurrenceId := ⟨instanceId, roles.root.id, 1⟩
    let child := transactionChildOwner roles instanceId
    state.scopeOccurrences.filter (fun scope => decide (scope.id = root)) =
      [{ id := root, parent := none }] ∧
    state.scopeOccurrences.filter (fun scope => decide (scope.id = child)) =
      [{ id := child, parent := some root }] ∧
    state.scopeOccurrences.filter (fun scope => scope.id.definitionScopeId == roles.root.id) =
      [{ id := root, parent := none }] ∧
    state.scopeOccurrences.filter (fun scope => scope.id.definitionScopeId == roles.child.id) =
      [{ id := child, parent := some root }] := by
  have different := roles.child_scope_ne_root wellFormed
  have scopes := transaction_split_scopes p roles instanceId
  dsimp only
  constructor
  · apply List.Perm.eq_singleton
    simpa [transactionChildOwner, different, Ne.symm different] using
      scopes.filter (fun scope => decide (scope.id = (⟨instanceId, roles.root.id, 1⟩ : ScopeOccurrenceId)))
  constructor
  · apply List.Perm.eq_singleton
    simpa [transactionChildOwner, different, Ne.symm different] using
      scopes.filter (fun scope => decide (scope.id = transactionChildOwner roles instanceId))
  constructor
  · apply List.Perm.eq_singleton
    simpa [transactionChildOwner, different, Ne.symm different] using
      scopes.filter (fun scope => scope.id.definitionScopeId == roles.root.id)
  · apply List.Perm.eq_singleton
    simpa [transactionChildOwner, different, Ne.symm different] using
      scopes.filter (fun scope => scope.id.definitionScopeId == roles.child.id)

private theorem transaction_split_order (p : Program) (roles : TransactionAdmittedRoles p)
    (instanceId : SemanticId) : canonicalCollectionOrder (transactionSplitState roles instanceId []) = true := by
  have tokens := orderedBy_addTokens [] [roles.left, roles.right]
    (transactionChildOwner roles instanceId) (by rfl)
  have scopes := orderedBy_insertScopeOccurrence
    { id := transactionChildOwner roles instanceId, parent := some ⟨instanceId, roles.root.id, 1⟩ }
    [{ id := ⟨instanceId, roles.root.id, 1⟩, parent := none }] (by rfl)
  have activations := orderedBy_setScopeActivationCount
    [{ scopeId := roles.root.id, count := 1 }] roles.child.id 1 (by rfl)
  simp [canonicalCollectionOrder, transactionSplitState, transactionEnteredState,
    transactionInitiatedState, transactionRootStartState, runningStartState, initialState,
    emptyScopedVariables, tokens, scopes, activations, orderedBy, parallelMultiInstanceControllersOrdered]

private theorem transaction_split_place_binding (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (place : ControlPlaceId)
    (selected : place = roles.left ∨ place = roles.right) :
    (uniqueControlPlace? p place).isSome = true ∧
    p.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = place)) =
      [{ controlPlaceId := place, scopeId := roles.child.id }] := by
  have operationIdsUnique : (p.operations.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted p wellFormed)
  have placeIdsUnique : (p.controlPlaces.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted p wellFormed)
  obtain ⟨id, origin, input, shape⟩ := roles.splitShape
  obtain ⟨owner, declared, operationOwner, placeOwner, declaration⟩ :=
    programGraphWellFormed_operationControlPlaceScope p roles.split place
      (programWellFormed_graph p wellFormed) operationIdsUnique placeIdsUnique
      (soleConsumer_facts _ _ _ roles.splitSelected).1
      (by simp [shape, operationControlPlacesShareOwner])
      (by rcases selected with rfl | rfl <;>
        simp only [shape, operationControlPlaces, List.mem_append] <;>
        exact Or.inr (by simp [operationOutputs]))
  have ownerEq : owner = roles.child.id := by
    have owned := roles.splitOwned
    change (unique? (p.operationScopes.filter (fun binding => binding.operationId == roles.split.id))).map
      (·.scopeId) = some roles.child.id at owned
    have filterEq : p.operationScopes.filter (fun binding => binding.operationId == roles.split.id) =
        [{ operationId := roles.split.id, scopeId := owner }] := by
      simpa only [Bool.beq_eq_decide_eq] using operationOwner
    rw [filterEq] at owned
    exact Option.some.inj owned
  obtain ⟨member, key⟩ := List.mem_filter.mp
    (show declared ∈ p.controlPlaces.filter (fun candidate => decide (candidate.id = place)) by
      rw [declaration]; simp)
  have origins := (transaction_place_filters p roles wellFormed declared member).2
  exact ⟨by simp [uniqueControlPlace?, declaration, origins], by simpa [ownerEq] using placeOwner⟩

private theorem transaction_split_call_associations (p : Program) (roles : TransactionAdmittedRoles p)
    (instanceId : SemanticId) : calledProcessAssociationsValid (transactionSplitState roles instanceId []) = true := by
  let state := transactionSplitState roles instanceId []
  let root : ScopeOccurrenceId := ⟨instanceId, roles.root.id, 1⟩
  have scopes := transaction_split_scopes p roles instanceId
  have hosting : state.scopeOccurrences.filter (fun occurrence =>
      decide (occurrence.parent.isNone && occurrence.id.processInstanceId = instanceId)) =
        [{ id := root, parent := none }] := by
    apply List.Perm.eq_singleton
    simpa [root, transactionChildOwner] using scopes.filter (fun occurrence =>
      decide (occurrence.parent.isNone && occurrence.id.processInstanceId = instanceId))
  change (match state.scopeOccurrences.filter (fun occurrence =>
      decide (occurrence.parent.isNone && occurrence.id.processInstanceId = instanceId)) with
    | [_] => true && (state.scopeOccurrences.all fun occurrence =>
        if occurrence.parent.isNone && occurrence.id.processInstanceId ≠ instanceId then false else true) && true
    | _ => false) = true
  rw [hosting, scopes.all_eq]
  simp [transactionChildOwner]

theorem transaction_split_position_valid (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId)
    (nonemptyInstance : nonempty instanceId.value = true) :
    runtimePositionValid p instanceId (transactionSplitState roles instanceId []) = true := by
  let state := transactionSplitState roles instanceId []
  let root : ScopeOccurrenceId := ⟨instanceId, roles.root.id, 1⟩
  let child := transactionChildOwner roles instanceId
  obtain ⟨parent, origins, rootFilter, childFilter, rootLookup, childLookup⟩ :=
    transaction_scope_facts p roles wellFormed
  obtain ⟨rootLive, childLive, _, _⟩ := transaction_split_scope_filters p roles wellFormed instanceId
  have scopes := transaction_split_scopes p roles instanceId
  have instanceNotEmpty : instanceId.value ≠ "" := by simpa [nonempty] using nonemptyInstance
  unfold runtimePositionValid
  simp only [Bool.and_eq_true]
  refine ⟨⟨wellFormed, ?_⟩, ?_⟩
  · change ((p.controlPlaces.all fun place =>
      (p.controlPlaces.filter fun candidate => decide (candidate.origin = place.origin)).length = 1) &&
      p.definitionScopes.all fun scope => (p.definitionScopes.filter fun candidate =>
        decide (candidate.originElementId = scope.originElementId)).length = 1) = true
    simp only [Bool.and_eq_true]
    constructor
    · apply List.all_eq_true.mpr
      intro place member
      simp [(transaction_place_filters p roles wellFormed place member).2]
    · rcases transaction_scope_inventory p roles with inventory | inventory <;>
        simp [inventory, origins, Ne.symm origins]
  · change (decide (instanceId = instanceId) && _ && _ && _ && _) = true
    simp only [decide_true, Bool.true_and, Bool.and_eq_true]
    refine ⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩
    · change decide ((state.scopeOccurrences.filter fun occurrence =>
        match uniqueDefinitionScope? p occurrence.id.definitionScopeId with
        | none => false
        | some definition => occurrence.parent.isNone &&
            occurrence.id.processInstanceId = instanceId && definition.parentScopeId.isNone &&
            definition.originElementId.value = p.processId.value).length = 1) = true
      simp only [decide_eq_true_eq]
      have counts := (scopes.filter (fun occurrence =>
        match uniqueDefinitionScope? p occurrence.id.definitionScopeId with
        | none => false
        | some definition => occurrence.parent.isNone &&
            occurrence.id.processInstanceId = instanceId && definition.parentScopeId.isNone &&
            definition.originElementId.value = p.processId.value)).length_eq
      simpa [transactionChildOwner, rootLookup, childLookup, parent, roles.rootProcessOrigin] using counts
    · exact transaction_split_call_associations p roles instanceId
    · change state.scopeOccurrences.all _ = true
      rw [scopes.all_eq]
      simp only [List.all_cons, List.all_nil, Bool.and_true, Bool.and_eq_true]
      constructor
      · constructor
        · simp [exactLiveOccurrence, childLive]
        · change (match uniqueDefinitionScope? p roles.child.id with
          | none => false
          | some definition => decide (instanceId.value ≠ "") && decide (1 > 0) &&
              (match definition.parentScopeId, (some root : Option ScopeOccurrenceId) with
              | none, none => _
              | some expected, some owner => decide (owner.processInstanceId = instanceId) &&
                  decide (owner.definitionScopeId = expected) && exactLiveOccurrence state owner
              | _, _ => false)) = true
          simp [childLookup, roles.childParent, exactLiveOccurrence, state, root, rootLive, instanceNotEmpty]
      · constructor
        · simp [exactLiveOccurrence, rootLive]
        · change (match uniqueDefinitionScope? p roles.root.id with
          | none => false
          | some definition => decide (instanceId.value ≠ "") && decide (1 > 0) && _) = true
          rw [rootLookup]
          change (decide (instanceId.value ≠ "") && decide (1 > 0) &&
            (match roles.root.parentScopeId, (none : Option ScopeOccurrenceId) with
            | none, none => ((true && decide (instanceId = instanceId) && roles.root.parentScopeId.isNone &&
                decide (roles.root.originElementId.value = p.processId.value)) && !false) ||
              (!(true && decide (instanceId = instanceId) && roles.root.parentScopeId.isNone &&
                decide (roles.root.originElementId.value = p.processId.value)) && false)
            | some expected, some owner => _
            | _, _ => false)) = true
          simp [parent, roles.rootProcessOrigin, instanceNotEmpty]
    · change (addTokens [] [roles.left, roles.right] child).all _ = true
      rw [(addTokens_perm [] [roles.left, roles.right] child).all_eq]
      simp only [List.map_cons, List.map_nil, List.append_nil, List.all_cons,
        List.all_nil, Bool.and_true, Bool.and_eq_true]
      have tokenValid (place : ControlPlaceId) (selected : place = roles.left ∨ place = roles.right) :
          (match uniqueControlPlace? p place,
              (match p.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = place)) with
              | [binding] => some binding.scopeId | _ => none) with
          | some _, some owner => decide (owner = roles.child.id) && exactLiveOccurrence state child
          | _, _ => false) = true := by
        obtain ⟨declared, owned⟩ := transaction_split_place_binding p roles wellFormed place selected
        cases found : uniqueControlPlace? p place <;>
          simp [found, owned, exactLiveOccurrence, state, child, childLive] at declared ⊢
      exact ⟨tokenValid roles.left (.inl rfl), tokenValid roles.right (.inr rfl)⟩

private theorem transaction_scope_nonempty (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) :
    nonempty roles.root.id.value = true ∧ nonempty roles.child.id.value = true ∧
      nonempty roles.child.originElementId.value = true := by
  have scopes : p.definitionScopes.all (fun scope =>
      nonempty scope.id.value && nonempty scope.originElementId.value) = true := by
    simp only [programWellFormed, Bool.and_eq_true] at wellFormed
    grind only
  have root := List.all_eq_true.mp scopes roles.root (unique_filter_facts _ _ _ roles.rootSelected).1
  have child := List.all_eq_true.mp scopes roles.child (unique_filter_facts _ _ _ roles.childSelected).1
  simp only [Bool.and_eq_true] at root child
  exact ⟨root.1, child⟩

private theorem transaction_split_retention_valid (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId) :
    compensationActivityRetentionStateValid p (transactionSplitState roles instanceId []) = true := by
  let state := transactionSplitState roles instanceId []
  let root : ScopeOccurrenceId := ⟨instanceId, roles.root.id, 1⟩
  let child := transactionChildOwner roles instanceId
  have declared : compensationActivityRetentionDeclarationValid p = true := by
    simp only [programWellFormed, Bool.and_eq_true] at wellFormed
    exact wellFormed.1.2
  obtain ⟨parent, _, _, _, _, _⟩ := transaction_scope_facts p roles wellFormed
  obtain ⟨rootNonempty, childNonempty, originNonempty⟩ := transaction_scope_nonempty p roles wellFormed
  simp only [nonempty] at rootNonempty childNonempty originNonempty
  have different := roles.child_scope_ne_root wellFormed
  have parentScope : compensationTransactionParentScope? p roles.child.id = some roles.root.id := by
    rcases transaction_scope_inventory p roles with scopes | scopes <;>
      simp [compensationTransactionParentScope?, scopes, parent, roles.childParent,
        Ne.symm different, roles.rootProcessOrigin, rootNonempty, childNonempty, originNonempty]
  obtain ⟨_, childLive, rootByDefinition, childByDefinition⟩ :=
    transaction_split_scope_filters p roles wellFormed instanceId
  unfold compensationActivityRetentionStateValid
  rw [declared, roles.retentionPresent]
  change (true && (match compensationTransactionParentScope? p roles.retention.definitionScopeId with
    | some parent => _ | none => _)) = true
  rw [roles.retentionScope, parentScope]
  change (true && (decide (state.scopeOccurrences.filter (fun scope =>
      scope.id.definitionScopeId == roles.root.id) = [{ id := root, parent := none }]) &&
    (match state.scopeOccurrences.filter (fun scope =>
        scope.id.definitionScopeId == roles.retention.definitionScopeId) with
    | [] => _ | [occurrence] => _ | _ => false))) = true
  rw [roles.retentionScope]
  rw [show state.scopeOccurrences.filter (fun scope => scope.id.definitionScopeId == roles.root.id) =
      [{ id := root, parent := none }] from rootByDefinition,
    show state.scopeOccurrences.filter (fun scope => scope.id.definitionScopeId == roles.child.id) =
      [{ id := child, parent := some root }] from childByDefinition]
  change (true && (decide (([{ id := root, parent := none }] : List RuntimeScopeOccurrence) =
      [{ id := root, parent := none }]) &&
    (child.processInstanceId == instanceId && child.activation == 1 &&
      ((some root : Option ScopeOccurrenceId) == some root) && (child == child &&
    (child.processInstanceId == instanceId &&
      (child.definitionScopeId == roles.retention.definitionScopeId) && child.activation == 1 &&
      decide (state.scopeOccurrences.filter (fun scope => scope.id == child) =
        [{ id := child, parent := some root }]) && decide (1 > 0) && true && true &&
      decide (0 ≤ roles.retention.maxRecords) &&
      decide (2 ≤ roles.retention.maxCanonicalBytes) && true) && (!false || true))))) = true
  have childLive' : state.scopeOccurrences.filter (fun scope => scope.id == child) =
      [{ id := child, parent := some root }] := by
    simpa only [Bool.beq_eq_decide_eq] using childLive
  simp [child, transactionChildOwner, roles.retentionScope, roles.retentionLimits.2]
  simpa only [child, transactionChildOwner] using childLive'

/-- The admitted split derives the complete invariant; nonempty input is essential even before arming. -/
theorem transaction_split_wellFormed (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId)
    (nonemptyInstance : nonempty instanceId.value = true) :
    runtimeStateWellFormed p instanceId (transactionSplitState roles instanceId []) = true := by
  let state := transactionSplitState roles instanceId []
  have position := transaction_split_position_valid p roles wellFormed instanceId nonemptyInstance
  have retention := transaction_split_retention_valid p roles wellFormed instanceId
  have ordered := transaction_split_order p roles instanceId
  have executionDeclared : compensationExecutionDeclarationValid p = true := by
    simp only [programWellFormed, Bool.and_eq_true] at wellFormed
    exact wellFormed.2
  have execution := compensationExecutionStateValid_empty p state executionDeclared rfl rfl
    (.inr ⟨instanceId, rfl⟩)
  have snapshots : compensationEventSubProcessSnapshotStateValid p state = true := by
    simp [compensationEventSubProcessSnapshotStateValid, roles.snapshotsAbsent,
      compensationEventSubProcessSnapshotDeclarationValid, state, transactionSplitState,
      transactionEnteredState, transactionInitiatedState, transactionRootStartState,
      runningStartState, initialState]
  have parallel : parallelMultiInstanceProgramBindingsValid p state = true := by
    simp only [parallelMultiInstanceProgramBindingsValid, state, transactionSplitState,
      transactionEnteredState, transactionInitiatedState, transactionRootStartState,
      runningStartState, initialState, List.all_nil, parallelMultiInstanceControllersOrdered,
      Bool.true_and, List.all_eq_true]
    intro operation member
    have family := List.all_eq_true.mp roles.canonicalOperations operation member
    cases operation <;> first | rfl | (change false = true at family; contradiction)
  unfold runtimeStateWellFormed
  rw [position, retention, ordered, execution, snapshots, parallel]
  simp [transactionSplitState, transactionEnteredState, transactionInitiatedState,
    transactionRootStartState, runningStartState, initialState, emptyScopedVariables,
    waitOwnersLive, waitIdentitiesUnique, waitDeclarationsValid, hiddenRecordDeclarationsValid,
    eventRaceAssociationsValid, effectIncidentAssociationsValid, runtimeStateIdentityBound,
    activityRecordsOwnLiveWork, attachedTimersUnambiguous, attachedMessagesUnambiguous,
    activityIdentitiesUnique, activityBodyClaimsUnique, controllersOwnLiveActivity,
    sequentialMultiInstanceProgramBindingsValid, sequentialMultiInstanceControllerProgramBindingsValid,
    sequentialMultiInstanceOperationBindingComplete, controllerIdentitiesUnique, controllersNotExhausted]
  intro operation _
  cases operation <;> simp
  split <;> rfl

private def continuationOperationFamily : SemanticOperation → Prop
  | .awaitUserTask .. | .reachNoneEnd .. | .cancelTransaction .. => True
  | _ => False

private theorem transaction_chain_operation_family (p : Program) (scope : DefinitionScopeId)
    (place : ControlPlaceId) (operations : List SemanticOperation) (places : List ControlPlaceId)
    (chain : TransactionTaskChain p scope place operations places)
    (operation : SemanticOperation) (member : operation ∈ operations) :
    continuationOperationFamily operation := by
  induction chain with
  | task _ _ _ _ _ _ _ _ _ _ _ _ _ ih =>
    simp only [List.mem_cons] at member
    rcases member with rfl | member
    · trivial
    · exact ih member
  | noneEnd current id origin input placeOwned operationOwned consumer =>
    have same : operation = .reachNoneEnd id origin input := by simpa using member
    subst operation
    trivial
  | cancelEnd current id origin selectedScope input output boundary placeOwned operationOwned consumer =>
    have same : operation = .cancelTransaction id origin selectedScope input output boundary := by
      simpa using member
    subst operation
    trivial

private theorem transaction_only_entry (p : Program) (roles : TransactionAdmittedRoles p)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (scope : DefinitionScopeId)
    (member : SemanticOperation.enterScope id origin input entry scope ∈ p.operations) :
    SemanticOperation.enterScope id origin input entry scope = roles.entry := by
  have inventory := roles.operation_in_inventory _ member
  obtain ⟨_, _, startShape⟩ := roles.startShape
  obtain ⟨_, _, _, splitShape⟩ := roles.splitShape
  obtain ⟨_, _, _, rootShape⟩ := roles.rootCompleteShape
  obtain ⟨_, _, _, childShape⟩ := roles.childCompleteShape
  obtain ⟨_, _, _, normalShape⟩ := roles.normalEndShape
  obtain ⟨_, _, _, _, ackShape⟩ := roles.ackShape
  obtain ⟨_, _, _, endShape⟩ := roles.ackEndShape
  simp only [List.mem_append, List.mem_cons, List.not_mem_nil, or_false,
    startShape, splitShape, rootShape, childShape, normalShape, ackShape, endShape,
    reduceCtorEq, false_or, or_false] at inventory
  rcases inventory with (selected | onLeft) | onRight
  · exact selected
  · exact False.elim (transaction_chain_operation_family p _ _ _ _ roles.left_chain _ onLeft)
  · exact False.elim (transaction_chain_operation_family p _ _ _ _ roles.right_chain _ onRight)

private theorem transaction_entry_projection_census (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId) :
    (p.operations.filter fun operation =>
      if !FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy p operation
          ⟨instanceId, roles.root.id, 1⟩ then false
      else match operation with
      | .enterScope _ origin _ _ childScopeId
      | .enterBoundedScope _ origin _ _ childScopeId _
      | .enterMonitoredScope _ origin _ _ childScopeId _ =>
          childScopeId = roles.child.id && origin.elementId = roles.child.originElementId
      | _ => false) = [roles.entry] := by
  have member := (soleConsumer_facts _ _ _ roles.entrySelected).1
  have unique : (p.operations.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted p wellFormed)
  have owned : FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy p roles.entry
      ⟨instanceId, roles.root.id, 1⟩ = true := by
    have selected := List.all_eq_true.mp roles.rootOperationsOwned roles.entry (by simp)
    have selected' : TransactionProgramRoles.operationOwner? p roles.entry.id = some roles.root.id :=
      by simpa only [beq_iff_eq] using selected
    change (unique? (p.operationScopes.filter
      (fun binding => binding.operationId == roles.entry.id))).map (·.scopeId) =
        some roles.root.id at selected'
    simp only [Bool.beq_eq_decide_eq] at selected'
    unfold FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy
    generalize filtered : p.operationScopes.filter
      (fun binding => decide (binding.operationId = roles.entry.id)) = bindings at selected' ⊢
    cases bindings with
    | nil => change none = some roles.root.id at selected'; contradiction
    | cons binding rest => cases rest with
      | nil =>
        change some binding.scopeId = some roles.root.id at selected'
        simpa using selected'
      | cons other tail => change none = some roles.root.id at selected'; contradiction
  apply filter_eq_singleton_of_key_nodup _ (·.id) _ roles.entry unique member
  · obtain ⟨id, origin, input, shape⟩ := roles.entryShape
    have originEq := roles.entryOrigin id origin input shape
    rw [shape] at owned
    simp [shape, originEq, owned]
  · intro operation present accepted
    have canonical := List.all_eq_true.mp roles.canonicalOperations operation present
    split at accepted
    · contradiction
    · cases operation <;> first
      | exact congrArg SemanticOperation.id (transaction_only_entry p roles _ _ _ _ _ present)
      | (change false = true at accepted; contradiction)
      | (change false = true at canonical; contradiction)

private theorem transaction_split_occurrence_valid (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId)
    (nonemptyInstance : nonempty instanceId.value = true) :
    flowNodeOccurrenceProgramValidity p (transactionSplitState roles instanceId []) = true := by
  let state := transactionSplitState roles instanceId []
  let root : ScopeOccurrenceId := ⟨instanceId, roles.root.id, 1⟩
  let child := transactionChildOwner roles instanceId
  obtain ⟨parent, _, rootFilter, childFilter, _, _⟩ := transaction_scope_facts p roles wellFormed
  obtain ⟨rootNonempty, childNonempty, _⟩ := transaction_scope_nonempty p roles wellFormed
  obtain ⟨rootLive, childLive, _, _⟩ := transaction_split_scope_filters p roles wellFormed instanceId
  have scopes := transaction_split_scopes p roles instanceId
  have census := transaction_entry_projection_census p roles wellFormed instanceId
  have structural : flowNodeOccurrenceStructuralProgramValidity p state = true := by
    unfold flowNodeOccurrenceStructuralProgramValidity
    change (state.scopeOccurrences.all _ && true) = true
    simp only [Bool.and_true]
    rw [scopes.all_eq]
    simp only [List.all_cons, List.all_nil, Bool.and_true, Bool.and_eq_true]
    constructor
    · change (match p.definitionScopes.filter (fun scope => decide (scope.id = roles.child.id)) with
        | [definition] => _ | _ => false) = true
      rw [childFilter]
      change (nonempty instanceId.value && nonempty roles.child.id.value && true &&
        flowNodeOccurrenceOwnerLiveUnique state child && _ && _) = true
      rw [nonemptyInstance, childNonempty]
      simp only [Bool.true_and, Bool.and_eq_true]
      refine ⟨⟨?_, ?_⟩, ?_⟩
      · simp [flowNodeOccurrenceOwnerLiveUnique, state, child, childLive]
      · change decide ((p.operations.filter _).length = 1) = true
        simp only [decide_eq_true_eq]
        refine Eq.trans ?_ (congrArg List.length census)
        apply congrArg List.length
        apply List.filter_congr
        intro operation _
        cases operation <;> rfl
      · change (match roles.child.parentScopeId, (some root : Option ScopeOccurrenceId), state.control with
          | some expected, some owner, .running _ =>
              decide (owner.processInstanceId = child.processInstanceId) &&
                decide (owner.definitionScopeId = expected) && flowNodeOccurrenceOwnerLiveUnique state owner
          | none, none, .running hosting => _
          | _, _, _ => false) = true
        rw [show state.control = .running instanceId from rfl]
        simp [roles.childParent, flowNodeOccurrenceOwnerLiveUnique, state, root, rootLive,
          child, transactionChildOwner]
    · change (match p.definitionScopes.filter (fun scope => decide (scope.id = roles.root.id)) with
        | [definition] => _ | _ => false) = true
      rw [rootFilter]
      change (nonempty instanceId.value && nonempty roles.root.id.value && true &&
        flowNodeOccurrenceOwnerLiveUnique state root && true &&
        (match roles.root.parentScopeId, (none : Option ScopeOccurrenceId), state.control with
        | some expected, some owner, .running _ => _
        | none, none, .running hosting => if instanceId = hosting then
            decide (roles.root.originElementId.value = p.processId.value) else _
        | _, _, _ => false)) = true
      rw [parent, show state.control = .running instanceId from rfl]
      simp [nonemptyInstance, rootNonempty, roles.rootProcessOrigin,
        flowNodeOccurrenceOwnerLiveUnique, state, root, rootLive]
  unfold flowNodeOccurrenceProgramValidity
  rw [structural]
  simp [flowNodeOccurrenceWaitProgramValidity, flowNodeOccurrenceUserTaskProgramValidity,
    flowNodeOccurrenceEffectProgramValidity, transactionSplitState,
    transactionEnteredState, transactionInitiatedState, transactionRootStartState,
    runningStartState, initialState] <;> rfl

/-- The split projects the one live child Transaction from its actual scope and declaring entry. -/
theorem transaction_split_open_projection (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId)
    (nonemptyInstance : nonempty instanceId.value = true) :
    projectOpenFlowNodeOccurrences? p (transactionSplitState roles instanceId []) =
      some [{ anchor := .scope (transactionChildOwner roles instanceId)
              processId := p.processId
              elementId := roles.child.originElementId
              owner := ⟨instanceId, roles.root.id, 1⟩ }] := by
  let state := transactionSplitState roles instanceId []
  let root : ScopeOccurrenceId := ⟨instanceId, roles.root.id, 1⟩
  have valid : flowNodeOccurrenceProgramValidity p state = true :=
    transaction_split_occurrence_valid p roles wellFormed instanceId nonemptyInstance
  obtain ⟨_, _, _, childFilter, _, _⟩ := transaction_scope_facts p roles wellFormed
  have rootLive := (transaction_split_scope_filters p roles wellFormed instanceId).1
  have children : state.scopeOccurrences.filter (fun scope => scope.parent.isSome) =
      [{ id := transactionChildOwner roles instanceId, parent := some root }] := by
    apply List.Perm.eq_singleton
    simpa [root] using (transaction_split_scopes p roles instanceId).filter (fun scope => scope.parent.isSome)
  have lookup : processIdForOwner? p state root = some p.processId := by
    simp [processIdForOwner?, hostingInstanceId?, flowNodeOccurrenceOwnerLiveUnique, root,
      show state.control = .running instanceId from rfl, show state.scopeOccurrences.filter
        (fun scope => decide (scope.id = root)) = [{ id := root, parent := none }] from rootLive]
  have messages : messageBoundedProjectionValid p state = true := by
    apply List.all_eq_true.mpr
    intro operation _
    cases operation <;> simp [messageBoundedOperationProjectionValid, state, transactionSplitState,
      transactionEnteredState, transactionInitiatedState, transactionRootStartState, runningStartState, initialState]
  have races : eventRaceAssociationsValid state = true := by rfl
  have incidents : effectIncidentAssociationsValid state = true := by rfl
  have calls : calledProcessAssociationsValid state = true :=
    transaction_split_call_associations p roles instanceId
  change projectOpenFlowNodeOccurrences? p state = _
  simp only [projectOpenFlowNodeOccurrences?, show state.control = .running instanceId from rfl,
    wellFormed, valid, messages, races, incidents, calls, Bool.not_true, Bool.or_false,
    Bool.false_eq_true, ↓reduceIte]
  have waits : projectWaits? p state = some [] := rfl
  rw [waits, children]
  simp [scopeStart?, lookup, childFilter, transactionChildOwner, root,
    show state.calledProcessOccurrences = [] from rfl, sortFlowNodeOccurrenceStarts, sortBy, insertBy]

theorem transaction_split_valid_and_projectable (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId)
    (nonemptyInstance : nonempty instanceId.value = true) :
    runtimeStateWellFormed p instanceId (transactionSplitState roles instanceId []) = true ∧
      (projectOpenFlowNodeOccurrences? p (transactionSplitState roles instanceId [])).isSome = true := by
  exact ⟨transaction_split_wellFormed p roles wellFormed instanceId nonemptyInstance,
    by rw [transaction_split_open_projection p roles wellFormed instanceId nonemptyInstance]; rfl⟩

end BpmnSemantics.SemanticProcess
