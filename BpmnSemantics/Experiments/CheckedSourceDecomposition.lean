import BpmnSemantics.Experiments.CheckedSourceGraph

/-! # Executable checked-source decomposition

This module owns the deterministic serial-wait and balanced-parallel decomposition probe used by the provisional structured-admission experiment.
-/

namespace BpmnSemantics.Experiments.CheckedSourceAdmission

open BpmnSemantics.SemanticProcess

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
      | some (.userTask _ _ none)
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
              | some (.userTask _ _ none), some (.userTask _ _ none) =>
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
      | some (.userTask _ _ (some _))
      | some (.sequentialMultiInstanceUserTask ..)
      | some (.messageStartEvent ..)
      | some (.timerStartEvent ..)
      | some (.embeddedSubProcess ..)
      | some (.callActivity ..)
      | some (.boundaryErrorEvent ..)
      | some (.timerBoundaryEvent ..)
      | some (.errorEndEvent ..)
      | some (.terminateEndEvent ..)
      | some (.intermediateCatchMessageEvent ..)
      | some (.receiveTask ..)
      | some (.configuredTask ..)
      | some (.parallelGateway _ .converging)
      | some (.exclusiveMerge ..)
      | some (.exclusiveGateway ..)
      | some (.inclusiveGatewayDiverging ..)
      | some (.inclusiveGatewayConverging ..)
      | some (.eventBasedGateway ..)
      | none => none

def coversEveryNode (source : CheckedProcess)
    (visited : List NodeId) : Bool :=
  visited.length = source.nodes.length &&
    allDistinct visited &&
    source.nodes.all fun node => visited.contains node.id

def parseProcess? (source : CheckedProcess) :
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

def composedNodeSurfaceValid : CheckedNode → Bool
  | .noneStartEvent _
  | .noneEndEvent _
  | .userTask _ _ none
  | .parallelGateway .. => true
  | .userTask _ _ (some _) => false
  | .sequentialMultiInstanceUserTask .. => false
  | .embeddedSubProcess ..
  | .callActivity ..
  | .boundaryErrorEvent ..
  | .timerBoundaryEvent ..
  | .errorEndEvent .. => false
  | .terminateEndEvent .. => false
  | .intermediateCatchTimerEvent _ durationLiteral =>
      durationLiteral = "PT1S"
  | .serviceTask _ descriptor inputMappings outputMappings route =>
      descriptor.protocol =
          "urn:bpmn-lean:effect-protocol:activity-v1" &&
        descriptor.operation =
          "urn:bpmn-lean:effect-operation:probe-v1" &&
        inputMappings.isEmpty &&
        outputMappings.isEmpty &&
        route.isNone
  | .intermediateCatchMessageEvent .. => false
  | .receiveTask .. => false
  | .configuredTask .. => false
  | .exclusiveMerge .. => false
  | .exclusiveGateway .. => false
  | .inclusiveGatewayDiverging .. => false
  | .inclusiveGatewayConverging .. => false
  | .eventBasedGateway .. => false
  | .messageStartEvent .. => false
  | .timerStartEvent .. => false

def profileChecks (source : CheckedProcess) : Bool :=
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

end BpmnSemantics.Experiments.CheckedSourceAdmission
