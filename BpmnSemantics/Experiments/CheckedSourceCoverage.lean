import BpmnSemantics.Experiments.CheckedSourceChain

/-! # Whole-process checked-source coverage

This module relates successful structured decomposition to graph-derived Start, End, chain, node-coverage, and Sequence-Flow-coverage facts. Parser state remains private proof plumbing.
-/

namespace BpmnSemantics.Experiments.CheckedSourceAdmission

open BpmnSemantics.SemanticProcess

def segmentNodes : StructuredSegment → List NodeId
  | .wait segment => [segment.nodeId]
  | .parallelUserPair segment =>
      [segment.forkId, segment.leftTaskId, segment.rightTaskId, segment.joinId]

def decompositionNodes (decomposition : StructuredDecomposition) : List NodeId :=
  decomposition.startId ::
    (decomposition.segments.flatMap segmentNodes ++ [decomposition.finishId])

def decompositionFlows (source : CheckedProcess)
    (decomposition : StructuredDecomposition) : List CheckedSequenceFlow :=
  (decompositionNodes decomposition).flatMap (outgoingFlows source)

private theorem parseFrom_visited (source : CheckedProcess) (fuel : Nat)
    (entry : NodeId) (tail : ParsedTail)
    (result : parseFrom source fuel entry = some tail) :
    tail.visited =
      tail.segments.flatMap segmentNodes ++ [tail.finishId] := by
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
            rfl
        | noneStartEvent _ => simp [parseFrom, nodeResult] at result
        | messageStartEvent _ _ => simp [parseFrom, nodeResult] at result
        | timerStartEvent _ _ => simp [parseFrom, nodeResult] at result
        | embeddedSubProcess _ _ => simp [parseFrom, nodeResult] at result
        | callActivity _ _ => simp [parseFrom, nodeResult] at result
        | boundaryErrorEvent _ _ _ _ => simp [parseFrom, nodeResult] at result
        | timerBoundaryEvent _ _ _ _ => simp [parseFrom, nodeResult] at result
        | errorEndEvent _ _ => simp [parseFrom, nodeResult] at result
        | terminateEndEvent _ => simp [parseFrom, nodeResult] at result
        | configuredTask _ _ => simp [parseFrom, nodeResult] at result
        | userTask _ _ metadata =>
            cases metadata with
            | none =>
                simp only [parseFrom, nodeResult] at result
                split at result <;> try simp at result
                obtain ⟨remaining, parsed, rfl⟩ := result
                simp [segmentNodes, ih _ _ parsed]
            | some metadata => simp [parseFrom, nodeResult] at result
        | sequentialMultiInstanceUserTask _ _ _ _ _ _ =>
            simp [parseFrom, nodeResult] at result
        | intermediateCatchTimerEvent _ _
        | serviceTask _ _ _ _ _ =>
            simp only [parseFrom, nodeResult] at result
            split at result <;> try simp at result
            obtain ⟨remaining, parsed, rfl⟩ := result
            simp [segmentNodes, ih _ _ parsed]
        | intermediateCatchMessageEvent _ _ =>
            simp [parseFrom, nodeResult] at result
        | receiveTask _ _ =>
            simp [parseFrom, nodeResult] at result
        | exclusiveMerge _ =>
            simp [parseFrom, nodeResult] at result
        | exclusiveGateway _ _ _ =>
            simp [parseFrom, nodeResult] at result
        | inclusiveGatewayDiverging _ _ _ =>
            simp [parseFrom, nodeResult] at result
        | inclusiveGatewayConverging _ _ =>
            simp [parseFrom, nodeResult] at result
        | eventBasedGateway _ =>
            simp [parseFrom, nodeResult] at result
        | parallelGateway _ direction =>
            cases direction with
            | converging => simp [parseFrom, nodeResult] at result
            | diverging =>
                simp only [parseFrom, nodeResult] at result
                split at result <;> try simp_all
                split at result <;> try simp_all
                split at result <;> try simp_all
                split at result <;> try simp_all
                obtain ⟨_, remaining, parsed, rfl⟩ := result
                simp [segmentNodes, ih _ _ parsed]

private theorem parseProcess_sound (source : CheckedProcess)
    (decomposition : StructuredDecomposition)
    (result : parseProcess? source = some decomposition) :
    ∃ flow : CheckedSequenceFlow,
      startIds source = [decomposition.startId] ∧
      endIds source = [decomposition.finishId] ∧
      outgoingFlows source decomposition.startId = [flow] ∧
      ChainFrom source flow.targetId decomposition.segments
        decomposition.finishId ∧
      decomposition.segments ≠ [] ∧
      (decompositionNodes decomposition).length = source.nodes.length ∧
      allDistinct (decompositionNodes decomposition) = true ∧
      ∀ node ∈ source.nodes,
        (decompositionNodes decomposition).contains node.id = true := by
  unfold parseProcess? at result
  split at result <;> try simp_all
  split at result <;> try simp_all
  split at result <;> try simp_all
  obtain ⟨⟨⟨nonempty, finishEq⟩, coverage⟩, rfl⟩ := result
  rw [parseFrom_visited source source.nodes.length _ _ ‹_›] at coverage
  subst finishEq
  change coversEveryNode source
    (decompositionNodes
      { startId := ‹NodeId›
        segments := ‹ParsedTail›.segments
        finishId := ‹ParsedTail›.finishId }) = true at coverage
  simp only [coversEveryNode, Bool.and_eq_true, decide_eq_true_eq,
    List.all_eq_true] at coverage
  constructor
  · simp
  constructor
  · simp
  refine ⟨‹CheckedSequenceFlow›, ?_, ?_, nonempty, ?_, ?_, ?_⟩
  · assumption
  · simpa using parseFrom_sound source source.nodes.length _ _ ‹_›
  · simpa [decompositionNodes] using coverage.1.1
  · simpa [decompositionNodes] using coverage.1.2
  · simpa [decompositionNodes] using coverage.2

private theorem startIds_singleton (source : CheckedProcess) (start : NodeId)
    (fact : startIds source = [start]) :
    CheckedNode.noneStartEvent start ∈ source.nodes ∧
      ∀ other, CheckedNode.noneStartEvent other ∈ source.nodes →
        other = start := by
  have mapped : start ∈ startIds source := by simp [fact]
  rw [startIds, List.mem_filterMap] at mapped
  obtain ⟨node, member, nodeResult⟩ := mapped
  constructor
  · cases node <;> simp_all
  · intro other otherMember
    have otherMapped : other ∈ startIds source := by
      rw [startIds, List.mem_filterMap]
      exact ⟨.noneStartEvent other, otherMember, rfl⟩
    rw [fact] at otherMapped
    simpa using otherMapped

private theorem endIds_singleton (source : CheckedProcess) (finish : NodeId)
    (fact : endIds source = [finish]) :
    CheckedNode.noneEndEvent finish ∈ source.nodes ∧
      ∀ other, CheckedNode.noneEndEvent other ∈ source.nodes →
        other = finish := by
  have mapped : finish ∈ endIds source := by simp [fact]
  rw [endIds, List.mem_filterMap] at mapped
  obtain ⟨node, member, nodeResult⟩ := mapped
  constructor
  · cases node <;> simp_all
  · intro other otherMember
    have otherMapped : other ∈ endIds source := by
      rw [endIds, List.mem_filterMap]
      exact ⟨.noneEndEvent other, otherMember, rfl⟩
    rw [fact] at otherMapped
    simpa using otherMapped

private theorem decompositionComponents (source : CheckedProcess)
    (decomposition : StructuredDecomposition)
    (result : structuredDecomposition? source = some decomposition) :
    sourceGraphWellFormed source = true ∧
      profileChecks source = true ∧
      parseProcess? source = some decomposition := by
  unfold structuredDecomposition? at result
  split at result <;> try simp_all
  split at result <;> simp_all

private theorem flowSourceResolves (source : CheckedProcess)
    (wellFormed : sourceGraphWellFormed source = true)
    (flow : CheckedSequenceFlow) (member : flow ∈ source.sequenceFlows) :
    ∃ node ∈ source.nodes, node.id = flow.sourceId := by
  unfold sourceGraphWellFormed at wellFormed
  split at wellFormed <;> simp_all [nodeExists, nodeAt]

private theorem flow_coverage (source : CheckedProcess)
    (decomposition : StructuredDecomposition)
    (wellFormed : sourceGraphWellFormed source = true)
    (nodeCoverage : ∀ node ∈ source.nodes,
      (decompositionNodes decomposition).contains node.id = true) :
    (∀ flow, flow ∈ source.sequenceFlows ↔
        flow ∈ decompositionFlows source decomposition) ∧
      ∀ flow entry other,
        flow ∈ outgoingFlows source entry →
        flow ∈ outgoingFlows source other →
        entry = other := by
  constructor
  · intro flow
    constructor
    · intro member
      obtain ⟨node, nodeMember, sourceId⟩ :=
        flowSourceResolves source wellFormed flow member
      apply List.mem_flatMap.mpr
      exact ⟨node.id, by simpa using nodeCoverage node nodeMember,
        by simp [outgoingFlows, member, sourceId]⟩
    · intro member
      obtain ⟨_, _, flowMember⟩ := List.mem_flatMap.mp member
      simp [outgoingFlows] at flowMember
      exact flowMember.1
  · intro flow entry other entryMember otherMember
    simp [outgoingFlows] at entryMember otherMember
    grind

/-- Graph-derived whole-process facts exposed by successful structured admission. -/
structure WholeProcessDecompositionFacts (source : CheckedProcess)
    (decomposition : StructuredDecomposition) : Prop where
  sourceGraph : sourceGraphWellFormed source = true
  profile : profileChecks source = true
  startNode : CheckedNode.noneStartEvent decomposition.startId ∈ source.nodes
  startUnique : ∀ other, CheckedNode.noneStartEvent other ∈ source.nodes →
    other = decomposition.startId
  finishNode : CheckedNode.noneEndEvent decomposition.finishId ∈ source.nodes
  finishUnique : ∀ other, CheckedNode.noneEndEvent other ∈ source.nodes →
    other = decomposition.finishId
  initialChain : ∃ flow : CheckedSequenceFlow,
    outgoingFlows source decomposition.startId = [flow] ∧
      ChainFrom source flow.targetId decomposition.segments decomposition.finishId
  nonempty : decomposition.segments ≠ []
  nodeCount : (decompositionNodes decomposition).length = source.nodes.length
  nodeDistinct : allDistinct (decompositionNodes decomposition) = true
  nodeCoverage : ∀ node ∈ source.nodes,
    (decompositionNodes decomposition).contains node.id = true
  flowCoverage : ∀ flow, flow ∈ source.sequenceFlows ↔
    flow ∈ decompositionFlows source decomposition
  flowSourceUnique : ∀ flow entry other,
    flow ∈ outgoingFlows source entry →
      flow ∈ outgoingFlows source other → entry = other

/-- Successful admission exposes only graph-derived whole-process facts. -/
theorem structuredDecomposition_sound (source : CheckedProcess)
    (decomposition : StructuredDecomposition)
    (result : structuredDecomposition? source = some decomposition) :
    WholeProcessDecompositionFacts source decomposition := by
  obtain ⟨sourceGraph, profile, processResult⟩ :=
    decompositionComponents source decomposition result
  obtain ⟨flow, startFact, finishFact, flowFact, chain, nonempty,
      nodeCount, nodeDistinct, nodeCoverage⟩ :=
    parseProcess_sound source decomposition processResult
  obtain ⟨startNode, startUnique⟩ :=
    startIds_singleton source decomposition.startId startFact
  obtain ⟨finishNode, finishUnique⟩ :=
    endIds_singleton source decomposition.finishId finishFact
  obtain ⟨flowCoverage, flowSourceUnique⟩ :=
    flow_coverage source decomposition sourceGraph nodeCoverage
  exact
    { sourceGraph
      profile
      startNode
      startUnique
      finishNode
      finishUnique
      initialChain := ⟨flow, flowFact, chain⟩
      nonempty
      nodeCount
      nodeDistinct
      nodeCoverage
      flowCoverage
      flowSourceUnique }

/-- The parsed chain is canonical among graph-derived chains, up to branch exchange. -/
theorem parsed_chain_is_canonical (source : CheckedProcess)
    (decomposition : StructuredDecomposition) (entry finish : NodeId)
    (other : List StructuredSegment)
    (parsed : ChainFrom source entry decomposition.segments
      decomposition.finishId)
    (rival : ChainFrom source entry other finish) :
    finish = decomposition.finishId ∧
      SegmentsEquivalent other decomposition.segments :=
  chainFrom_unique source entry finish decomposition.finishId other
    decomposition.segments rival parsed

end BpmnSemantics.Experiments.CheckedSourceAdmission
