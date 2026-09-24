import BpmnSemantics.SemanticProcess.MessageMonitoredTask

/-! Quantified ESL-MESSAGE/SPAWN/CLOSE laws. Exact singleton censuses, rather than an assumed
successor invariant, establish withdrawal finality. Token production and prior handler multiplicity
are independent of the number or order of existing handler occurrences. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem monitored_insert_length (before : α → α → Bool) (value : α) (values : List α) :
    (canonicalInsertBy before value values).length = values.length + 1 := by
  induction values with
  | nil => rfl
  | cons head tail ih =>
      simp only [canonicalInsertBy]
      split <;> simp_all +arith

/-- Every field except the single boundary token insertion is an exact predecessor frame. -/
theorem message_monitored_spawn_exact (program : Program) (identity : MessageSubscriptionId)
    (channel : MessageChannel) (before after : RuntimeState)
    (step : MessageMonitoredSpawnStep program identity channel before after) :
    ∃ pair, MessageMonitoredBinding program before pair ∧
      messageMonitoredSubscriptionIdentity pair.message = identity ∧
      after = { before with tokens := addToken before.tokens pair.definition.boundary.output pair.record.owner } := by
  cases step with
  | spawn pair bound addressed _ => exact ⟨pair, bound, addressed, rfl⟩

/-- Arbitrarily many earlier User Task and Message handlers retain their complete lists, order,
identities and multiplicities; the selected host, Activity and attachment survive with them. -/
theorem message_monitored_spawn_preserves_all_waits (program : Program)
    (identity : MessageSubscriptionId) (channel : MessageChannel) (before after : RuntimeState)
    (step : MessageMonitoredSpawnStep program identity channel before after) :
    after.waits = before.waits ∧ after.messageWaits = before.messageWaits ∧
      after.activityOccurrences = before.activityOccurrences ∧
      after.timerWaits = before.timerWaits ∧ after.scopeOccurrences = before.scopeOccurrences ∧
      after.activations = before.activations ∧ after.messageActivations = before.messageActivations ∧
      after.activityActivations = before.activityActivations ∧ after.logicalTimeMs = before.logicalTimeMs := by
  cases step
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

theorem message_monitored_spawn_adds_exactly_one_token (program : Program)
    (identity : MessageSubscriptionId) (channel : MessageChannel) (before after : RuntimeState)
    (step : MessageMonitoredSpawnStep program identity channel before after) :
    after.tokens.length = before.tokens.length + 1 := by
  cases step
  exact monitored_insert_length _ _ _

/-- The selector reads no token collection, so a committed delivery cannot consume its own
eligibility. This does not identify command retries; deduplication belongs to the host ledger. -/
theorem message_monitored_second_delivery (program : Program) (before after : RuntimeState)
    (identity : MessageSubscriptionId) (channel : MessageChannel)
    (first : spawnFromMessageMonitoredUserTask? program before identity channel = some after) :
    ∃ next, spawnFromMessageMonitoredUserTask? program after identity channel = some next ∧
      next.waits = before.waits ∧ next.messageWaits = before.messageWaits ∧
      next.activityOccurrences = before.activityOccurrences ∧
      next.tokens.length = before.tokens.length + 2 := by
  have firstStep := spawnFromMessageMonitoredUserTask_sound program before after identity channel first
  unfold spawnFromMessageMonitoredUserTask? at first
  obtain ⟨pair, found, committed⟩ := Option.bind_eq_some_iff.mp first
  split at committed
  · next accepted =>
      cases committed
      let next := spawnMessageMonitoredPair (spawnMessageMonitoredPair before pair.val) pair.val
      have again : spawnFromMessageMonitoredUserTask? program
          (spawnMessageMonitoredPair before pair.val) identity channel = some next := by
        change (messageMonitoredPairForSubscription? program before identity).bind _ = some next
        simp [found, accepted, next]
      refine ⟨next, again, rfl, rfl, rfl, ?_⟩
      have secondStep := spawnFromMessageMonitoredUserTask_sound program _ next identity channel again
      have one := message_monitored_spawn_adds_exactly_one_token program identity channel _ _ firstStep
      have two := message_monitored_spawn_adds_exactly_one_token program identity channel _ _ secondStep
      omega
  · contradiction

/-- Completion removes only the exact owned triple and preserves every other runtime field. -/
theorem message_monitored_completion_exact (program : Program) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (values : List VariableBinding)
    (before after : RuntimeState)
    (step : MessageMonitoredCompletionStep program instanceId taskId activation values before after) :
    ∃ pair, MessageMonitoredBinding program before pair ∧ values = [] ∧
      after = { before with
        waits := before.waits.erase pair.task
        messageWaits := before.messageWaits.erase pair.message
        activityOccurrences := before.activityOccurrences.erase pair.record
        tokens := addToken before.tokens pair.definition.task.output pair.record.owner } := by
  cases step with
  | complete pair bound _ empty => exact ⟨pair, bound, empty, rfl⟩

/-- Exact-key censuses imply that erasing the selected records leaves no matching identity.
There is no successor-validity or externally assumed uniqueness premise. -/
theorem message_monitored_completion_withdrawal_final (program : Program) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (values : List VariableBinding)
    (before after : RuntimeState)
    (step : MessageMonitoredCompletionStep program instanceId taskId activation values before after) :
    ∃ pair, MessageMonitoredBinding program before pair ∧
      after.waits.filter (taskIdNamesWait (messageMonitoredTaskIdentity pair.task)) = [] ∧
      after.messageWaits.filter (messageIdNamesWait (messageMonitoredSubscriptionIdentity pair.message)) = [] ∧
      after.activityOccurrences.filter (sameActivityOccurrence pair.record) = [] := by
  cases step with
  | complete pair bound _ _ =>
      obtain ⟨tasks, messages, _, _, records⟩ := bound.1
      refine ⟨pair, bound, ?_, ?_, ?_⟩ <;>
        simp only [completeMessageMonitoredPair, ← List.erase_filter, tasks, messages, records, List.erase_cons_head]

/-- An arbitrary distinct handler wait keeps its multiplicity, even when its element is shared
with another handler instance. The exclusion names the exact selected wait, never its element. -/
theorem message_monitored_completion_preserves_handler_multiplicity (program : Program)
    (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (values : List VariableBinding) (before after : RuntimeState)
    (step : MessageMonitoredCompletionStep program instanceId taskId activation values before after) :
    ∃ pair, MessageMonitoredBinding program before pair ∧
      (∀ handler : UserTaskWait, handler ≠ pair.task → after.waits.count handler = before.waits.count handler) ∧
      (∀ handler : MessageWait, handler ≠ pair.message → after.messageWaits.count handler = before.messageWaits.count handler) := by
  cases step with
  | complete pair bound _ _ =>
      exact ⟨pair, bound, fun _ distinct => List.count_erase_of_ne distinct,
        fun _ distinct => List.count_erase_of_ne distinct⟩

theorem message_monitored_completion_counter_frames (program : Program)
    (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (values : List VariableBinding) (before after : RuntimeState)
    (step : MessageMonitoredCompletionStep program instanceId taskId activation values before after) :
    after.activations = before.activations ∧ after.messageActivations = before.messageActivations ∧
      after.activityActivations = before.activityActivations ∧ after.timerActivations = before.timerActivations ∧
      after.effectActivations = before.effectActivations ∧ after.scopeActivations = before.scopeActivations ∧
      after.eventRaceActivations = before.eventRaceActivations ∧ after.callActivations = before.callActivations ∧
      after.logicalTimeMs = before.logicalTimeMs := by
  cases step
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- The reused atomic arm mints three independently keyed identities. No equality between their
predecessor counters is needed, and every unrelated collection is framed by that existing arm. -/
theorem message_monitored_arming_independent_counters (state : RuntimeState)
    (instanceId : SemanticId) (owner : ScopeOccurrenceId) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundary : BoundaryMessageArm) :
    let after := activateMessageBoundedUserTask state instanceId owner input task boundary
    after.activations = setActivationCount state.activations task.id (activationCount state task.id + 1) ∧
    after.messageActivations = setMessageActivationCount state.messageActivations boundary.elementId
      (messageActivationCount state boundary.elementId + 1) ∧
    after.activityActivations = setActivationCount state.activityActivations task.id (activityActivationCount state task.id + 1) ∧
    activationCount state task.id < activationCount state task.id + 1 ∧
    messageActivationCount state boundary.elementId < messageActivationCount state boundary.elementId + 1 ∧
    activityActivationCount state task.id < activityActivationCount state task.id + 1 ∧
    activityIdentityIssuingDiscipline state after = true := by
  refine ⟨rfl, rfl, rfl, Nat.lt_succ_self _, Nat.lt_succ_self _, Nat.lt_succ_self _, ?_⟩
  exact activateMessageBoundedUserTask_issues_fresh_activity state instanceId owner input task boundary

@[simp] theorem message_monitored_nonempty_completion_refused (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (values : List VariableBinding) (nonempty : values ≠ []) :
    completeMessageMonitoredUserTask? program state instanceId taskId activation values = none := by
  simp [completeMessageMonitoredUserTask?, nonempty]

/-- Missing, ambiguous, wrong-tag, or wrong-owner pairs cannot take a lifetime step. The premise
names predecessor declaration/ownership facts, not the result of running either evaluator. -/
theorem message_monitored_no_binding_refused (program : Program) (state : RuntimeState)
    (unbound : ∀ pair, ¬MessageMonitoredBinding program state pair)
    (identity : MessageSubscriptionId) (channel : MessageChannel)
    (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat) :
    spawnFromMessageMonitoredUserTask? program state identity channel = none ∧
    completeMessageMonitoredUserTask? program state instanceId taskId activation [] = none := by
  constructor
  · cases result : spawnFromMessageMonitoredUserTask? program state identity channel with
    | none => rfl
    | some after =>
        have step := spawnFromMessageMonitoredUserTask_sound program state after identity channel result
        cases step with | spawn pair bound _ _ => exact False.elim (unbound pair bound)
  · cases result : completeMessageMonitoredUserTask? program state instanceId taskId activation [] with
    | none => rfl
    | some after =>
        have step := completeMessageMonitoredUserTask_sound program state after instanceId taskId activation [] result
        cases step with | complete pair bound _ _ => exact False.elim (unbound pair bound)

theorem completeMessageMonitoredPair_activity_identity_discipline (state : RuntimeState)
    (pair : MessageMonitoredPair) :
    activityIdentityIssuingDiscipline state (completeMessageMonitoredPair state pair) = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  intro record present
  exact List.mem_of_mem_erase present

end BpmnSemantics.SemanticProcess
