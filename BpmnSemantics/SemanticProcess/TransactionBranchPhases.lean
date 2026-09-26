import BpmnSemantics.SemanticProcess.TransactionReachableFrontier
import BpmnSemantics.SemanticProcess.TransactionFrontierCardinality
import BpmnSemantics.SemanticProcess.TransactionCancellationSemantics

/-! # Transaction continuation after initial arming

The admitted acyclic branches never return a token to scope entry or the initial split. Ordinary
completion introduces one token from a stable wait; Task arming and None End consume it. These
profile-local facts supply the linear continuation part of the command-boundary induction.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open TransactionProgramRoles

/-- Entry and the only duplicating operation precede every continuation place. -/
def TransactionContinuationPlace {p : Program} (roles : TransactionAdmittedRoles p)
    (place : ControlPlaceId) : Prop :=
  place ≠ roles.first ∧ place ≠ roles.childEntry ∧
    ∃ operation, soleConsumer? p place = some operation

private theorem transaction_chain_place_consumer (p : Program) (scope : DefinitionScopeId)
    (start : ControlPlaceId) (operations : List SemanticOperation) (places : List ControlPlaceId)
    (chain : TransactionTaskChain p scope start operations places)
    (place : ControlPlaceId) (member : place ∈ places) :
    ∃ operation, soleConsumer? p place = some operation := by
  induction chain with
  | task current id origin input output task rest remaining placeOwned operationOwned consumer metadata tail ih =>
      simp only [List.mem_cons] at member
      rcases member with same | remaining
      · subst place; exact ⟨_, consumer⟩
      · exact ih remaining
  | noneEnd current id origin input placeOwned operationOwned consumer =>
      have same : place = current := by simpa using member
      subst place
      exact ⟨_, consumer⟩
  | cancelEnd current id origin scope input output boundary placeOwned operationOwned consumer =>
      have same : place = current := by simpa using member
      subst place
      exact ⟨_, consumer⟩

theorem transaction_branch_place_is_continuation (p : Program) (roles : TransactionAdmittedRoles p)
    (place : ControlPlaceId) (member : place ∈ roles.leftPlaces ++ roles.rightPlaces) :
    TransactionContinuationPlace roles place := by
  have inventory := roles.place_inventory_nodup
  simp only [List.cons_append, List.nil_append, List.nodup_cons] at inventory
  refine ⟨?_, ?_, ?_⟩
  · intro same
    apply inventory.1
    simp only [List.mem_cons, List.mem_append]
    exact Or.inr (Or.inr (Or.inr (Or.inr (same ▸ List.mem_append.mp member))))
  · intro same
    apply inventory.2.1
    simp only [List.mem_cons, List.mem_append]
    exact Or.inr (Or.inr (Or.inr (same ▸ List.mem_append.mp member)))
  · rcases List.mem_append.mp member with left | right
    · exact transaction_chain_place_consumer p roles.child.id roles.left roles.leftOperations
        roles.leftPlaces roles.left_chain place left
    · exact transaction_chain_place_consumer p roles.child.id roles.right roles.rightOperations
        roles.rightPlaces roles.right_chain place right

/-- Every Task's output belongs to the parsed suffix, including the terminal event's input. -/
theorem transaction_chain_task_output_member (p : Program) (scope : DefinitionScopeId)
    (place : ControlPlaceId) (operations : List SemanticOperation) (places : List ControlPlaceId)
    (chain : TransactionTaskChain p scope place operations places)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (task : UserTaskDefinition)
    (member : SemanticOperation.awaitUserTask id origin input output task ∈ operations) :
    output ∈ places := by
  induction chain with
  | task current taskId taskOrigin taskInput taskOutput definition rest remaining
      placeOwned operationOwned consumer metadataAbsent tail ih =>
      simp only [List.mem_cons] at member
      rcases member with same | member
      · cases same
        exact List.mem_cons_of_mem _
          (transaction_taskChain_start_member p scope output rest remaining tail)
      · exact List.mem_cons_of_mem _ (ih member)
  | noneEnd | cancelEnd => simp at member

/-- Complete admission, rather than a selected example, excludes Task outputs into entry or split. -/
theorem transaction_task_output_is_continuation (p : Program) (roles : TransactionAdmittedRoles p)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (task : UserTaskDefinition)
    (member : SemanticOperation.awaitUserTask id origin input output task ∈ p.operations) :
    TransactionContinuationPlace roles output := by
  have selected := roles.operation_in_inventory _ member
  simp only [List.mem_append, List.mem_cons, List.not_mem_nil, or_false] at selected
  rcases selected with base | right
  · rcases base with fixed | left
    · rcases fixed with start | entry | split | rootComplete | childComplete | normalEnd | ack | ackEnd
      · obtain ⟨_, _, shape⟩ := roles.startShape; simp [shape] at start
      · obtain ⟨_, _, _, shape⟩ := roles.entryShape; simp [shape] at entry
      · obtain ⟨_, _, _, shape⟩ := roles.splitShape; simp [shape] at split
      · obtain ⟨_, _, _, shape⟩ := roles.rootCompleteShape; simp [shape] at rootComplete
      · obtain ⟨_, _, _, shape⟩ := roles.childCompleteShape; simp [shape] at childComplete
      · obtain ⟨_, _, _, shape⟩ := roles.normalEndShape; simp [shape] at normalEnd
      · obtain ⟨_, _, _, _, shape⟩ := roles.ackShape
        rw [shape] at ack
        cases ack
        have inventory := roles.place_inventory_nodup
        simp only [List.cons_append, List.nil_append, List.nodup_cons] at inventory
        exact ⟨fun same => inventory.1 (by simp [← same]),
          fun same => inventory.2.1 (by simp [← same]), ⟨roles.ackEnd, roles.ackEndSelected⟩⟩
      · obtain ⟨_, _, _, shape⟩ := roles.ackEndShape; simp [shape] at ackEnd
    · exact transaction_branch_place_is_continuation p roles output
        (List.mem_append_left _ (transaction_chain_task_output_member p roles.child.id roles.left
          roles.leftOperations roles.leftPlaces roles.left_chain id origin input output task left))
  · exact transaction_branch_place_is_continuation p roles output
      (List.mem_append_right _ (transaction_chain_task_output_member p roles.child.id roles.right
        roles.rightOperations roles.rightPlaces roles.right_chain id origin input output task right))

/-- Stable waits retain only source-admitted continuation outputs; completion creates one token. -/
theorem transaction_wait_completion_enters_linear_continuation
    (p : Program) (roles : TransactionAdmittedRoles p) (before after : RuntimeState)
    (taskId : UserTaskInstanceId) (emptyTokens : before.tokens = [])
    (waitOutputs : ∀ wait ∈ before.waits, TransactionContinuationPlace roles wait.output)
    (completed : completeOrdinaryUserTaskWithCompensation? completeUserTask p before taskId = some after) :
    after.tokens.length = 1 ∧
      (∀ token ∈ after.tokens, TransactionContinuationPlace roles token.placeId) ∧
      (∀ wait ∈ after.waits, TransactionContinuationPlace roles wait.output) := by
  obtain ⟨wait, selected, tokens, waits, _⟩ :=
    transaction_ordinary_completion_from_waiting p before after taskId emptyTokens completed
  have present : wait ∈ before.waits := List.mem_of_find?_eq_some selected
  refine ⟨by simp [tokens], ?_, ?_⟩
  · intro token member
    simp only [tokens, List.mem_singleton] at member
    subst token
    exact waitOutputs wait present
  · intro other member
    rw [waits] at member
    exact waitOutputs other (List.mem_of_mem_erase member)

/-- With entry and split inputs absent, neither can restart the initial two-token frontier. -/
theorem transaction_continuation_excludes_entry_and_split
    (p : Program) (roles : TransactionAdmittedRoles p) (state : RuntimeState)
    (later : ∀ token ∈ state.tokens, TransactionContinuationPlace roles token.placeId) :
    attemptInternalOperation p roles.entry state = .disabled roles.entry ∧
      attemptInternalOperation p roles.split state = .disabled roles.split := by
  have missing (place : ControlPlaceId)
      (excluded : ∀ token ∈ state.tokens, token.placeId ≠ place) :
      onlyTokenOwner? state place = none := by
    have filtered : state.tokens.filter (fun token => decide (token.placeId = place)) = [] := by
      apply List.filter_eq_nil_iff.mpr
      intro token member
      simp [excluded token member]
    simp [onlyTokenOwner?, tokenOwners, filtered]
  constructor
  · exact transaction_consuming_attempt_without_token p state roles.entry roles.first roles.execution
      roles.executionPresent roles.snapshotsAbsent (soleConsumer_facts p roles.first _ roles.entrySelected).2
      (missing roles.first (fun token member => (later token member).1))
  · exact transaction_consuming_attempt_without_token p state roles.split roles.childEntry roles.execution
      roles.executionPresent roles.snapshotsAbsent
      (soleConsumer_facts p roles.childEntry _ roles.splitSelected).2
      (missing roles.childEntry (fun token member => (later token member).2.1))

/-- The continuation token bound is preserved by each ordinary branch transition. -/
structure TransactionContinuationState {p : Program} (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) : Prop where
  consumed : state.initiationPending = false
  tokenBound : state.tokens.length ≤ 1
  tokenPlaces : ∀ token ∈ state.tokens, TransactionContinuationPlace roles token.placeId
  waitOutputs : ∀ wait ∈ state.waits, TransactionContinuationPlace roles wait.output

/-- Both actual initial orders establish the continuation predicate rather than assuming it. -/
theorem transaction_both_arms_enter_continuation (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (instanceId : SemanticId) (variables : List VariableBinding)
    (reverse : Bool) :
    TransactionContinuationState roles
      (transactionInitialArmingState roles heads instanceId variables reverse .both) := by
  have tokens := (transaction_initial_arming_both_waits p roles heads instanceId variables reverse).1
  have consumers := transaction_initial_heads_consumers p roles heads
  have armOutputs (head : TransactionInitialTask) (member : head.operation ∈ p.operations)
      (state : RuntimeState)
      (previous : ∀ wait ∈ state.waits, TransactionContinuationPlace roles wait.output) :
      ∀ wait ∈ (head.arm instanceId (transactionChildOwner roles instanceId) state).waits,
        TransactionContinuationPlace roles wait.output := by
    intro wait present
    have selected := (mem_insertUserTaskWait _ wait state.waits).mp present
    rcases selected with same | present
    · subst wait
      exact transaction_task_output_is_continuation p roles head.id head.origin head.input head.output head.task member
    · exact previous wait present
  have initialOutputs : ∀ wait ∈ (transactionSplitState roles instanceId variables).waits,
      TransactionContinuationPlace roles wait.output := by
    intro wait member
    change wait ∈ [] at member
    contradiction
  refine ⟨rfl, by simp [tokens], ?_, ?_⟩
  · intro token member
    simp [tokens] at member
  · cases reverse
    · exact armOutputs heads.right (soleConsumer_facts p roles.right _ consumers.2).1 _
        (armOutputs heads.left (soleConsumer_facts p roles.left _ consumers.1).1 _ initialOutputs)
    · exact armOutputs heads.left (soleConsumer_facts p roles.left _ consumers.1).1 _
        (armOutputs heads.right (soleConsumer_facts p roles.right _ consumers.2).1 _ initialOutputs)

theorem transaction_continuation_task_arming (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (phase : TransactionContinuationState roles state)
    (instanceId : SemanticId) (owner : ScopeOccurrenceId)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (task : UserTaskDefinition)
    (member : SemanticOperation.awaitUserTask id origin input output task ∈ p.operations) :
    TransactionContinuationState roles (activateUserTask state instanceId owner input output task) := by
  refine ⟨phase.consumed, ?_, ?_, ?_⟩
  · exact Nat.le_trans (removeToken_sublist state.tokens input owner).length_le phase.tokenBound
  · intro token present
    exact phase.tokenPlaces token ((removeToken_sublist state.tokens input owner).subset present)
  · intro wait present
    have selected := (mem_insertUserTaskWait _ wait state.waits).mp present
    rcases selected with same | previous
    · subst wait
      exact transaction_task_output_is_continuation p roles id origin input output task member
    · exact phase.waitOutputs wait previous

theorem transaction_continuation_task_attempt (p : Program) (roles : TransactionAdmittedRoles p)
    (before after : RuntimeState) (phase : TransactionContinuationState roles before)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (task : UserTaskDefinition)
    (member : SemanticOperation.awaitUserTask id origin input output task ∈ p.operations)
    (applied : awaitUserTaskState? before input output task = some after) :
    TransactionContinuationState roles after := by
  unfold awaitUserTaskState? at applied
  obtain ⟨owner, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  cases applied
  exact transaction_continuation_task_arming p roles before phase owner.processInstanceId owner
    id origin input output task member

theorem transaction_continuation_none_end (p : Program) (roles : TransactionAdmittedRoles p)
    (before after : RuntimeState) (phase : TransactionContinuationState roles before)
    (input : ControlPlaceId) (applied : reachNoneEndState? before input = some after) :
    TransactionContinuationState roles after := by
  unfold reachNoneEndState? at applied
  obtain ⟨owner, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  cases applied
  refine ⟨phase.consumed, ?_, ?_, phase.waitOutputs⟩
  · exact Nat.le_trans (removeToken_sublist before.tokens input owner).length_le phase.tokenBound
  · intro token present
    exact phase.tokenPlaces token ((removeToken_sublist before.tokens input owner).subset present)

theorem transaction_continuation_task_completion (p : Program) (roles : TransactionAdmittedRoles p)
    (before after : RuntimeState) (phase : TransactionContinuationState roles before)
    (taskId : UserTaskInstanceId) (emptyTokens : before.tokens = [])
    (completed : completeOrdinaryUserTaskWithCompensation? completeUserTask p before taskId = some after) :
    TransactionContinuationState roles after := by
  have continued := transaction_wait_completion_enters_linear_continuation p roles before after
    taskId emptyTokens phase.waitOutputs completed
  obtain ⟨_, _, _, _, _, _, _, consumed⟩ :=
    transaction_ordinary_completion_from_waiting p before after taskId emptyTokens completed
  exact ⟨consumed.trans phase.consumed, by omega, continued.2.1, continued.2.2⟩

private theorem single_selected_token (state : RuntimeState) (input : ControlPlaceId)
    (owner : ScopeOccurrenceId) (bound : state.tokens.length ≤ 1)
    (selected : onlyTokenOwner? state input = some owner) :
    state.tokens = [{ placeId := input, owner }] := by
  cases tokens : state.tokens with
  | nil => simp [onlyTokenOwner?, tokenOwners, tokens] at selected
  | cons token rest =>
      have restEmpty : rest = [] := by
        cases rest with
        | nil => rfl
        | cons next tail => simp [tokens] at bound
      subst rest
      by_cases same : token.placeId = input
      · have owned : token.owner = owner := by
          simpa [onlyTokenOwner?, tokenOwners, tokens, same] using selected
        cases token
        simp_all
      · simp [onlyTokenOwner?, tokenOwners, tokens, same] at selected

private theorem cancellation_clears_selected_single_token (state : RuntimeState)
    (input : ControlPlaceId) (owner : ScopeOccurrenceId) (bound : state.tokens.length ≤ 1)
    (selected : onlyTokenOwner? state input = some owner) :
    (cancelScopeSubtree state owner .retain).tokens = [] := by
  have tokens := single_selected_token state input owner bound selected
  simp [cancelScopeSubtree, tokens, occurrenceInSubtree, occurrenceInSubtreeWithin]

theorem transaction_continuation_cancel_step (p : Program) (roles : TransactionAdmittedRoles p)
    (before after : RuntimeState) (phase : TransactionContinuationState roles before)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (input output : ControlPlaceId) (boundary : NodeId) (compensating : Bool)
    (continuation : TransactionContinuationPlace roles output)
    (step : TransactionCancellationStep p (.cancelTransaction id origin scope input output boundary)
      before compensating after) :
    TransactionContinuationState roles after := by
  cases step with
  | empty declaration operationId scopeId selectedInput selectedOutput owner after ready sources joined accepted =>
      cases ready with
      | ready selectedOrigin selectedBoundary declared operationSelected programAccepted running tokenOwner
          scopeMatches stateValid child parent childSelected parentSelected unclaimed =>
        cases operationSelected
        have empty := cancellation_clears_selected_single_token before input owner phase.tokenBound tokenOwner
        cases joined with
        | joined occurrence parent selected parentSelected quiescent =>
          refine ⟨phase.consumed, ?_, ?_, ?_⟩
          · change (addToken (cancelScopeSubtree before owner .retain).tokens output parent).length ≤ 1
            simp [empty, addToken, canonicalInsertBy]
          · intro token member
            change token ∈ addToken (cancelScopeSubtree before owner .retain).tokens output parent at member
            simp only [empty, addToken, canonicalInsertBy, List.mem_singleton] at member
            subst token
            exact continuation
          · intro wait member
            exact phase.waitOutputs wait (List.mem_filter.mp member).1
  | compensating declaration operationId scopeId selectedInput selectedOutput owner first rest pending activated
      triggers waits after ready sources pendingShape frontier triggersShape waitsShape capacity afterShape accepted =>
      subst after
      refine ⟨phase.consumed, ?_, ?_, ?_⟩
      · exact Nat.le_trans (List.length_filter_le ..) phase.tokenBound
      · intro token member
        exact phase.tokenPlaces token (List.mem_filter.mp member).1
      · intro wait member
        exact phase.waitOutputs wait (List.mem_filter.mp member).1

theorem transaction_cancel_output_is_continuation (p : Program) (roles : TransactionAdmittedRoles p) :
    TransactionContinuationPlace roles roles.cancelOutput := by
  have inventory := roles.place_inventory_nodup
  simp only [List.cons_append, List.nil_append, List.nodup_cons] at inventory
  exact ⟨fun same => inventory.1 (by simp [← same]),
    fun same => inventory.2.1 (by simp [← same]), ⟨roles.ack, roles.ackSelected⟩⟩

/-- The existing execution validator binds every retained trigger to the admitted Cancel route. -/
theorem transaction_valid_trigger_output (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (trigger : CompensationTriggerExecution)
    (valid : compensationExecutionStateValid p state = true)
    (member : trigger ∈ state.compensationTriggers) :
    TransactionContinuationPlace roles trigger.output := by
  have matched := compensationExecutionStateValid_trigger p state roles.execution
    roles.executionPresent valid trigger member
  unfold triggerMatchesDeclaration at matched
  split at matched
  · rename_i id origin scope input output selected
    have operationMember : SemanticOperation.triggerCompensation id origin scope input output ∈ p.operations := by
      have inFilter : SemanticOperation.triggerCompensation id origin scope input output ∈
          p.operations.filter (fun operation => operation.id == roles.execution.triggerOperationId) := by
        rw [selected]; simp
      exact (List.mem_filter.mp inFilter).1
    have canonical := List.all_eq_true.mp roles.canonicalOperations _ operationMember
    change false = true at canonical
    contradiction
  · rename_i id origin scope input output boundary selected
    have operationMember : SemanticOperation.cancelTransaction id origin scope input output boundary ∈ p.operations := by
      have inFilter : SemanticOperation.cancelTransaction id origin scope input output boundary ∈
          p.operations.filter (fun operation => operation.id == roles.execution.triggerOperationId) := by
        rw [selected]; simp
      exact (List.mem_filter.mp inFilter).1
    have same : SemanticOperation.cancelTransaction id origin scope input output boundary = roles.cancel := by
      have membership := congrArg
        (fun operations => SemanticOperation.cancelTransaction id origin scope input output boundary ∈ operations)
        (unique_exact _ _ roles.cancelSelected)
      simp only [List.mem_filter, List.mem_singleton] at membership
      rw [← membership]
      exact ⟨operationMember, trivial⟩
    obtain ⟨selectedId, selectedOrigin, selectedInput, selectedBoundary, shape⟩ := roles.cancelShape
    rw [shape] at same
    cases same
    have outputSelected : trigger.output = roles.cancelOutput := by
      simp only [Bool.and_eq_true, beq_iff_eq] at matched
      grind only
    rw [outputSelected]
    exact transaction_cancel_output_is_continuation p roles
  · contradiction

private theorem completion_ready_output (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (declaration : CompensationExecutionDeclaration) (selected : SelectedCompensationHandler)
    (ready : CompensationHandlerCompletionReady p state effectId result declaration selected) :
    TransactionContinuationPlace roles selected.trigger.output := by
  cases ready with
  | ready inputReady handlerSelected =>
    cases inputReady with
    | ready stateReady patchAccepted =>
      cases stateReady with
      | ready programReady accepted =>
        have valid : compensationExecutionStateValid p state = true := by
          simp only [compensationHandlerCompletionStateRejected, Bool.or_eq_false_iff,
            Bool.not_eq_false', compensationTriggerHandlerStateValid, Bool.and_eq_true] at accepted
          exact accepted.1.2
        exact transaction_valid_trigger_output p roles state selected.trigger valid
          (selectCompensationHandler_trigger_member state effectId selected handlerSelected)

/-- Actual handler success routes one parent token; failure removes all ordinary work. -/
theorem transaction_continuation_handler_completion (p : Program) (roles : TransactionAdmittedRoles p)
    (before after : RuntimeState) (phase : TransactionContinuationState roles before)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult) (emptyTokens : before.tokens = [])
    (step : CompensationHandlerCompletionStep p before effectId result after) :
    TransactionContinuationState roles after := by
  cases step with
  | successFinal declaration selected patch activated triggers waits after ready resultShape candidate capacity routing valid =>
      have output := completion_ready_output p roles before effectId result declaration selected ready
      cases routing with
      | root id origin scope input selectedOperation =>
          refine ⟨phase.consumed, ?_, ?_, phase.waitOutputs⟩
          · simp [emptyTokens, addToken_length]
          · intro token member
            simp only [emptyTokens, addToken, canonicalInsertBy, List.mem_singleton] at member
            subst token
            exact output
      | transaction id origin scope input continuation boundary after selectedOperation joined =>
          cases joined with
          | joined occurrence parent selectedOccurrence parentSelected quiescent =>
            refine ⟨phase.consumed, ?_, ?_, phase.waitOutputs⟩
            · simp [emptyTokens, addToken_length]
            · intro token member
              simp only [emptyTokens, addToken, canonicalInsertBy, List.mem_singleton] at member
              subst token
              exact output
  | successAdvance declaration selected patch activated triggers waits after ready resultShape candidate capacity afterShape valid =>
      subst after
      exact ⟨phase.consumed, phase.tokenBound, phase.tokenPlaces, phase.waitOutputs⟩
  | failure declaration selected code message patch after ready resultShape cancelled valid =>
      cases cancelled with
      | cancel handlers failedTrigger failure after terminalized triggerShape failureShape afterShape =>
        subst after
        exact ⟨rfl, by simp, by simp, by simp⟩

/-- A quiescent leaf either retires the Process or contributes its one declared continuation token. -/
theorem transaction_continuation_scope_completion (p : Program) (roles : TransactionAdmittedRoles p)
    (before after : RuntimeState) (phase : TransactionContinuationState roles before)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId)
    (emptyTokens : before.tokens = [])
    (continuation : ∀ place, output = some place → TransactionContinuationPlace roles place)
    (applied : completeScopeState? before scope output = some after) :
    TransactionContinuationState roles after := by
  unfold completeScopeState? at applied
  split at applied
  · split at applied
    · contradiction
    · unfold completeQuiescentScope? at applied
      split at applied
      · split at applied
        · contradiction
        · cases applied
          exact ⟨phase.consumed, phase.tokenBound, phase.tokenPlaces, phase.waitOutputs⟩
      · split at applied
        · cases applied
          refine ⟨phase.consumed, ?_, ?_, phase.waitOutputs⟩
          · simp [emptyTokens, addToken_length]
          · intro token member
            simp only [emptyTokens, addToken, canonicalInsertBy, List.mem_singleton] at member
            subst token
            exact continuation _ rfl
        · contradiction
      · contradiction
  · contradiction

end BpmnSemantics.SemanticProcess
