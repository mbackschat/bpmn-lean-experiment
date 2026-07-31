import BpmnSemantics.SemanticProcessContract

/-! # Error definition admission and lowering

This module owns exact-code resolution of one interrupting boundary Error handler for a throwing embedded Sub-Process scope. It validates the source-level handler relationship and lowers that already-resolved relationship into the Semantic Process operation payload; runtime propagation remains in `ErrorPropagation`.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def nodeScopeId? (source : CheckedProcess) (nodeId : NodeId) :
    Option DefinitionScopeId :=
  (source.nodeScopes.find? fun ownership =>
    decide (ownership.nodeId = nodeId)).map (·.scopeId)

private def attachedChildScope? (source : CheckedProcess)
    (attachedToRef : NodeId) : Option DefinitionScopeId :=
  source.nodes.findSome? fun
    | .embeddedSubProcess id childScopeId =>
        if id = attachedToRef then some childScopeId else none
    | _ => none

private def sequenceFlowScopeId? (source : CheckedProcess)
    (flowId : SequenceFlowId) : Option DefinitionScopeId :=
  (source.sequenceFlowScopes.find? fun ownership =>
    decide (ownership.sequenceFlowId = flowId)).map (·.scopeId)

/-- Lower the unique directly attached exact-code handler already required by checked admission. -/
def lowerInterruptingErrorHandler (source : CheckedProcess)
    (throwingScopeId : DefinitionScopeId) (error : ErrorReference) :
    InterruptingErrorHandler :=
  (source.nodes.findSome? fun
    | .boundaryErrorEvent id attachedToRef caught outputFlowId =>
        if attachedChildScope? source attachedToRef = some throwingScopeId &&
            caught.errorElementId = error.errorElementId &&
            caught.code = error.code then
          some
            { attachedScopeId := throwingScopeId
              code := caught.code
              output := ⟨"place:" ++ outputFlowId.value⟩
              origin :=
                { boundaryEventId := id
                  errorDefinitionId := caught.errorDefinitionId
                  errorElementId := caught.errorElementId
                  sequenceFlowId := outputFlowId } }
        else none
    | _ => none).getD
      { attachedScopeId := throwingScopeId
        code := ""
        output := ⟨""⟩
        origin :=
          { boundaryEventId := ⟨""⟩
            errorDefinitionId := ⟨""⟩
            errorElementId := ⟨""⟩
            sequenceFlowId := ⟨""⟩ } }

/-- Validate the three project-owned identity facts retained for an Error reference. -/
def errorReferenceValid (error : ErrorReference) : Bool :=
  !error.errorDefinitionId.value.isEmpty &&
    !error.errorElementId.value.isEmpty &&
    !error.code.isEmpty

private def directHandlerMatches (source : CheckedProcess)
    (throwingScopeId : DefinitionScopeId) (error : ErrorReference) :
    CheckedNode → Bool
  | .boundaryErrorEvent id attachedToRef caught outputFlowId =>
      errorReferenceValid caught &&
        decide (caught.errorDefinitionId ≠ error.errorDefinitionId) &&
        caught.errorElementId = error.errorElementId &&
        caught.code = error.code &&
        attachedChildScope? source attachedToRef = some throwingScopeId &&
        (source.definitionScopes.find? fun scope =>
          decide (scope.id = throwingScopeId)).bind (·.parentScopeId) =
            nodeScopeId? source id &&
        source.sequenceFlows.any fun flow =>
          decide (
            flow.id = outputFlowId &&
            flow.sourceId = id &&
            sequenceFlowScopeId? source flow.id = nodeScopeId? source id)
  | _ => false

/-- Require every Error End Event to have exactly one direct-parent, exact-code interrupting handler. -/
def checkedErrorHandlersValid (source : CheckedProcess) : Bool :=
  source.nodes.all fun
    | .errorEndEvent id error =>
        errorReferenceValid error &&
          match nodeScopeId? source id with
          | none => false
          | some throwingScopeId =>
              (source.nodes.filter
                (directHandlerMatches source throwingScopeId error)).length = 1
    | _ => true

end BpmnSemantics.SemanticProcess
