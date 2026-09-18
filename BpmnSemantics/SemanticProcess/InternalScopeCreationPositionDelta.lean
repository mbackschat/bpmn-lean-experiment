import BpmnSemantics.SemanticProcess.InternalScopeCreationSelection
import BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts

/-! Scope-creation position templates bind both differently owned token units and the entered scope
to immutable provenance under the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def internalScopeCreationPositionDelta? (program : Program)
    (selected : InternalScopeCreationSelection) : Option PublicControlPositionDelta := do
  let consumed ← internalLocalControlPlaceOrigin? program selected.input selected.owner
  let produced ← internalLocalControlPlaceOrigin? program selected.entry selected.created.id
  let definition ← definitionScope? program selected.created.id.definitionScopeId
  if definition.originElementId.value = "" ||
      (program.definitionScopes.filter fun candidate =>
        decide (candidate.originElementId = definition.originElementId)).length ≠ 1 then none
  else
    some
      { consumedTokens :=
          [{ sequenceFlowId := consumed.elementId, owner := selected.owner, multiplicity := 1 }]
        producedTokens :=
          [{ sequenceFlowId := produced.elementId, owner := selected.created.id, multiplicity := 1 }]
        enteredScopes :=
          [{ id := selected.created.id, parent := selected.created.parent
             bpmnElementId := definition.originElementId }]
        exitedScopes := [] }

theorem internalScopeCreationPositionDelta_facts (program : Program)
    (selected : InternalScopeCreationSelection) (delta : PublicControlPositionDelta)
    (found : internalScopeCreationPositionDelta? program selected = some delta) :
    ∃ consumed produced definition,
      internalLocalControlPlaceOrigin? program selected.input selected.owner = some consumed ∧
      internalLocalControlPlaceOrigin? program selected.entry selected.created.id = some produced ∧
      definitionScope? program selected.created.id.definitionScopeId = some definition ∧
      definition.originElementId.value ≠ "" ∧
      (program.definitionScopes.filter fun candidate =>
        decide (candidate.originElementId = definition.originElementId)).length = 1 ∧
      delta =
        { consumedTokens :=
            [{ sequenceFlowId := consumed.elementId, owner := selected.owner, multiplicity := 1 }]
          producedTokens :=
            [{ sequenceFlowId := produced.elementId, owner := selected.created.id, multiplicity := 1 }]
          enteredScopes :=
            [{ id := selected.created.id, parent := selected.created.parent
               bpmnElementId := definition.originElementId }]
          exitedScopes := [] } := by
  unfold internalScopeCreationPositionDelta? at found
  obtain ⟨consumed, consumedFound, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨produced, producedFound, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨definition, definitionFound, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · contradiction
  · cases found
    refine ⟨consumed, produced, definition, consumedFound, producedFound, definitionFound, ?_⟩
    simp_all

end BpmnSemantics.SemanticProcess.InternalCommutation
