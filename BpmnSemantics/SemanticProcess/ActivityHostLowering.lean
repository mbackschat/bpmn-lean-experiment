module

public import BpmnSemantics.SemanticProcess.LoweringIdentity
public import BpmnSemantics.SemanticProcessContract

/-! # Activity host lowering

ACTH-ADMIT-01 of the [Activity host specification](../../docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#lowering): a
User, Service or Send Task with two or more incoming flows lowers to one Activity host whose inputs are those flows'
places in canonical order and whose one output is its outgoing flow. A Task with one incoming flow keeps its legacy
lowering (ACTH-ONE-01), so `Lowering` dispatches here only for a merging Task. Transcribed independently by the
TypeScript `activity-host-lowering` module.
-/

public section

namespace BpmnSemantics.SemanticProcess

/-- Lower one merging Task to its host over `inputs`, which the caller passes in canonical order (ACTH-HOST-01). -/
def lowerActivityHost? (scopeId : Option DefinitionScopeId) (id : NodeId) (inputs : List ControlPlaceId)
    (output : ControlPlaceId) (work : ActivityWork) : Option (SemanticOperation × DefinitionScopeId) :=
  scopeId.map fun ownedScopeId =>
    (.activity { id := nodeOperationId id, origin := { elementId := id }, inputs, outputs := [{ place := output }], work },
      ownedScopeId)

end BpmnSemantics.SemanticProcess
