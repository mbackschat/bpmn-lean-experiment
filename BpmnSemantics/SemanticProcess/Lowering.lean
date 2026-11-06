module

public import BpmnSemantics.SemanticProcess.TransactionSourceLowering
public import BpmnSemantics.SemanticProcess.ErrorDefinition
public import BpmnSemantics.SemanticProcess.ParallelMultiInstanceLowering
public import BpmnSemantics.SemanticProcess.ConfiguredTaskLowering
public import BpmnSemantics.SemanticProcess.TimerStartLowering
public import BpmnSemantics.SemanticProcess.TerminateEndLowering
public import BpmnSemantics.SemanticProcess.CompensationSourceLowering
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
public import BpmnSemantics.SemanticProcess.GraphValidation
import BpmnSemantics.SemanticProcess.InclusiveRegionWalk
import all BpmnSemantics.SemanticProcess.GraphValidation
meta import BpmnSemantics.PrivateEquationLemmas

/-! # Canonical checked-process lowering

This module owns the total project-authored lowering from a checked BPMN graph to the Semantic Process IL and its identity/provenance preservation laws. Checked-process admission, IL validation, and runtime execution remain separate owners.

`lowerCheckedProcess` is total as required by the reviewed preservation proposition, but only `checkedWellFormed` inputs are admitted. Its arbitrary result outside that domain is never a semantic outcome.
-/

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def CheckedSequenceFlow.toControlPlace (flow : CheckedSequenceFlow) :
    ControlPlace :=
  { id := ⟨"place:" ++ flow.id.value⟩
    origin := { elementId := flow.id } }

def incomingPlaces (source : CheckedProcess) (nodeId : NodeId) :
    List ControlPlaceId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.targetId = nodeId then
      some (flowControlPlaceId flow.id)
    else
      none

def outgoingPlaces (source : CheckedProcess) (nodeId : NodeId) :
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

def firstPlace (places : List ControlPlaceId) : ControlPlaceId :=
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

def configuredByEventGateway (source : CheckedProcess)
    (nodeId : NodeId) : Bool :=
  source.sequenceFlows.any fun flow =>
    decide (flow.targetId = nodeId) && eventRaceConfigurationFlow source flow

def eventRaceMessageArm (source : CheckedProcess)
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

/-- Ten Julian years of exact time, the same maximum as TypeScript's `maxExactTimerDurationMs`. -/
private def maxExactTimerDurationMs : Nat := 315576000000

/-- Reads `[nH][nM][nS]` after `PT`: digits `n` of the pending component, whether it has any,
the last unit taken (0 none, 1 H, 2 M, 3 S) and the running total. -/
private def exactDurationGo : List Char → Nat → Bool → Nat → Nat → Option Nat
  | [], _, digits, stage, total =>
      if digits || stage = 0 || total = 0 || total > maxExactTimerDurationMs then none else some total
  | c :: cs, n, digits, stage, total =>
      if c.isDigit then exactDurationGo cs (n * 10 + (c.toNat - 48)) true stage total
      else if !digits then none
      else match c with
        | 'H' => if stage < 1 then exactDurationGo cs 0 false 1 (total + n * 3600000) else none
        | 'M' => if stage < 2 then exactDurationGo cs 0 false 2 (total + n * 60000) else none
        | 'S' => if stage < 3 then exactDurationGo cs 0 false 3 (total + n * 1000) else none
        | _ => none

/-- An exact ISO 8601 duration `PT[nH][nM][nS]` in milliseconds, positive and at most the maximum;
TypeScript's `parseExactTimerDuration` reads the same grammar (TED-PARSE-01). -/
private def exactTimerDurationMs? (literal : String) : Option Nat :=
  match literal.toList with
  | 'P' :: 'T' :: rest => exactDurationGo rest 0 false 0 0
  | _ => none

/-- Milliseconds for one duration lexeme; a refused lexeme lowers to `0`, never a semantic result:
the Intermediate Catch pin in program structural validation requires a positive value and every
other Timer pin an exact one, so definition admission refuses it. Structural recursion keeps it
kernel-reducible for the fixtures that decide a lowering. -/
def normalizeTimerDuration (durationLiteral : String) : Nat :=
  (exactTimerDurationMs? durationLiteral).getD 0

def normalizeBoundaryTimerExpression : CheckedBoundaryTimerExpression → Nat
  | .duration literal => normalizeTimerDuration literal
  | .cycle literal => if literal = "R/PT1S" then 1000 else 0

def eventRaceTimerArm (source : CheckedProcess)
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
        -- TED-SITE-01: a race arm keeps its single `PT1S` lexeme; every other lexeme lowers to 0.
        durationMs := if duration = "PT1S" then normalizeTimerDuration duration else 0
        output := firstPlace (outgoingPlaces source elementId) }
  | none =>
      { configurationOrigin := { elementId := ⟨""⟩ }
        elementId := ⟨""⟩
        durationMs := 0
        output := ⟨""⟩ }

def isEntryRootScope (source : CheckedProcess)
    (scopeId : DefinitionScopeId) : Bool :=
  source.definitionScopes.any fun scope =>
    decide (scope.id = scopeId && scope.parentScopeId.isNone &&
      scope.originElementId.value = source.processId.value)

def returnProcessOperationId (id : NodeId) : OperationId :=
  ⟨"operation:return-process:" ++ id.value⟩

def childEntryPlace (source : CheckedProcess)
    (childScopeId : DefinitionScopeId) : ControlPlaceId :=
  let startId := (source.nodes.findSome? fun node =>
    match node, checkedNodeScopeId? source node.id with
    | .noneStartEvent id, some scopeId =>
        if scopeId = childScopeId then some id else none
    | _, _ => none).getD ⟨""⟩
  firstPlace (outgoingPlaces source startId)

def lowerBpmnErrorRoute
    (route : Option CheckedBpmnErrorRoute) : Option BpmnErrorRoute :=
  route.map fun route =>
    { code := route.code
      output := flowControlPlaceId route.outputFlowId
      origin :=
        { boundaryEventId := route.boundaryEventId
          errorDefinitionId := route.errorDefinitionId
          errorElementId := route.errorElementId
          sequenceFlowId := route.outputFlowId } }

def lowerConditionalCandidate (source : CheckedProcess)
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

/-- IGR-BIND-01: the input of the paired join that the branch from `flowId` reaches, by the shared region walk. -/
def expectedJoinInput (source : CheckedProcess) (_splitId : NodeId)
    (flowId : SequenceFlowId) : ControlPlaceId :=
  flowControlPlaceId ((InclusiveRegion.checkedBranchJoinInput? source flowId).getD ⟨""⟩)

/-- An output without a condition lowers to the literal `true`: CIB takes it unconditionally and Clause 8.4.13 leaves it ungated (CIB-INT-0005). -/
def lowerInclusiveCandidate (source : CheckedProcess)
    (splitId : NodeId) (flowId : SequenceFlowId) : InclusiveCandidate :=
  let candidate := lowerConditionalCandidate source flowId
  let unconditioned := (source.sequenceFlows.find? fun flow => decide (flow.id = flowId)).any (·.condition.isNone)
  { condition := if unconditioned then .literal true else candidate.condition
    output := candidate.output
    expectedJoinInput := expectedJoinInput source splitId flowId
    origin := candidate.origin }

def lowerInclusiveDefaultBranch (source : CheckedProcess)
    (splitId : NodeId) (flowId : SequenceFlowId) : InclusiveDefaultBranch :=
  { output := flowControlPlaceId flowId
    expectedJoinInput := expectedJoinInput source splitId flowId
    origin := { elementId := flowId } }

def insertInclusiveCandidate (candidate : InclusiveCandidate) :
    List InclusiveCandidate → List InclusiveCandidate
  | [] => [candidate]
  | current :: rest =>
      if candidate.origin.elementId.value < current.origin.elementId.value then
        candidate :: current :: rest
      else current :: insertInclusiveCandidate candidate rest

def sortInclusiveCandidates :
    List InclusiveCandidate → List InclusiveCandidate
  | [] => []
  | candidate :: rest =>
      insertInclusiveCandidate candidate (sortInclusiveCandidates rest)

/-- The Timer Boundary Event attached to this Activity, when the profile admitted one, with the disposition that selects the host's operation kind. -/
def timerBoundaryFor (source : CheckedProcess) (activityId : NodeId) :
    Option (NodeId × BoundaryInterruption × CheckedBoundaryTimerExpression × SequenceFlowId) :=
  source.nodes.findSome? fun
    | .timerBoundaryEvent id attachedToRef interruption durationLiteral
        outputFlowId =>
        if attachedToRef = activityId then
          some (id, interruption, durationLiteral, outputFlowId)
        else none
    | _ => none

def messageBoundaryFor (source : CheckedProcess) (activityId : NodeId) :
    Option (NodeId × BoundaryInterruption × MessageChannel × SequenceFlowId) :=
  source.nodes.findSome? fun
    | .messageBoundaryEvent id attachedToRef interruption channel outputFlowId =>
        if attachedToRef = activityId then some (id, interruption, channel, outputFlowId)
        else none
    | _ => none

def lowerNode (source : CheckedProcess) :
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
  | .sequentialMultiInstanceSubProcess id childScopeId collectionName itemName bodyInputs condition => do
      let scopeId ← checkedNodeScopeId? source id
      pure (.enterSequentialMultiInstanceScope (nodeOperationId id) { elementId := id }
        (firstPlace (incomingPlaces source id)) (childEntryPlace source childScopeId) childScopeId
        (firstPlace (outgoingPlaces source id)) collectionName itemName bodyInputs condition, scopeId)
  | .parallelMultiInstanceSubProcess id childScopeId collectionName itemName bodyInputs condition => do
      let scopeId ← checkedNodeScopeId? source id
      pure (.enterParallelMultiInstanceScope (nodeOperationId id) { elementId := id }
        (firstPlace (incomingPlaces source id)) (childEntryPlace source childScopeId) childScopeId
        (firstPlace (outgoingPlaces source id)) collectionName itemName bodyInputs condition, scopeId)
  | .transactionSubProcess id childScopeId _ => do
      let scopeId ← checkedNodeScopeId? source id
      pure (.enterScope (nodeOperationId id) { elementId := id }
        (firstPlace (incomingPlaces source id)) (childEntryPlace source childScopeId) childScopeId, scopeId)
  | .cancelEndEvent id => lowerTransactionCancel source id (firstPlace (incomingPlaces source id))
  | .cancelBoundaryEvent .. => none
  | .embeddedSubProcess id childScopeId =>
      if checkedMessageEventSubProcessElement source id then none
      else do
        let scopeId ← checkedNodeScopeId? source id
        match timerBoundaryFor source id with
        | some (timerId, interruption, durationLiteral, outputFlowId) =>
            pure
              ((match interruption with
                | .interrupting => SemanticOperation.enterBoundedScope
                | .nonInterrupting => SemanticOperation.enterMonitoredScope)
                (nodeOperationId id)
                { elementId := id }
                (firstPlace (incomingPlaces source id))
                (childEntryPlace source childScopeId)
                childScopeId
                { elementId := timerId
                  durationMs := normalizeBoundaryTimerExpression durationLiteral
                  recurrence := match durationLiteral with | .cycle _ => some .repeating | _ => none
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
  | .callActivity id calledProcessId data => do
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
          (returnProcessOperationId id) data, scopeId)
  | .boundaryErrorEvent .. => none
  -- The deadline has no operation of its own: it belongs to the Activity it is attached to, so no
  -- program can express the two waits as unrelated siblings.
  | .timerBoundaryEvent .. => none
  | .messageBoundaryEvent .. => none
  | .userTask id name metadata =>
      match messageBoundaryFor source id, timerBoundaryFor source id, metadata with
      | some (messageId, interruption, channel, outputFlowId), none, none =>
          checkedNodeScopeId? source id |>.map fun scopeId =>
          ((match interruption with
            | .interrupting => SemanticOperation.awaitMessageBoundedUserTask
            | .nonInterrupting => SemanticOperation.awaitMessageMonitoredUserTask)
            (nodeOperationId id)
            { elementId := id }
            (firstPlace (incomingPlaces source id))
            { id := ⟨id.value⟩
              name
              output := firstPlace (outgoingPlaces source id) }
            { elementId := messageId
              channel
              output := firstPlace (outgoingPlaces source messageId)
              origin := { elementId := outputFlowId } }, scopeId)
      | some _, _, _ => none
      -- The disposition selects the operation kind, and that kind is the whole difference: one
      -- family's firing removes the task occurrence and the other's preserves it.
      | none, some (timerId, interruption, durationLiteral, outputFlowId), none =>
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
              durationMs := normalizeBoundaryTimerExpression durationLiteral
              recurrence := match durationLiteral with | .cycle _ => some .repeating | _ => none
              output := firstPlace (outgoingPlaces source timerId)
              origin := { elementId := outputFlowId } }, scopeId)
      | none, some _, some _ => none
      | none, none, _ =>
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
  | .dataInputOutputUserTask id name directInput directOutput =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitDataInputOutputUserTask
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        ⟨id.value⟩
        name
        directInput
        directOutput, scopeId)
  | .dataOutputUserTask id name directOutput =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitDataOutputUserTask
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        ⟨id.value⟩
        name
        directOutput, scopeId)
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
  | .payloadMessageCatchEvent id channel directOutput =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitPayloadMessage
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id, channel }
        directOutput, scopeId)
  | .correlatedPayloadMessageCatchEvent id channel correlationKeyId
      correlationPropertyId payloadSelector processPropertySelector =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.awaitCorrelatedPayloadMessage
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id, channel }
        correlationKeyId
        correlationPropertyId
        payloadSelector
        processPropertySelector, scopeId)
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
  | .nonOperationalTask id _ | .noneIntermediateThrowEvent id =>
      -- PTT-PASS-01, NIT-PASS-01: the nonsynchronizing token move with the Task or Event as origin; the notation stays
      -- in the checked graph. PTSM-SPLIT-01 and PTSM-MERGE-01: several outgoing flows make it a node-origin fork, several
      -- incoming flows a many-input merge over the canonical inputs, as a Parallel fork and an Exclusive merge lower.
      checkedNodeScopeId? source id |>.map fun scopeId =>
      if 2 ≤ (outgoingPlaces source id).length then
        (.duplicate
          (nodeOperationId id)
          { elementId := id }
          (firstPlace (incomingPlaces source id))
          (outgoingPlaces source id), scopeId)
      else
        (.mergeExclusive
          (nodeOperationId id)
          { elementId := id }
          (if (incomingPlaces source id).length = 1 then [firstPlace (incomingPlaces source id)]
            else lowerExclusiveMergeInputs source id)
          (lowerExclusiveMergeOutput source id), scopeId)
  -- LNK-CONT-01: lowered only through `lowerLinkedCheckedProcess`, which removes every pair first.
  | .linkThrowEvent .. | .linkCatchEvent .. => none
  | .exclusiveGateway id candidateFlowIds defaultFlowId =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.choose
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (candidateFlowIds.map (lowerConditionalCandidate source))
        (defaultFlowId.map flowControlPlaceId)
        (defaultFlowId.map fun flowId => { elementId := flowId }), scopeId)
  | .inclusiveGatewayDiverging id candidateFlowIds defaultFlowId =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.selectMany
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (sortInclusiveCandidates
          (candidateFlowIds.map (lowerInclusiveCandidate source id)))
        (defaultFlowId.map (lowerInclusiveDefaultBranch source id))
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
  | .globalSynchronousCompensationThrowEvent id =>
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (lowerGlobalSynchronousCompensationThrow source id
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id)), scopeId)
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
      -- NEF-END-01: an End with several incoming flows lowers per flow in `lowerCheckedProcess`.
      if 2 ≤ (incomingPlaces source id).length then none else
      checkedNodeScopeId? source id |>.map fun scopeId =>
      (.reachNoneEnd
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id)), scopeId)

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`CheckedSequenceFlow.toControlPlace, `lowerNode]

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

/-- PTT-PASS-01, PTT-KIND-01: an Abstract or Manual Task with one incoming and one outgoing flow lowers to the one-input
nonsynchronizing merge whose origin is the Task, the same operation for both notations, so its one activation is an
instantaneous occurrence of the Task and no wait, effect or data operation is introduced. -/
private theorem lower_non_operational_task_is_one_input_merge
    (source : CheckedProcess) (id : NodeId) (taskNotation : TaskNotation)
    (one_in : (incomingPlaces source id).length = 1) (one_out : (outgoingPlaces source id).length = 1) :
    lowerNode source (.nonOperationalTask id taskNotation) =
      (checkedNodeScopeId? source id).map fun scopeId =>
        (.mergeExclusive
          (nodeOperationId id)
          { elementId := id }
          [firstPlace (incomingPlaces source id)]
          (lowerExclusiveMergeOutput source id), scopeId) := by
  simp [lowerNode, one_in, one_out]

/-- NIT-PASS-01: a None Intermediate Throw Event with one incoming and one outgoing flow lowers to the one-input
nonsynchronizing merge whose origin is the Event, so its one activation is an instantaneous occurrence and no wait,
effect or data operation is introduced. -/
private theorem lower_none_intermediate_throw_event_is_one_input_merge (source : CheckedProcess) (id : NodeId)
    (one_in : (incomingPlaces source id).length = 1) (one_out : (outgoingPlaces source id).length = 1) :
    lowerNode source (.noneIntermediateThrowEvent id) =
      (checkedNodeScopeId? source id).map fun scopeId =>
        (.mergeExclusive
          (nodeOperationId id)
          { elementId := id }
          [firstPlace (incomingPlaces source id)]
          (lowerExclusiveMergeOutput source id), scopeId) := by
  simp [lowerNode, one_in, one_out]

/-- Ordinary User Task lowering preserves the exact checked/IL resumption-cut classification when no boundary deadline changes the operation family. -/
theorem lowering_preserves_user_task_resumption_cut
    (source : CheckedProcess) (id : NodeId) (name : Option String)
    (metadata : Option UserTaskMetadata)
    (scopeId : DefinitionScopeId)
    (scope : checkedNodeScopeId? source id = some scopeId)
    (unbounded : timerBoundaryFor source id = none)
    (noMessageBoundary : messageBoundaryFor source id = none) :
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
  simp [lowerNode, unbounded, noMessageBoundary, scope]

def lowerOrdinaryScopeCompletions (source : CheckedProcess)
    (scope : DefinitionScope) : List (SemanticOperation × DefinitionScopeId) :=
  if checkedScopeIsCompensationDormant source scope then []
  else if scope.parentScopeId.isNone &&
      scope.originElementId.value ≠ source.processId.value then
    -- A called root completes by one return per Call naming it, each continuing that Call (CALLN-RETURN-01).
    source.nodes.filterMap fun
      | .callActivity callId calledProcessId data =>
          if calledProcessId.value = scope.originElementId.value then
            some (.returnProcess
              (returnProcessOperationId callId)
              { elementId := callId }
              calledProcessId
              scope.id
              (firstPlace (outgoingPlaces source callId)) data, scope.id)
          else none
      | _ => none
  else
    let parentOutput := scope.parentScopeId.map fun _ =>
      firstPlace (outgoingPlaces source scope.originElementId)
    [(.completeScope
        ⟨"operation:complete-scope:" ++ scope.id.value⟩
        { elementId := scope.originElementId }
        scope.id
        parentOutput, scope.id)]

def lowerScopeCompletions (source : CheckedProcess)
    (scope : DefinitionScope) : List (SemanticOperation × DefinitionScopeId) :=
  match lowerMessageEventSubProcessCompletion? source scope with
  | some completion => [completion]
  | none =>
      let completionId : OperationId := ⟨"operation:complete-scope:" ++ scope.id.value⟩
      match source.nodes.findSome? (fun
        | .sequentialMultiInstanceSubProcess id childScopeId _ _ _ _ =>
            if childScopeId == scope.id then some (SemanticOperation.completeSequentialMultiInstanceScope
              completionId { elementId := id } (nodeOperationId id)) else none
        | .parallelMultiInstanceSubProcess id childScopeId _ _ _ _ =>
            if childScopeId == scope.id then some (SemanticOperation.completeParallelMultiInstanceScope
              completionId { elementId := id } (nodeOperationId id)) else none
        | _ => none) with
      | some completion => [(completion, scope.id)]
      | none => lowerOrdinaryScopeCompletions source scope

def insertScopedOperation
    (operation : SemanticOperation × DefinitionScopeId) :
    List (SemanticOperation × DefinitionScopeId) →
      List (SemanticOperation × DefinitionScopeId)
  | [] => [operation]
  | candidate :: rest =>
      if operation.1.id.value < candidate.1.id.value then
        operation :: candidate :: rest
      else candidate :: insertScopedOperation operation rest

def sortScopedOperations :
    List (SemanticOperation × DefinitionScopeId) →
      List (SemanticOperation × DefinitionScopeId)
  | [] => []
  | operation :: rest =>
      insertScopedOperation operation (sortScopedOperations rest)

def lowerParallelMultiInstanceCompletion? (source : CheckedProcess) :
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
      -- NEF-END-01: one `reachNoneEnd` per incoming flow of a None End with several, so each token ends on its own.
      -- `operation:<End>:from:<flow>` is the Lean spelling of `noneEndArrivalOperationId`, which
      -- `semantic-process-identifiers.ts` owns; `DefinitionInput`'s lowering equality guards the two spellings.
      source.nodes.flatMap (fun node => match node with
        | .noneEndEvent id =>
            let arrivals := source.sequenceFlows.filter (·.targetId == id)
            match checkedNodeScopeId? source id with
            | some scopeId =>
                if arrivals.length < 2 then [] else arrivals.map fun flow =>
                  (.reachNoneEnd ⟨(nodeOperationId id).value ++ ":from:" ++ flow.id.value⟩ { elementId := id }
                    (flowControlPlaceId flow.id), scopeId)
            | none => []
        | _ => []) ++
      source.definitionScopes.flatMap (lowerScopeCompletions source))
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
    operations := scopedOperations.map (·.1)
    interruptingMessageEventSubProcesses := lowerMessageEventSubProcessDeclarations source
    scopeLocalData := source.scopeLocalData
    compensationActivityRetention :=
      if source.transactionCancellation.isSome then lowerTransactionRetention source
      else lowerCheckedCompensationActivityRetention source
    compensationEventSubProcessSnapshots :=
      lowerCheckedCompensationSnapshots source
    compensationExecution := if source.transactionCancellation.isSome then lowerTransactionExecution source
      else lowerCheckedCompensationExecution source }

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`lowerCheckedProcess]

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
