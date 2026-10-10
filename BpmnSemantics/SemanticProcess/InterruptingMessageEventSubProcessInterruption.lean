import BpmnSemantics.SemanticProcess.ScopeCancellation
import BpmnSemantics.WireNatural

/-! Exact Message selection and retained-parent interruption for IMES-TRIGGER-01. Selection uses the
predecessor; the rewrite composes regional cleanup with fresh handler creation in that order. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

structure EventSubProcessMessageDeliverySelection where
  subscription : EventSubProcessMessageSubscription
  declaration : InterruptingMessageEventSubProcessDeclaration
  parent : RuntimeScopeOccurrence
  child : ScopeOccurrenceId
  deriving Repr, DecidableEq

/-- IMES-TRIGGER-01 cleans the old region before inserting the reserved child, retaining the parent context. -/
def applyEventSubProcessInterruption (state : RuntimeState)
    (selected : EventSubProcessMessageDeliverySelection) : RuntimeState :=
  let cleaned := cancelScopeSubtree state selected.parent.id .retain
  { cleaned with
    tokens := addToken cleaned.tokens selected.declaration.childEntry selected.child
    scopeOccurrences := insertScopeOccurrence { id := selected.child, parent := some selected.parent.id }
      cleaned.scopeOccurrences
    scopeActivations := setScopeActivationCount cleaned.scopeActivations
      selected.child.definitionScopeId selected.child.activation }

/-- Address, declaration, live owner and fresh-child capacity are selected before any cancellation. -/
def selectEventSubProcessMessageDelivery? (program : Program) (state : RuntimeState)
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel) :
    Option EventSubProcessMessageDeliverySelection :=
  match state.eventSubProcessMessageSubscriptions.filter (fun listener => listener.id == subscriptionId) with
  | [listener] =>
    match program.interruptingMessageEventSubProcesses.filter (fun declaration =>
        declaration.startEventId.value == listener.id.elementId.value &&
        declaration.parentScopeId == listener.owner.definitionScopeId &&
        declaration.channel == listener.channel),
        state.scopeOccurrences.filter (fun occurrence => occurrence.id == listener.owner) with
    | [declaration], [parent] =>
      let activation := scopeActivationCount state declaration.handlerScopeId + 1
      if listener.channel = channel ∧
          listener.id.processInstanceId = parent.id.processInstanceId ∧
          state.control = .running parent.id.processInstanceId ∧
          state.messageWaits.any ((messageIdNamesWait listener.id)) = false ∧
          (state.scopeActivations.filter (fun counter => counter.scopeId == declaration.handlerScopeId)).length ≤ 1 ∧
          state.scopeOccurrences.any (fun occurrence =>
            occurrence.id.definitionScopeId == declaration.handlerScopeId) = false ∧
          activation ≤ SemanticProcessJson.maxSafeWireNat then
        some {
          subscription := listener
          declaration
          parent
          child := {
            processInstanceId := parent.id.processInstanceId
            definitionScopeId := declaration.handlerScopeId
            activation } }
      else none
    | _, _ => none
  | _ => none

def deliverEventSubProcessMessage (program : Program) (state : RuntimeState)
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel) : Option RuntimeState :=
  (selectEventSubProcessMessageDelivery? program state subscriptionId channel).map
    (applyEventSubProcessInterruption state)

end BpmnSemantics.SemanticProcess
