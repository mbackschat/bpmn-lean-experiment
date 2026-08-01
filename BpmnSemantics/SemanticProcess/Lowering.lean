import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.ErrorDefinition
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

private def nodeScopeId? (source : CheckedProcess) (nodeId : NodeId) :
    Option DefinitionScopeId :=
  (source.nodeScopes.find? fun ownership =>
    decide (ownership.nodeId = nodeId)).map (·.scopeId)

private def isRootScope (source : CheckedProcess)
    (scopeId : DefinitionScopeId) : Bool :=
  source.definitionScopes.any fun scope =>
    decide (scope.id = scopeId) && scope.parentScopeId.isNone

private def childEntryPlace (source : CheckedProcess)
    (childScopeId : DefinitionScopeId) : ControlPlaceId :=
  let startId := (source.nodes.findSome? fun node =>
    match node, nodeScopeId? source node.id with
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
      match nodeScopeId? source id with
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
      let scopeId ← nodeScopeId? source id
      pure
        (.enterScope
          (nodeOperationId id)
          { elementId := id }
          (firstPlace (incomingPlaces source id))
          (childEntryPlace source childScopeId)
          childScopeId, scopeId)
  | .boundaryErrorEvent .. => none
  | .userTask id name =>
      nodeScopeId? source id |>.map fun scopeId =>
      (.awaitUserTask
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { id := ⟨id.value⟩, name }, scopeId)
  | .intermediateCatchTimerEvent id durationLiteral =>
      nodeScopeId? source id |>.map fun scopeId =>
      (.awaitTimer
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id
          durationMs := if durationLiteral = "PT1S" then 1000 else 0 }, scopeId)
  | .intermediateCatchMessageEvent id channel =>
      nodeScopeId? source id |>.map fun scopeId =>
      (.awaitMessage
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id, channel }, scopeId)
  | .receiveTask id channel =>
      nodeScopeId? source id |>.map fun scopeId =>
      (.awaitMessage
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id, channel }, scopeId)
  | .serviceTask id descriptor inputMappings outputMappings bpmnErrorRoute =>
      nodeScopeId? source id |>.map fun scopeId =>
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
      nodeScopeId? source id |>.map fun scopeId =>
      (.duplicate
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (outgoingPlaces source id), scopeId)
  | .parallelGateway id .converging =>
      nodeScopeId? source id |>.map fun scopeId =>
      (.synchronize
        (nodeOperationId id)
        { elementId := id }
        (incomingPlaces source id)
        (firstPlace (outgoingPlaces source id)), scopeId)
  | .exclusiveGateway id candidateFlowIds defaultFlowId =>
      nodeScopeId? source id |>.map fun scopeId =>
      (.choose
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (candidateFlowIds.map (lowerConditionalCandidate source))
        (flowControlPlaceId defaultFlowId)
        { elementId := defaultFlowId }, scopeId)
  | .errorEndEvent id error =>
      nodeScopeId? source id |>.map fun scopeId =>
      (.throwError
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        error
        (lowerInterruptingErrorHandler source scopeId error), scopeId)
  | .noneEndEvent id =>
      nodeScopeId? source id |>.map fun scopeId =>
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

private def scopeExists (scopes : List DefinitionScope)
    (scopeId : DefinitionScopeId) : Bool :=
  scopes.any fun scope => decide (scope.id = scopeId)

private def sequenceFlowScopeId? (source : CheckedProcess)
    (flowId : SequenceFlowId) : Option DefinitionScopeId :=
  (source.sequenceFlowScopes.find? fun ownership =>
    decide (ownership.sequenceFlowId = flowId)).map (·.scopeId)

private def flowSourceScopeId? (source : CheckedProcess) (flow : CheckedSequenceFlow) :
    Option DefinitionScopeId :=
  match nodeScopeId? source flow.sourceId with
  | some scopeId => some scopeId
  | none =>
      source.nodes.findSome? fun
        | .serviceTask id _ _ _ (some route) =>
            if route.boundaryEventId = flow.sourceId then nodeScopeId? source id
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
                          nodeScopeId? source id = some parentScopeId)
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
      let scopeId := sequenceFlowScopeId? source flow.id
      scopeId = flowSourceScopeId? source flow &&
        scopeId = nodeScopeId? source flow.targetId

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
      channel.identifiersNonempty &&
        incomingCount flows id = 1 && outgoingCount flows id = 1
  | .receiveTask id channel =>
      channel.identifiersNonempty &&
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
  | .enterScope id origin input childEntry childScopeId =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty childScopeId.value &&
        placeExists places input &&
        placeExists places childEntry
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
  | .awaitMessage id origin input output message =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty message.elementId.value &&
        decide (origin.elementId = message.elementId) &&
        message.channel.identifiersNonempty &&
        decide (input ≠ output) &&
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
  | .throwError id origin input error handler =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        errorReferenceValid error &&
        nonempty handler.attachedScopeId.value &&
        nonempty handler.code &&
        nonempty handler.origin.boundaryEventId.value &&
        nonempty handler.origin.errorDefinitionId.value &&
        nonempty handler.origin.errorElementId.value &&
        nonempty handler.origin.sequenceFlowId.value &&
        handler.code = error.code &&
        handler.origin.errorElementId = error.errorElementId &&
        decide (handler.origin.errorDefinitionId ≠ error.errorDefinitionId) &&
        placeExists places input &&
        placeHasOrigin places handler.output
          { elementId := handler.origin.sequenceFlowId }
  | .reachNoneEnd id origin input =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists places input
  | .completeScope id origin scopeId parentOutput =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty scopeId.value &&
        parentOutput.all (placeExists places)

private def isInitiate : SemanticOperation → Bool
  | .initiate .. => true
  | _ => false

/-- Structural validation for a decoded Semantic Process program, independent of checked-source equality. -/
def programWellFormed (program : Program) : Bool :=
  nonempty program.identity.semanticProfile.value &&
    nonempty program.identity.sourceId.value &&
    lowercaseHexSha256 program.identity.sourceSha256 &&
    nonempty program.processId.value &&
    !program.definitionScopes.isEmpty &&
    strictlySortedStrings (program.definitionScopes.map fun scope => scope.id.value) &&
    program.definitionScopes.all (fun scope =>
      nonempty scope.id.value && nonempty scope.originElementId.value) &&
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
