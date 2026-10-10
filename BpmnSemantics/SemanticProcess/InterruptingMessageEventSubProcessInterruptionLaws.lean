import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessInterruption

/-! Declarative Message interruption with evaluator soundness, exact regional withdrawal and context
frames. These local laws do not assert admission or execution of unselected cross-family compositions. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- IMES-TRIGGER-01 resolves the complete address and reserves a fresh child from predecessor facts. -/
inductive EventSubProcessMessageSelection : Program → RuntimeState → MessageSubscriptionId → MessageChannel →
    EventSubProcessMessageDeliverySelection → Prop where
  | select (program : Program) (state : RuntimeState) (subscriptionId : MessageSubscriptionId)
      (channel : MessageChannel) (listener : EventSubProcessMessageSubscription)
      (declaration : InterruptingMessageEventSubProcessDeclaration) (parent : RuntimeScopeOccurrence)
      (addressed : state.eventSubProcessMessageSubscriptions.filter
        (fun candidate => candidate.id == subscriptionId) = [listener])
      (declared : program.interruptingMessageEventSubProcesses.filter (fun candidate =>
        candidate.startEventId.value == listener.id.elementId.value &&
        candidate.parentScopeId == listener.owner.definitionScopeId &&
        candidate.channel == listener.channel) = [declaration])
      (owned : state.scopeOccurrences.filter (fun occurrence => occurrence.id == listener.owner) = [parent])
      (bound : listener.channel = channel ∧
        listener.id.processInstanceId = parent.id.processInstanceId ∧
        state.control = .running parent.id.processInstanceId ∧
        state.messageWaits.any ((messageIdNamesWait listener.id)) = false ∧
        (state.scopeActivations.filter (fun counter => counter.scopeId == declaration.handlerScopeId)).length ≤ 1 ∧
        state.scopeOccurrences.any (fun occurrence =>
          occurrence.id.definitionScopeId == declaration.handlerScopeId) = false ∧
        scopeActivationCount state declaration.handlerScopeId + 1 ≤ SemanticProcessJson.maxSafeWireNat) :
      EventSubProcessMessageSelection program state subscriptionId channel {
        subscription := listener
        declaration
        parent
        child := {
          processInstanceId := parent.id.processInstanceId
          definitionScopeId := declaration.handlerScopeId
          activation := scopeActivationCount state declaration.handlerScopeId + 1 } }

theorem selectEventSubProcessMessageDelivery_sound
    (program : Program) (before : RuntimeState) (subscriptionId : MessageSubscriptionId)
    (channel : MessageChannel) (selected : EventSubProcessMessageDeliverySelection)
    (result : selectEventSubProcessMessageDelivery? program before subscriptionId channel = some selected) :
    EventSubProcessMessageSelection program before subscriptionId channel selected := by
  unfold selectEventSubProcessMessageDelivery? at result
  split at result
  · rename_i listener addressed
    split at result
    · rename_i declaration parent declared owned
      dsimp only at result
      split at result
      · rename_i bound
        simp only [Option.some.injEq] at result
        subst selected
        exact .select program before subscriptionId channel listener declaration parent addressed declared owned bound
      · simp at result
    · simp at result
  · simp at result

inductive EventSubProcessInterruptionStep : Program → RuntimeState → MessageSubscriptionId → MessageChannel →
    RuntimeState → Prop where
  | interrupt (program : Program) (before : RuntimeState) (subscriptionId : MessageSubscriptionId)
      (channel : MessageChannel) (selected : EventSubProcessMessageDeliverySelection)
      (selection : EventSubProcessMessageSelection program before subscriptionId channel selected) :
      EventSubProcessInterruptionStep program before subscriptionId channel
        (let cleaned := cancelScopeSubtree before selected.parent.id .retain
         { cleaned with
           tokens := addToken cleaned.tokens selected.declaration.childEntry selected.child
           scopeOccurrences := insertScopeOccurrence
             { id := selected.child, parent := some selected.parent.id } cleaned.scopeOccurrences
           scopeActivations := setScopeActivationCount cleaned.scopeActivations
             selected.child.definitionScopeId selected.child.activation })

theorem deliverEventSubProcessMessage_sound
    (program : Program) (before after : RuntimeState) (subscriptionId : MessageSubscriptionId)
    (channel : MessageChannel)
    (result : deliverEventSubProcessMessage program before subscriptionId channel = some after) :
    EventSubProcessInterruptionStep program before subscriptionId channel after := by
  unfold deliverEventSubProcessMessage at result
  cases selected : selectEventSubProcessMessageDelivery? program before subscriptionId channel with
  | none => simp [selected] at result
  | some selection =>
    simp only [selected, Option.map_some, Option.some.injEq] at result
    subst after
    exact .interrupt program before subscriptionId channel selection
      (selectEventSubProcessMessageDelivery_sound program before subscriptionId channel selection selected)

/-- IMES-TRIGGER-01 withdraws every ordinary Task owned by the interrupted parent. -/
theorem eventSubProcessInterruption_withdraws_parent_tasks
    (before : RuntimeState) (selected : EventSubProcessMessageDeliverySelection)
    (wait : UserTaskWait) (owned : wait.owner = selected.parent.id) :
    wait ∉ (applyEventSubProcessInterruption before selected).waits := by
  simp [applyEventSubProcessInterruption, cancelScopeSubtree,
    occurrenceInSubtree, occurrenceInSubtreeWithin, owned]

/-- Consuming the parent region withdraws its listener even though the parent occurrence survives. -/
theorem eventSubProcessInterruption_withdraws_parent_listeners
    (before : RuntimeState) (selected : EventSubProcessMessageDeliverySelection)
    (listener : EventSubProcessMessageSubscription) (owned : listener.owner = selected.parent.id) :
    listener ∉ (applyEventSubProcessInterruption before selected).eventSubProcessMessageSubscriptions := by
  simp [applyEventSubProcessInterruption, cancelScopeSubtree,
    occurrenceInSubtree, occurrenceInSubtreeWithin, owned]

/-- Regional cancellation leaves an unrelated Task present exactly when it was present before. -/
theorem eventSubProcessInterruption_preserves_outside_task
    (before : RuntimeState) (selected : EventSubProcessMessageDeliverySelection) (wait : UserTaskWait)
    (outside : occurrenceInSubtree before.scopeOccurrences selected.parent.id wait.owner = false)
    (notCalled : (calledInstanceClosure before selected.parent.id).contains wait.owner.processInstanceId = false) :
    wait ∈ (applyEventSubProcessInterruption before selected).waits ↔ wait ∈ before.waits := by
  simp only [List.contains_eq_mem, decide_eq_false_iff_not] at notCalled
  simp [applyEventSubProcessInterruption, cancelScopeSubtree, outside, notCalled]

/-- The new listener collection follows the same regional boundary as ordinary live work. -/
theorem eventSubProcessInterruption_preserves_outside_listener
    (before : RuntimeState) (selected : EventSubProcessMessageDeliverySelection)
    (listener : EventSubProcessMessageSubscription)
    (outside : occurrenceInSubtree before.scopeOccurrences selected.parent.id listener.owner = false)
    (notCalled : (calledInstanceClosure before selected.parent.id).contains listener.owner.processInstanceId = false) :
    listener ∈ (applyEventSubProcessInterruption before selected).eventSubProcessMessageSubscriptions ↔
      listener ∈ before.eventSubProcessMessageSubscriptions := by
  simp only [List.contains_eq_mem, decide_eq_false_iff_not] at notCalled
  simp [applyEventSubProcessInterruption, cancelScopeSubtree, outside, notCalled]

/-- IMES-CONTEXT-01 preserves Process data, history, logical time and every issuance counter except the new child scope. -/
theorem eventSubProcessInterruption_preserves_context_and_history
    (before : RuntimeState) (selected : EventSubProcessMessageDeliverySelection) :
    let after := applyEventSubProcessInterruption before selected
    after.control = before.control ∧ after.variables.process = before.variables.process ∧
    after.endOccurrences = before.endOccurrences ∧ after.logicalTimeMs = before.logicalTimeMs ∧
    after.activations = before.activations ∧ after.messageActivations = before.messageActivations ∧
    after.timerActivations = before.timerActivations ∧ after.effectActivations = before.effectActivations ∧
    after.callActivations = before.callActivations ∧ after.activityActivations = before.activityActivations ∧
    after.eventRaceActivations = before.eventRaceActivations := by
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- The actual child is inserted after cancellation, so its entry token and scope cannot be erased by the old-region mask. -/
theorem eventSubProcessInterruption_creates_handler_after_cleanup
    (before : RuntimeState) (selected : EventSubProcessMessageDeliverySelection) :
    let cleaned := cancelScopeSubtree before selected.parent.id .retain
    let after := applyEventSubProcessInterruption before selected
    after.tokens = addToken cleaned.tokens selected.declaration.childEntry selected.child ∧
    after.scopeOccurrences = insertScopeOccurrence { id := selected.child, parent := some selected.parent.id }
      cleaned.scopeOccurrences ∧
    after.scopeActivations = setScopeActivationCount before.scopeActivations
      selected.child.definitionScopeId selected.child.activation := by
  exact ⟨rfl, rfl, rfl⟩

/-- The reserved identity strictly advances its exact definition counter and remains wire-representable. -/
theorem eventSubProcessSelection_fresh_child
    (program : Program) (before : RuntimeState) (subscriptionId : MessageSubscriptionId)
    (channel : MessageChannel) (selected : EventSubProcessMessageDeliverySelection)
    (selection : EventSubProcessMessageSelection program before subscriptionId channel selected) :
    selected.child.processInstanceId = selected.parent.id.processInstanceId ∧
    selected.child.definitionScopeId = selected.declaration.handlerScopeId ∧
    selected.child.activation = scopeActivationCount before selected.declaration.handlerScopeId + 1 ∧
    selected.child.activation ≤ SemanticProcessJson.maxSafeWireNat ∧
    before.scopeOccurrences.any (fun occurrence =>
      occurrence.id.definitionScopeId == selected.declaration.handlerScopeId) = false := by
  cases selection with
  | select listener declaration parent _ _ _ bound =>
    exact ⟨rfl, rfl, rfl, bound.2.2.2.2.2.2, bound.2.2.2.2.2.1⟩

/-- An address with no current listener cannot trigger cleanup or create another handler. -/
theorem deliverEventSubProcessMessage_refuses_stale_address
    (program : Program) (before : RuntimeState) (subscriptionId : MessageSubscriptionId)
    (channel : MessageChannel)
    (absent : before.eventSubProcessMessageSubscriptions.filter
      (fun candidate => candidate.id == subscriptionId) = []) :
    deliverEventSubProcessMessage program before subscriptionId channel = none := by
  simp [deliverEventSubProcessMessage, selectEventSubProcessMessageDelivery?, absent]

end BpmnSemantics.SemanticProcess
