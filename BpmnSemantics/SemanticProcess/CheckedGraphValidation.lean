import BpmnSemantics.SemanticProcess.GraphValidation

/-! # Checked BPMN graph validation

This module owns topology-independent reachability, co-reachability, and cycle rejection for the production checked graph. `normalizedFlowSource` remains scoped to the inline Service Task boundary route, where the boundary event is source metadata rather than a checked runtime node. Explicit boundary Error nodes contribute a separate parent-local exceptional edge from their attached Sub-Process.
-/

namespace BpmnSemantics.SemanticProcess

private def checkedNodeId : CheckedNode → NodeId
  | .noneStartEvent id
  | .embeddedSubProcess id _
  | .boundaryErrorEvent id _ _ _
  | .userTask id _
  | .intermediateCatchTimerEvent id _
  | .intermediateCatchMessageEvent id _
  | .receiveTask id _
  | .serviceTask id _ _ _ _
  | .parallelGateway id _
  | .exclusiveGateway id _ _
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

private def nodeScope? (source : CheckedProcess) (nodeId : NodeId) :
    Option DefinitionScopeId :=
  (source.nodeScopes.find? fun ownership =>
    decide (ownership.nodeId = nodeId)).map (·.scopeId)

private def flowScope? (source : CheckedProcess) (flowId : SequenceFlowId) :
    Option DefinitionScopeId :=
  (source.sequenceFlowScopes.find? fun ownership =>
    decide (ownership.sequenceFlowId = flowId)).map (·.scopeId)

private def scopedNodes (source : CheckedProcess) (scopeId : DefinitionScopeId) :
    List CheckedNode :=
  source.nodes.filter fun node => nodeScope? source (checkedNodeId node) == some scopeId

private def scopedFlows (source : CheckedProcess) (scopeId : DefinitionScopeId) :
    List CheckedSequenceFlow :=
  source.sequenceFlows.filter fun flow => flowScope? source flow.id == some scopeId

private def checkedEdges (source : CheckedProcess)
    (flows : List CheckedSequenceFlow) : List (GraphEdge NodeId) :=
  flows.map fun flow =>
    { source := normalizedFlowSource source.nodes flow.sourceId
      target := flow.targetId }

private def exceptionalEdges (nodes : List CheckedNode) : List (GraphEdge NodeId) :=
  nodes.filterMap fun
    | .boundaryErrorEvent id attachedToRef _ _ =>
        some { source := attachedToRef, target := id }
    | _ => none

private def checkedStartIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .noneStartEvent id => some id
    | _ => none

private def checkedEndIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .errorEndEvent id _ => some id
    | .noneEndEvent id => some id
    | _ => none

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
        acyclicClosed edges fuel
  | _ => false

/-- Every declared definition scope is independently connected, co-reachable, and acyclic. -/
def checkedProcessGraphWellFormed (source : CheckedProcess) : Bool :=
  !source.definitionScopes.isEmpty &&
    source.definitionScopes.all (checkedScopeGraphWellFormed source)

end BpmnSemantics.SemanticProcess
