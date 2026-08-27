import BpmnSemantics.Experiments.CheckedSourceDecomposition

/-! # Declarative checked-source chains

This module owns the graph-derived segment and chain relations plus executable-tail-parser soundness for the provisional structured-admission experiment.
-/

namespace BpmnSemantics.Experiments.CheckedSourceAdmission

open BpmnSemantics.SemanticProcess

def isWaitNode : CheckedNode → Bool
  | .userTask _ _ none
  | .intermediateCatchTimerEvent ..
  | .serviceTask .. => true
  | .intermediateCatchMessageEvent .. => false
  | .receiveTask .. => false
  | .configuredTask .. => false
  | .userTask _ _ (some _) => false
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
        nodeAt source leftInput.targetId =
          some (.userTask leftNode leftName none))
      (rightFact :
        nodeAt source rightInput.targetId =
          some (.userTask rightNode rightName none))
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
        | messageStartEvent _ _ => simp [parseFrom, nodeResult] at result
        | timerStartEvent _ _ => simp [parseFrom, nodeResult] at result
        | embeddedSubProcess _ _ => simp [parseFrom, nodeResult] at result
        | callActivity _ _ => simp [parseFrom, nodeResult] at result
        | timerBoundaryEvent _ _ _ _ =>
            simp [parseFrom, nodeResult] at result
        | boundaryErrorEvent _ _ _ _ => simp [parseFrom, nodeResult] at result
        | errorEndEvent _ _ => simp [parseFrom, nodeResult] at result
        | terminateEndEvent _ => simp [parseFrom, nodeResult] at result
        | userTask id name metadata =>
            cases metadata with
            | none => grind [parseFrom, mappedWait_sound, isWaitNode]
            | some metadata => simp [parseFrom, nodeResult] at result
        | sequentialMultiInstanceUserTask id name input output normalOutputFlowId
            boundaryTimer =>
            simp [parseFrom, nodeResult] at result
        | parallelMultiInstanceUserTask id name input output completionCondition normalOutputFlowId
            boundaryTimer =>
            simp [parseFrom, nodeResult] at result
        | intermediateCatchTimerEvent id duration =>
            grind [parseFrom, mappedWait_sound, isWaitNode]
        | intermediateCatchMessageEvent id channel =>
            simp [parseFrom, nodeResult] at result
        | receiveTask id channel =>
            simp [parseFrom, nodeResult] at result
        | configuredTask id descriptor =>
            simp [parseFrom, nodeResult] at result
        | serviceTask id descriptor inputs outputs route =>
            grind [parseFrom, mappedWait_sound, isWaitNode]
        | exclusiveMerge id =>
            simp [parseFrom, nodeResult] at result
        | exclusiveGateway id candidateFlowIds defaultFlowId =>
            simp [parseFrom, nodeResult] at result
        | inclusiveGatewayDiverging id candidateFlowIds defaultFlowId =>
            simp [parseFrom, nodeResult] at result
        | inclusiveGatewayConverging id pairedGatewayId =>
            simp [parseFrom, nodeResult] at result
        | eventBasedGateway id =>
            simp [parseFrom, nodeResult] at result
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

end BpmnSemantics.Experiments.CheckedSourceAdmission
