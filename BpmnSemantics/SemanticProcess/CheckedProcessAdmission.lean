import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.Data
import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import BpmnSemantics.SemanticProcess.ErrorDefinition
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression

/-! # Checked-process structural admission

This module owns checked-process admission by composing representation-specific identity, scope ownership, reference, arity, mapping, Error-handler, and profile-capability rules with the topology predicate from `CheckedGraphValidation`. It does not lower or validate Semantic Process programs.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def incomingCount (flows : List CheckedSequenceFlow) (id : NodeId) : Nat :=
  (flows.filter fun flow => decide (flow.targetId = id)).length

private def outgoingCount (flows : List CheckedSequenceFlow) (id : NodeId) : Nat :=
  (flows.filter fun flow => decide (flow.sourceId = id)).length

private def nodeExists (nodes : List CheckedNode) (id : NodeId) : Bool :=
  nodes.any fun node => decide (node.id = id)

private def scopeExists (scopes : List DefinitionScope)
    (scopeId : DefinitionScopeId) : Bool :=
  scopes.any fun scope => decide (scope.id = scopeId)

private def flowSourceScopeId? (source : CheckedProcess)
    (flow : CheckedSequenceFlow) : Option DefinitionScopeId :=
  match checkedNodeScopeId? source flow.sourceId with
  | some scopeId => some scopeId
  | none =>
      source.nodes.findSome? fun
        | .serviceTask id _ _ _ (some route) =>
            if route.boundaryEventId = flow.sourceId then
              checkedNodeScopeId? source id
            else none
        | _ => none

private def checkedDefinitionScopesValid (source : CheckedProcess) : Bool :=
  let roots := source.definitionScopes.filter (·.parentScopeId.isNone)
  let entryRoots := roots.filter fun root =>
    root.originElementId.value = source.processId.value
  let nestedValid := source.definitionScopes.all fun scope =>
    match scope.parentScopeId with
    | none => true
    | some parentScopeId =>
        decide (scope.id ≠ parentScopeId) &&
          scopeExists source.definitionScopes parentScopeId &&
          source.nodes.any fun
            | .embeddedSubProcess id childScopeId =>
                decide (
                  childScopeId = scope.id &&
                  scope.originElementId = id &&
                  checkedNodeScopeId? source id = some parentScopeId)
            | _ => false
  strictlySortedStrings (source.definitionScopes.map fun scope => scope.id.value) &&
    nestedValid &&
    if source.identity.semanticProfile.value =
        "bpmn-2.0.2-called-process-call-activity-draft" then
      match entryRoots, source.nodes.filterMap fun
          | .callActivity id calledProcessId => some (id, calledProcessId)
          | _ => none with
      | [entry], [(callId, calledProcessId)] =>
          roots.length = 2 &&
            checkedNodeScopeId? source callId = some entry.id &&
            (roots.filter fun root =>
              root.originElementId.value = calledProcessId.value).length = 1 &&
            calledProcessId.value ≠ source.processId.value
      | _, _ => false
    else
      match roots with
      | [root] => root.originElementId.value = source.processId.value
      | _ => false

private def checkedOwnershipValid (source : CheckedProcess) : Bool :=
  strictlySortedStrings (source.nodeScopes.map fun ownership =>
      ownership.nodeId.value) &&
    strictlySortedStrings (source.sequenceFlowScopes.map fun ownership =>
      ownership.sequenceFlowId.value) &&
    source.nodeScopes.map (·.nodeId) = source.nodes.map (·.id) &&
    source.sequenceFlowScopes.map (·.sequenceFlowId) =
      source.sequenceFlows.map (·.id) &&
    source.nodeScopes.all fun ownership =>
      scopeExists source.definitionScopes ownership.scopeId &&
    source.sequenceFlowScopes.all fun ownership =>
      scopeExists source.definitionScopes ownership.scopeId &&
    source.sequenceFlows.all fun flow =>
      let scopeId := checkedSequenceFlowScopeId? source flow.id
      scopeId = flowSourceScopeId? source flow &&
        scopeId = checkedNodeScopeId? source flow.targetId

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

private def checkedInclusiveGatewayValid (flows : List CheckedSequenceFlow)
    (id : NodeId) (candidateFlowIds : List SequenceFlowId)
    (defaultFlowId : SequenceFlowId) : Bool :=
  checkedExclusiveGatewayValid flows id candidateFlowIds defaultFlowId

private def inclusiveBranchReachesJoin (source : CheckedProcess)
    (splitId joinId : NodeId) (flowId : SequenceFlowId) : Bool :=
  match source.sequenceFlows.find? fun flow => decide (flow.id = flowId) with
  | none => false
  | some branch =>
      branch.sourceId = splitId &&
        source.nodes.any fun
          | .userTask taskId _ =>
              taskId = branch.targetId &&
                match source.sequenceFlows.filter fun flow =>
                    decide (flow.sourceId = taskId && flow.targetId = joinId) with
                | [_] => true
                | _ => false
          | _ => false

private def checkedInclusivePairingValid (source : CheckedProcess) : Bool :=
  source.nodes.all fun
    | .inclusiveGatewayDiverging splitId candidates defaultFlow =>
        match source.nodes.filter fun
            | .inclusiveGatewayConverging _ paired => paired = splitId
            | _ => false with
        | [.inclusiveGatewayConverging joinId _] =>
            (candidates ++ [defaultFlow]).all
              (inclusiveBranchReachesJoin source splitId joinId)
        | _ => false
    | .inclusiveGatewayConverging joinId paired =>
        source.nodes.any fun
          | .inclusiveGatewayDiverging splitId _ _ =>
              splitId = paired &&
                incomingCount source.sequenceFlows joinId = 3
          | _ => false
    | _ => true

private def checkedEventRaceConfigurationValid (source : CheckedProcess) : Bool :=
  source.nodes.all fun
    | .eventBasedGateway gatewayId =>
        let outgoing := source.sequenceFlows.filter fun flow =>
          decide (flow.sourceId = gatewayId)
        match outgoing with
        | [first, second] =>
            first.condition.isNone && second.condition.isNone &&
              ((source.nodes.any fun
                  | .intermediateCatchMessageEvent id _ => id = first.targetId
                  | _ => false) &&
                (source.nodes.any fun
                  | .intermediateCatchTimerEvent id _ => id = second.targetId
                  | _ => false) ||
              (source.nodes.any fun
                  | .intermediateCatchTimerEvent id _ => id = first.targetId
                  | _ => false) &&
                (source.nodes.any fun
                  | .intermediateCatchMessageEvent id _ => id = second.targetId
                  | _ => false))
        | _ => false
    | _ => true

private def checkedNodeArityValid (flows : List CheckedSequenceFlow) :
    CheckedNode → Bool
  | .noneStartEvent id =>
      incomingCount flows id = 0 && outgoingCount flows id = 1
  | .messageStartEvent id channel =>
      (match channel with
        | .operationMessage .. => channel.identifiersNonempty
        | .directMessage .. => false) &&
        incomingCount flows id = 0 && outgoingCount flows id = 1 &&
        (flows.find? fun flow => decide (flow.sourceId = id)).all
          (fun flow => flow.condition.isNone)
  | .embeddedSubProcess id _ =>
      incomingCount flows id = 1 && outgoingCount flows id = 1
  | .callActivity id calledProcessId =>
      nonempty calledProcessId.value &&
        incomingCount flows id = 1 && outgoingCount flows id = 1
  | .boundaryErrorEvent id _ error outputFlowId =>
      errorReferenceValid error &&
        incomingCount flows id = 0 && outgoingCount flows id = 1 &&
        flows.any fun flow => decide (flow.id = outputFlowId && flow.sourceId = id)
  | .timerBoundaryEvent id _ _ durationLiteral outputFlowId =>
      durationLiteral = "PT1S" &&
        incomingCount flows id = 0 && outgoingCount flows id = 1 &&
        flows.any fun flow => decide (flow.id = outputFlowId && flow.sourceId = id)
  | .userTask id _ =>
      incomingCount flows id = 1 && outgoingCount flows id = 1
  | .intermediateCatchTimerEvent id durationLiteral =>
      durationLiteral = "PT1S" &&
        incomingCount flows id = 1 && outgoingCount flows id = 1
  | .intermediateCatchMessageEvent id channel =>
      (match channel with
        | .operationMessage .. => channel.identifiersNonempty
        | .directMessage .. => false) &&
        incomingCount flows id = 1 && outgoingCount flows id = 1
  | .receiveTask id channel =>
      (match channel with
        | .operationMessage .. => false
        | .directMessage .. => channel.identifiersNonempty) &&
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
  | .exclusiveMerge id =>
      incomingCount flows id = 3 && outgoingCount flows id = 1
  | .exclusiveGateway id candidateFlowIds defaultFlowId =>
      incomingCount flows id = 1 &&
        outgoingCount flows id = 3 &&
        checkedExclusiveGatewayValid flows id candidateFlowIds defaultFlowId
  | .inclusiveGatewayDiverging id candidateFlowIds defaultFlowId =>
      incomingCount flows id = 1 &&
        outgoingCount flows id = 3 &&
        checkedInclusiveGatewayValid flows id candidateFlowIds defaultFlowId
  | .inclusiveGatewayConverging id pairedGatewayId =>
      nonempty pairedGatewayId.value &&
        incomingCount flows id = 3 && outgoingCount flows id = 1
  | .eventBasedGateway id =>
      incomingCount flows id = 1 && outgoingCount flows id = 2
  | .errorEndEvent id error =>
      errorReferenceValid error &&
        incomingCount flows id = 1 && outgoingCount flows id = 0
  | .noneEndEvent id =>
      incomingCount flows id = 1 && outgoingCount flows id = 0

/-- The node kinds whose lowered operation carries a boundary Timer deadline of the given disposition. An allowlist, so an unrecognised kind fails closed; a kind belongs here only once some lowering clause folds the deadline into that host's operation *and* preserves its disposition. The two dispositions have different allowlists because they have different lowering clauses: `enterBoundedScope` is interrupting by construction and discards the disposition it was given, so a non-interrupting deadline on a Sub-Process host must be refused here rather than lowered into it. -/
def checkedOwnsBoundaryTimerDeadline (node : CheckedNode)
    (interruption : BoundaryInterruption) (host : NodeId) : Bool :=
  match node, interruption with
  | .userTask hostId _, _ => decide (hostId = host)
  | .embeddedSubProcess hostId _, .interrupting => decide (hostId = host)
  | _, _ => false

/-- Every boundary Timer attaches to exactly one same-scope deadline-owning Activity that admits its disposition, and no two claim the same host. Without this the node admits and then lowers to no operation, because the deadline belongs to the Activity's operation rather than to itself, so a misattached boundary node yields a silently deadline-free program that nothing downstream rejects. Checking the disposition here rather than leaving it to the profile cardinality table is what keeps the rule fail-closed: a profile that happened to pin the wrong pair would otherwise be the only thing standing between a non-interrupting source and an interrupting scope entry. -/
def checkedBoundaryTimerAttachmentValid (source : CheckedProcess) : Bool :=
  let hosts := source.nodes.filterMap fun
    | .timerBoundaryEvent _ attachedToRef _ _ _ => some attachedToRef
    | _ => none
  source.nodes.all fun
    | .timerBoundaryEvent id attachedToRef interruption _ _ =>
        source.nodes.any
            (checkedOwnsBoundaryTimerDeadline · interruption attachedToRef) &&
          checkedNodeScopeId? source id ==
            checkedNodeScopeId? source attachedToRef &&
          (hosts.filter (· = attachedToRef)).length = 1
    | _ => true

/-- Independent static admission for the exact currently implemented checked-graph profiles. -/
def checkedWellFormed (source : CheckedProcess) : Bool :=
  nonempty source.identity.semanticProfile.value &&
    nonempty source.identity.sourceId.value &&
    sourceOverlayIdentityValid source.identity.sourceOverlay &&
    lowercaseHexSha256 source.identity.sourceSha256 &&
    nonempty source.processId.value &&
    checkedDefinitionScopesValid source &&
    checkedOwnershipValid source &&
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
                | .inclusiveGatewayDiverging _ candidateFlowIds _ =>
                    candidateFlowIds.contains flow.id
                | _ => false)) &&
    source.nodes.all (checkedNodeArityValid source.sequenceFlows) &&
    checkedInclusivePairingValid source &&
    checkedEventRaceConfigurationValid source &&
    checkedErrorHandlersValid source &&
    checkedBoundaryTimerAttachmentValid source &&
    checkedProfileCapabilitiesValid source &&
    checkedProcessGraphWellFormed source

end BpmnSemantics.SemanticProcess
