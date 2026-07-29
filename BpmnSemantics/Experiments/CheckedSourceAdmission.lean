import BpmnSemantics.SemanticProcess.Fixtures

/-! # Stage 2 structured-admission proof infrastructure

This module owns fuel-bounded checked-graph facts, a deterministic structured-decomposition probe, and adversarial witnesses. It does not participate in production source admission.
-/

namespace BpmnSemantics.Experiments.CheckedSourceAdmission

open BpmnSemantics.SemanticProcess

private def sourceEdges (source : CheckedProcess) :
    List (GraphEdge NodeId) :=
  source.sequenceFlows.map fun flow =>
    { source := flow.sourceId, target := flow.targetId }

private def allDistinct [DecidableEq α] : List α → Bool
  | [] => true
  | item :: remaining =>
      !remaining.contains item && allDistinct remaining

private def incomingFlows (source : CheckedProcess) (id : NodeId) :
    List CheckedSequenceFlow :=
  source.sequenceFlows.filter fun flow => decide (flow.targetId = id)

def outgoingFlows (source : CheckedProcess) (id : NodeId) :
    List CheckedSequenceFlow :=
  source.sequenceFlows.filter fun flow => decide (flow.sourceId = id)

def nodeAt (source : CheckedProcess) (id : NodeId) :
    Option CheckedNode :=
  source.nodes.find? fun node => decide (node.id = id)

private def nodeExists (source : CheckedProcess) (id : NodeId) : Bool :=
  (nodeAt source id).isSome

private def nodeArityValid (source : CheckedProcess) :
    CheckedNode → Bool
  | .noneStartEvent id =>
      (incomingFlows source id).isEmpty &&
        (outgoingFlows source id).length = 1
  | .noneEndEvent id =>
      (incomingFlows source id).length = 1 &&
        (outgoingFlows source id).isEmpty
  | .userTask id _
  | .intermediateCatchTimerEvent id _
  | .serviceTask id _ _ _ _ _ =>
      (incomingFlows source id).length = 1 &&
        (outgoingFlows source id).length = 1
  | .parallelGateway id .diverging =>
      (incomingFlows source id).length = 1 &&
        (outgoingFlows source id).length = 2
  | .parallelGateway id .converging =>
      (incomingFlows source id).length = 2 &&
        (outgoingFlows source id).length = 1

private def startIds (source : CheckedProcess) : List NodeId :=
  source.nodes.filterMap fun
    | .noneStartEvent id => some id
    | _ => none

private def endIds (source : CheckedProcess) : List NodeId :=
  source.nodes.filterMap fun
    | .noneEndEvent id => some id
    | _ => none

/-- Finite graph facts used by the structured derivation, separate from topology recognition. -/
def sourceGraphWellFormed (source : CheckedProcess) : Bool :=
  let nodes := source.nodes.map (·.id)
  let edges := sourceEdges source
  let fuel := nodes.length
  match startIds source, endIds source with
  | [start], [finish] =>
      allDistinct nodes &&
        allDistinct (source.sequenceFlows.map (·.id)) &&
        source.sequenceFlows.all (fun flow =>
          nodeExists source flow.sourceId &&
            nodeExists source flow.targetId &&
            decide (flow.sourceId ≠ flow.targetId)) &&
        source.nodes.all (nodeArityValid source) &&
        allReachableWithin nodes edges fuel start &&
        allCoreachableWithin nodes edges fuel [finish] &&
        acyclicWithin edges fuel
  | _, _ => false

structure WaitSegment where
  nodeId : NodeId
  deriving Repr, DecidableEq

structure ParallelUserPair where
  forkId : NodeId
  leftTaskId : NodeId
  rightTaskId : NodeId
  joinId : NodeId
  deriving Repr, DecidableEq

inductive StructuredSegment where
  | wait (segment : WaitSegment)
  | parallelUserPair (segment : ParallelUserPair)
  deriving Repr, DecidableEq

structure StructuredDecomposition where
  startId : NodeId
  segments : List StructuredSegment
  finishId : NodeId
  deriving Repr, DecidableEq

structure ParsedTail where
  segments : List StructuredSegment
  visited : List NodeId
  finishId : NodeId
  deriving Repr, DecidableEq

def parseFrom (source : CheckedProcess) :
    Nat → NodeId → Option ParsedTail
  | 0, _ => none
  | fuel + 1, current =>
      match nodeAt source current with
      | some (.noneEndEvent _) =>
          some { segments := [], visited := [current], finishId := current }
      | some (.userTask ..)
      | some (.intermediateCatchTimerEvent ..)
      | some (.serviceTask ..) =>
          match outgoingFlows source current with
          | [flow] =>
              (parseFrom source fuel flow.targetId).map fun tail =>
                { tail with
                  segments :=
                    .wait { nodeId := current } :: tail.segments
                  visited := current :: tail.visited }
          | _ => none
      | some (.parallelGateway _ .diverging) =>
          match outgoingFlows source current with
          | [leftInput, rightInput] =>
              match nodeAt source leftInput.targetId,
                  nodeAt source rightInput.targetId with
              | some (.userTask ..), some (.userTask ..) =>
                  match outgoingFlows source leftInput.targetId,
                      outgoingFlows source rightInput.targetId with
                  | [leftOutput], [rightOutput] =>
                      if leftOutput.targetId = rightOutput.targetId then
                        let joinId := leftOutput.targetId
                        match nodeAt source joinId,
                            outgoingFlows source joinId with
                        | some (.parallelGateway _ .converging), [joinOutput] =>
                            (parseFrom source fuel joinOutput.targetId).map
                              fun tail =>
                                { tail with
                                  segments :=
                                    .parallelUserPair
                                        { forkId := current
                                          leftTaskId := leftInput.targetId
                                          rightTaskId := rightInput.targetId
                                          joinId } ::
                                      tail.segments
                                  visited :=
                                    current :: leftInput.targetId ::
                                      rightInput.targetId :: joinId ::
                                        tail.visited }
                        | _, _ => none
                      else
                        none
                  | _, _ => none
              | _, _ => none
          | _ => none
      | some (.noneStartEvent _)
      | some (.parallelGateway _ .converging)
      | none => none

def isWaitNode : CheckedNode → Bool
  | .userTask ..
  | .intermediateCatchTimerEvent ..
  | .serviceTask .. => true
  | _ => false

inductive SegmentAt (source : CheckedProcess) :
    NodeId → StructuredSegment → NodeId → Prop where
  | wait
      (entry : NodeId) (node : CheckedNode) (flow : CheckedSequenceFlow)
      (nodeFact : nodeAt source entry = some node)
      (waitFact : isWaitNode node = true)
      (flowFact : outgoingFlows source entry = [flow]) :
      SegmentAt source entry (.wait { nodeId := entry }) flow.targetId
  | parallelUserPair
      (fork forkNode leftNode rightNode join joinNode : NodeId)
      (leftName rightName : Option String)
      (leftInput rightInput leftOutput rightOutput joinOutput :
        CheckedSequenceFlow)
      (forkFact :
        nodeAt source fork = some (.parallelGateway forkNode .diverging))
      (inputFacts :
        outgoingFlows source fork = [leftInput, rightInput] ∨
          outgoingFlows source fork = [rightInput, leftInput])
      (leftFact :
        nodeAt source leftInput.targetId = some (.userTask leftNode leftName))
      (rightFact :
        nodeAt source rightInput.targetId = some (.userTask rightNode rightName))
      (leftOutputFact :
        outgoingFlows source leftInput.targetId = [leftOutput])
      (rightOutputFact :
        outgoingFlows source rightInput.targetId = [rightOutput])
      (commonJoin : leftOutput.targetId = join ∧ rightOutput.targetId = join)
      (joinFact :
        nodeAt source join = some (.parallelGateway joinNode .converging))
      (joinOutputFact : outgoingFlows source join = [joinOutput]) :
      SegmentAt source fork
        (.parallelUserPair
          { forkId := fork
            leftTaskId := leftInput.targetId
            rightTaskId := rightInput.targetId
            joinId := join })
        joinOutput.targetId

inductive ChainFrom (source : CheckedProcess) :
    NodeId → List StructuredSegment → NodeId → Prop where
  | finish (entry endNode : NodeId)
      (nodeFact : nodeAt source entry = some (.noneEndEvent endNode)) :
      ChainFrom source entry [] entry
  | next (entry next finish : NodeId) (segment : StructuredSegment)
      (remaining : List StructuredSegment)
      (segmentFact : SegmentAt source entry segment next)
      (tailFact : ChainFrom source next remaining finish) :
      ChainFrom source entry (segment :: remaining) finish

/-- Equality of serial segments and branch-order-insensitive equality of parallel segments. -/
def SegmentEquivalent : StructuredSegment → StructuredSegment → Prop
  | .wait left, .wait right => left = right
  | .parallelUserPair left, .parallelUserPair right =>
      left.forkId = right.forkId ∧
        left.joinId = right.joinId ∧
        ((left.leftTaskId = right.leftTaskId ∧
            left.rightTaskId = right.rightTaskId) ∨
          (left.leftTaskId = right.rightTaskId ∧
            left.rightTaskId = right.leftTaskId))
  | _, _ => False

/-- Pointwise segment equivalence for two graph-derived chains. -/
inductive SegmentsEquivalent :
    List StructuredSegment → List StructuredSegment → Prop where
  | nil : SegmentsEquivalent [] []
  | cons {left right lefts rights}
      (head : SegmentEquivalent left right)
      (tail : SegmentsEquivalent lefts rights) :
      SegmentsEquivalent (left :: lefts) (right :: rights)

/-- One checked graph entry determines one exit and one segment up to branch exchange. -/
theorem segmentAt_unique (source : CheckedProcess)
    (entry leftNext rightNext : NodeId)
    (left right : StructuredSegment)
    (leftFact : SegmentAt source entry left leftNext)
    (rightFact : SegmentAt source entry right rightNext) :
    SegmentEquivalent left right ∧ leftNext = rightNext := by
  cases leftFact <;> cases rightFact <;> simp_all [isWaitNode, SegmentEquivalent]
  all_goals grind

/-- Checked graph facts determine an entire decomposition up to branch exchange. -/
theorem chainFrom_unique (source : CheckedProcess)
    (entry leftFinish rightFinish : NodeId)
    (left right : List StructuredSegment)
    (leftFact : ChainFrom source entry left leftFinish)
    (rightFact : ChainFrom source entry right rightFinish) :
    leftFinish = rightFinish ∧ SegmentsEquivalent left right := by
  induction leftFact generalizing right rightFinish with
  | finish entry endNode endFact =>
      cases rightFact with
      | finish _ _ rightEndFact => exact ⟨by simp_all, .nil⟩
      | next _ _ _ _ _ segmentFact _ =>
          cases segmentFact <;> simp_all [isWaitNode]
  | next entry next leftFinish segment remaining segmentFact tailFact ih =>
      cases rightFact with
      | finish _ _ endFact =>
          cases segmentFact <;> simp_all [isWaitNode]
      | next _ rightNext rightFinish rightSegment rightRemaining
          rightSegmentFact rightTailFact =>
          obtain ⟨segmentEq, nextEq⟩ :=
            segmentAt_unique source entry next rightNext segment rightSegment
              segmentFact rightSegmentFact
          subst rightNext
          obtain ⟨finishEq, tailEq⟩ := ih _ _ rightTailFact
          exact ⟨finishEq, .cons segmentEq tailEq⟩

private theorem mappedWait_sound (source : CheckedProcess) (fuel : Nat)
    (entry : NodeId) (node : CheckedNode) (flow : CheckedSequenceFlow)
    (tail : ParsedTail)
    (nodeFact : nodeAt source entry = some node)
    (waitFact : isWaitNode node = true)
    (flowFact : outgoingFlows source entry = [flow])
    (result :
      (parseFrom source fuel flow.targetId).map (fun remaining =>
        { remaining with
          segments := .wait { nodeId := entry } :: remaining.segments
          visited := entry :: remaining.visited }) = some tail)
    (tailSound : ∀ tail, parseFrom source fuel flow.targetId = some tail →
      ChainFrom source flow.targetId tail.segments tail.finishId) :
    ChainFrom source entry tail.segments tail.finishId := by
  rw [Option.map_eq_some_iff] at result
  obtain ⟨remaining, parsed, rfl⟩ := result
  exact .next entry flow.targetId remaining.finishId
    (.wait { nodeId := entry }) remaining.segments
    (.wait entry node flow nodeFact waitFact flowFact)
    (tailSound remaining parsed)

/-- Every successful executable parse constructs a declarative checked-graph chain. -/
theorem parseFrom_sound (source : CheckedProcess) (fuel : Nat)
    (entry : NodeId) (tail : ParsedTail)
    (result : parseFrom source fuel entry = some tail) :
    ChainFrom source entry tail.segments tail.finishId := by
  induction fuel generalizing entry tail with
  | zero => simp [parseFrom] at result
  | succ fuel ih =>
      cases nodeResult : nodeAt source entry with
      | none => simp [parseFrom, nodeResult] at result
      | some node =>
        cases node with
        | noneEndEvent endNode =>
            simp [parseFrom, nodeResult] at result
            cases result
            exact .finish entry endNode nodeResult
        | noneStartEvent _ => simp [parseFrom, nodeResult] at result
        | userTask id name =>
            grind [parseFrom, mappedWait_sound, isWaitNode]
        | intermediateCatchTimerEvent id duration =>
            grind [parseFrom, mappedWait_sound, isWaitNode]
        | serviceTask id implementation binding inputs outputs route =>
            grind [parseFrom, mappedWait_sound, isWaitNode]
        | parallelGateway gatewayNode direction =>
            cases direction with
            | converging => simp [parseFrom, nodeResult] at result
            | diverging =>
                simp only [parseFrom, nodeResult] at result
                split at result <;> try simp_all
                split at result <;> try simp_all
                split at result <;> try simp_all
                split at result <;> try simp_all
                obtain ⟨_, remaining, parsed, rfl⟩ := result
                apply ChainFrom.next
                · apply SegmentAt.parallelUserPair
                  all_goals try assumption
                  all_goals simp_all
                · exact ih _ _ parsed

private def coversEveryNode (source : CheckedProcess)
    (visited : List NodeId) : Bool :=
  visited.length = source.nodes.length &&
    allDistinct visited &&
    source.nodes.all fun node => visited.contains node.id

private def parseProcess? (source : CheckedProcess) :
    Option StructuredDecomposition :=
  match startIds source, endIds source with
  | [start], [finish] =>
      match outgoingFlows source start with
      | [flow] =>
          match parseFrom source source.nodes.length flow.targetId with
          | some tail =>
              if tail.segments.isEmpty ||
                  tail.finishId ≠ finish ||
                  !coversEveryNode source (start :: tail.visited) then
                none
              else
                some { startId := start, segments := tail.segments, finishId := finish }
          | none => none
      | _ => none
  | _, _ => none

private def composedNodeSurfaceValid : CheckedNode → Bool
  | .intermediateCatchTimerEvent _ durationLiteral =>
      durationLiteral = "PT1S"
  | .serviceTask _ implementation
      (.probe delegateNamespace delegateValue asyncNamespace asyncValue)
      inputMappings outputMappings route =>
      implementation = "urn:bpmn-lean:effect:probe-v1" &&
        delegateNamespace = "http://camunda.org/schema/1.0/bpmn" &&
        delegateValue = "${bpmnLeanEffectHandler}" &&
        asyncNamespace = "http://camunda.org/schema/1.0/bpmn" &&
        asyncValue = "true" &&
        inputMappings.isEmpty &&
        outputMappings.isEmpty &&
        route.isNone
  | .serviceTask .. => false
  | _ => true

private def profileChecks (source : CheckedProcess) : Bool :=
  source.nodes.all composedNodeSurfaceValid &&
    (source.nodes.filter fun
      | .intermediateCatchTimerEvent .. => true
      | _ => false).length ≤ 1 &&
    (source.nodes.filter fun
      | .serviceTask .. => true
      | _ => false).length ≤ 1

def structuredDecomposition? (source : CheckedProcess) :
    Option StructuredDecomposition :=
  if sourceGraphWellFormed source then
    match parseProcess? source with
    | some decomposition =>
        if profileChecks source then some decomposition else none
    | none => none
  else
    none

def structuredAdmissionDecider (source : CheckedProcess) : Bool :=
  (structuredDecomposition? source).isSome

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
