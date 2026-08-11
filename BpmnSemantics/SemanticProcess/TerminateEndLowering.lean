import BpmnSemantics.SemanticProcess.CheckedGraphValidation

/-! # Terminate End lowering

This module owns endpoint-only lowering of an identity-only checked Terminate End Event. Its sole
incoming Sequence Flow becomes the consumed control place, the checked node identity becomes the
operation origin, and the checked containing definition scope becomes the termination target. No
continuation output is synthesized here.
-/

namespace BpmnSemantics.SemanticProcess

private def terminateIncomingPlace? (source : CheckedProcess) (id : NodeId) :
    Option ControlPlaceId :=
  match source.sequenceFlows.filter fun flow => decide (flow.targetId = id) with
  | [flow] => some ⟨"place:" ++ flow.id.value⟩
  | _ => none

/-- Lower one checked Terminate End from exact checked endpoints and scope ownership only. -/
def lowerTerminateEnd? (source : CheckedProcess) (id : NodeId) :
    Option (SemanticOperation × DefinitionScopeId) := do
  let scopeId ← checkedNodeScopeId? source id
  let input ← terminateIncomingPlace? source id
  pure
    (.terminateScope
      ⟨"operation:" ++ id.value⟩
      { elementId := id }
      input
      scopeId, scopeId)

theorem lowerTerminateEnd_preserves_identity_input_scope
    (source : CheckedProcess) (id : NodeId) (input : ControlPlaceId)
    (scopeId : DefinitionScopeId)
    (incoming : terminateIncomingPlace? source id = some input)
    (scope : checkedNodeScopeId? source id = some scopeId) :
    lowerTerminateEnd? source id =
      some
        (.terminateScope ⟨"operation:" ++ id.value⟩
          { elementId := id } input scopeId, scopeId) := by
  simp [lowerTerminateEnd?, incoming, scope]

end BpmnSemantics.SemanticProcess
