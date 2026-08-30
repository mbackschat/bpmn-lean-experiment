import BpmnSemantics.SemanticProcess.ActivityBodyClaimUniqueness
import BpmnSemantics.SemanticProcess.ActivityBodyTurnover
import BpmnSemantics.SemanticProcess.MessageBoundedTask
import BpmnSemantics.SemanticProcess.RuntimeStateWaitIdentity

/-! # Interrupting Activity boundary Message laws

The laws in this module expose the exact atomic state changes of the Message-bounded User Task and
the conditional finality of both withdrawn wait identities. The latter keeps the existing explicit
runtime well-formedness and wait-identity uniqueness hypotheses; preservation of those hypotheses
across all reachable transitions is intentionally not claimed here.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem messageBoundedTaskDefinitionId_eq_of_value {left right : TaskDefinitionId}
    (equal : left.value = right.value) : left = right := by
  cases left
  cases right
  simp_all

/-- Arming changes all three owned collections atomically and frames unrelated runtime state. -/
theorem message_bounded_arming_atomic_frames (state : RuntimeState)
    (instanceId : SemanticId) (owner : ScopeOccurrenceId) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundaryMessage : BoundaryMessageArm) :
    let after := activateMessageBoundedUserTask state instanceId owner input task boundaryMessage
    after.tokens = removeToken state.tokens input owner ∧
      after.waits = insertUserTaskWait
        { processInstanceId := instanceId, owner,
          task := { id := task.id, name := task.name },
          activation := activationCount state task.id + 1,
          output := task.output, metadata := none } state.waits ∧
      after.messageWaits = insertMessageWait
        { processInstanceId := instanceId, owner,
          elementId := boundaryMessage.elementId,
          activation := messageActivationCount state boundaryMessage.elementId + 1,
          channel := boundaryMessage.channel,
          output := boundaryMessage.output } state.messageWaits ∧
      after.activityOccurrences = insertActivityOccurrence
        { processInstanceId := instanceId,
          activityElementId := { value := task.id.value },
          activation := activityActivationCount state task.id + 1,
          owner,
          body := .userTask
            { processInstanceId := instanceId, elementId := { value := task.id.value },
              activation := activationCount state task.id + 1 },
          attachedHandlers := [.message
            { processInstanceId := instanceId,
              elementId := { value := boundaryMessage.elementId.value },
              activation := messageActivationCount state boundaryMessage.elementId + 1 }] }
          state.activityOccurrences ∧
      after.timerWaits = state.timerWaits ∧ after.effectWaits = state.effectWaits ∧
      after.effectIncidents = state.effectIncidents ∧
      after.scopeOccurrences = state.scopeOccurrences ∧ after.variables = state.variables ∧
      after.logicalTimeMs = state.logicalTimeMs := by
  simp [activateMessageBoundedUserTask]

/-- Each family mints strictly above its own predecessor high-water mark; unrelated counters frame. -/
theorem message_bounded_arming_freshness_and_counter_frames (state : RuntimeState)
    (instanceId : SemanticId) (owner : ScopeOccurrenceId) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundaryMessage : BoundaryMessageArm) :
    activationCount state task.id < activationCount state task.id + 1 ∧
      messageActivationCount state boundaryMessage.elementId <
        messageActivationCount state boundaryMessage.elementId + 1 ∧
      activityActivationCount state task.id < activityActivationCount state task.id + 1 ∧
      (activateMessageBoundedUserTask state instanceId owner input task boundaryMessage).timerActivations =
        state.timerActivations ∧
      (activateMessageBoundedUserTask state instanceId owner input task boundaryMessage).effectActivations =
        state.effectActivations ∧
      (activateMessageBoundedUserTask state instanceId owner input task boundaryMessage).scopeActivations =
        state.scopeActivations := by
  simp [activateMessageBoundedUserTask]

/-- The freshly minted task body claim is disjoint from every predecessor claim under the existing
live-work and identity-bound hypotheses, so arming preserves global claim uniqueness. -/
theorem activateMessageBoundedUserTask_preserves_activityBodyClaimsUnique
    (state : RuntimeState) (instanceId : SemanticId) (owner : ScopeOccurrenceId)
    (input : ControlPlaceId) (task : BoundedTaskArm)
    (boundaryMessage : BoundaryMessageArm)
    (recordsOwn : activityRecordsOwnLiveWork state = true)
    (bounds : runtimeStateIdentityBound state = true)
    (claimsUnique : activityBodyClaimsUnique state.activityOccurrences = true) :
    activityBodyClaimsUnique
      (activateMessageBoundedUserTask state instanceId owner input task
        boundaryMessage).activityOccurrences = true := by
  let issuedRecord : ActivityOccurrence :=
    { processInstanceId := instanceId
      activityElementId := { value := task.id.value }
      activation := activityActivationCount state task.id + 1
      owner
      body := .userTask
        { processInstanceId := instanceId
          elementId := { value := task.id.value }
          activation := activationCount state task.id + 1 }
      attachedHandlers :=
        [.message
          { processInstanceId := instanceId
            elementId := { value := boundaryMessage.elementId.value }
            activation := messageActivationCount state boundaryMessage.elementId + 1 }] }
  have disjoint : state.activityOccurrences.all
      (activityBodyClaimsDisjoint issuedRecord) = true := by
    simp only [List.all_eq_true]
    intro existing existingMem
    apply activityBodyClaimsDisjoint_userTask_of_not_mem issuedRecord existing
      { processInstanceId := instanceId
        elementId := { value := task.id.value }
        activation := activationCount state task.id + 1 }
    intro claimed
    obtain ⟨candidate, candidateMem, names⟩ := activityBodyTaskClaim_has_live_wait state
      existing
      { processInstanceId := instanceId
        elementId := { value := task.id.value }
        activation := activationCount state task.id + 1 }
      recordsOwn existingMem claimed
    simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds
    have candidateBound := List.all_eq_true.mp bounds.1.1 candidate candidateMem
    simp only [decide_eq_true_eq] at candidateBound
    simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at names
    have taskEq : candidate.task.id = task.id :=
      messageBoundedTaskDefinitionId_eq_of_value names.1.2.symm
    rw [taskEq] at candidateBound
    omega
  have preserved := activityBodyClaimsUnique_insertActivityOccurrence issuedRecord
    state.activityOccurrences disjoint claimsUnique
  simpa [activateMessageBoundedUserTask, issuedRecord] using preserved

/-- Either constructor removes the task, Message subscription, and their owning Activity together,
and adds exactly one token on that constructor's selected output. -/
theorem message_bounded_victory_withdraws_owned_triple (program : Program)
    (before after : RuntimeState)
    (victory : MessageBoundedTaskVictoryStep program before after) :
    ∃ pair : MessageBoundedPair,
      pair.task ∈ before.waits ∧ pair.message ∈ before.messageWaits ∧
      pair.record ∈ before.activityOccurrences ∧
      after.waits = before.waits.erase pair.task ∧
      after.messageWaits = before.messageWaits.erase pair.message ∧
      after.activityOccurrences = before.activityOccurrences.erase pair.record ∧
      (after.tokens = addToken before.tokens pair.taskOutput pair.task.owner ∨
        after.tokens = addToken before.tokens pair.messageOutput pair.task.owner) := by
  cases victory with
  | activity instanceId pair running taskLive messageLive recordLive paired =>
      exact ⟨pair, taskLive, messageLive, recordLive, rfl, rfl, rfl, Or.inl rfl⟩
  | message instanceId pair running taskLive messageLive recordLive paired =>
      exact ⟨pair, taskLive, messageLive, recordLive, rfl, rfl, rfl, Or.inr rfl⟩

@[simp]
theorem message_bounded_nonempty_completion_refused (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (submittedValues : List VariableBinding) (nonempty : submittedValues.isEmpty = false) :
    completeMessageBoundedUserTask? program state processInstanceId taskId activation
      submittedValues = none := by
  simp [completeMessageBoundedUserTask?, nonempty]

theorem message_bounded_wrong_task_identity_refused (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (absent : state.waits.find? (fun wait =>
      decide (wait.processInstanceId = processInstanceId) && decide (wait.task.id = taskId) &&
        decide (wait.activation = activation)) = none) :
    completeMessageBoundedUserTask? program state processInstanceId taskId activation [] = none := by
  simp [completeMessageBoundedUserTask?, absent]

theorem message_bounded_wrong_subscription_identity_refused (program : Program)
    (state : RuntimeState) (subscriptionId : MessageSubscriptionId) (channel : MessageChannel)
    (absent : state.messageWaits.find? (fun candidate =>
      decide (candidate.processInstanceId = subscriptionId.processInstanceId) &&
        decide (candidate.elementId.value = subscriptionId.elementId.value) &&
        decide (candidate.activation = subscriptionId.activation)) = none) :
    interruptMessageBoundedUserTask? program state subscriptionId channel = none := by
  simp [interruptMessageBoundedUserTask?, messageBoundedPairForSubscription?, absent]

theorem message_bounded_wrong_channel_refused (program : Program) (state : RuntimeState)
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel)
    (pair : MessageBoundedPair)
    (found : messageBoundedPairForSubscription? program state subscriptionId = some pair)
    (wrong : pair.message.channel ≠ channel) :
    interruptMessageBoundedUserTask? program state subscriptionId channel = none := by
  simp [interruptMessageBoundedUserTask?, found, wrong]

private theorem message_key_absent_after_erase : ∀ (values : List MessageWait)
    (wait : MessageWait),
    messageWaitKeyMatches wait wait = true → wait ∈ values →
    (values.filter (messageWaitKeyMatches wait)).length = 1 →
    ∀ candidate ∈ values.erase wait, messageWaitKeyMatches wait candidate = false
  | [], _, _, live, _, _, _ => absurd live (by simp)
  | head :: tail, wait, reflexive, live, counted, candidate, remaining => by
      by_cases sameHead : head = wait
      · subst sameHead
        rw [List.filter_cons_of_pos reflexive] at counted
        have empty : tail.filter (messageWaitKeyMatches head) = [] := by
          apply List.eq_nil_of_length_eq_zero
          simpa using counted
        have candidateLive : candidate ∈ tail := by simpa using remaining
        cases matched : messageWaitKeyMatches head candidate with
        | false => rfl
        | true =>
            have selected : candidate ∈ tail.filter (messageWaitKeyMatches head) := by
              simp [List.mem_filter, candidateLive, matched]
            simp [empty] at selected
      · have waitLive : wait ∈ tail := by
          cases List.mem_cons.mp live with
          | inl equal => exact absurd equal.symm sameHead
          | inr rest => exact rest
        have waitSelected : wait ∈ tail.filter (messageWaitKeyMatches wait) := by
          simp [List.mem_filter, waitLive, reflexive]
        have headAbsent : messageWaitKeyMatches wait head = false := by
          cases matched : messageWaitKeyMatches wait head with
          | false => rfl
          | true =>
              rw [List.filter_cons_of_pos matched] at counted
              have empty : tail.filter (messageWaitKeyMatches wait) = [] := by
                apply List.eq_nil_of_length_eq_zero
                simpa using counted
              simp [empty] at waitSelected
        have tailCounted : (tail.filter (messageWaitKeyMatches wait)).length = 1 := by
          rw [List.filter_cons_of_neg (by simp [headAbsent])] at counted
          exact counted
        have eraseCons : (head :: tail).erase wait = head :: tail.erase wait := by
          simp [sameHead]
        rw [eraseCons] at remaining
        cases List.mem_cons.mp remaining with
        | inl headEq => rw [headEq]; exact headAbsent
        | inr rest =>
            exact message_key_absent_after_erase tail wait reflexive waitLive tailCounted
              candidate rest

/-- Under the existing explicit runtime hypotheses, neither stale losing identity can be found after
either victory. This does not claim those hypotheses are preserved by every transition. -/
theorem message_bounded_victory_withdrawals_are_final (program : Program)
    (instanceId : SemanticId) (before after : RuntimeState)
    (wellFormed : runtimeStateWellFormed program instanceId before = true)
    (unique : waitIdentitiesUnique before = true)
    (victory : MessageBoundedTaskVictoryStep program before after) :
    ∃ task message,
      runtimeStateWellFormed program instanceId before = true ∧
      task ∈ before.waits ∧ message ∈ before.messageWaits ∧
      (∀ candidate ∈ after.waits, userTaskWaitKeyMatches task candidate = false) ∧
      (∀ candidate ∈ after.messageWaits,
        messageWaitKeyMatches message candidate = false) := by
  have messageFinal : ∀ (message : MessageWait), message ∈ before.messageWaits →
      ∀ candidate ∈ before.messageWaits.erase message,
        messageWaitKeyMatches message candidate = false := by
    intro message live candidate remaining
    have occurs : (before.messageWaits.filter
        (messageWaitKeyMatches message)).length = 1 := by
      have identities := unique
      simp [waitIdentitiesUnique] at identities
      simpa [occursOnce] using identities.1.1.2 message live
    exact message_key_absent_after_erase before.messageWaits message
      (by simp [messageWaitKeyMatches]) live occurs candidate remaining
  cases victory with
  | activity instanceId pair running taskLive messageLive recordLive paired =>
      exact ⟨pair.task, pair.message, wellFormed, taskLive, messageLive,
        fun candidate remaining =>
          userTask_key_absent_after_withdrawal before pair.task candidate unique taskLive remaining,
        messageFinal pair.message messageLive⟩
  | message instanceId pair running taskLive messageLive recordLive paired =>
      exact ⟨pair.task, pair.message, wellFormed, taskLive, messageLive,
        fun candidate remaining =>
          userTask_key_absent_after_withdrawal before pair.task candidate unique taskLive remaining,
        messageFinal pair.message messageLive⟩

end BpmnSemantics.SemanticProcess
