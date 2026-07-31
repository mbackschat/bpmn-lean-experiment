import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression

/-! # BpmnSemantics.SemanticProcess — bounded lowering and operational semantics

This module implements the project-owned checked BPMN graph to Semantic Process lowering and the first generic token semantics. Runtime execution selects an operation by explicit semantic input; definition order is therefore not an implicit scheduler.

`lowerCheckedProcess` is total as required by the reviewed preservation proposition, but only `checkedWellFormed` inputs are admitted. Its arbitrary result outside that domain is never a semantic outcome.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

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

private def lowerBpmnErrorRoute
    (route : Option CheckedBpmnErrorRoute) : Option BpmnErrorRoute :=
  route.map fun route =>
    { code := route.code
      output := flowControlPlaceId route.outputFlowId
      origin :=
        { boundaryEventId := route.boundaryEventId
          errorDefinitionId := route.errorDefinitionId
          errorElementId := route.errorElementId
          sequenceFlowId := route.outputFlowId } }

private def lowerConditionalCandidate (source : CheckedProcess)
    (flowId : SequenceFlowId) : ConditionalCandidate :=
  match source.sequenceFlows.find? fun flow => decide (flow.id = flowId) with
  | some flow =>
      { condition :=
          (flow.condition.bind fun condition =>
            parseSimpleBooleanExpression condition.body).getD (.literal false)
        output := flowControlPlaceId flow.id
        origin := { elementId := flow.id } }
  | none =>
      { condition := .literal false
        output := flowControlPlaceId flowId
        origin := { elementId := flowId } }

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
  | .serviceTask id descriptor inputMappings outputMappings bpmnErrorRoute =>
      .awaitEffect
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id
          descriptor
          inputMappings
          outputMappings }
        (lowerBpmnErrorRoute bpmnErrorRoute)
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
  | .exclusiveGateway id candidateFlowIds defaultFlowId =>
      .choose
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (candidateFlowIds.map (lowerConditionalCandidate source))
        (flowControlPlaceId defaultFlowId)
        { elementId := defaultFlowId }
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

private def nodeExists (nodes : List CheckedNode) (id : NodeId) : Bool :=
  nodes.any fun node => decide (node.id = id)

private def singleStringLiteralMapping : List VariableMapping → Bool
  | [{ target
       expression := .stringLiteral value }] =>
      nonempty target && nonempty value
  | _ => false

private def singleLocalVariableMapping : List VariableMapping → Bool
  | [{ target
       expression := .localVariable name }] =>
      nonempty target && nonempty name
  | _ => false

private def wellFormedCheckedBpmnErrorRoute (serviceId : NodeId) :
    Option CheckedBpmnErrorRoute → Bool
  | some route =>
      nonempty route.boundaryEventId.value &&
        route.attachedToRef = serviceId &&
        nonempty route.errorDefinitionId.value &&
        nonempty route.errorElementId.value &&
        nonempty route.code &&
        nonempty route.outputFlowId.value
  | none => false

private def checkedConditionValid : Option CheckedCondition → Bool
  | some condition =>
      condition.language = simpleBooleanExpressionLanguage &&
        (parseSimpleBooleanExpression condition.body).isSome
  | none => false

private def checkedExclusiveGatewayValid (flows : List CheckedSequenceFlow)
    (id : NodeId) (candidateFlowIds : List SequenceFlowId)
    (defaultFlowId : SequenceFlowId) : Bool :=
  candidateFlowIds.length = 2 &&
    (candidateFlowIds.eraseDups).length = 2 &&
    !candidateFlowIds.contains defaultFlowId &&
    candidateFlowIds.all fun candidateId =>
      match flows.find? fun flow => decide (flow.id = candidateId) with
      | some flow =>
          flow.sourceId = id && checkedConditionValid flow.condition
      | none => false
    &&
    match flows.find? fun flow => decide (flow.id = defaultFlowId) with
    | some flow => flow.sourceId = id && flow.condition.isNone
    | none => false

private def checkedNodeArityValid (flows : List CheckedSequenceFlow) :
    CheckedNode → Bool
  | .noneStartEvent id =>
      incomingCount flows id = 0 && outgoingCount flows id = 1
  | .userTask id _ =>
      incomingCount flows id = 1 && outgoingCount flows id = 1
  | .intermediateCatchTimerEvent id durationLiteral =>
      durationLiteral = "PT1S" &&
        incomingCount flows id = 1 && outgoingCount flows id = 1
  | .serviceTask id descriptor inputMappings outputMappings route =>
      (descriptor.protocol = "urn:bpmn-lean:effect-protocol:activity-v1" &&
        ((descriptor.operation = "urn:bpmn-lean:effect-operation:probe-v1" &&
          inputMappings.isEmpty &&
          outputMappings.isEmpty &&
          route.isNone) ||
        (descriptor.operation =
            "urn:bpmn-lean:effect-operation:mapped-success-v1" &&
          singleStringLiteralMapping inputMappings &&
          singleLocalVariableMapping outputMappings &&
          route.isNone) ||
        (descriptor.operation =
            "urn:bpmn-lean:effect-operation:mapped-boundary-error-v1" &&
          singleStringLiteralMapping inputMappings &&
          singleLocalVariableMapping outputMappings &&
          wellFormedCheckedBpmnErrorRoute id route))) &&
        incomingCount flows id = 1 && outgoingCount flows id = 1
  | .parallelGateway id .diverging =>
      incomingCount flows id = 1 && outgoingCount flows id ≥ 2
  | .parallelGateway id .converging =>
      incomingCount flows id ≥ 2 && outgoingCount flows id = 1
  | .exclusiveGateway id candidateFlowIds defaultFlowId =>
      incomingCount flows id = 1 &&
        outgoingCount flows id = 3 &&
        checkedExclusiveGatewayValid flows id candidateFlowIds defaultFlowId
  | .noneEndEvent id =>
      incomingCount flows id = 1 && outgoingCount flows id = 0

/-- Independent static admission for the exact currently implemented checked-graph profiles. -/
def checkedWellFormed (source : CheckedProcess) : Bool :=
  nonempty source.identity.semanticProfile.value &&
    nonempty source.identity.sourceId.value &&
    lowercaseHexSha256 source.identity.sourceSha256 &&
    nonempty source.processId.value &&
    strictlySortedStrings (source.nodes.map fun node => node.id.value) &&
    strictlySortedStrings (source.sequenceFlows.map fun flow => flow.id.value) &&
    source.nodes.all (fun node => nonempty node.id.value) &&
    source.sequenceFlows.all (fun flow =>
      nonempty flow.id.value &&
        (nodeExists source.nodes flow.sourceId ||
          source.nodes.any fun
            | .serviceTask _ _ _ _ (some route) =>
                decide (route.boundaryEventId = flow.sourceId)
            | _ => false) &&
        nodeExists source.nodes flow.targetId &&
        decide (flow.sourceId ≠ flow.targetId) &&
        (match flow.condition with
          | none => true
          | some _ =>
              source.nodes.any fun
                | .exclusiveGateway _ candidateFlowIds _ =>
                    candidateFlowIds.contains flow.id
                | _ => false)) &&
    source.nodes.all (checkedNodeArityValid source.sequenceFlows) &&
    checkedProfileCapabilitiesValid source &&
    checkedProcessGraphWellFormed source

private def placeExists (places : List ControlPlace) (id : ControlPlaceId) : Bool :=
  places.any fun place => decide (place.id = id)

private def placeHasOrigin (places : List ControlPlace)
    (id : ControlPlaceId) (origin : BpmnSequenceFlowOrigin) : Bool :=
  places.any fun place =>
    decide (place.id = id && place.origin = origin)

private def sortedDistinctPlaceIds (ids : List ControlPlaceId) : Bool :=
  strictlySortedStrings (ids.map fun id => id.value)

private def wellFormedBpmnErrorRoute (places : List ControlPlace)
    (route : Option BpmnErrorRoute) : Bool :=
  match route with
  | none => true
  | some route =>
      nonempty route.code &&
        nonempty route.origin.boundaryEventId.value &&
        nonempty route.origin.errorDefinitionId.value &&
        nonempty route.origin.errorElementId.value &&
        nonempty route.origin.sequenceFlowId.value &&
        placeExists places route.output

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
  | .awaitEffect id origin input output effect bpmnErrorRoute =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty effect.elementId.value &&
        decide (origin.elementId = effect.elementId) &&
        ((effect.descriptor.protocol =
              "urn:bpmn-lean:effect-protocol:activity-v1" &&
            effect.descriptor.operation =
              "urn:bpmn-lean:effect-operation:probe-v1" &&
            effect.inputMappings.isEmpty &&
            effect.outputMappings.isEmpty &&
            bpmnErrorRoute.isNone) ||
          (effect.descriptor.protocol =
              "urn:bpmn-lean:effect-protocol:activity-v1" &&
            effect.descriptor.operation =
              "urn:bpmn-lean:effect-operation:mapped-success-v1" &&
            singleStringLiteralMapping effect.inputMappings &&
            singleLocalVariableMapping effect.outputMappings &&
            bpmnErrorRoute.isNone) ||
          (effect.descriptor.protocol =
              "urn:bpmn-lean:effect-protocol:activity-v1" &&
            effect.descriptor.operation =
              "urn:bpmn-lean:effect-operation:mapped-boundary-error-v1" &&
            singleStringLiteralMapping effect.inputMappings &&
            singleLocalVariableMapping effect.outputMappings &&
            !bpmnErrorRoute.isNone)) &&
        placeExists places input &&
        placeExists places output &&
        wellFormedBpmnErrorRoute places bpmnErrorRoute
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
  | .choose id origin input candidates defaultOutput defaultOrigin =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists places input &&
        candidates.length = 2 &&
        (candidates.map (·.output)).eraseDups.length = 2 &&
        !((candidates.map (·.output)).contains defaultOutput) &&
        candidates.all fun candidate =>
          simpleBooleanExpressionValid candidate.condition &&
            placeHasOrigin places candidate.output candidate.origin &&
        placeHasOrigin places defaultOutput defaultOrigin
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
    program.controlPlaces.all (fun place =>
      nonempty place.id.value && nonempty place.origin.elementId.value) &&
    program.operations.all (operationWellFormed program.controlPlaces) &&
    (program.operations.filter isInitiate).length = 1 &&
    programGraphWellFormed program

/-- Artifact admission requires both independent validators and exact canonical lowering equality. -/
def definitionBindingValid (source : CheckedProcess) (program : Program) : Bool :=
  checkedWellFormed source &&
    programWellFormed program &&
    programProfileCapabilitiesValid program &&
    decide (lowerCheckedProcess source = program)


end BpmnSemantics.SemanticProcess
