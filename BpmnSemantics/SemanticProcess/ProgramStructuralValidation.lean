import BpmnSemantics.SemanticProcess.Data
import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import BpmnSemantics.SemanticProcess.ErrorDefinition
import BpmnSemantics.SemanticProcess.GraphValidation
import BpmnSemantics.SemanticProcess.InclusiveGateway
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression
import BpmnSemantics.SemanticProcess.CallActivityAdmission

/-! # Semantic Process program structural validation

This module owns definition, place, operation, initiation, and operation-specific admission for the Semantic Process IL. `GraphValidation` remains the owner of topology, reachability, scope-tree, and producer/consumer checks.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

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

private def operationWellFormed (program : Program) (places : List ControlPlace) :
    SemanticOperation → Bool
  | .initiate id origin output =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists program.controlPlaces output
  | .enterScope id origin input childEntry childScopeId =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty childScopeId.value &&
        placeExists program.controlPlaces input &&
        placeExists program.controlPlaces childEntry
  | .enterBoundedScope id origin input childEntry childScopeId boundaryTimer =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty childScopeId.value &&
        nonempty boundaryTimer.elementId.value &&
        nonempty boundaryTimer.origin.elementId.value &&
        boundaryTimer.durationMs = 1000 &&
        decide (
          origin.elementId.value ≠ boundaryTimer.elementId.value ∧
          childEntry ≠ boundaryTimer.output ∧
          input ≠ childEntry ∧ input ≠ boundaryTimer.output) &&
        -- Same token-carrying requirement as the task host: the deadline output must be exactly the
        -- boundary Sequence Flow's place, not some other place that merely exists.
        places.any (fun place =>
          decide (place.id = boundaryTimer.output ∧
            place.origin = boundaryTimer.origin)) &&
        placeExists program.controlPlaces input &&
        placeExists program.controlPlaces childEntry
  | .invokeProcess id origin input calledProcessId calledRoot calledEntry returned =>
      invokeProcessOperationWellFormed program id origin input calledProcessId
        calledRoot calledEntry returned
  | .returnProcess id origin calledProcessId calledRoot callerOutput =>
      returnProcessOperationWellFormed program id origin calledProcessId calledRoot
        callerOutput
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
  | .awaitEventRace id origin input message timer =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty message.configurationOrigin.elementId.value &&
        nonempty message.elementId.value &&
        (match message.channel with
          | .operationMessage .. => message.channel.identifiersNonempty
          | .directMessage .. => false) &&
        nonempty timer.configurationOrigin.elementId.value &&
        nonempty timer.elementId.value &&
        timer.durationMs = 1000 &&
        decide (
          message.configurationOrigin ≠ timer.configurationOrigin ∧
          message.elementId ≠ timer.elementId ∧
          message.output ≠ timer.output ∧
          input ≠ message.output ∧ input ≠ timer.output) &&
        !(places.any fun place =>
          decide (place.origin = message.configurationOrigin ∨
            place.origin = timer.configurationOrigin)) &&
        placeExists places input &&
        placeExists places message.output &&
        placeExists places timer.output
  | .awaitBoundedUserTask id origin input task boundaryTimer
  | .awaitMonitoredUserTask id origin input task boundaryTimer =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty task.id.value &&
        nonempty boundaryTimer.elementId.value &&
        nonempty boundaryTimer.origin.elementId.value &&
        decide (origin.elementId.value = task.id.value) &&
        boundaryTimer.durationMs = 1000 &&
        decide (
          task.id.value ≠ boundaryTimer.elementId.value ∧
          task.output ≠ boundaryTimer.output ∧
          input ≠ task.output ∧ input ≠ boundaryTimer.output) &&
        -- The boundary Sequence Flow carries a token, unlike an Event-Based Gateway's configuration
        -- Flows, so this requires the opposite: the deadline output must be exactly that Flow's place.
        places.any (fun place =>
          decide (place.id = boundaryTimer.output ∧
            place.origin = boundaryTimer.origin)) &&
        placeExists places input &&
        placeExists places task.output
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
  | .mergeExclusive id origin inputs output =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        !inputs.isEmpty &&
        sortedDistinctPlaceIds inputs &&
        !inputs.contains output &&
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
  | .selectMany id origin input candidates defaultBranch selectionKey =>
      let outputs := candidates.map (·.output) ++ [defaultBranch.output]
      let expected :=
        candidates.map (·.expectedJoinInput) ++ [defaultBranch.expectedJoinInput]
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty selectionKey &&
        placeExists places input &&
        candidates.length = 2 &&
        outputs.eraseDups.length = 3 &&
        expected.eraseDups.length = 3 &&
        strictlySortedStrings
          (candidates.map fun candidate => candidate.origin.elementId.value) &&
        candidates.all fun candidate =>
          simpleBooleanExpressionValid candidate.condition &&
            placeHasOrigin places candidate.output candidate.origin &&
            placeExists places candidate.expectedJoinInput &&
        placeHasOrigin places defaultBranch.output defaultBranch.origin &&
        placeExists places defaultBranch.expectedJoinInput
  | .synchronizeSelected id origin inputs output selectionKey =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty selectionKey &&
        inputs.length = 3 &&
        sortedDistinctPlaceIds inputs &&
        inputs.all (placeExists places) &&
        placeExists places output
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

private def inclusiveOperationsPaired (operations : List SemanticOperation) : Bool :=
  let selections := operations.filterMap fun
    | .selectMany _ _ _ candidates defaultBranch selectionKey =>
        some (selectionKey,
          canonicalControlPlaceOrder
            (candidates.map (·.expectedJoinInput) ++
              [defaultBranch.expectedJoinInput]))
    | _ => none
  let joins := operations.filterMap fun
    | .synchronizeSelected _ _ inputs _ selectionKey =>
        some (selectionKey, inputs)
    | _ => none
  if selections.isEmpty && joins.isEmpty then true
  else
    selections.length = joins.length &&
      selections.all fun selection =>
        (joins.filter fun join => decide (join.1 = selection.1 &&
          join.2 = selection.2)).length = 1 &&
      joins.all fun join =>
        (selections.filter fun selection => decide (selection.1 = join.1 &&
          selection.2 = join.2)).length = 1

/-- Structural validation for a decoded Semantic Process program, independent of checked-source equality. -/
def programWellFormed (program : Program) : Bool :=
  nonempty program.identity.semanticProfile.value &&
    nonempty program.identity.sourceId.value &&
    sourceOverlayIdentityValid program.identity.sourceOverlay &&
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
    program.operations.all (operationWellFormed program program.controlPlaces) &&
    inclusiveOperationsPaired program.operations &&
    callOperationsPaired program &&
    (program.operations.filter isInitiate).length = 1 &&
    programGraphWellFormed program

end BpmnSemantics.SemanticProcess
