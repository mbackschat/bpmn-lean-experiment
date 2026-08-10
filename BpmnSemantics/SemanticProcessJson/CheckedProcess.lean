import BpmnSemantics.SemanticProcess.JsonSupport
import BpmnSemantics.SemanticProcessJson.Elements

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

/-- Rejects any lexeme outside the closed disposition, so an unknown value never defaults into one. -/
private def decodeBoundaryInterruption (value : String) :
    Except String BoundaryInterruption :=
  match value with
  | "interrupting" => pure .interrupting
  | "nonInterrupting" => pure .nonInterrupting
  | other => throw s!"unknown boundary interruption: {other}"

private def decodeCheckedNode (json : Json) : Except String CheckedNode := do
  let kind ← stringField json "kind"
  match kind with
  | "noneStartEvent" =>
      requireObjectShape json ["id", "kind"]
      pure (.noneStartEvent ⟨← stringField json "id"⟩)
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
  | "userTask" =>
      requireObjectShape json ["id", "kind", "name"]
      pure
        (.userTask
          ⟨← stringField json "id"⟩
          (← decodeOptionalString (← field json "name")))
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
  | "receiveTask" =>
      requireObjectShape json ["channel", "id", "kind"]
      pure
        (.receiveTask
          ⟨← stringField json "id"⟩
          (← decodeMessageChannel (← field json "channel")))
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
  | "noneEndEvent" =>
      requireObjectShape json ["id", "kind"]
      pure (.noneEndEvent ⟨← stringField json "id"⟩)
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
  requireObjectShape json
    ["definitionScopes", "identity", "kind", "nodeScopes", "nodes",
      "processId", "sequenceFlowScopes", "sequenceFlows"]
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
          (← field json "sequenceFlows") }

end BpmnSemantics.SemanticProcessJson
