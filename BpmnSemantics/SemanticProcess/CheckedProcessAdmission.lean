import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.Data
import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import BpmnSemantics.SemanticProcess.ErrorDefinition
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression

/-! # Checked-process structural admission

This module owns representation-specific identity, scope ownership, reference, arity, mapping, Error-handler, profile-capability, and topology admission for the checked BPMN graph. It does not lower or validate Semantic Process programs.
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
  strictlySortedStrings (source.definitionScopes.map fun scope => scope.id.value) &&
    match source.definitionScopes.filter (·.parentScopeId.isNone) with
    | [root] =>
        root.originElementId.value = source.processId.value &&
          source.definitionScopes.all fun scope =>
            match scope.parentScopeId with
            | none => scope.id = root.id
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

private def checkedNodeArityValid (flows : List CheckedSequenceFlow) :
    CheckedNode → Bool
  | .noneStartEvent id =>
      incomingCount flows id = 0 && outgoingCount flows id = 1
  | .embeddedSubProcess id _ =>
      incomingCount flows id = 1 && outgoingCount flows id = 1
  | .boundaryErrorEvent id _ error outputFlowId =>
      errorReferenceValid error &&
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
  | .exclusiveGateway id candidateFlowIds defaultFlowId =>
      incomingCount flows id = 1 &&
        outgoingCount flows id = 3 &&
        checkedExclusiveGatewayValid flows id candidateFlowIds defaultFlowId
  | .errorEndEvent id error =>
      errorReferenceValid error &&
        incomingCount flows id = 1 && outgoingCount flows id = 0
  | .noneEndEvent id =>
      incomingCount flows id = 1 && outgoingCount flows id = 0

/-- Independent static admission for the exact currently implemented checked-graph profiles. -/
def checkedWellFormed (source : CheckedProcess) : Bool :=
  nonempty source.identity.semanticProfile.value &&
    nonempty source.identity.sourceId.value &&
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
                | _ => false)) &&
    source.nodes.all (checkedNodeArityValid source.sequenceFlows) &&
    checkedErrorHandlersValid source &&
    checkedProfileCapabilitiesValid source &&
    checkedProcessGraphWellFormed source

end BpmnSemantics.SemanticProcess
