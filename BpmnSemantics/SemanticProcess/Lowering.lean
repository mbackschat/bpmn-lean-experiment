import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.ErrorDefinition
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression

/-! # Canonical checked-process lowering

This module owns the total project-authored lowering from a checked BPMN graph to the Semantic Process IL and its identity/provenance preservation laws. Checked-process admission, IL validation, and runtime execution remain separate owners.

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

private def isRootScope (source : CheckedProcess)
    (scopeId : DefinitionScopeId) : Bool :=
  source.definitionScopes.any fun scope =>
    decide (scope.id = scopeId) && scope.parentScopeId.isNone

private def childEntryPlace (source : CheckedProcess)
    (childScopeId : DefinitionScopeId) : ControlPlaceId :=
  let startId := (source.nodes.findSome? fun node =>
    match node, checkedNodeScopeId? source node.id with
    | .noneStartEvent id, some scopeId =>
        if scopeId = childScopeId then some id else none
    | _, _ => none).getD ⟨""⟩
  firstPlace (outgoingPlaces source startId)

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

private def lowerNode (source : CheckedProcess) :
    CheckedNode → Option (SemanticOperation × DefinitionScopeId)
  | .noneStartEvent id =>
      match checkedNodeScopeId? source id with
      | some scopeId =>
          if isRootScope source scopeId then
            some
              (.initiate
                (nodeOperationId id)
                { elementId := id }
                (firstPlace (outgoingPlaces source id)), scopeId)
          else none
      | none => none
  | .embeddedSubProcess id childScopeId => do
      let scopeId ← checkedNodeScopeId? source id
      pure
        (.enterScope
          (nodeOperationId id)
          { elementId := id }
          (firstPlace (incomingPlaces source id))
          (childEntryPlace source childScopeId)
          childScopeId, scopeId)
  | .boundaryErrorEvent .. => none
  | .userTask id name =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitUserTask
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { id := ⟨id.value⟩, name }, scopeId)
  | .intermediateCatchTimerEvent id durationLiteral =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitTimer
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id
          durationMs := if durationLiteral = "PT1S" then 1000 else 0 }, scopeId)
  | .intermediateCatchMessageEvent id channel =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitMessage
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id, channel }, scopeId)
  | .receiveTask id channel =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitMessage
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id, channel }, scopeId)
  | .serviceTask id descriptor inputMappings outputMappings bpmnErrorRoute =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitEffect
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id
          descriptor
          inputMappings
          outputMappings }
        (lowerBpmnErrorRoute bpmnErrorRoute), scopeId)
  | .parallelGateway id .diverging =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.duplicate
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (outgoingPlaces source id), scopeId)
  | .parallelGateway id .converging =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.synchronize
        (nodeOperationId id)
        { elementId := id }
        (incomingPlaces source id)
        (firstPlace (outgoingPlaces source id)), scopeId)
  | .exclusiveGateway id candidateFlowIds defaultFlowId =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.choose
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (candidateFlowIds.map (lowerConditionalCandidate source))
        (flowControlPlaceId defaultFlowId)
        { elementId := defaultFlowId }, scopeId)
  | .errorEndEvent id error =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.throwError
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        error
        (lowerInterruptingErrorHandler source scopeId error), scopeId)
  | .noneEndEvent id =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.reachNoneEnd
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id)), scopeId)

private def lowerScopeCompletion (source : CheckedProcess)
    (scope : DefinitionScope) : SemanticOperation × DefinitionScopeId :=
  let parentOutput := scope.parentScopeId.map fun _ =>
    firstPlace (outgoingPlaces source scope.originElementId)
  (.completeScope
    ⟨"operation:complete-scope:" ++ scope.id.value⟩
    { elementId := scope.originElementId }
    scope.id
    parentOutput, scope.id)

private def insertScopedOperation
    (operation : SemanticOperation × DefinitionScopeId) :
    List (SemanticOperation × DefinitionScopeId) →
      List (SemanticOperation × DefinitionScopeId)
  | [] => [operation]
  | candidate :: rest =>
      if operation.1.id.value < candidate.1.id.value then
        operation :: candidate :: rest
      else candidate :: insertScopedOperation operation rest

private def sortScopedOperations :
    List (SemanticOperation × DefinitionScopeId) →
      List (SemanticOperation × DefinitionScopeId)
  | [] => []
  | operation :: rest =>
      insertScopedOperation operation (sortScopedOperations rest)

/-- Canonical lowering over the current checked graph. Meaning is claimed only under `checkedWellFormed`. -/
def lowerCheckedProcess (source : CheckedProcess) : Program :=
  let scopedOperations := sortScopedOperations
    (source.nodes.filterMap (lowerNode source) ++
      source.definitionScopes.map (lowerScopeCompletion source))
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := source.identity.semanticProfile
        sourceId := source.identity.sourceId
        sourceSha256 := source.identity.sourceSha256 }
    processId := source.processId
    definitionScopes := source.definitionScopes
    operationScopes := scopedOperations.map fun operation =>
      { operationId := operation.1.id, scopeId := operation.2 }
    controlPlaceScopes := source.sequenceFlowScopes.map fun ownership =>
      { controlPlaceId := flowControlPlaceId ownership.sequenceFlowId
        scopeId := ownership.scopeId }
    controlPlaces := source.sequenceFlows.map CheckedSequenceFlow.toControlPlace
    operations := scopedOperations.map (·.1) }

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


end BpmnSemantics.SemanticProcess
