import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.WaitCompletion
import BpmnSemantics.SemanticProcess.CompensationActivityRetentionProducers
import BpmnSemantics.SemanticProcess.TransactionProgramRoles

/-! # Transaction scope barriers between frontier phases

The selected Transaction grammar keeps its Cancel branch token or Task wait live until cancellation,
then keeps an active child-owned Compensation trigger. These exact-owned facts rule out normal
scope completion independently of operation ordering. Reachability must derive these facts; the
lemmas here do not assume or establish a complete reachable-frontier classification.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Every admitted consuming family uses its declared input token before it can perform work. -/
theorem transaction_consuming_attempt_without_token
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (input : ControlPlaceId) (declaration : CompensationExecutionDeclaration)
    (declared : program.compensationExecution = some declaration)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (consumes : TransactionProgramRoles.operationInput? operation = some input)
    (missing : onlyTokenOwner? state input = none) :
    attemptInternalOperation program operation state = .disabled operation := by
  cases operation <;> dsimp [TransactionProgramRoles.operationInput?] at consumes
  all_goals try contradiction
  all_goals cases consumes
  all_goals simp only [attemptInternalOperation, declared, snapshots]
  case enterScope id origin childEntry childScope =>
    change (match enterScopeWithCompensationRetention? program state input childEntry childScope with
      | none => InternalOperationAttempt.disabled _
      | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _
    simp [enterScopeWithCompensationRetention?, enterScopeState?, missing]
  case awaitUserTask id origin output task =>
    change (match awaitUserTaskState? state input output task with
      | none => InternalOperationAttempt.disabled _
      | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _
    simp [awaitUserTaskState?, missing]
  case duplicate id origin outputs =>
    change (match duplicateState? state input outputs with
      | none => InternalOperationAttempt.disabled _
      | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _
    simp [duplicateState?, missing]
  case reachNoneEnd id origin =>
    change (match reachNoneEndState? state input with
      | none => InternalOperationAttempt.disabled _
      | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _
    simp [reachNoneEndState?, missing]
  case cancelTransaction id origin scope output boundary =>
    cases state.control <;> simp [attemptTransactionCancellation, declared, missing]

/-- A singleton token cannot enable an operation on another branch's input. -/
theorem transaction_single_token_consuming_input
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (input : ControlPlaceId) (declaration : CompensationExecutionDeclaration)
    (declared : program.compensationExecution = some declaration)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (consumes : TransactionProgramRoles.operationInput? operation = some input)
    (token : ControlToken) (tokens : state.tokens = [token])
    (step : AppliedInternalOperation)
    (applied : attemptInternalOperation program operation state = .applied step) :
    input = token.placeId := by
  by_cases same : input = token.placeId
  · exact same
  · have missing : onlyTokenOwner? state input = none := by
      simp [onlyTokenOwner?, tokenOwners, tokens, Ne.symm same]
    rw [transaction_consuming_attempt_without_token program state operation input declaration
      declared snapshots consumes missing] at applied
    contradiction

/-- Once initiation is consumed, the Start operation cannot re-enter a later frontier. -/
theorem transaction_initiation_consumed
    (program : Program) (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (output : ControlPlaceId) (snapshots : program.compensationEventSubProcessSnapshots = none)
    (consumed : state.initiationPending = false) :
    attemptInternalOperation program (.initiate id origin output) state =
      .disabled (.initiate id origin output) := by
  cases execution : program.compensationExecution <;>
    simp only [attemptInternalOperation, execution, snapshots]
  all_goals
    change (match initiateState? state output with
      | none => InternalOperationAttempt.disabled _
      | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _
    cases root : rootScopeOccurrence? state <;> simp [initiateState?, consumed, root]

/-- With initiation consumed and scope completion blocked, an applied operation needs an input token. -/
theorem transaction_applied_consumes_input
    (program : Program) (roles : TransactionAdmittedRoles program) (state : RuntimeState)
    (graph : transactionCancellationProgramGraph program = true)
    (consumed : state.initiationPending = false)
    (blocked : ∀ id origin scope output,
      SemanticOperation.completeScope id origin scope output ∈ program.operations →
      attemptInternalOperation program (.completeScope id origin scope output) state =
        .disabled (.completeScope id origin scope output))
    (operation : SemanticOperation) (member : operation ∈ program.operations)
    (step : AppliedInternalOperation)
    (applied : attemptInternalOperation program operation state = .applied step) :
    ∃ input, TransactionProgramRoles.operationInput? operation = some input := by
  have family := transactionCancellationProgramGraph_operation_families program graph operation member
  cases operation <;> try contradiction
  case initiate id origin output =>
    rw [transaction_initiation_consumed program state id origin output roles.snapshotsAbsent
      consumed] at applied
    contradiction
  case completeScope id origin scope output =>
    rw [blocked id origin scope output member] at applied
    contradiction
  all_goals exact ⟨_, rfl⟩

/-- Complete admission and one token select at most its sole consumer while scope barriers hold. -/
theorem transaction_single_token_selects_only_consumer
    (program : Program) (roles : TransactionAdmittedRoles program) (state : RuntimeState)
    (graph : transactionCancellationProgramGraph program = true)
    (token : ControlToken) (tokens : state.tokens = [token])
    (consumed : state.initiationPending = false)
    (blocked : ∀ id origin scope output,
      SemanticOperation.completeScope id origin scope output ∈ program.operations →
      attemptInternalOperation program (.completeScope id origin scope output) state =
        .disabled (.completeScope id origin scope output))
    (selected : SemanticOperation)
    (consumer : TransactionProgramRoles.soleConsumer? program token.placeId = some selected)
    (operation : SemanticOperation) (member : operation ∈ program.operations)
    (step : AppliedInternalOperation)
    (applied : attemptInternalOperation program operation state = .applied step) :
    operation = selected := by
  have input := transaction_applied_consumes_input program roles state graph consumed blocked
    operation member step applied
  obtain ⟨input, consumes⟩ := input
  have same := transaction_single_token_consuming_input program state operation input
    roles.execution roles.executionPresent roles.snapshotsAbsent consumes token tokens step applied
  have inFilter : operation ∈ program.operations.filter (fun candidate =>
      TransactionProgramRoles.operationInput? candidate == some token.placeId) :=
    List.mem_filter.mpr ⟨member, by simp [consumes, same]⟩
  rw [TransactionProgramRoles.soleConsumer_exact program token.placeId selected consumer] at inFilter
  simpa using inFilter

/-- Successful selected entry carries the exact new child register, rather than a caller-supplied owner. -/
theorem transaction_entry_initializes_selected_child
    (program : Program) (before after : RuntimeState) (input childEntry : ControlPlaceId)
    (childScopeId : DefinitionScopeId) (declaration : CompensationActivityRetentionDeclaration)
    (declared : program.compensationActivityRetention = some declaration)
    (selectedScope : declaration.definitionScopeId = childScopeId)
    (applied : enterScopeWithCompensationRetention? program before input childEntry childScopeId =
      some after) :
    ∃ entered occurrence,
      enterScopeState? before input childEntry childScopeId = some entered ∧
      entered.scopeOccurrences.filter (fun candidate =>
        candidate.id.definitionScopeId == childScopeId) = [occurrence] ∧
      occurrence.id.definitionScopeId = childScopeId ∧
      after = { entered with compensationActivityRetentions :=
        [{ owner := occurrence.id, nextCompletionOrdinal := 1, records := [] }] } := by
  unfold enterScopeWithCompensationRetention? at applied
  obtain ⟨entered, enteredSelected, applied⟩ := Option.bind_eq_some_iff.mp applied
  simp only [declared, Option.map_some, selectedScope, ↓reduceIte] at applied
  split at applied
  · rename_i occurrence selected
    have member : occurrence ∈ entered.scopeOccurrences.filter (fun candidate =>
        candidate.id.definitionScopeId == childScopeId) := by rw [selected]; simp
    have owned : occurrence.id.definitionScopeId = childScopeId := by
      simpa only [beq_iff_eq] using (List.mem_filter.mp member).2
    simp only [pure, initializeTransactionRetention, declared, selectedScope, owned,
      BEq.rfl, ↓reduceIte, Option.some.injEq] at applied
    exact ⟨entered, occurrence, enteredSelected, selected, owned, applied.symm⟩
  · contradiction

/-- The live branch, handler or child prevents its owning scope's normal completion. -/
inductive TransactionScopeBarrier (state : RuntimeState) (owner : ScopeOccurrenceId) : Prop where
  | token (token : ControlToken) (member : token ∈ state.tokens) (owned : token.owner = owner)
  | task (wait : UserTaskWait) (member : wait ∈ state.waits) (owned : wait.owner = owner)
  | compensation (trigger : CompensationTriggerExecution)
      (member : trigger ∈ state.compensationTriggers) (active : trigger.lifecycle = .active)
      (owned : trigger.owner = owner)
  | child (occurrence : RuntimeScopeOccurrence) (member : occurrence ∈ state.scopeOccurrences)
      (parent : occurrence.parent = some owner)

/-- A live branch token, Task wait or active trigger supplies the actual quiescence discriminator. -/
theorem transaction_scope_barrier_not_quiescent
    (state : RuntimeState) (owner : ScopeOccurrenceId)
    (barrier : TransactionScopeBarrier state owner) :
    scopeQuiescent state owner = false := by
  cases barrier with
  | token token member owned =>
      have present : (state.tokens.any fun candidate => candidate.owner == owner) = true := by
        apply List.any_eq_true.mpr
        exact ⟨token, member, by simp [owned]⟩
      simp [scopeQuiescent, present]
  | task wait member owned =>
      have present : (state.waits.any fun candidate => candidate.owner == owner) = true := by
        apply List.any_eq_true.mpr
        exact ⟨wait, member, by simp [owned]⟩
      simp [scopeQuiescent, present]
  | compensation trigger member active owned =>
      exact scopeQuiescent_refuses_active_compensation_trigger state owner trigger member active owned
  | child occurrence member parent =>
      have present : (state.scopeOccurrences.any fun candidate => candidate.parent == some owner) = true := by
        apply List.any_eq_true.mpr
        exact ⟨occurrence, member, by simp [parent]⟩
      simp [scopeQuiescent, present]

/-- Arming consumes a branch token but replaces its completion barrier with the owned Task wait. -/
theorem transaction_task_arming_keeps_scope_blocked
    (state : RuntimeState) (instanceId : SemanticId) (owner : ScopeOccurrenceId)
    (input output : ControlPlaceId) (task : UserTaskDefinition) :
    TransactionScopeBarrier (activateUserTask state instanceId owner input output task) owner := by
  let wait : UserTaskWait :=
    { processInstanceId := instanceId, owner, task, activation := activationCount state task.id + 1,
      output, metadata := task.metadata }
  apply TransactionScopeBarrier.task wait
  · exact (mem_insertUserTaskWait wait wait state.waits).mpr (Or.inl rfl)
  · rfl

/-- The real arming selector retains the same barrier for its exact selected token owner. -/
theorem transaction_selected_task_arming_keeps_scope_blocked
    (before after : RuntimeState) (owner : ScopeOccurrenceId)
    (input output : ControlPlaceId) (task : UserTaskDefinition)
    (selected : onlyTokenOwner? before input = some owner)
    (applied : awaitUserTaskState? before input output task = some after) :
    TransactionScopeBarrier after owner := by
  simp only [awaitUserTaskState?, selected, Bind.bind, Option.bind] at applied
  cases running : runningInstance? before with
  | none => simp [running] at applied
  | some runningId =>
      simp only [running, pure, Option.some.injEq] at applied
      subst after
      exact transaction_task_arming_keeps_scope_blocked before owner.processInstanceId owner input output task

/-- Completing the selected branch wait creates the next owned token before internal closure. -/
theorem transaction_selected_task_completion_keeps_scope_blocked
    (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (wait : UserTaskWait)
    (selected : before.waits.find? (fun candidate => decide
      (candidate.processInstanceId = instanceId && candidate.task.id = taskId &&
        candidate.activation = activation)) = some wait)
    (completed : completeUserTask before instanceId taskId activation = some after) :
    TransactionScopeBarrier after wait.owner := by
  simp only [completeUserTask, selected, Option.some.injEq] at completed
  subst after
  apply TransactionScopeBarrier.token { placeId := wait.output, owner := wait.owner }
  · exact (addToken_perm before.tokens wait.output wait.owner).mem_iff.mpr List.mem_cons_self
  · rfl

/-- Completing one branch cannot remove the other branch's distinct waiting occurrence. -/
theorem transaction_task_completion_preserves_other_wait
    (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (selectedWait otherWait : UserTaskWait)
    (selected : before.waits.find? (fun candidate => decide
      (candidate.processInstanceId = instanceId && candidate.task.id = taskId &&
        candidate.activation = activation)) = some selectedWait)
    (completed : completeUserTask before instanceId taskId activation = some after)
    (different : otherWait ≠ selectedWait) (present : otherWait ∈ before.waits) :
    otherWait ∈ after.waits := by
  simp only [completeUserTask, selected, Option.some.injEq] at completed
  subst after
  exact (List.mem_erase_of_ne different).mpr present

/-- Retention classification only changes the register, so a parallel Cancel wait cannot vanish there. -/
theorem transaction_retention_staging_preserves_frontier
    (program : Program) (family : CompensationActivityOperationFamily)
    (owner : ScopeOccurrenceId) (facts : CompensationCompletionFacts) (before after : RuntimeState)
    (staged : stageDeclaredCompensationCompletion? program family owner facts before = some after) :
    after.tokens = before.tokens ∧ after.waits = before.waits ∧
      after.scopeOccurrences = before.scopeOccurrences ∧
      after.compensationTriggers = before.compensationTriggers ∧
      after.control = before.control ∧ after.initiationPending = before.initiationPending := by
  unfold stageDeclaredCompensationCompletion? at staged
  split at staged
  · cases staged
    exact ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩
  · cases retained : retainCompletedCompensableActivity program owner facts before with
    | refused reason successor => simp [retained] at staged
    | retained successor record | notRetained successor =>
        simp only [retained, Option.some.injEq] at staged
        subst after
        unfold retainCompletedCompensableActivity at retained
        repeat' (split at retained <;> try dsimp only at retained)
        all_goals
          first
          | contradiction
          | (cases retained; exact ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩)

/-- Actual ordinary completion, including selected retention, advances just its matching wait's token. -/
theorem transaction_ordinary_completion_from_waiting
    (program : Program) (before after : RuntimeState) (taskId : UserTaskInstanceId)
    (emptyTokens : before.tokens = [])
    (completed : completeOrdinaryUserTaskWithCompensation? completeUserTask program before taskId =
      some after) :
    ∃ wait, matchingOrdinaryUserTaskWait? before taskId = some wait ∧
      after.tokens = [{ placeId := wait.output, owner := wait.owner }] ∧
      after.waits = before.waits.erase wait ∧ after.scopeOccurrences = before.scopeOccurrences ∧
      after.compensationTriggers = before.compensationTriggers ∧
      after.control = before.control ∧ after.initiationPending = before.initiationPending := by
  unfold completeOrdinaryUserTaskWithCompensation? at completed
  split at completed
  · obtain ⟨wait, matched, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨staged, retained, completed⟩ := Option.bind_eq_some_iff.mp completed
    have frame := transaction_retention_staging_preserves_frontier program .ordinaryUserTask
      wait.owner _ _ staged retained
    have found : staged.waits.find? (fun candidate => decide
        (candidate.processInstanceId = taskId.processInstanceId &&
          candidate.task.id = ⟨taskId.elementId.value⟩ && candidate.activation = taskId.activation)) =
        some wait := by
      rw [frame.2.1]
      exact matched
    simp only [completeUserTask, found, Option.some.injEq] at completed
    subst after
    refine ⟨wait, matched, ?_, ?_, ?_, ?_, ?_, ?_⟩
    · simp [frame.1, emptyTokens, addToken, canonicalInsertBy]
    · exact congrArg (fun waits => waits.erase wait) frame.2.1
    · exact frame.2.2.1
    · exact frame.2.2.2.1
    · exact frame.2.2.2.2.1
    · exact frame.2.2.2.2.2
  · cases matched : matchingOrdinaryUserTaskWait? before taskId with
    | none =>
      change before.waits.find? _ = none at matched
      simp only [completeUserTask, matched, reduceCtorEq] at completed
    | some wait =>
      have found : before.waits.find? (fun candidate => decide
          (candidate.processInstanceId = taskId.processInstanceId &&
            candidate.task.id = ⟨taskId.elementId.value⟩ && candidate.activation = taskId.activation)) =
          some wait := matched
      simp only [completeUserTask, found, Option.some.injEq] at completed
      subst after
      refine ⟨wait, rfl, ?_, rfl, rfl, rfl, rfl, rfl⟩
      simp [emptyTokens, addToken, canonicalInsertBy]

/-- Neither ordinary nor layered scope completion may bypass the primitive quiescence refusal. -/
theorem transaction_scope_barrier_disables_completion
    (program : Program) (state : RuntimeState) (scopeId : DefinitionScopeId)
    (output : Option ControlPlaceId) (occurrence : RuntimeScopeOccurrence)
    (unique : state.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (barrier : TransactionScopeBarrier state occurrence.id) :
    completeSelectedScope? program state scopeId output = none := by
  have refused := completeScopeState_refuses_nonquiescent state scopeId output occurrence unique
    (transaction_scope_barrier_not_quiescent state occurrence.id barrier)
  unfold completeSelectedScope?
  split
  · simp only [completeMonitoredScope?]
    cases monitoredScopePairForChild? program state scopeId with
    | none => rfl
    | some pair =>
        dsimp only [Bind.bind, Option.bind]
        split <;> simp [refused]
  · simp [completeBoundedScope?, refused]

/-- Attempt-aware closure keeps normal completion disabled while the exact child's barrier remains. -/
theorem transaction_scope_barrier_disables_completion_attempt
    (program : Program) (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (occurrence : RuntimeScopeOccurrence)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (unique : state.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (barrier : TransactionScopeBarrier state occurrence.id) :
    attemptInternalOperation program (.completeScope id origin scopeId output) state =
      .disabled (.completeScope id origin scopeId output) := by
  have refused := transaction_scope_barrier_disables_completion program state scopeId output
    occurrence unique barrier
  cases execution : program.compensationExecution <;>
    simp only [attemptInternalOperation, execution, snapshots]
  all_goals
    change (match completeSelectedScope? program state scopeId output with
      | none => InternalOperationAttempt.disabled (.completeScope id origin scopeId output)
      | some successor => InternalOperationAttempt.applied
          { operation := .completeScope id origin scopeId output, successor }) = _
    rw [refused]

end BpmnSemantics.SemanticProcess
