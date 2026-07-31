import BpmnSemantics.Experiments.CheckedSourceCoverage
import BpmnSemantics.SemanticProcess.Fixtures

/-! # Stage 2 structured-admission witnesses

This module owns adversarial executable witnesses for the provisional structured-admission experiment. It does not participate in production source admission.
-/

namespace BpmnSemantics.Experiments.CheckedSourceAdmission

open BpmnSemantics.SemanticProcess

private def disconnectedProgram : Program :=
  let scopeId := rootDefinitionScopeId sequentialProgram.processId
  let input : ControlPlace :=
    { id := ⟨"place:DisconnectedInput"⟩
      origin := { elementId := ⟨"Flow_DisconnectedInput"⟩ } }
  let output : ControlPlace :=
    { id := ⟨"place:DisconnectedOutput"⟩
      origin := { elementId := ⟨"Flow_DisconnectedOutput"⟩ } }
  let operation : SemanticOperation :=
    .awaitUserTask ⟨"operation:DisconnectedTask"⟩
      { elementId := ⟨"DisconnectedTask"⟩ }
      input.id output.id { id := ⟨"DisconnectedTask"⟩, name := none }
  { sequentialProgram with
    identity :=
      { sequentialProgram.identity with
        semanticProfile := ⟨"checked-source-stage-2"⟩
        sourceId := ⟨"disconnected-program"⟩
        sourceSha256 :=
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    operationScopes :=
      sequentialProgram.operationScopes ++ [{ operationId := operation.id, scopeId }]
    controlPlaceScopes := sequentialProgram.controlPlaceScopes ++
      [ { controlPlaceId := input.id, scopeId }
      , { controlPlaceId := output.id, scopeId } ]
    controlPlaces := sequentialProgram.controlPlaces ++ [input, output]
    operations := sequentialProgram.operations ++ [operation] }

/-- A structurally disconnected program must fail standalone validation. -/
theorem disconnectedProgramIsRejected :
    programWellFormed disconnectedProgram = false := by
  decide

private def twoSegmentSource : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"checked-source-stage-2"⟩
        sourceId := ⟨"two-segment-source"⟩
        sourceSha256 :=
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    processId := ⟨"Process_TwoSegment"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_TwoSegment"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_TwoSegment"⟩
      [⟨"End"⟩, ⟨"Start"⟩, ⟨"Task_A"⟩, ⟨"Task_B"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"Process_TwoSegment"⟩
      [⟨"Flow_A_B"⟩, ⟨"Flow_B_End"⟩, ⟨"Flow_Start_A"⟩]
    nodes :=
      [ .noneEndEvent ⟨"End"⟩
      , .noneStartEvent ⟨"Start"⟩
      , .userTask ⟨"Task_A"⟩ (some "A")
      , .userTask ⟨"Task_B"⟩ (some "B") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_A_B"⟩, sourceId := ⟨"Task_A"⟩,
          targetId := ⟨"Task_B"⟩ }
      , { id := ⟨"Flow_B_End"⟩, sourceId := ⟨"Task_B"⟩,
          targetId := ⟨"End"⟩ }
      , { id := ⟨"Flow_Start_A"⟩, sourceId := ⟨"Start"⟩,
          targetId := ⟨"Task_A"⟩ } ] }

private def zeroSegmentSource : CheckedProcess :=
  { twoSegmentSource with
    identity := { twoSegmentSource.identity with sourceId := ⟨"zero-segment"⟩ }
    nodeScopes := rootNodeScopes twoSegmentSource.processId [⟨"End"⟩, ⟨"Start"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes twoSegmentSource.processId
      [⟨"Flow_Start_End"⟩]
    nodes := [.noneEndEvent ⟨"End"⟩, .noneStartEvent ⟨"Start"⟩]
    sequenceFlows :=
      [ { id := ⟨"Flow_Start_End"⟩
          sourceId := ⟨"Start"⟩
          targetId := ⟨"End"⟩ } ] }

private def disconnectedCycleSource : CheckedProcess :=
  { twoSegmentSource with
    identity :=
      { twoSegmentSource.identity with sourceId := ⟨"disconnected-cycle"⟩ }
    nodeScopes := rootNodeScopes twoSegmentSource.processId
      [⟨"End"⟩, ⟨"Start"⟩, ⟨"Task_A"⟩, ⟨"Task_B"⟩, ⟨"Task_C"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes twoSegmentSource.processId
      [⟨"Flow_A_End"⟩, ⟨"Flow_B_C"⟩, ⟨"Flow_C_B"⟩,
        ⟨"Flow_Start_A"⟩]
    nodes :=
      [ .noneEndEvent ⟨"End"⟩
      , .noneStartEvent ⟨"Start"⟩
      , .userTask ⟨"Task_A"⟩ (some "A")
      , .userTask ⟨"Task_B"⟩ (some "B")
      , .userTask ⟨"Task_C"⟩ (some "C") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_A_End"⟩, sourceId := ⟨"Task_A"⟩,
          targetId := ⟨"End"⟩ }
      , { id := ⟨"Flow_B_C"⟩, sourceId := ⟨"Task_B"⟩,
          targetId := ⟨"Task_C"⟩ }
      , { id := ⟨"Flow_C_B"⟩, sourceId := ⟨"Task_C"⟩,
          targetId := ⟨"Task_B"⟩ }
      , { id := ⟨"Flow_Start_A"⟩, sourceId := ⟨"Start"⟩,
          targetId := ⟨"Task_A"⟩ } ] }

private def twoTimerSource : CheckedProcess :=
  { twoSegmentSource with
    identity := { twoSegmentSource.identity with sourceId := ⟨"two-timers"⟩ }
    nodes :=
      [ .noneEndEvent ⟨"End"⟩
      , .noneStartEvent ⟨"Start"⟩
      , .intermediateCatchTimerEvent ⟨"Task_A"⟩ "PT1S"
      , .intermediateCatchTimerEvent ⟨"Task_B"⟩ "PT1S" ] }

theorem twoSegmentSourceIsAccepted :
    structuredAdmissionDecider twoSegmentSource = true := by
  decide

theorem parallelSourceIsAccepted :
    structuredAdmissionDecider parallelCheckedProcess = true := by
  decide

theorem zeroSegmentSourceIsRejected :
    structuredAdmissionDecider zeroSegmentSource = false := by
  decide

theorem disconnectedCycleIsRejected :
    sourceGraphWellFormed disconnectedCycleSource = false := by
  decide

theorem secondTimerIsRejected :
    structuredAdmissionDecider twoTimerSource = false := by
  decide

private def exactProbeServiceNode (route : Option CheckedBpmnErrorRoute := none) :
    CheckedNode :=
  .serviceTask ⟨"ServiceTask"⟩
    { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
      operation := "urn:bpmn-lean:effect-operation:probe-v1" }
    [] [] route

private def excludedExclusiveGateway : CheckedNode :=
  .exclusiveGateway ⟨"Choice"⟩
    [⟨"Flow_First"⟩, ⟨"Flow_Second"⟩] ⟨"Flow_Default"⟩

private def excludedMessageCatch : CheckedNode :=
  .intermediateCatchMessageEvent ⟨"MessageCatch"⟩
    { interfaceId := ⟨"Interface"⟩
      interfaceOperationId := ⟨"Operation"⟩
      messageId := ⟨"Message"⟩
    }

private def excludedEmbeddedSubProcess : CheckedNode :=
  .embeddedSubProcess ⟨"EmbeddedSubProcess"⟩ ⟨"scope:child"⟩

private def excludedBoundaryRoute : CheckedBpmnErrorRoute :=
  { boundaryEventId := ⟨"BoundaryError"⟩
    boundaryEventName := none
    attachedToRef := ⟨"ServiceTask"⟩
    errorDefinitionId := ⟨"ErrorDefinition"⟩
    errorElementId := ⟨"Error"⟩
    errorName := none
    code := "Error"
    outputFlowId := ⟨"Flow_Error"⟩ }

theorem composedWaitSurfaceIsExact :
    composedNodeSurfaceValid
        (.intermediateCatchTimerEvent ⟨"Timer"⟩ "PT1S") = true ∧
      composedNodeSurfaceValid
        (.intermediateCatchTimerEvent ⟨"Timer"⟩ "PT5M") = false ∧
      composedNodeSurfaceValid exactProbeServiceNode = true ∧
      composedNodeSurfaceValid
        (.serviceTask ⟨"ServiceTask"⟩
          { protocol := "urn:bpmn-lean:effect-protocol:unreviewed"
            operation := "urn:bpmn-lean:effect-operation:probe-v1" }
          [] [] none) = false ∧
      composedNodeSurfaceValid
        (.serviceTask ⟨"ServiceTask"⟩
          { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
            operation :=
              "urn:bpmn-lean:effect-operation:mapped-success-v1" }
          [] [] none) = false ∧
      composedNodeSurfaceValid
        (exactProbeServiceNode (some excludedBoundaryRoute)) = false := by
  decide

/-- Expanding the production checked-node union does not silently expand the frozen structured-admission experiment. -/
theorem exclusiveGatewayRemainsOutsideFrozenExperiment :
    nodeArityValid twoSegmentSource excludedExclusiveGateway = false ∧
      composedNodeSurfaceValid excludedExclusiveGateway = false := by
  decide

/-- Production Message support does not silently expand the frozen structured-admission experiment. -/
theorem messageCatchRemainsOutsideFrozenExperiment :
    composedNodeSurfaceValid excludedMessageCatch = false := by
  decide

/-- Production embedded-scope support does not silently expand the frozen structured-admission experiment. -/
theorem embeddedSubProcessRemainsOutsideFrozenExperiment :
    nodeArityValid twoSegmentSource excludedEmbeddedSubProcess = false ∧
      composedNodeSurfaceValid excludedEmbeddedSubProcess = false := by
  decide

private def threeCycle : List (GraphEdge NodeId) :=
  [ { source := ⟨"A"⟩, target := ⟨"B"⟩ }
  , { source := ⟨"B"⟩, target := ⟨"C"⟩ }
  , { source := ⟨"C"⟩, target := ⟨"A"⟩ } ]

/-- One search round misses the three-edge return path. -/
theorem boundedSearchWronglyAccepts :
    acyclicWithin threeCycle 1 = true := by decide

/-- Saturation certification rejects the same under-fueled search. -/
theorem saturationCertifiedRejects :
    acyclicClosed threeCycle 1 = false := by decide

/-- Vertex-count fuel is a control showing that the retained witness is not a live fixture defect. -/
theorem bothRejectAtVertexFuel :
    acyclicWithin threeCycle 3 = false ∧
      acyclicClosed threeCycle 3 = false := by decide

/-- Two search rounds already expose the return path in the old predicate. -/
theorem boundedSearchCorrectAtTwo :
    acyclicWithin threeCycle 2 = false := by decide

private def graphPredicateChecks : Bool :=
  let forward : List (GraphEdge NodeId) :=
    [{ source := ⟨"A"⟩, target := ⟨"B"⟩ }]
  let cycle : List (GraphEdge NodeId) :=
    [{ source := ⟨"A"⟩, target := ⟨"B"⟩ },
      { source := ⟨"B"⟩, target := ⟨"A"⟩ }]
  reachableWithin forward 2 ⟨"A"⟩ ⟨"B"⟩ &&
    allCoreachableWithin [⟨"A"⟩, ⟨"B"⟩] forward 2 [⟨"B"⟩] &&
    !acyclicWithin cycle 2

def stageTwoAdmissionChecks : Bool :=
  graphPredicateChecks &&
    acyclicWithin threeCycle 1 &&
    !acyclicClosed threeCycle 1 &&
    !acyclicWithin threeCycle 2 &&
    !acyclicWithin threeCycle 3 &&
    !acyclicClosed threeCycle 3 &&
    composedNodeSurfaceValid
      (.intermediateCatchTimerEvent ⟨"Timer"⟩ "PT1S") &&
    !composedNodeSurfaceValid
      (.intermediateCatchTimerEvent ⟨"Timer"⟩ "PT5M") &&
    composedNodeSurfaceValid exactProbeServiceNode &&
    !nodeArityValid twoSegmentSource excludedExclusiveGateway &&
    !composedNodeSurfaceValid excludedExclusiveGateway &&
    !composedNodeSurfaceValid excludedMessageCatch &&
    !composedNodeSurfaceValid
      (exactProbeServiceNode (some excludedBoundaryRoute)) &&
    structuredAdmissionDecider twoSegmentSource &&
    structuredAdmissionDecider parallelCheckedProcess &&
    !structuredAdmissionDecider zeroSegmentSource &&
    !sourceGraphWellFormed disconnectedCycleSource &&
    !structuredAdmissionDecider twoTimerSource &&
    !programWellFormed disconnectedProgram

end BpmnSemantics.Experiments.CheckedSourceAdmission
