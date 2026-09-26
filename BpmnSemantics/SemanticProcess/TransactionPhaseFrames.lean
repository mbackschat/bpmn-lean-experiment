import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SemanticProcess.WaitCompletion
import BpmnSemantics.SemanticProcess.CompensationActivityRetentionProducers
import BpmnSemantics.SemanticProcess.TransactionCancellationSemantics

/-! # Transaction inactive collections and live-scope control

The selected Transaction grammar introduces no Message, Timer, ordinary effect, incident, or Called
Process work. These local induction predicates track that exclusion and the running identity of each
live scope through actual primitive and declarative steps. Non-notStarted control is preserved
separately because live-scope control is vacuous after terminal scope removal. These facts neither
assert runtime validity nor assume a successor phase; initialization and command/prefix induction
own their establishment.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def TransactionInertCollections (state : RuntimeState) : Prop :=
  state.messageWaits = [] ∧ state.timerWaits = [] ∧ state.effectWaits = [] ∧
    state.effectIncidents = [] ∧ state.calledProcessOccurrences = []

def TransactionLiveScopeControl (state : RuntimeState) : Prop :=
  ∀ scope ∈ state.scopeOccurrences, state.control = .running scope.id.processInstanceId

/-- A stale live scope cannot share a phase with a different running Process identity. -/
theorem transaction_live_scope_rejects_foreign_instance (state : RuntimeState)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (scope : RuntimeScopeOccurrence) (present : scope ∈ state.scopeOccurrences)
    (foreign : scope.id.processInstanceId ≠ instanceId) : ¬ TransactionLiveScopeControl state := by
  intro live
  have same := live scope present
  rw [running] at same
  exact foreign (ProcessControl.running.inj same).symm

theorem transaction_task_arming_phase_frames (before after : RuntimeState)
    (inert : TransactionInertCollections before) (live : TransactionLiveScopeControl before)
    (started : before.control ≠ .notStarted)
    (input output : ControlPlaceId) (task : UserTaskDefinition)
    (applied : awaitUserTaskState? before input output task = some after) :
    TransactionInertCollections after ∧ TransactionLiveScopeControl after ∧ after.control ≠ .notStarted := by
  unfold awaitUserTaskState? at applied
  obtain ⟨owner, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  cases applied
  exact ⟨inert, live, started⟩

theorem transaction_none_end_phase_frames (before after : RuntimeState)
    (inert : TransactionInertCollections before) (live : TransactionLiveScopeControl before)
    (started : before.control ≠ .notStarted)
    (input : ControlPlaceId) (applied : reachNoneEndState? before input = some after) :
    TransactionInertCollections after ∧ TransactionLiveScopeControl after ∧ after.control ≠ .notStarted := by
  unfold reachNoneEndState? at applied
  obtain ⟨owner, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  cases applied
  exact ⟨inert, live, started⟩

private theorem transaction_retention_staging_phase_frames
    (program : Program) (family : CompensationActivityOperationFamily) (owner : ScopeOccurrenceId)
    (facts : CompensationCompletionFacts) (before after : RuntimeState)
    (staged : stageDeclaredCompensationCompletion? program family owner facts before = some after)
    (inert : TransactionInertCollections before) (live : TransactionLiveScopeControl before)
    (started : before.control ≠ .notStarted) :
    TransactionInertCollections after ∧ TransactionLiveScopeControl after ∧ after.control ≠ .notStarted := by
  unfold stageDeclaredCompensationCompletion? at staged
  split at staged
  · cases staged; exact ⟨inert, live, started⟩
  · cases retained : retainCompletedCompensableActivity program owner facts before with
    | refused reason successor => simp [retained] at staged
    | retained successor record | notRetained successor =>
        simp only [retained, Option.some.injEq] at staged
        subst after
        unfold retainCompletedCompensableActivity at retained
        repeat' (split at retained <;> try dsimp only at retained)
        all_goals first | contradiction | (cases retained; exact ⟨inert, live, started⟩)

/-- Retention staging and ordinary completion change neither inactive families nor live scope control. -/
theorem transaction_task_completion_phase_frames (program : Program) (before after : RuntimeState)
    (inert : TransactionInertCollections before) (live : TransactionLiveScopeControl before)
    (started : before.control ≠ .notStarted)
    (taskId : UserTaskInstanceId)
    (completed : completeOrdinaryUserTaskWithCompensation? completeUserTask program before taskId = some after) :
    TransactionInertCollections after ∧ TransactionLiveScopeControl after ∧ after.control ≠ .notStarted := by
  have ordinary (state successor : RuntimeState)
      (inert : TransactionInertCollections state) (live : TransactionLiveScopeControl state)
      (started : state.control ≠ .notStarted)
      (completed : completeUserTask state taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation = some successor) :
      TransactionInertCollections successor ∧ TransactionLiveScopeControl successor ∧ successor.control ≠ .notStarted := by
    unfold completeUserTask at completed
    split at completed
    · contradiction
    · cases completed; exact ⟨inert, live, started⟩
  unfold completeOrdinaryUserTaskWithCompensation? at completed
  split at completed
  · obtain ⟨wait, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨staged, retained, completed⟩ := Option.bind_eq_some_iff.mp completed
    have stagedFrame := transaction_retention_staging_phase_frames program .ordinaryUserTask wait.owner
      _ _ staged retained
    obtain ⟨stagedInert, stagedLive, stagedStarted⟩ := stagedFrame inert live started
    exact ordinary staged after stagedInert stagedLive stagedStarted completed
  · exact ordinary before after inert live started completed

/-- Root completion empties the scope census; child completion keeps only previously running scopes. -/
theorem transaction_normal_completion_phase_frames (before after : RuntimeState)
    (inert : TransactionInertCollections before) (live : TransactionLiveScopeControl before)
    (started : before.control ≠ .notStarted)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId)
    (completed : completeScopeState? before scope output = some after) :
    TransactionInertCollections after ∧ TransactionLiveScopeControl after ∧ after.control ≠ .notStarted := by
  unfold completeScopeState? at completed
  split at completed
  · split at completed
    · contradiction
    · unfold completeQuiescentScope? at completed
      split at completed
      · split at completed
        · contradiction
        · cases completed
          exact ⟨inert, by intro occurrence member; simp at member, by simp⟩
      · split at completed
        · cases completed
          exact ⟨inert, fun occurrence member => live occurrence (List.mem_filter.mp member).1, started⟩
        · contradiction
      · contradiction
  · contradiction

private theorem transaction_withdrawal_phase_frames (before : RuntimeState)
    (owner : ScopeOccurrenceId) (inert : TransactionInertCollections before)
    (live : TransactionLiveScopeControl before) (started : before.control ≠ .notStarted) :
    TransactionInertCollections (cancelScopeSubtree before owner .retain) ∧
      TransactionLiveScopeControl (cancelScopeSubtree before owner .retain) ∧
      (cancelScopeSubtree before owner .retain).control ≠ .notStarted := by
  refine ⟨?_, fun occurrence member => live occurrence (List.mem_filter.mp member).1, started⟩
  rcases inert with ⟨messages, timers, effects, incidents, calls⟩
  simp [TransactionInertCollections, cancelScopeSubtree, messages, timers, effects, incidents, calls]

private theorem transaction_join_phase_frames (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (inert : TransactionInertCollections before) (live : TransactionLiveScopeControl before)
    (started : before.control ≠ .notStarted)
    (joined : TransactionCancellationJoin before owner output after) :
    TransactionInertCollections after ∧ TransactionLiveScopeControl after ∧ after.control ≠ .notStarted := by
  cases joined
  exact ⟨inert, fun occurrence member => live occurrence (List.mem_filter.mp member).1, started⟩

/-- Both Cancel paths withdraw only existing work; the empty path then removes its selected child. -/
theorem transaction_cancellation_phase_frames (program : Program) (operation : SemanticOperation)
    (before after : RuntimeState) (compensating : Bool)
    (inert : TransactionInertCollections before) (live : TransactionLiveScopeControl before)
    (started : before.control ≠ .notStarted)
    (step : TransactionCancellationStep program operation before compensating after) :
    TransactionInertCollections after ∧ TransactionLiveScopeControl after ∧ after.control ≠ .notStarted := by
  cases step with
  | empty declaration id scope input output owner after ready sources joined accepted =>
      obtain ⟨withdrawnInert, withdrawnLive, withdrawnStarted⟩ := transaction_withdrawal_phase_frames before owner inert live started
      exact transaction_join_phase_frames _ after owner output withdrawnInert withdrawnLive withdrawnStarted joined
  | compensating declaration id scope input output owner first rest pending activated triggers waits after ready sources pendingShape frontier triggersShape waitsShape capacity afterShape accepted =>
      subst after
      exact transaction_withdrawal_phase_frames before owner inert live started

/-- Handler success preserves running scope owners; fail-fast cancellation clears every live scope. -/
theorem transaction_handler_completion_phase_frames (program : Program) (before after : RuntimeState)
    (inert : TransactionInertCollections before) (live : TransactionLiveScopeControl before)
    (started : before.control ≠ .notStarted)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (step : CompensationHandlerCompletionStep program before effectId result after) :
    TransactionInertCollections after ∧ TransactionLiveScopeControl after ∧ after.control ≠ .notStarted := by
  cases step with
  | successFinal declaration selected patch activated triggers waits after ready resultShape candidate capacity routing valid =>
      cases routing with
      | root id origin scope input output selectedOperation => exact ⟨inert, live, started⟩
      | transaction id origin scope input output boundary after selectedOperation joined =>
          exact transaction_join_phase_frames
            { before with
              compensationTriggers := triggers
              compensationHandlerEffectWaits := waits
              effectActivations := activated.effectActivations } after
            selected.trigger.owner selected.trigger.output inert live started joined
  | successAdvance declaration selected patch activated triggers waits after ready resultShape candidate capacity afterShape valid =>
      subst after
      exact ⟨inert, live, started⟩
  | failure declaration selected code message patch after ready resultShape cancelled valid =>
      cases cancelled with
      | cancel handlers failedTrigger failure after terminalized triggerShape failureShape afterShape =>
          subst after
          exact ⟨by simp [TransactionInertCollections], by intro occurrence member; simp at member, by simp⟩

end BpmnSemantics.SemanticProcess
