import BpmnSemantics.SemanticProcess.GraphValidation

/-! # Checked BPMN graph validation

This module owns topology-independent reachability, co-reachability, and cycle rejection for the production checked graph. A boundary-event route is normalized to the owning Service Task operation because the boundary event is source metadata rather than a checked runtime node.
-/

namespace BpmnSemantics.SemanticProcess

private def checkedNodeId : CheckedNode → NodeId
  | .noneStartEvent id
  | .userTask id _
  | .intermediateCatchTimerEvent id _
  | .serviceTask id _ _ _ _
  | .parallelGateway id _
  | .exclusiveGateway id _ _
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

private def checkedEdges (source : CheckedProcess) : List (GraphEdge NodeId) :=
  source.sequenceFlows.map fun flow =>
    { source := normalizedFlowSource source.nodes flow.sourceId
      target := flow.targetId }

private def checkedStartIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .noneStartEvent id => some id
    | _ => none

private def checkedEndIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .noneEndEvent id => some id
    | _ => none

/-- Finite graph progress backstop independent of any complete model topology. -/
def checkedProcessGraphWellFormed (source : CheckedProcess) : Bool :=
  let nodeIds := source.nodes.map checkedNodeId
  let ends := checkedEndIds source.nodes
  match checkedStartIds source.nodes with
  | [start] =>
      let edges := checkedEdges source
      let fuel := nodeIds.length
      allReachableWithin nodeIds edges fuel start &&
        allCoreachableWithin nodeIds edges fuel ends &&
        acyclicClosed edges fuel
  | _ => false

end BpmnSemantics.SemanticProcess
