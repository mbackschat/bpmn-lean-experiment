import BpmnSemantics.SemanticProcessContract

/-! # Message key-correlation profile admission

This module owns correlation-specific payload, channel, selector, and identity checks. Generic node
and operation cardinalities remain in `ProfileAdmission`.
-/

namespace BpmnSemantics.SemanticProcess

/-- Runtime-frozen identity of the approved Message key-correlation profile. -/
def messageKeyCorrelationProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-message-key-correlation-draft"⟩

private def exactOperationChannelIdentities (elementId : NodeId)
    (channel : MessageChannel) (extra : List String) : Bool :=
  match channel with
  | .operationMessage interfaceId operationId messageId =>
      let identities := [elementId.value, interfaceId.value, operationId.value,
        messageId.value] ++ extra
      channel.identifiersNonempty && identities.all (fun id => !id.isEmpty) &&
        identities.eraseDups.length = identities.length
  | .directMessage .. => false

def messageKeyCorrelationCheckedPayloadValid (source : CheckedProcess) : Bool :=
  if source.identity.semanticProfile = messageKeyCorrelationProfileId then
    source.nodes.all fun
      | .payloadMessageCatchEvent id channel directOutput =>
          exactOperationChannelIdentities id channel
            [directOutput.associationId, directOutput.sourceDataOutputId,
              directOutput.targetPropertyId] &&
            decide (directOutput.sourceDataOutputName ≠ some "")
      | .correlatedPayloadMessageCatchEvent id channel correlationKeyId
          correlationPropertyId payloadSelector processPropertySelector =>
          exactOperationChannelIdentities id channel
            [correlationKeyId, correlationPropertyId, processPropertySelector.propertyId] &&
            correlationMessagePathValid payloadSelector &&
            correlationProcessPropertyPathValid processPropertySelector
      | _ => true
  else true

def messageKeyCorrelationProgramPayloadValid (program : Program) : Bool :=
  if program.identity.semanticProfile = messageKeyCorrelationProfileId then
    program.operations.all fun
      | .awaitPayloadMessage _ origin _ _ message directOutput =>
          origin.elementId = message.elementId &&
            exactOperationChannelIdentities message.elementId message.channel
              [directOutput.associationId, directOutput.sourceDataOutputId,
                directOutput.targetPropertyId] &&
            decide (directOutput.sourceDataOutputName ≠ some "")
      | .awaitCorrelatedPayloadMessage _ origin _ _ message correlationKeyId
          correlationPropertyId payloadSelector processPropertySelector =>
          origin.elementId = message.elementId &&
            exactOperationChannelIdentities message.elementId message.channel
              [correlationKeyId, correlationPropertyId, processPropertySelector.propertyId] &&
            correlationMessagePathValid payloadSelector &&
            correlationProcessPropertyPathValid processPropertySelector
      | _ => true
  else true

end BpmnSemantics.SemanticProcess
