import BpmnSemantics.SemanticProcess.Data
import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import BpmnSemantics.SemanticProcess.ErrorDefinition
import BpmnSemantics.SemanticProcess.GraphValidation
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression

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

end BpmnSemantics.SemanticProcess
