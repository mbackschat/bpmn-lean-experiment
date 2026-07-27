import BpmnSemantics.SemanticProcessContract

/-! # BpmnSemantics.SemanticProcess — bounded lowering and operational semantics

This module implements the project-owned checked BPMN graph to Semantic Process lowering and the first generic token semantics. Runtime execution selects an operation by explicit semantic input; definition order is therefore not an implicit scheduler.

`lowerCheckedProcess` is total as required by the reviewed preservation proposition, but only `checkedWellFormed` inputs are admitted. Its arbitrary result outside that domain is never a semantic outcome.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def CheckedNode.id : CheckedNode → NodeId
  | .noneStartEvent id
  | .userTask id _
  | .intermediateCatchTimerEvent id _
  | .serviceTask id _ _ _ _ _
  | .parallelGateway id _
  | .noneEndEvent id => id

def CheckedSequenceFlow.toControlPlace (flow : CheckedSequenceFlow) :
    ControlPlace :=
  { id := ⟨"place:" ++ flow.id.value⟩
    origin := { elementId := flow.id } }

def nodeOperationId (id : NodeId) : OperationId :=
  ⟨"operation:" ++ id.value⟩

def flowControlPlaceId (id : SequenceFlowId) : ControlPlaceId :=
  ⟨"place:" ++ id.value⟩

private def incomingPlaces (source : CheckedProcess) (nodeId : NodeId) :
    List ControlPlaceId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.targetId = nodeId then
      some (flowControlPlaceId flow.id)
    else
      none

private def outgoingPlaces (source : CheckedProcess) (nodeId : NodeId) :
    List ControlPlaceId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.sourceId = nodeId then
      some (flowControlPlaceId flow.id)
    else
      none

private def firstPlace (places : List ControlPlaceId) : ControlPlaceId :=
  places.head?.getD ⟨""⟩

private def lowerNode (source : CheckedProcess) : CheckedNode → SemanticOperation
  | .noneStartEvent id =>
      .initiate
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (outgoingPlaces source id))
  | .userTask id name =>
      .awaitUserTask
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { id := ⟨id.value⟩, name }
  | .intermediateCatchTimerEvent id durationLiteral =>
      .awaitTimer
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id
          durationMs := if durationLiteral = "PT1S" then 1000 else 0 }
  | .serviceTask id implementation _ _ _ _ =>
      .awaitEffect
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id
          descriptor :=
            { protocol := implementation
              handler := "bpmnLeanEffectHandler" } }
  | .parallelGateway id .diverging =>
      .duplicate
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (outgoingPlaces source id)
  | .parallelGateway id .converging =>
      .synchronize
        (nodeOperationId id)
        { elementId := id }
        (incomingPlaces source id)
        (firstPlace (outgoingPlaces source id))
  | .noneEndEvent id =>
      .terminate
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))

/-- Canonical lowering over the current checked graph. Meaning is claimed only under `checkedWellFormed`. -/
def lowerCheckedProcess (source : CheckedProcess) : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := source.identity.semanticProfile
        sourceId := source.identity.sourceId
        sourceSha256 := source.identity.sourceSha256 }
    processId := source.processId
    controlPlaces := source.sequenceFlows.map CheckedSequenceFlow.toControlPlace
    operations := source.nodes.map (lowerNode source) }

theorem lower_preserves_definition_identity (source : CheckedProcess) :
    (lowerCheckedProcess source).identity.semanticProfile =
        source.identity.semanticProfile ∧
      (lowerCheckedProcess source).identity.sourceId =
        source.identity.sourceId ∧
      (lowerCheckedProcess source).identity.sourceSha256 =
        source.identity.sourceSha256 ∧
      (lowerCheckedProcess source).processId = source.processId := by
  simp [lowerCheckedProcess]

theorem lower_preserves_sequence_flow_origins (source : CheckedProcess) :
    (lowerCheckedProcess source).controlPlaces.map (·.origin.elementId) =
      source.sequenceFlows.map (·.id) := by
  simp [lowerCheckedProcess, CheckedSequenceFlow.toControlPlace]

private def strictlySortedStrings : List String → Bool
  | []
  | [_] => true
  | left :: right :: rest =>
      decide (left < right) && strictlySortedStrings (right :: rest)

private def nonempty (value : String) : Bool :=
  !value.isEmpty

private def lowercaseHexSha256 (value : String) : Bool :=
  value.length = 64 &&
    value.toList.all fun character =>
      "0123456789abcdef".toList.contains character

private def incomingCount (flows : List CheckedSequenceFlow) (id : NodeId) : Nat :=
  (flows.filter fun flow => decide (flow.targetId = id)).length

private def outgoingCount (flows : List CheckedSequenceFlow) (id : NodeId) : Nat :=
  (flows.filter fun flow => decide (flow.sourceId = id)).length

private def hasFlow (flows : List CheckedSequenceFlow) (source target : NodeId) :
    Bool :=
  flows.any fun flow =>
    decide (flow.sourceId = source && flow.targetId = target)

private def nodeExists (nodes : List CheckedNode) (id : NodeId) : Bool :=
  nodes.any fun node => decide (node.id = id)

private def checkedNodeArityValid (flows : List CheckedSequenceFlow) :
    CheckedNode → Bool
  | .noneStartEvent id =>
      incomingCount flows id = 0 && outgoingCount flows id = 1
  | .userTask id _ =>
      incomingCount flows id = 1 && outgoingCount flows id = 1
  | .intermediateCatchTimerEvent id durationLiteral =>
      durationLiteral = "PT1S" &&
        incomingCount flows id = 1 && outgoingCount flows id = 1
  | .serviceTask id implementation
      delegateExpressionNamespace delegateExpressionValue
      asyncBeforeNamespace asyncBeforeValue =>
      implementation = "urn:bpmn-lean:effect:probe-v1" &&
        delegateExpressionNamespace =
          "http://camunda.org/schema/1.0/bpmn" &&
        delegateExpressionValue = "${bpmnLeanEffectHandler}" &&
        asyncBeforeNamespace = "http://camunda.org/schema/1.0/bpmn" &&
        asyncBeforeValue = "true" &&
        incomingCount flows id = 1 && outgoingCount flows id = 1
  | .parallelGateway id .diverging =>
      incomingCount flows id = 1 && outgoingCount flows id ≥ 2
  | .parallelGateway id .converging =>
      incomingCount flows id ≥ 2 && outgoingCount flows id = 1
  | .noneEndEvent id =>
      incomingCount flows id = 1 && outgoingCount flows id = 0

private def startIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .noneStartEvent id => some id
    | _ => none

private def taskIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .userTask id _ => some id
    | _ => none

private def timerIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .intermediateCatchTimerEvent id _ => some id
    | _ => none

private def effectIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .serviceTask id _ _ _ _ _ => some id
    | _ => none

private def divergingGatewayIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .parallelGateway id .diverging => some id
    | _ => none

private def convergingGatewayIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .parallelGateway id .converging => some id
    | _ => none

private def endIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .noneEndEvent id => some id
    | _ => none

private def boundedTopology (source : CheckedProcess) : Bool :=
  match
      startIds source.nodes,
      taskIds source.nodes,
      timerIds source.nodes,
      effectIds source.nodes,
      divergingGatewayIds source.nodes,
      convergingGatewayIds source.nodes,
      endIds source.nodes with
  | [start], [task], [], [], [], [], [endNode] =>
      source.nodes.length = 3 &&
        source.sequenceFlows.length = 2 &&
        hasFlow source.sequenceFlows start task &&
        hasFlow source.sequenceFlows task endNode
  | [start], [], [timer], [], [], [], [endNode] =>
      source.nodes.length = 3 &&
        source.sequenceFlows.length = 2 &&
        hasFlow source.sequenceFlows start timer &&
        hasFlow source.sequenceFlows timer endNode
  | [start], [], [], [effect], [], [], [endNode] =>
      source.nodes.length = 3 &&
        source.sequenceFlows.length = 2 &&
        hasFlow source.sequenceFlows start effect &&
        hasFlow source.sequenceFlows effect endNode
  | [start], [taskA, taskB], [], [], [fork], [join], [endNode] =>
      source.nodes.length = 6 &&
        source.sequenceFlows.length = 6 &&
        hasFlow source.sequenceFlows start fork &&
        hasFlow source.sequenceFlows fork taskA &&
        hasFlow source.sequenceFlows fork taskB &&
        hasFlow source.sequenceFlows taskA join &&
        hasFlow source.sequenceFlows taskB join &&
        hasFlow source.sequenceFlows join endNode
  | _, _, _, _, _, _, _ => false

/-- Independent static admission for the current sequential and balanced parallel checked graphs. -/
def checkedWellFormed (source : CheckedProcess) : Bool :=
  nonempty source.identity.semanticProfile.value &&
    nonempty source.identity.sourceId.value &&
    lowercaseHexSha256 source.identity.sourceSha256 &&
    nonempty source.processId.value &&
    strictlySortedStrings (source.nodes.map fun node => node.id.value) &&
    strictlySortedStrings (source.sequenceFlows.map fun flow => flow.id.value) &&
    source.nodes.all fun node => nonempty node.id.value &&
    source.sequenceFlows.all fun flow =>
      nonempty flow.id.value &&
        nodeExists source.nodes flow.sourceId &&
        nodeExists source.nodes flow.targetId &&
        decide (flow.sourceId ≠ flow.targetId) &&
    source.nodes.all (checkedNodeArityValid source.sequenceFlows) &&
    boundedTopology source

def SemanticOperation.id : SemanticOperation → OperationId
  | .initiate id _ _
  | .awaitUserTask id _ _ _ _
  | .awaitTimer id _ _ _ _
  | .awaitEffect id _ _ _ _
  | .duplicate id _ _ _
  | .synchronize id _ _ _
  | .terminate id _ _ => id

private def placeExists (places : List ControlPlace) (id : ControlPlaceId) : Bool :=
  places.any fun place => decide (place.id = id)

private def sortedDistinctPlaceIds (ids : List ControlPlaceId) : Bool :=
  strictlySortedStrings (ids.map fun id => id.value)

private def operationWellFormed (places : List ControlPlace) :
    SemanticOperation → Bool
  | .initiate id origin output =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists places output
  | .awaitUserTask id origin input output task =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty task.id.value &&
        decide (origin.elementId.value = task.id.value) &&
        placeExists places input &&
        placeExists places output
  | .awaitTimer id origin input output timer =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty timer.elementId.value &&
        decide (origin.elementId = timer.elementId) &&
        timer.durationMs = 1000 &&
        placeExists places input &&
        placeExists places output
  | .awaitEffect id origin input output effect =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty effect.elementId.value &&
        decide (origin.elementId = effect.elementId) &&
        effect.descriptor.protocol = "urn:bpmn-lean:effect:probe-v1" &&
        effect.descriptor.handler = "bpmnLeanEffectHandler" &&
        placeExists places input &&
        placeExists places output
  | .duplicate id origin input outputs =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists places input &&
        outputs.length ≥ 2 &&
        sortedDistinctPlaceIds outputs &&
        outputs.all (placeExists places)
  | .synchronize id origin inputs output =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        inputs.length ≥ 2 &&
        sortedDistinctPlaceIds inputs &&
        inputs.all (placeExists places) &&
        placeExists places output
  | .terminate id origin input =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists places input

private def isInitiate : SemanticOperation → Bool
  | .initiate .. => true
  | _ => false

/-- Structural validation for a decoded Semantic Process program, independent of checked-source equality. -/
def programWellFormed (program : Program) : Bool :=
  nonempty program.identity.semanticProfile.value &&
    nonempty program.identity.sourceId.value &&
    lowercaseHexSha256 program.identity.sourceSha256 &&
    nonempty program.processId.value &&
    !program.controlPlaces.isEmpty &&
    !program.operations.isEmpty &&
    strictlySortedStrings (program.controlPlaces.map fun place => place.id.value) &&
    strictlySortedStrings (program.operations.map fun operation => operation.id.value) &&
    program.controlPlaces.all fun place =>
      nonempty place.id.value && nonempty place.origin.elementId.value &&
    program.operations.all (operationWellFormed program.controlPlaces) &&
    (program.operations.filter isInitiate).length = 1

/-- Artifact admission requires both independent validators and exact canonical lowering equality. -/
def definitionBindingValid (source : CheckedProcess) (program : Program) : Bool :=
  checkedWellFormed source &&
    programWellFormed program &&
    decide (lowerCheckedProcess source = program)


end BpmnSemantics.SemanticProcess

