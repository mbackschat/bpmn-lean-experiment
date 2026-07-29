import BpmnSemantics.Experiments.CheckedSourceCoverage
import BpmnSemantics.SemanticProcess.Fixtures

/-! # Stage 2 structured-admission witnesses

This module owns adversarial executable witnesses for the provisional structured-admission experiment. It does not participate in production source admission.
-/

namespace BpmnSemantics.Experiments.CheckedSourceAdmission

open BpmnSemantics.SemanticProcess

private def disconnectedProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"checked-source-stage-2"⟩
        sourceId := ⟨"disconnected-program"⟩
        sourceSha256 :=
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    processId := ⟨"Process_Disconnected"⟩
    controlPlaces :=
      [ { id := ⟨"place:A"⟩, origin := { elementId := ⟨"Flow_A"⟩ } }
      , { id := ⟨"place:B"⟩, origin := { elementId := ⟨"Flow_B"⟩ } }
      , { id := ⟨"place:C"⟩, origin := { elementId := ⟨"Flow_C"⟩ } } ]
    operations :=
      [ .terminate ⟨"operation:End"⟩ { elementId := ⟨"End"⟩ } ⟨"place:A"⟩
      , .initiate ⟨"operation:Start"⟩ { elementId := ⟨"Start"⟩ } ⟨"place:A"⟩
      , .awaitUserTask ⟨"operation:Task"⟩ { elementId := ⟨"Task"⟩ }
          ⟨"place:B"⟩ ⟨"place:C"⟩ { id := ⟨"Task"⟩, name := none } ] }

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
    nodes := [.noneEndEvent ⟨"End"⟩, .noneStartEvent ⟨"Start"⟩]
    sequenceFlows :=
      [ { id := ⟨"Flow_Start_End"⟩
          sourceId := ⟨"Start"⟩
          targetId := ⟨"End"⟩ } ] }

private def disconnectedCycleSource : CheckedProcess :=
  { twoSegmentSource with
    identity :=
      { twoSegmentSource.identity with sourceId := ⟨"disconnected-cycle"⟩ }
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
  .serviceTask ⟨"ServiceTask"⟩ "urn:bpmn-lean:effect:probe-v1"
    (.probe "http://camunda.org/schema/1.0/bpmn"
      "${bpmnLeanEffectHandler}"
      "http://camunda.org/schema/1.0/bpmn" "true")
    [] [] route

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
        (.serviceTask ⟨"ServiceTask"⟩ "urn:unreviewed"
          (.probe "http://camunda.org/schema/1.0/bpmn"
            "${bpmnLeanEffectHandler}"
            "http://camunda.org/schema/1.0/bpmn" "true")
          [] [] none) = false ∧
      composedNodeSurfaceValid
        (.serviceTask ⟨"ServiceTask"⟩ "urn:bpmn-lean:a12-delegate:v1"
          (.a12CreateDocument "" "" "" "" "" "" "") [] [] none) = false ∧
      composedNodeSurfaceValid
        (exactProbeServiceNode (some excludedBoundaryRoute)) = false := by
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
    !composedNodeSurfaceValid
      (exactProbeServiceNode (some excludedBoundaryRoute)) &&
    structuredAdmissionDecider twoSegmentSource &&
    structuredAdmissionDecider parallelCheckedProcess &&
    !structuredAdmissionDecider zeroSegmentSource &&
    !sourceGraphWellFormed disconnectedCycleSource &&
    !structuredAdmissionDecider twoTimerSource &&
    !programWellFormed disconnectedProgram

end BpmnSemantics.Experiments.CheckedSourceAdmission
