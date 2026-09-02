import BpmnSemantics.SemanticProcess.JsonSupport
import BpmnSemantics.SemanticProcessJson.Elements
import BpmnSemantics.SemanticProcessJson.CompensationSource

/-! # Strict checked-process wire decoding

Owns one public contract: the checked BPMN graph the TypeScript compiler emits. Decoding admits the
exact current shape and establishes neither structural validity nor profile capability. -/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open Lean

private def decodeSourceIdentity (json : Json) :
    Except String SourceIdentity := do
  requireObjectShape json
    ["semanticProfile", "sourceId", "sourceOverlay", "sourceSha256"]
  pure
    { semanticProfile := ⟨← stringField json "semanticProfile"⟩
      sourceId := ⟨← stringField json "sourceId"⟩
      sourceOverlay :=
        ← decodeSourceOverlayIdentity (← field json "sourceOverlay")
      sourceSha256 := ← stringField json "sourceSha256" }

private def decodeCheckedBpmnErrorRoute (json : Json) :
    Except String (Option CheckedBpmnErrorRoute) :=
  match json with
  | .null => pure none
  | _ => do
      requireObjectShape json
        ["attachedToRef", "boundaryEventId", "boundaryEventName", "code",
          "errorDefinitionId", "errorElementId", "errorName", "outputFlowId"]
      pure
        (some
          { boundaryEventId := ⟨← stringField json "boundaryEventId"⟩
            boundaryEventName :=
              ← decodeOptionalString (← field json "boundaryEventName")
            attachedToRef := ⟨← stringField json "attachedToRef"⟩
            errorDefinitionId := ⟨← stringField json "errorDefinitionId"⟩
            errorElementId := ⟨← stringField json "errorElementId"⟩
            errorName := ← decodeOptionalString (← field json "errorName")
            code := ← stringField json "code"
            outputFlowId := ⟨← stringField json "outputFlowId"⟩ })

private def decodeCheckedCondition : Json →
    Except String (Option CheckedCondition)
  | .null => pure none
  | json => do
      requireObjectShape json ["body", "language"]
      pure
        (some
          { language := ← stringField json "language"
            body := ← stringField json "body" })

private def decodeRequiredCheckedCondition (json : Json) :
    Except String CheckedCondition := do
  match ← decodeCheckedCondition json with
  | some condition => pure condition
  | none => throw "checked condition must be present"

/-- Rejects any lexeme outside the closed disposition, so an unknown value never defaults into one. -/
private def decodeBoundaryInterruption (value : String) :
    Except String BoundaryInterruption :=
  match value with
  | "interrupting" => pure .interrupting
  | "nonInterrupting" => pure .nonInterrupting
  | other => throw s!"unknown boundary interruption: {other}"

/-- Decode one User Task node while preserving physical metadata absence and refusing every extra key. -/
def decodeCheckedUserTask (json : Json) : Except String CheckedNode := do
  let metadata ← decodeOptionalUserTaskMetadataField json
  requireObjectShape json
    (if metadata.isSome then ["id", "kind", "metadata", "name"]
      else ["id", "kind", "name"])
  expectStringField json "kind" "userTask"
  pure
    (.userTask
      ⟨← stringField json "id"⟩
      (← decodeOptionalString (← field json "name"))
      metadata)

/-- Decode one direct Data Input Association's exact source identities. -/
private def decodeDirectActivityDataInput (json : Json) :
    Except String DirectActivityDataInput := do
  requireObjectShape json
    ["associationId", "sourcePropertyId", "targetDataInputId", "targetDataInputName"]
  pure
    { associationId := ← stringField json "associationId"
      sourcePropertyId := ← stringField json "sourcePropertyId"
      targetDataInputId := ← stringField json "targetDataInputId"
      targetDataInputName := ← decodeOptionalString (← field json "targetDataInputName") }

/-- Decode one direct Data Output Association's exact source identities. -/
private def decodeDirectActivityDataOutput (json : Json) :
    Except String DirectActivityDataOutput := do
  requireObjectShape json
    ["associationId", "sourceDataOutputId", "sourceDataOutputName", "targetPropertyId"]
  pure
    { associationId := ← stringField json "associationId"
      sourceDataOutputId := ← stringField json "sourceDataOutputId"
      sourceDataOutputName := ← decodeOptionalString (← field json "sourceDataOutputName")
      targetPropertyId := ← stringField json "targetPropertyId" }

private def decodeDirectCatchEventPayloadOutput (json : Json) :
    Except String DirectCatchEventPayloadOutput := do
  requireObjectShape json
    ["associationId", "sourceDataOutputId", "sourceDataOutputName", "targetPropertyId"]
  pure
    { associationId := ← stringField json "associationId"
      sourceDataOutputId := ← stringField json "sourceDataOutputId"
      sourceDataOutputName := ← decodeOptionalString (← field json "sourceDataOutputName")
      targetPropertyId := ← stringField json "targetPropertyId" }

private def decodeSequentialMultiInstanceInput (json : Json) :
    Except String SequentialMultiInstanceInputDefinition := do
  requireObjectShape json
    ["collectionAssociationId", "collectionItemDefinitionId", "dataObjectId",
      "dataObjectReferenceId", "inputDataItemId", "itemAssociationId",
      "loopDataInputId", "scalarItemDefinitionId", "taskDataInputId"]
  pure
    { collectionItemDefinitionId := ← stringField json "collectionItemDefinitionId"
      scalarItemDefinitionId := ← stringField json "scalarItemDefinitionId"
      dataObjectId := ← stringField json "dataObjectId"
      dataObjectReferenceId := ← stringField json "dataObjectReferenceId"
      loopDataInputId := ← stringField json "loopDataInputId"
      inputDataItemId := ← stringField json "inputDataItemId"
      taskDataInputId := ← stringField json "taskDataInputId"
      collectionAssociationId := ← stringField json "collectionAssociationId"
      itemAssociationId := ← stringField json "itemAssociationId" }

private def decodeSequentialMultiInstanceOutput (json : Json) :
    Except String SequentialMultiInstanceOutputDefinition := do
  requireObjectShape json
    ["collectionAssociationId", "dataObjectId", "dataObjectReferenceId",
      "itemAssociationId", "loopDataOutputId", "outputDataItemId",
      "taskDataOutputId"]
  pure
    { dataObjectId := ← stringField json "dataObjectId"
      dataObjectReferenceId := ← stringField json "dataObjectReferenceId"
      taskDataOutputId := ← stringField json "taskDataOutputId"
      outputDataItemId := ← stringField json "outputDataItemId"
      loopDataOutputId := ← stringField json "loopDataOutputId"
      itemAssociationId := ← stringField json "itemAssociationId"
      collectionAssociationId := ← stringField json "collectionAssociationId" }

private def decodeCheckedMultiInstanceBoundaryTimer (json : Json) :
    Except String CheckedSequentialMultiInstanceBoundaryTimer := do
  requireObjectShape json ["durationLiteral", "elementId", "outputFlowId"]
  let durationLiteral ← stringField json "durationLiteral"
  if durationLiteral ≠ "PT5S" then
    throw "Multi-Instance boundary Timer requires exact PT5S duration"
  pure
    { elementId := ⟨← stringField json "elementId"⟩
      durationLiteral
      outputFlowId := ⟨← stringField json "outputFlowId"⟩ }

private def decodeCheckedNode (json : Json) : Except String CheckedNode := do
  let kind ← stringField json "kind"
  match kind with
  | "noneStartEvent" =>
      requireObjectShape json ["id", "kind"]
      pure (.noneStartEvent ⟨← stringField json "id"⟩)
  | "messageStartEvent" =>
      requireObjectShape json ["channel", "id", "kind"]
      pure
        (.messageStartEvent
          ⟨← stringField json "id"⟩
          (← decodeOperationMessageChannel (← field json "channel")))
  | "timerStartEvent" =>
      requireObjectShape json ["durationLiteral", "id", "kind"]
      let id ← stringField json "id"
      let durationLiteral ← stringField json "durationLiteral"
      if id.isEmpty || durationLiteral ≠ "PT1S" then
        throw "timerStartEvent requires a nonempty id and exact PT1S duration"
      pure
        (.timerStartEvent
          ⟨id⟩
          durationLiteral)
  | "embeddedSubProcess" =>
      requireObjectShape json ["childScopeId", "id", "kind"]
      pure
        (.embeddedSubProcess
          ⟨← stringField json "id"⟩
          ⟨← stringField json "childScopeId"⟩)
  | "callActivity" =>
      requireObjectShape json ["calledProcessId", "id", "kind"]
      pure
        (.callActivity
          ⟨← stringField json "id"⟩
          ⟨← stringField json "calledProcessId"⟩)
  | "boundaryErrorEvent" =>
      requireObjectShape json
        ["attachedToRef", "error", "id", "kind", "outputFlowId"]
      pure
        (.boundaryErrorEvent
          ⟨← stringField json "id"⟩
          ⟨← stringField json "attachedToRef"⟩
          (← decodeErrorReference (← field json "error"))
          ⟨← stringField json "outputFlowId"⟩)
  | "timerBoundaryEvent" =>
      requireObjectShape json
        ["attachedToRef", "durationLiteral", "id", "interruption", "kind",
          "outputFlowId"]
      pure
        (.timerBoundaryEvent
          ⟨← stringField json "id"⟩
          ⟨← stringField json "attachedToRef"⟩
          (← decodeBoundaryInterruption (← stringField json "interruption"))
          (← stringField json "durationLiteral")
          ⟨← stringField json "outputFlowId"⟩)
  | "messageBoundaryEvent" =>
      requireObjectShape json
        ["attachedToRef", "channel", "id", "interruption", "kind",
          "outputFlowId"]
      pure
        (.messageBoundaryEvent
          ⟨← stringField json "id"⟩
          ⟨← stringField json "attachedToRef"⟩
          (← decodeBoundaryInterruption (← stringField json "interruption"))
          (← decodeOperationMessageChannel (← field json "channel"))
          ⟨← stringField json "outputFlowId"⟩)
  | "userTask" =>
      decodeCheckedUserTask json
  | "dataInputUserTask" =>
      requireObjectShape json ["directInput", "id", "kind", "name"]
      pure
        (.dataInputUserTask
          ⟨← stringField json "id"⟩
          (← decodeOptionalString (← field json "name"))
          (← decodeDirectActivityDataInput (← field json "directInput")))
  | "dataOutputUserTask" =>
      requireObjectShape json ["directOutput", "id", "kind", "name"]
      pure
        (.dataOutputUserTask
          ⟨← stringField json "id"⟩
          (← decodeOptionalString (← field json "name"))
          (← decodeDirectActivityDataOutput (← field json "directOutput")))
  | "sequentialMultiInstanceUserTask" =>
      requireObjectShape json
        ["boundaryTimer", "id", "input", "kind", "name", "normalOutputFlowId",
          "output"]
      pure
        (.sequentialMultiInstanceUserTask
          ⟨← stringField json "id"⟩
          (← decodeOptionalString (← field json "name"))
          (← decodeSequentialMultiInstanceInput (← field json "input"))
          (← decodeSequentialMultiInstanceOutput (← field json "output"))
          ⟨← stringField json "normalOutputFlowId"⟩
          (← decodeCheckedMultiInstanceBoundaryTimer
            (← field json "boundaryTimer")))
  | "parallelMultiInstanceUserTask" =>
      requireObjectShape json
        ["boundaryTimer", "completionCondition", "id", "input", "kind", "name",
          "normalOutputFlowId", "output"]
      pure
        (.parallelMultiInstanceUserTask
          ⟨← stringField json "id"⟩
          (← decodeOptionalString (← field json "name"))
          (← decodeSequentialMultiInstanceInput (← field json "input"))
          (← decodeSequentialMultiInstanceOutput (← field json "output"))
          (← decodeRequiredCheckedCondition (← field json "completionCondition"))
          ⟨← stringField json "normalOutputFlowId"⟩
          (← decodeCheckedMultiInstanceBoundaryTimer
            (← field json "boundaryTimer")))
  | "intermediateCatchTimerEvent" =>
      requireObjectShape json ["durationLiteral", "id", "kind"]
      pure
        (.intermediateCatchTimerEvent
          ⟨← stringField json "id"⟩
          (← stringField json "durationLiteral"))
  | "intermediateCatchMessageEvent" =>
      requireObjectShape json ["channel", "id", "kind"]
      pure
        (.intermediateCatchMessageEvent
          ⟨← stringField json "id"⟩
          (← decodeMessageChannel (← field json "channel")))
  | "payloadMessageCatchEvent" =>
      requireObjectShape json ["channel", "directOutput", "id", "kind"]
      pure
        (.payloadMessageCatchEvent
          ⟨← stringField json "id"⟩
          (← decodeOperationMessageChannel (← field json "channel"))
          (← decodeDirectCatchEventPayloadOutput (← field json "directOutput")))
  | "correlatedPayloadMessageCatchEvent" =>
      requireObjectShape json
        ["channel", "correlationKeyId", "correlationPropertyId", "id", "kind",
          "payloadSelector", "processPropertySelector"]
      pure
        (.correlatedPayloadMessageCatchEvent
          ⟨← decodeNonemptyStringField json "id"⟩
          (← decodeOperationMessageChannel (← field json "channel"))
          (← decodeNonemptyStringField json "correlationKeyId")
          (← decodeNonemptyStringField json "correlationPropertyId")
          (← decodeCorrelationMessagePath (← field json "payloadSelector"))
          (← decodeCorrelationProcessPropertyPath
            (← field json "processPropertySelector")))
  | "receiveTask" =>
      requireObjectShape json ["channel", "id", "kind"]
      pure
        (.receiveTask
          ⟨← stringField json "id"⟩
          (← decodeMessageChannel (← field json "channel")))
  | "configuredTask" =>
      requireObjectShape json ["descriptor", "id", "kind"]
      let descriptor ← decodeEffectDescriptor (← field json "descriptor")
      if descriptor.protocol ≠ "urn:bpmn-lean:effect-protocol:activity-v1" ||
          descriptor.operation ≠ "urn:bpmn-lean:effect-operation:probe-v1" then
        throw "configuredTask requires the exact Probe effect descriptor"
      pure
        (.configuredTask
          ⟨← decodeNonemptyStringField json "id"⟩
          descriptor)
  | "serviceTask" =>
      requireObjectShape json
        ["bpmnErrorRoute", "descriptor", "id", "inputMappings", "kind",
          "outputMappings"]
      pure
        (.serviceTask
          ⟨← stringField json "id"⟩
          (← decodeEffectDescriptor (← field json "descriptor"))
          (← decodeArray decodeVariableMapping (← field json "inputMappings"))
          (← decodeArray decodeVariableMapping (← field json "outputMappings"))
          (← decodeCheckedBpmnErrorRoute (← field json "bpmnErrorRoute")))
  | "parallelGateway" =>
      requireObjectShape json ["direction", "id", "kind"]
      let direction ← stringField json "direction"
      match direction with
      | "diverging" =>
          pure (.parallelGateway ⟨← stringField json "id"⟩ .diverging)
      | "converging" =>
          pure (.parallelGateway ⟨← stringField json "id"⟩ .converging)
      | _ => throw s!"unsupported gateway direction {direction}"
  | "exclusiveMerge" =>
      requireObjectShape json ["id", "kind"]
      pure (.exclusiveMerge ⟨← stringField json "id"⟩)
  | "exclusiveGateway" =>
      requireObjectShape json
        ["candidateFlowIds", "defaultFlowId", "direction", "id", "kind"]
      expectStringField json "direction" "diverging"
      pure
        (.exclusiveGateway
          ⟨← stringField json "id"⟩
          ((← decodeStringArray (← field json "candidateFlowIds")).map
            SequenceFlowId.mk)
          ⟨← stringField json "defaultFlowId"⟩)
  | "inclusiveGateway" =>
      let direction ← stringField json "direction"
      match direction with
      | "diverging" =>
          requireObjectShape json
            ["candidateFlowIds", "defaultFlowId", "direction", "id", "kind"]
          pure
            (.inclusiveGatewayDiverging
              ⟨← stringField json "id"⟩
              ((← decodeStringArray (← field json "candidateFlowIds")).map
                SequenceFlowId.mk)
              ⟨← stringField json "defaultFlowId"⟩)
      | "converging" =>
          requireObjectShape json
            ["direction", "id", "kind", "pairedGatewayId"]
          pure
            (.inclusiveGatewayConverging
              ⟨← stringField json "id"⟩
              ⟨← stringField json "pairedGatewayId"⟩)
      | _ => throw s!"unsupported gateway direction {direction}"
  | "eventBasedGateway" =>
      requireObjectShape json ["direction", "id", "kind"]
      expectStringField json "direction" "diverging"
      pure (.eventBasedGateway ⟨← stringField json "id"⟩)
  | "globalSynchronousCompensationThrowEvent" =>
      requireObjectShape json ["id", "kind"]
      pure (.globalSynchronousCompensationThrowEvent
        ⟨← decodeNonemptyStringField json "id"⟩)
  | "noneEndEvent" =>
      requireObjectShape json ["id", "kind"]
      pure (.noneEndEvent ⟨← stringField json "id"⟩)
  | "terminateEndEvent" =>
      requireObjectShape json ["id", "kind"]
      pure (.terminateEndEvent ⟨← decodeNonemptyStringField json "id"⟩)
  | "errorEndEvent" =>
      requireObjectShape json ["error", "id", "kind"]
      pure
        (.errorEndEvent
          ⟨← stringField json "id"⟩
          (← decodeErrorReference (← field json "error")))
  | _ => throw s!"unsupported checked node kind {kind}"

private def decodeCheckedSequenceFlow (json : Json) :
    Except String CheckedSequenceFlow := do
  requireObjectShape json ["condition", "id", "sourceId", "targetId"]
  pure
    { id := ⟨← stringField json "id"⟩
      sourceId := ⟨← stringField json "sourceId"⟩
      targetId := ⟨← stringField json "targetId"⟩
      condition := ← decodeCheckedCondition (← field json "condition") }

private def decodeNodeScopeOwnership (json : Json) :
    Except String NodeScopeOwnership := do
  requireObjectShape json ["nodeId", "scopeId"]
  pure
    { nodeId := ⟨← stringField json "nodeId"⟩
      scopeId := ⟨← stringField json "scopeId"⟩ }

private def decodeSequenceFlowScopeOwnership (json : Json) :
    Except String SequenceFlowScopeOwnership := do
  requireObjectShape json ["scopeId", "sequenceFlowId"]
  pure
    { sequenceFlowId := ⟨← stringField json "sequenceFlowId"⟩
      scopeId := ⟨← stringField json "scopeId"⟩ }

/-- Decode the exact current checked-process wire shape without admitting it structurally. Required nullable fields such as a User Task name must be present even when their value is `null`. -/
def decodeCheckedProcess (json : Json) : Except String CheckedProcess := do
  let compensation ← decodeOptionalCheckedCompensationField json
  requireObjectShape json
    (if compensation.isSome then
      ["compensation", "definitionScopes", "identity", "kind", "nodeScopes", "nodes",
        "processId", "sequenceFlowScopes", "sequenceFlows"]
    else
      ["definitionScopes", "identity", "kind", "nodeScopes", "nodes",
        "processId", "sequenceFlowScopes", "sequenceFlows"])
  expectStringField json "kind" "checkedProcess"
  pure
    { identity := ← decodeSourceIdentity (← field json "identity")
      processId := ⟨← stringField json "processId"⟩
      definitionScopes :=
        ← decodeArray decodeDefinitionScope (← field json "definitionScopes")
      nodeScopes :=
        ← decodeArray decodeNodeScopeOwnership (← field json "nodeScopes")
      sequenceFlowScopes :=
        ← decodeArray decodeSequenceFlowScopeOwnership
          (← field json "sequenceFlowScopes")
      nodes := ← decodeArray decodeCheckedNode (← field json "nodes")
      sequenceFlows :=
        ← decodeArray decodeCheckedSequenceFlow
          (← field json "sequenceFlows")
      compensation }

end BpmnSemantics.SemanticProcessJson
