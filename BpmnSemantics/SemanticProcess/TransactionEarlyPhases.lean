import BpmnSemantics.SemanticProcess.TransactionPhaseInduction

/-! # Exact Transaction entry prefixes

Actual offered transitions select the reader's Start, entry and split in sequence. The one-arm
prefix selects the other Task. These facts supply the early cases of reachable-phase induction.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics TransactionProgramRoles

private theorem completion_disabled (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (state : RuntimeState)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId)
    (missing : completeScopeState? state scope output = none) (id : OperationId)
    (origin : BpmnElementOrigin) :
    attemptInternalOperation p (.completeScope id origin scope output) state =
      .disabled (.completeScope id origin scope output) := by
  simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent]
  change (match completeSelectedScope? p state scope output with
    | none => InternalOperationAttempt.disabled _
    | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _
  rw [transaction_scope_completion_dispatch p graph, missing]

private theorem barrier_completion_disabled (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (state : RuntimeState)
    (barriers : ∀ occurrence ∈ state.scopeOccurrences, TransactionScopeBarrier state occurrence.id)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (output : Option ControlPlaceId) :
    attemptInternalOperation p (.completeScope id origin scope output) state =
      .disabled (.completeScope id origin scope output) := by
  apply completion_disabled p roles graph state scope output _ id origin
  unfold completeScopeState?
  split
  · rename_i occurrence selected
    have member := (List.mem_filter.mp (show occurrence ∈ state.scopeOccurrences.filter
      (fun candidate => decide (candidate.id.definitionScopeId = scope)) by rw [selected]; simp)).1
    simp [transaction_scope_barrier_not_quiescent state occurrence.id (barriers occurrence member)]
  · rfl

/-- Pending initiation cannot be bypassed by the root's otherwise quiescent completion. -/
theorem transaction_pending_start_completion_disabled (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (instanceId : SemanticId)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (output : Option ControlPlaceId) :
    attemptInternalOperation p (.completeScope id origin scope output)
      (transactionRootStartState roles instanceId []) = .disabled (.completeScope id origin scope output) := by
  apply completion_disabled p roles graph _ scope output _ id origin
  by_cases same : roles.root.id = scope
  · cases output <;> simp [completeScopeState?, completeQuiescentScope?, transactionRootStartState,
      runningStartState, initialState, scopeQuiescent, same]
  · simp [completeScopeState?, transactionRootStartState, same]

/-- With no tokens and pending initiation, only the selected Start can apply. -/
theorem transaction_pending_only_start (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (instanceId : SemanticId)
    (operation : SemanticOperation) (after : RuntimeState)
    (offered : (operation, after) ∈
      (snapshotInternalTransitionFrontier p (transactionRootStartState roles instanceId [])).transitions) :
    operation = roles.start ∧ after = transactionInitiatedState roles instanceId [] := by
  obtain ⟨member, applied⟩ := (transaction_frontier_attempt_iff p _ operation after).mp offered
  have family := transactionCancellationProgramGraph_operation_families p graph operation member
  have noConsumer (selected : SemanticOperation) (input : ControlPlaceId)
      (consumes : operationInput? selected = some input)
      (applied : attemptInternalOperation p selected (transactionRootStartState roles instanceId []) =
        .applied { operation := selected, successor := after }) : False := by
    have missing : onlyTokenOwner? (transactionRootStartState roles instanceId []) input = none := by
      simp [onlyTokenOwner?, tokenOwners, transactionRootStartState, runningStartState, initialState]
    rw [transaction_consuming_attempt_without_token p _ selected input roles.execution
      roles.executionPresent roles.snapshotsAbsent consumes missing] at applied
    contradiction
  cases operation <;> try contradiction
  case initiate id origin output =>
    have exactStarts := unique_exact _ _ roles.startSelected
    have selected : SemanticOperation.initiate id origin output ∈ [roles.start] := by
      rw [← exactStarts]
      exact List.mem_filter.mpr ⟨member, rfl⟩
    have same : SemanticOperation.initiate id origin output = roles.start := by simpa using selected
    rw [same, transaction_start_operation_reaches_entry p roles instanceId []] at applied
    exact ⟨same, (congrArg AppliedInternalOperation.successor (InternalOperationAttempt.applied.inj applied)).symm⟩
  case completeScope id origin scope output =>
    rw [transaction_pending_start_completion_disabled p roles graph instanceId id origin scope output] at applied
    contradiction
  all_goals exact False.elim (noConsumer _ _ rfl applied)

/-- Entry and child split retain an owned token or child barrier for every live scope. -/
theorem transaction_entry_prefix_barriers (p : Program) (roles : TransactionAdmittedRoles p)
    (instanceId : SemanticId) :
    (∀ occurrence ∈ (transactionInitiatedState roles instanceId []).scopeOccurrences,
      TransactionScopeBarrier (transactionInitiatedState roles instanceId []) occurrence.id) ∧
    (∀ occurrence ∈ (transactionEnteredState roles instanceId []).scopeOccurrences,
      TransactionScopeBarrier (transactionEnteredState roles instanceId []) occurrence.id) := by
  let parent : ScopeOccurrenceId :=
    { processInstanceId := instanceId, definitionScopeId := roles.root.id, activation := 1 }
  let child : RuntimeScopeOccurrence :=
    { id := transactionChildOwner roles instanceId, parent := some parent }
  constructor
  · intro occurrence member
    have same : occurrence = { id := parent, parent := none } := by
      simpa [transactionInitiatedState, transactionRootStartState, parent] using member
    subst occurrence
    exact .token { placeId := roles.first, owner := parent } (by simp [transactionInitiatedState, parent]) rfl
  · intro occurrence member
    change occurrence ∈ insertScopeOccurrence child [{ id := parent, parent := none }] at member
    rw [mem_insertScopeOccurrence] at member
    rcases member with same | same
    · subst occurrence
      exact .token { placeId := roles.childEntry, owner := child.id } (by simp [transactionEnteredState, child]) rfl
    · have same : occurrence = { id := parent, parent := none } := by simpa using same
      subst occurrence
      exact .child child (by change child ∈ insertScopeOccurrence child [_]; simp [mem_insertScopeOccurrence]) rfl

private theorem singleton_successor (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (before expected : RuntimeState)
    (token : ControlToken) (tokens : before.tokens = [token]) (consumed : before.initiationPending = false)
    (blocked : ∀ id origin scope output, SemanticOperation.completeScope id origin scope output ∈ p.operations →
      attemptInternalOperation p (.completeScope id origin scope output) before =
        .disabled (.completeScope id origin scope output))
    (selected : SemanticOperation) (consumer : soleConsumer? p token.placeId = some selected)
    (actual : attemptInternalOperation p selected before = .applied { operation := selected, successor := expected })
    (operation : SemanticOperation) (after : RuntimeState)
    (offered : (operation, after) ∈ (snapshotInternalTransitionFrontier p before).transitions) :
    operation = selected ∧ after = expected := by
  obtain ⟨member, applied⟩ := (transaction_frontier_attempt_iff p before operation after).mp offered
  have same := transaction_single_token_selects_only_consumer p roles before graph token tokens consumed
    blocked selected consumer operation member _ applied
  subst operation
  rw [actual] at applied
  exact ⟨rfl, (congrArg AppliedInternalOperation.successor (InternalOperationAttempt.applied.inj applied)).symm⟩

theorem transaction_initiated_only_entry (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (wellFormed : programWellFormed p = true)
    (instanceId : SemanticId) (operation : SemanticOperation) (after : RuntimeState)
    (offered : (operation, after) ∈
      (snapshotInternalTransitionFrontier p (transactionInitiatedState roles instanceId [])).transitions) :
    operation = roles.entry ∧ after = transactionEnteredState roles instanceId [] := by
  apply singleton_successor p roles graph _ _
    { placeId := roles.first, owner :=
      { processInstanceId := instanceId, definitionScopeId := roles.root.id, activation := 1 } }
    rfl rfl _ roles.entry roles.entrySelected
    (transaction_entry_operation_reaches_child p roles wellFormed instanceId []) operation after offered
  intro id origin scope output _
  exact barrier_completion_disabled p roles graph _ (transaction_entry_prefix_barriers p roles instanceId).1
    id origin scope output

theorem transaction_entered_only_split (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true)
    (instanceId : SemanticId) (operation : SemanticOperation) (after : RuntimeState)
    (offered : (operation, after) ∈
      (snapshotInternalTransitionFrontier p (transactionEnteredState roles instanceId [])).transitions) :
    operation = roles.split ∧ after = transactionSplitState roles instanceId [] := by
  apply singleton_successor p roles graph _ _
    { placeId := roles.childEntry, owner := transactionChildOwner roles instanceId }
    rfl rfl _ roles.split roles.splitSelected
    (transaction_split_operation_reaches_two_children p roles instanceId []) operation after offered
  intro id origin scope output _
  exact barrier_completion_disabled p roles graph _ (transaction_entry_prefix_barriers p roles instanceId).2
    id origin scope output

/-- The one-arm state has exactly the other Task as its next possible applied operation. -/
theorem transaction_one_arm_only_other (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (graph : transactionCancellationProgramGraph p = true)
    (instanceId : SemanticId) (reverse : Bool) (operation : SemanticOperation) (after : RuntimeState)
    (offered : (operation, after) ∈ (snapshotInternalTransitionFrontier p
      (transactionInitialArmingState roles heads instanceId [] reverse .one)).transitions) :
    operation = (if reverse then heads.left else heads.right).operation ∧
      after = transactionInitialArmingState roles heads instanceId [] reverse .both := by
  have different := transaction_admitted_split_places_distinct p roles
  have tokens : (transactionInitialArmingState roles heads instanceId [] reverse .one).tokens =
      [{ placeId := if reverse then roles.left else roles.right, owner := transactionChildOwner roles instanceId }] := by
    cases reverse
    all_goals
      by_cases ordered : controlTokenBefore
          { placeId := roles.left, owner := transactionChildOwner roles instanceId }
          { placeId := roles.right, owner := transactionChildOwner roles instanceId } = true
      all_goals simp [transactionInitialArmingState, TransactionInitialTask.arm, transactionSplitState,
        activateUserTask, addTokens, addToken, canonicalInsertBy, removeToken, ordered,
        heads.leftInput, heads.rightInput, different, Ne.symm different]
  apply singleton_successor p roles graph _ _ _ tokens rfl _
    (if reverse then heads.left else heads.right).operation _
    (transaction_initial_arming_actual_steps p roles heads instanceId [] reverse true)
    operation after offered
  · intro id origin scope output _
    exact transaction_initial_arming_completions_disabled p roles heads instanceId [] reverse .one id origin scope output
  · have consumers := transaction_initial_heads_consumers p roles heads
    cases reverse
    · exact consumers.2
    · exact consumers.1

theorem transaction_initial_frontier_empty (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) :
    (snapshotInternalTransitionFrontier p initialState).transitions = [] := by
  have empty := transaction_token_free_frontier_cardinality p roles initialState graph rfl rfl (by
    intro id origin scope output _
    exact completion_disabled p roles graph initialState scope output rfl id origin)
  exact List.length_eq_zero_iff.mp empty

end BpmnSemantics.SemanticProcess
