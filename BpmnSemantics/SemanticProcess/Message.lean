import BpmnSemantics.SemanticProcess.Transition

/-! # Semantic Process Message delivery

This module owns direct Message-subscription correlation, committed delivery, its declarative external transition relation, and the executable soundness bridge. Message activation remains an internal Semantic Process operation owned by `Transition`; command closure and scenario projection remain separate.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def messageOccurrenceMatches (subscriptionId : MessageSubscriptionId)
    (wait : MessageWait) : Bool :=
  decide (
    wait.processInstanceId = subscriptionId.processInstanceId &&
      wait.elementId.value = subscriptionId.elementId.value &&
      wait.activation = subscriptionId.activation)

def messageDefinitionMatches (program : Program) (wait : MessageWait) : Bool :=
  program.operations.any fun
    | .awaitMessage _ _ _ _ message =>
        decide (
          message.elementId = wait.elementId &&
            message.channel = wait.channel)
    | _ => false

/-- Declarative account of one successful directly addressed Message delivery. Correlation, caller channel consistency, and admitted-definition consistency remain separate premises. -/
inductive MessageDeliveryStep :
    Program → RuntimeState → MessageSubscriptionId → MessageChannel →
      RuntimeState → Prop where
  | commit
      (program : Program)
      (state : RuntimeState)
      (subscriptionId : MessageSubscriptionId)
      (channel : MessageChannel)
      (wait : MessageWait)
      (occurrence :
        state.messageWaits.find? (messageOccurrenceMatches subscriptionId) =
          some wait)
      (callerChannel : wait.channel = channel)
      (definition : messageDefinitionMatches program wait = true) :
      MessageDeliveryStep program state subscriptionId channel
        { state with
          messageWaits := state.messageWaits.erase wait
          tokens := wait.output :: state.tokens }

def deliverMessage (program : Program) (state : RuntimeState)
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel) :
    Option RuntimeState :=
  match state.messageWaits.find? (messageOccurrenceMatches subscriptionId) with
  | none => none
  | some wait =>
      if wait.channel = channel && messageDefinitionMatches program wait then
        some
          { state with
            messageWaits := state.messageWaits.erase wait
            tokens := wait.output :: state.tokens }
      else
        none

/-- Every successful executable Message delivery is permitted by the separately stated delivery relation. -/
theorem deliverMessage_sound
    (program : Program)
    (state successor : RuntimeState)
    (subscriptionId : MessageSubscriptionId)
    (channel : MessageChannel)
    (success :
      deliverMessage program state subscriptionId channel = some successor) :
    MessageDeliveryStep program state subscriptionId channel successor := by
  unfold deliverMessage at success
  split at success
  · contradiction
  · rename_i wait occurrence
    split at success
    · rename_i accepted
      cases success
      have callerChannel : wait.channel = channel := by
        exact of_decide_eq_true (Bool.and_eq_true_iff.mp accepted).1
      exact .commit program state subscriptionId channel wait occurrence
        callerChannel (Bool.and_eq_true_iff.mp accepted).2
    · contradiction

/-- Isolated state used to state direct Message-delivery laws over the complete public subscription identity and channel. -/
def singletonMessageWaitingState (wait : MessageWait)
    (logicalTimeMs : Nat := 0) : RuntimeState :=
  { initialState with
    control := .running wait.processInstanceId
    messageWaits := [wait]
    messageActivations :=
      [{ elementId := wait.elementId, count := wait.activation }]
    logicalTimeMs }

end BpmnSemantics.SemanticProcess
