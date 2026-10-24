module

public import BpmnSemantics.SemanticProcess.Transition

/-! # Direct Message Catch Event payload mediation

This module owns payload-bearing Message delivery after the unchanged Message wait has been armed.
The received payload, admitted by the selected profile's Message-payload domain, first fills the
declared Catch Event `DataOutput`; its direct association then routes the value into the owning
Process scope under the target `Property` identity. Neither pure intermediate binding is committed.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The unique payload declarer agreeing with the wait's element, channel, output, and owner. -/
def payloadMessageOperation? (program : Program) (wait : MessageWait) :
    Option (SemanticOperation × DirectCatchEventPayloadOutput) :=
  match program.operations.filterMap fun operation =>
      match operation with
      | .awaitPayloadMessage _ _ _ output message directOutput =>
          if message.elementId = wait.elementId && message.channel = wait.channel &&
              output = wait.output &&
              operationOwningScope? program operation.id =
                some wait.owner.definitionScopeId then
            some (operation, directOutput)
          else none
      | _ => none with
  | [entry] => some entry
  | _ => none

/-- A resolved payload declarer is an actual payload operation whose wait-facing fields and owning
scope agree exactly with the live subscription. -/
theorem payloadMessageOperation?_facts (program : Program) (wait : MessageWait)
    (operation : SemanticOperation) (directOutput : DirectCatchEventPayloadOutput)
    (resolved : payloadMessageOperation? program wait = some (operation, directOutput)) :
    operation ∈ program.operations ∧
      ∃ id origin input message,
        operation = .awaitPayloadMessage id origin input wait.output message directOutput ∧
        message.elementId = wait.elementId ∧
        message.channel = wait.channel ∧
        operationOwningScope? program operation.id = some wait.owner.definitionScopeId := by
  unfold payloadMessageOperation? at resolved
  -- Split the definition's own `match` rather than restating it: a module gives a restated `match` its own
  -- private matcher (docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#module-matcher-defect).
  split at resolved
  · rename_i entry entries
    obtain rfl := Option.some.inj resolved
    have selected := entries ▸ List.mem_singleton_self (operation, directOutput)
    obtain ⟨candidate, member, projected⟩ := List.mem_filterMap.mp selected
    cases candidate <;> simp_all
    rename_i id origin input output message candidateOutput
    obtain ⟨⟨⟨⟨elementEq, channelEq⟩, waitOutputEq⟩, ownerEq⟩,
      operationEq, outputEq⟩ := projected
    subst operation
    subst directOutput
    subst output
    exact ⟨member, id, origin, input, message, rfl, elementEq, channelEq, ownerEq⟩
  · contradiction

/-- The pure fill result before the direct association is applied. -/
def fillCatchEventOutput (directOutput : DirectCatchEventPayloadOutput)
    (payload : VariableValue) : VariableBinding :=
  { name := directOutput.sourceDataOutputId, value := payload }

/-- The pure direct-association result. The source name is discarded, not merged. -/
def routeCatchEventOutput (directOutput : DirectCatchEventPayloadOutput)
    (filled : VariableBinding) : VariableBinding :=
  { name := directOutput.targetPropertyId, value := filled.value }

/-- Atomically withdraw the exact ordinary Message wait, follow its output, and merge only the
association target into Process scope. Event-race ownership and payloads outside the profile's
Message-payload domain fail closed. -/
def deliverPayloadMessage (program : Program) (state : RuntimeState)
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel)
    (payload : VariableValue) : Option RuntimeState :=
  match state.messageWaits.find? (messageIdNamesWait subscriptionId) with
  | none => none
  | some wait =>
      if state.eventRaces.any (eventRaceHasMessage · wait) then none
      else if activityRecordsAttachMessageWait state.activityOccurrences wait then none
      else if wait.channel = channel then
        if variableValueAdmitted program.identity.semanticProfile .messagePayload payload then
          match payloadMessageOperation? program wait with
          | none => none
          | some entry =>
              let directOutput := entry.2
              let routed := routeCatchEventOutput directOutput
                (fillCatchEventOutput directOutput payload)
              some
                { state with
                  messageWaits := state.messageWaits.erase wait
                  tokens := addToken state.tokens wait.output wait.owner
                  variables :=
                    { state.variables with
                      process :=
                        { bindings := mergeProcessVariableBindings
                            state.variables.process.bindings [routed] } } }
        else none
      else none

/-- Declarative payload delivery with the fill and association stages named as pure premises. -/
inductive PayloadMessageDeliveryStep :
    Program → RuntimeState → MessageSubscriptionId → MessageChannel →
      VariableValue → RuntimeState → Prop where
  | commit (program : Program) (before : RuntimeState)
      (subscriptionId : MessageSubscriptionId) (channel : MessageChannel)
      (payload : VariableValue) (wait : MessageWait)
      (operation : SemanticOperation) (directOutput : DirectCatchEventPayloadOutput)
      (occurrence : before.messageWaits.find?
        (messageIdNamesWait subscriptionId) = some wait)
      (ordinary : before.eventRaces.any (eventRaceHasMessage · wait) = false)
      (unattached : activityRecordsAttachMessageWait before.activityOccurrences wait = false)
      (callerChannel : wait.channel = channel)
      (admitted : variableValueAdmitted program.identity.semanticProfile
        .messagePayload payload = true)
      (declarer : payloadMessageOperation? program wait = some (operation, directOutput)) :
      PayloadMessageDeliveryStep program before subscriptionId channel payload
        { before with
          messageWaits := before.messageWaits.erase wait
          tokens := addToken before.tokens wait.output wait.owner
          variables :=
            { before.variables with
              process :=
                { bindings := mergeProcessVariableBindings
                    before.variables.process.bindings
                    [routeCatchEventOutput directOutput
                      (fillCatchEventOutput directOutput payload)] } } }

/-- Every successful executable payload delivery satisfies the declarative settlement step. -/
theorem deliverPayloadMessage_sound (program : Program) (before after : RuntimeState)
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel)
    (payload : VariableValue)
    (success : deliverPayloadMessage program before subscriptionId channel payload =
      some after) :
    PayloadMessageDeliveryStep program before subscriptionId channel payload after := by
  unfold deliverPayloadMessage at success
  split at success
  · contradiction
  rename_i wait occurrence
  split at success
  · contradiction
  rename_i ordinary
  split at success
  · contradiction
  rename_i unattached
  split at success
  · rename_i callerChannel
    split at success
    · rename_i admitted
      split at success
      · contradiction
      rename_i entry declarer
      obtain ⟨operation, directOutput⟩ := entry
      cases success
      exact .commit program before subscriptionId channel payload wait operation
        directOutput occurrence (Bool.eq_false_iff.mpr ordinary)
          (Bool.eq_false_iff.mpr unattached) callerChannel admitted declarer
    · contradiction
  · contradiction

end BpmnSemantics.SemanticProcess
