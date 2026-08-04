import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.ErrorDefinition
import BpmnSemantics.SemanticProcess.InclusiveGateway
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

def eventRaceConfigurationFlow (source : CheckedProcess)
    (flow : CheckedSequenceFlow) : Bool :=
  source.nodes.any fun
    | .eventBasedGateway gatewayId => decide (flow.sourceId = gatewayId)
    | _ => false

private def configuredByEventGateway (source : CheckedProcess)
    (nodeId : NodeId) : Bool :=
  source.sequenceFlows.any fun flow =>
    decide (flow.targetId = nodeId) && eventRaceConfigurationFlow source flow

private def eventRaceMessageArm (source : CheckedProcess)
    (gatewayId : NodeId) : EventRaceMessageArm :=
  match source.sequenceFlows.findSome? fun flow =>
      if flow.sourceId = gatewayId then
        source.nodes.findSome? fun
          | .intermediateCatchMessageEvent id channel =>
              if id = flow.targetId then some (flow, id, channel) else none
          | _ => none
      else none with
  | some (flow, elementId, channel) =>
      { configurationOrigin := { elementId := flow.id }
        elementId
        channel
        output := firstPlace (outgoingPlaces source elementId) }
  | none =>
      { configurationOrigin := { elementId := ⟨""⟩ }
        elementId := ⟨""⟩
        channel := .operationMessage ⟨""⟩ ⟨""⟩ ⟨""⟩
        output := ⟨""⟩ }

private def eventRaceTimerArm (source : CheckedProcess)
    (gatewayId : NodeId) : EventRaceTimerArm :=
  match source.sequenceFlows.findSome? fun flow =>
      if flow.sourceId = gatewayId then
        source.nodes.findSome? fun
          | .intermediateCatchTimerEvent id duration =>
              if id = flow.targetId then some (flow, id, duration) else none
          | _ => none
      else none with
  | some (flow, elementId, duration) =>
      { configurationOrigin := { elementId := flow.id }
        elementId
        durationMs := if duration = "PT1S" then 1000 else 0
        output := firstPlace (outgoingPlaces source elementId) }
  | none =>
      { configurationOrigin := { elementId := ⟨""⟩ }
        elementId := ⟨""⟩
        durationMs := 0
        output := ⟨""⟩ }

private def isEntryRootScope (source : CheckedProcess)
    (scopeId : DefinitionScopeId) : Bool :=
  source.definitionScopes.any fun scope =>
    decide (scope.id = scopeId && scope.parentScopeId.isNone &&
      scope.originElementId.value = source.processId.value)

def returnProcessOperationId (id : NodeId) : OperationId :=
  ⟨"operation:return-process:" ++ id.value⟩

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

private def pairedInclusiveJoinId? (source : CheckedProcess)
    (splitId : NodeId) : Option NodeId :=
  source.nodes.findSome? fun
    | .inclusiveGatewayConverging joinId pairedGatewayId =>
        if pairedGatewayId = splitId then some joinId else none
    | _ => none

private def expectedJoinInput (source : CheckedProcess) (splitId : NodeId)
    (flowId : SequenceFlowId) : ControlPlaceId :=
  let branchTarget := (source.sequenceFlows.find? fun flow =>
    decide (flow.id = flowId && flow.sourceId = splitId)).map (·.targetId)
  let joinId := pairedInclusiveJoinId? source splitId
  match branchTarget, joinId with
  | some taskId, some joinId =>
      let inputs := source.sequenceFlows.filter fun flow =>
        decide (flow.sourceId = taskId && flow.targetId = joinId)
      flowControlPlaceId (inputs.head?.map (·.id) |>.getD ⟨""⟩)
  | _, _ => ⟨""⟩

private def lowerInclusiveCandidate (source : CheckedProcess)
    (splitId : NodeId) (flowId : SequenceFlowId) : InclusiveCandidate :=
  let candidate := lowerConditionalCandidate source flowId
  { condition := candidate.condition
    output := candidate.output
    expectedJoinInput := expectedJoinInput source splitId flowId
    origin := candidate.origin }

private def lowerInclusiveDefaultBranch (source : CheckedProcess)
    (splitId : NodeId) (flowId : SequenceFlowId) : InclusiveDefaultBranch :=
  { output := flowControlPlaceId flowId
    expectedJoinInput := expectedJoinInput source splitId flowId
    origin := { elementId := flowId } }

private def insertInclusiveCandidate (candidate : InclusiveCandidate) :
    List InclusiveCandidate → List InclusiveCandidate
  | [] => [candidate]
  | current :: rest =>
      if candidate.origin.elementId.value < current.origin.elementId.value then
        candidate :: current :: rest
      else current :: insertInclusiveCandidate candidate rest

private def sortInclusiveCandidates :
    List InclusiveCandidate → List InclusiveCandidate
  | [] => []
  | candidate :: rest =>
      insertInclusiveCandidate candidate (sortInclusiveCandidates rest)

/-- The interrupting Timer Boundary Event attached to this Activity, when the profile admitted one. -/
private def timerBoundaryFor (source : CheckedProcess) (activityId : NodeId) :
    Option (NodeId × String × SequenceFlowId) :=
  source.nodes.findSome? fun
    | .timerBoundaryEvent id attachedToRef durationLiteral outputFlowId =>
        if attachedToRef = activityId then
          some (id, durationLiteral, outputFlowId)
        else none
    | _ => none

private def normalizeTimerDuration (durationLiteral : String) : Nat :=
  if durationLiteral = "PT1S" then 1000 else 0

private def lowerNode (source : CheckedProcess) :
    CheckedNode → Option (SemanticOperation × DefinitionScopeId)
  | .noneStartEvent id =>
      match checkedNodeScopeId? source id with
      | some scopeId =>
          if isEntryRootScope source scopeId then
            some
              (.initiate
                (nodeOperationId id)
                { elementId := id }
                (firstPlace (outgoingPlaces source id)), scopeId)
          else none
      | none => none
  | .embeddedSubProcess id childScopeId => do
      let scopeId ← checkedNodeScopeId? source id
      match timerBoundaryFor source id with
      | some (timerId, durationLiteral, outputFlowId) =>
          pure
            (.enterBoundedScope
              (nodeOperationId id)
              { elementId := id }
              (firstPlace (incomingPlaces source id))
              (childEntryPlace source childScopeId)
              childScopeId
              { elementId := timerId
                durationMs := normalizeTimerDuration durationLiteral
                output := firstPlace (outgoingPlaces source timerId)
                origin := { elementId := outputFlowId } }, scopeId)
      | none =>
          pure
            (.enterScope
              (nodeOperationId id)
              { elementId := id }
              (firstPlace (incomingPlaces source id))
              (childEntryPlace source childScopeId)
              childScopeId, scopeId)
  | .callActivity id calledProcessId => do
      let scopeId ← checkedNodeScopeId? source id
      let calledRoot ← source.definitionScopes.find? fun scope =>
        decide (scope.parentScopeId.isNone &&
          scope.originElementId.value = calledProcessId.value)
      pure
        (.invokeProcess
          (nodeOperationId id)
          { elementId := id }
          (firstPlace (incomingPlaces source id))
          calledProcessId
          calledRoot.id
          (childEntryPlace source calledRoot.id)
          (returnProcessOperationId id), scopeId)
  | .boundaryErrorEvent .. => none
  -- The deadline has no operation of its own: it belongs to the Activity it is attached to, so no
  -- program can express the two waits as unrelated siblings.
  | .timerBoundaryEvent .. => none
  | .userTask id name =>
      match timerBoundaryFor source id with
      | some (timerId, durationLiteral, outputFlowId) =>
          checkedNodeScopeId? source id |>.map fun scopeId =>
          (.awaitBoundedUserTask
            (nodeOperationId id)
            { elementId := id }
            (firstPlace (incomingPlaces source id))
            { id := ⟨id.value⟩
              name
              output := firstPlace (outgoingPlaces source id) }
            { elementId := timerId
              durationMs := normalizeTimerDuration durationLiteral
              output := firstPlace (outgoingPlaces source timerId)
              origin := { elementId := outputFlowId } }, scopeId)
      | none =>
          checkedNodeScopeId? source id |>.map fun scopeId =>
          (.awaitUserTask
            (nodeOperationId id)
            { elementId := id }
            (firstPlace (incomingPlaces source id))
            (firstPlace (outgoingPlaces source id))
            { id := ⟨id.value⟩, name }, scopeId)
  | .intermediateCatchTimerEvent id durationLiteral =>
      if configuredByEventGateway source id then none
      else
        checkedNodeScopeId? source id |>.map fun scopeId =>
        (.awaitTimer
          (nodeOperationId id)
          { elementId := id }
          (firstPlace (incomingPlaces source id))
          (firstPlace (outgoingPlaces source id))
          { elementId := id
            durationMs := if durationLiteral = "PT1S" then 1000 else 0 }, scopeId)
  | .intermediateCatchMessageEvent id channel =>
      if configuredByEventGateway source id then none
      else
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
  | .inclusiveGatewayDiverging id candidateFlowIds defaultFlowId =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.selectMany
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (sortInclusiveCandidates
          (candidateFlowIds.map (lowerInclusiveCandidate source id)))
        (lowerInclusiveDefaultBranch source id defaultFlowId)
        id.value, scopeId)
  | .inclusiveGatewayConverging id pairedGatewayId =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.synchronizeSelected
        (nodeOperationId id)
        { elementId := id }
        (canonicalControlPlaceOrder (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        pairedGatewayId.value, scopeId)
  | .eventBasedGateway id =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitEventRace
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (eventRaceMessageArm source id)
        (eventRaceTimerArm source id), scopeId)
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
    (scope : DefinitionScope) : Option (SemanticOperation × DefinitionScopeId) :=
  if scope.parentScopeId.isNone &&
      scope.originElementId.value ≠ source.processId.value then
    match source.nodes.filter fun
        | .callActivity _ calledProcessId =>
            calledProcessId.value = scope.originElementId.value
        | _ => false with
    | [.callActivity callId calledProcessId] => some
        (.returnProcess
          (returnProcessOperationId callId)
          { elementId := callId }
          calledProcessId
          scope.id
          (firstPlace (outgoingPlaces source callId)), scope.id)
    | _ => none
  else
    let parentOutput := scope.parentScopeId.map fun _ =>
      firstPlace (outgoingPlaces source scope.originElementId)
    some
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
      source.definitionScopes.filterMap (lowerScopeCompletion source))
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := source.identity.semanticProfile
        sourceId := source.identity.sourceId
        sourceSha256 := source.identity.sourceSha256 }
    processId := source.processId
    definitionScopes := source.definitionScopes
    operationScopes := scopedOperations.map fun operation =>
      { operationId := operation.1.id, scopeId := operation.2 }
    controlPlaceScopes := source.sequenceFlowScopes.filterMap fun ownership =>
      match source.sequenceFlows.find? fun flow =>
          decide (flow.id = ownership.sequenceFlowId) with
      | some flow =>
          if eventRaceConfigurationFlow source flow then none
          else some
            { controlPlaceId := flowControlPlaceId ownership.sequenceFlowId
              scopeId := ownership.scopeId }
      | none => none
    controlPlaces :=
      (source.sequenceFlows.filter fun flow =>
        !eventRaceConfigurationFlow source flow).map
          CheckedSequenceFlow.toControlPlace
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
      (source.sequenceFlows.filter fun flow =>
        !eventRaceConfigurationFlow source flow).map (·.id) := by
  simp [lowerCheckedProcess, CheckedSequenceFlow.toControlPlace]

def operationConfigurationOrigins : SemanticOperation → List SequenceFlowId
  | .awaitEventRace _ _ _ message timer =>
      [message.configurationOrigin.elementId, timer.configurationOrigin.elementId]
  | _ => []

def programConfigurationOrigins (program : Program) : List SequenceFlowId :=
  program.operations.flatMap operationConfigurationOrigins


end BpmnSemantics.SemanticProcess
