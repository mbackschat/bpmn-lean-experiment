import BpmnSemantics.SemanticProcess.GraphValidation
import BpmnSemantics.SemanticProcess.ProfileAdmission

/-! # Checked BPMN graph validation

This module owns topology-independent reachability, co-reachability, and cycle rejection for the production checked graph. `normalizedFlowSource` remains scoped to the inline Service Task boundary route, where the boundary event is source metadata rather than a checked runtime node. Explicit boundary nodes contribute a separate parent-local exceptional edge from the Activity they attach to, keyed on attachment rather than on trigger kind.
-/

namespace BpmnSemantics.SemanticProcess

private def checkedNodeId : CheckedNode → NodeId
  | .noneStartEvent id
  | .messageStartEvent id _
  | .embeddedSubProcess id _
  | .callActivity id _
  | .boundaryErrorEvent id _ _ _
  | .timerBoundaryEvent id _ _ _ _
  | .userTask id _
  | .intermediateCatchTimerEvent id _
  | .intermediateCatchMessageEvent id _
  | .receiveTask id _
  | .serviceTask id _ _ _ _
  | .parallelGateway id _
  | .exclusiveMerge id
  | .exclusiveGateway id _ _
  | .inclusiveGatewayDiverging id _ _
  | .inclusiveGatewayConverging id _
  | .eventBasedGateway id
  | .errorEndEvent id _
  | .noneEndEvent id => id

private def normalizedFlowSource (nodes : List CheckedNode)
    (sourceId : NodeId) : NodeId :=
  if nodes.any fun node => decide (checkedNodeId node = sourceId) then
    sourceId
  else
    (nodes.findSome? fun
      | .serviceTask id _ _ _ (some route) =>
          if route.boundaryEventId = sourceId then some id else none
      | _ => none).getD sourceId

def checkedNodeScopeId? (source : CheckedProcess) (nodeId : NodeId) :
    Option DefinitionScopeId :=
  (source.nodeScopes.find? fun ownership =>
    decide (ownership.nodeId = nodeId)).map (·.scopeId)

def checkedSequenceFlowScopeId? (source : CheckedProcess)
    (flowId : SequenceFlowId) :
    Option DefinitionScopeId :=
  (source.sequenceFlowScopes.find? fun ownership =>
    decide (ownership.sequenceFlowId = flowId)).map (·.scopeId)

private def scopedNodes (source : CheckedProcess) (scopeId : DefinitionScopeId) :
    List CheckedNode :=
  source.nodes.filter fun node =>
    checkedNodeScopeId? source (checkedNodeId node) == some scopeId

private def scopedFlows (source : CheckedProcess) (scopeId : DefinitionScopeId) :
    List CheckedSequenceFlow :=
  source.sequenceFlows.filter fun flow =>
    checkedSequenceFlowScopeId? source flow.id == some scopeId

private def checkedEdges (source : CheckedProcess)
    (flows : List CheckedSequenceFlow) : List (GraphEdge NodeId) :=
  flows.map fun flow =>
    { source := normalizedFlowSource source.nodes flow.sourceId
      target := flow.targetId }

/-- Keyed on attachment, not on trigger kind: every boundary Event is reachable only through the Activity it is attached to, so a family added here without its edge would leave its own node unreachable. -/
private def attachedBoundaryHost? : CheckedNode → Option (GraphEdge NodeId)
  | .boundaryErrorEvent id attachedToRef _ _
  | .timerBoundaryEvent id attachedToRef _ _ _ =>
      some { source := attachedToRef, target := id }
  | .noneStartEvent .. | .messageStartEvent .. | .embeddedSubProcess .. | .callActivity ..
  | .userTask .. | .intermediateCatchTimerEvent ..
  | .intermediateCatchMessageEvent .. | .receiveTask .. | .serviceTask ..
  | .parallelGateway .. | .exclusiveGateway ..
  | .exclusiveMerge ..
  | .inclusiveGatewayDiverging .. | .inclusiveGatewayConverging ..
  | .eventBasedGateway .. | .errorEndEvent .. | .noneEndEvent .. => none

private def exceptionalEdges (nodes : List CheckedNode) : List (GraphEdge NodeId) :=
  nodes.filterMap attachedBoundaryHost?

private def checkedStartIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .noneStartEvent id => some id
    | .messageStartEvent id _ => some id
    | _ => none

private def checkedEndIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .errorEndEvent id _ => some id
    | .noneEndEvent id => some id
    | _ => none

/-- Closed checked-source resumption family for the only profile that selects a cut graph. -/
def checkedNodeIsResumptionCut : CheckedNode → Bool
  | .userTask .. => true
  | .noneStartEvent .. | .messageStartEvent .. | .embeddedSubProcess .. | .callActivity ..
  | .boundaryErrorEvent .. | .timerBoundaryEvent ..
  | .intermediateCatchTimerEvent .. | .intermediateCatchMessageEvent ..
  | .receiveTask .. | .serviceTask .. | .parallelGateway ..
  | .exclusiveMerge .. | .exclusiveGateway ..
  | .inclusiveGatewayDiverging .. | .inclusiveGatewayConverging ..
  | .eventBasedGateway .. | .errorEndEvent .. | .noneEndEvent .. => false

/-- Independently classify checked graph edges removed after a selected User Task resumption boundary. -/
def checkedEdgeIsResumptionContinuation (nodes : List CheckedNode)
    (edge : GraphEdge NodeId) : Bool :=
  nodes.any fun node =>
    decide (checkedNodeId node = edge.source) && checkedNodeIsResumptionCut node

def checkedResumptionCutEdges (nodes : List CheckedNode)
    (edges : List (GraphEdge NodeId)) : List (GraphEdge NodeId) :=
  edges.filter fun edge => !checkedEdgeIsResumptionContinuation nodes edge

private def checkedGraphPolicyValid (source : CheckedProcess)
    (nodes : List CheckedNode) (edges : List (GraphEdge NodeId))
    (fuel : Nat) : Bool :=
  match profileGraphPolicy? source.identity.semanticProfile.value with
  | some .acyclic => acyclicClosed edges fuel
  | some .resumptionBounded =>
      acyclicClosed (checkedResumptionCutEdges nodes edges) fuel
  | none => false

/-- Finite per-scope graph progress backstop independent of any complete model topology. -/
private def checkedScopeGraphWellFormed (source : CheckedProcess)
    (scope : DefinitionScope) : Bool :=
  let nodes := scopedNodes source scope.id
  let nodeIds := nodes.map checkedNodeId
  let ends := checkedEndIds nodes
  match checkedStartIds nodes with
  | [start] =>
      let edges := checkedEdges source (scopedFlows source scope.id) ++
        exceptionalEdges nodes
      let fuel := nodeIds.length
      !ends.isEmpty &&
      allReachableWithin nodeIds edges fuel start &&
        allCoreachableWithin nodeIds edges fuel ends &&
        checkedGraphPolicyValid source nodes edges fuel
  | _ => false

/-- Every declared definition scope is independently connected, co-reachable, and accepted by its closed whole-graph or resumption-cut policy. -/
def checkedProcessGraphWellFormed (source : CheckedProcess) : Bool :=
  !source.definitionScopes.isEmpty &&
    source.definitionScopes.all (checkedScopeGraphWellFormed source)

end BpmnSemantics.SemanticProcess
