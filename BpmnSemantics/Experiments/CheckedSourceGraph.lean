import BpmnSemantics.SemanticProcess.GraphValidation

/-! # Checked-source graph validation

This module owns executable graph facts for the provisional structured-admission experiment. It does not participate in production source admission.
-/

namespace BpmnSemantics.Experiments.CheckedSourceAdmission

open BpmnSemantics.SemanticProcess

def sourceEdges (source : CheckedProcess) :
    List (GraphEdge NodeId) :=
  source.sequenceFlows.map fun flow =>
    { source := flow.sourceId, target := flow.targetId }

def allDistinct [DecidableEq α] : List α → Bool
  | [] => true
  | item :: remaining =>
      !remaining.contains item && allDistinct remaining

def incomingFlows (source : CheckedProcess) (id : NodeId) :
    List CheckedSequenceFlow :=
  source.sequenceFlows.filter fun flow => decide (flow.targetId = id)

def outgoingFlows (source : CheckedProcess) (id : NodeId) :
    List CheckedSequenceFlow :=
  source.sequenceFlows.filter fun flow => decide (flow.sourceId = id)

def nodeAt (source : CheckedProcess) (id : NodeId) :
    Option CheckedNode :=
  source.nodes.find? fun node => decide (node.id = id)

def nodeExists (source : CheckedProcess) (id : NodeId) : Bool :=
  (nodeAt source id).isSome

def nodeArityValid (source : CheckedProcess) :
    CheckedNode → Bool
  | .noneStartEvent id =>
      (incomingFlows source id).isEmpty &&
        (outgoingFlows source id).length = 1
  | .messageStartEvent .. => false
  | .timerStartEvent .. => false
  | .noneEndEvent id =>
      (incomingFlows source id).length = 1 &&
        (outgoingFlows source id).isEmpty
  | .userTask id _
  | .intermediateCatchTimerEvent id _
  | .intermediateCatchMessageEvent id _
  | .receiveTask id _
  | .serviceTask id _ _ _ _ =>
      (incomingFlows source id).length = 1 &&
        (outgoingFlows source id).length = 1
  | .embeddedSubProcess _ _
  | .callActivity _ _
  | .boundaryErrorEvent ..
  | .timerBoundaryEvent ..
  | .errorEndEvent .. => false
  | .parallelGateway id .diverging =>
      (incomingFlows source id).length = 1 &&
        (outgoingFlows source id).length = 2
  | .parallelGateway id .converging =>
      (incomingFlows source id).length = 2 &&
        (outgoingFlows source id).length = 1
  | .exclusiveMerge _
  | .exclusiveGateway _ _ _
  | .inclusiveGatewayDiverging _ _ _
  | .inclusiveGatewayConverging _ _ => false
  | .eventBasedGateway _ => false

def startIds (source : CheckedProcess) : List NodeId :=
  source.nodes.filterMap fun
    | .noneStartEvent id => some id
    | _ => none

def endIds (source : CheckedProcess) : List NodeId :=
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
        acyclicClosed edges fuel
  | _, _ => false

end BpmnSemantics.Experiments.CheckedSourceAdmission
