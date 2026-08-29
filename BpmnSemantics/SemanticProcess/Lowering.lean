import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.ErrorDefinition
import BpmnSemantics.SemanticProcess.InclusiveGateway
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression
import BpmnSemantics.SemanticProcess.LoweringIdentity
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceLowering
import BpmnSemantics.SemanticProcess.ConfiguredTaskLowering
import BpmnSemantics.SemanticProcess.TimerStartLowering
import BpmnSemantics.SemanticProcess.TerminateEndLowering

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

/-- Canonical Message Start outputs derived only from checked Sequence Flow source endpoints. -/
def lowerMessageStartOutputs (source : CheckedProcess) (nodeId : NodeId) :
    List ControlPlaceId :=
  canonicalControlPlaceOrder
    (source.sequenceFlows.filterMap fun flow =>
      if flow.sourceId = nodeId then some (flowControlPlaceId flow.id)
      else none)

/-- Preserve the checked Start Event origin and complete operation-addressed channel while lowering its endpoint-derived fan-out. -/
def lowerMessageStartOperation (source : CheckedProcess) (id : NodeId)
    (channel : MessageChannel) : SemanticOperation :=
  .initiateMessage
    (nodeOperationId id)
    { elementId := id }
    channel
    (lowerMessageStartOutputs source id)

private def firstPlace (places : List ControlPlaceId) : ControlPlaceId :=
  places.head?.getD ⟨""⟩

/-- Canonical merge inputs derived only from authoritative checked Sequence Flow endpoints. -/
def lowerExclusiveMergeInputs (source : CheckedProcess) (nodeId : NodeId) :
    List ControlPlaceId :=
  canonicalControlPlaceOrder (incomingPlaces source nodeId)

/-- The sole merge output derived only from the authoritative checked Sequence Flow endpoint. Admission establishes that the list has exactly one member. -/
def lowerExclusiveMergeOutput (source : CheckedProcess) (nodeId : NodeId) :
    ControlPlaceId :=
  firstPlace (outgoingPlaces source nodeId)

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

/-- Milliseconds for one admitted duration lexeme.

An unadmitted lexeme normalizes to `0` rather than failing, because checked admission has already
rejected it; a total function keeps lowering free of an error path the profile cannot reach. `0` is
not a silent result: every family that carries a duration pins its own exact milliseconds in program
structural validation, so a lexeme this table forgets is refused there instead of executing an
instant deadline. -/
private def normalizeTimerDuration (durationLiteral : String) : Nat :=
  if durationLiteral = "PT1S" then 1000
  else if durationLiteral = "PT5S" then 5000
  else 0

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
        durationMs := normalizeTimerDuration duration
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

/-- The Timer Boundary Event attached to this Activity, when the profile admitted one, with the disposition that selects the host's operation kind. -/
private def timerBoundaryFor (source : CheckedProcess) (activityId : NodeId) :
    Option (NodeId × BoundaryInterruption × String × SequenceFlowId) :=
  source.nodes.findSome? fun
    | .timerBoundaryEvent id attachedToRef interruption durationLiteral
        outputFlowId =>
        if attachedToRef = activityId then
          some (id, interruption, durationLiteral, outputFlowId)
        else none
    | _ => none

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
  | .messageStartEvent id channel =>
      match checkedNodeScopeId? source id with
      | some scopeId =>
          if isEntryRootScope source scopeId then
            some
              (lowerMessageStartOperation source id channel, scopeId)
          else none
      | none => none
  | .timerStartEvent id durationLiteral =>
      match checkedNodeScopeId? source id with
      | some scopeId =>
          if isEntryRootScope source scopeId then
            some (lowerTimerStartOperation source id durationLiteral, scopeId)
          else none
      | none => none
  | .embeddedSubProcess id childScopeId => do
      let scopeId ← checkedNodeScopeId? source id
      match timerBoundaryFor source id with
      | some (timerId, _, durationLiteral, outputFlowId) =>
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
  | .userTask id name metadata =>
      match timerBoundaryFor source id, metadata with
      -- The disposition selects the operation kind, and that kind is the whole difference: one
      -- family's firing removes the task occurrence and the other's preserves it.
      | some (timerId, interruption, durationLiteral, outputFlowId), none =>
          checkedNodeScopeId? source id |>.map fun scopeId =>
          ((match interruption with
            | .interrupting => SemanticOperation.awaitBoundedUserTask
            | .nonInterrupting => SemanticOperation.awaitMonitoredUserTask)
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
      | some _, some _ => none
      | none, _ =>
          checkedNodeScopeId? source id |>.map fun scopeId =>
          (.awaitUserTask
            (nodeOperationId id)
            { elementId := id }
            (firstPlace (incomingPlaces source id))
            (firstPlace (outgoingPlaces source id))
            { id := ⟨id.value⟩, name, metadata }, scopeId)
  | .dataInputUserTask id name directInput =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitDataInputUserTask
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        ⟨id.value⟩
        name
        directInput, scopeId)
  | .sequentialMultiInstanceUserTask id name input output normalOutputFlowId boundaryTimer =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitSequentialMultiInstanceUserTask
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        { id := ⟨id.value⟩, name }
        { input, output }
        (flowControlPlaceId normalOutputFlowId)
        { elementId := boundaryTimer.elementId
          durationMs := normalizeTimerDuration boundaryTimer.durationLiteral
          output := flowControlPlaceId boundaryTimer.outputFlowId
          origin := { elementId := boundaryTimer.outputFlowId } }
        { maximumItems := 16
          maximumItemUtf8Bytes := 512
          maximumCanonicalCollectionUtf8Bytes := 8192 }, scopeId)
  | .parallelMultiInstanceUserTask id name input output completionCondition normalOutputFlowId
      boundaryTimer =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (lowerParallelMultiInstanceEntry id name
        (firstPlace (incomingPlaces source id)) { input, output }
        (flowControlPlaceId normalOutputFlowId)
        { elementId := boundaryTimer.elementId
          durationMs := normalizeTimerDuration boundaryTimer.durationLiteral
          output := flowControlPlaceId boundaryTimer.outputFlowId
          origin := { elementId := boundaryTimer.outputFlowId } }
        ((parseSimpleBooleanExpression completionCondition.body).getD (.literal false)), scopeId)
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
            durationMs := normalizeTimerDuration durationLiteral }, scopeId)
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
  | .configuredTask id descriptor =>
      lowerConfiguredTask?
        (checkedNodeScopeId? source id)
        id
        descriptor
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
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
  | .exclusiveMerge id =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.mergeExclusive
        (nodeOperationId id)
        { elementId := id }
        (lowerExclusiveMergeInputs source id)
        (lowerExclusiveMergeOutput source id), scopeId)
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
  | .terminateEndEvent id => lowerTerminateEnd? source id
  | .noneEndEvent id =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.reachNoneEnd
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id)), scopeId)

/-- Exclusive Merge lowering has no topology inventory besides checked Sequence Flow endpoints. -/
theorem lower_exclusive_merge_uses_checked_flow_endpoints
    (source : CheckedProcess) (id : NodeId) :
    lowerNode source (.exclusiveMerge id) =
      (checkedNodeScopeId? source id).map fun scopeId =>
        (.mergeExclusive
          (nodeOperationId id)
          { elementId := id }
          (lowerExclusiveMergeInputs source id)
          (lowerExclusiveMergeOutput source id), scopeId) := by
  rfl

/-- Ordinary User Task lowering preserves the exact checked/IL resumption-cut classification when no boundary deadline changes the operation family. -/
theorem lowering_preserves_user_task_resumption_cut
    (source : CheckedProcess) (id : NodeId) (name : Option String)
    (metadata : Option UserTaskMetadata)
    (scopeId : DefinitionScopeId)
    (scope : checkedNodeScopeId? source id = some scopeId)
    (unbounded : timerBoundaryFor source id = none) :
    ∃ operation,
      lowerNode source (.userTask id name metadata) = some (operation, scopeId) ∧
        checkedNodeIsResumptionCut (.userTask id name metadata) = true ∧
        semanticOperationIsResumptionCut operation = true := by
  refine ⟨.awaitUserTask
      (nodeOperationId id)
      { elementId := id }
      (firstPlace (incomingPlaces source id))
      (firstPlace (outgoingPlaces source id))
      { id := ⟨id.value⟩, name, metadata }, ?_, rfl, rfl⟩
  simp [lowerNode, unbounded, scope]

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

private def lowerParallelMultiInstanceCompletion? (source : CheckedProcess) :
    CheckedNode → Option (SemanticOperation × DefinitionScopeId)
  | .parallelMultiInstanceUserTask id _ _ _ _ normalOutputFlowId _ => do
      let scopeId ← checkedNodeScopeId? source id
      pure (lowerParallelMultiInstanceCompletion id
        (flowControlPlaceId normalOutputFlowId), scopeId)
  | _ => none

/-- Canonical lowering over the current checked graph. Meaning is claimed only under `checkedWellFormed`. -/
def lowerCheckedProcess (source : CheckedProcess) : Program :=
  let scopedOperations := sortScopedOperations
    (source.nodes.filterMap (lowerNode source) ++
      source.nodes.filterMap (lowerParallelMultiInstanceCompletion? source) ++
      source.definitionScopes.filterMap (lowerScopeCompletion source))
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := source.identity.semanticProfile
        sourceId := source.identity.sourceId
        sourceOverlay := source.identity.sourceOverlay
        sourceSha256 := source.identity.sourceSha256 }
    internalSchedulingMode := .rejectObservableChoice
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

theorem lower_preserves_source_overlay_identity (source : CheckedProcess) :
    (lowerCheckedProcess source).identity.sourceOverlay =
      source.identity.sourceOverlay := by
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
