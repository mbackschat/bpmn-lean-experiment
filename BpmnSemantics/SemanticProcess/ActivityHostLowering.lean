module

public import BpmnSemantics.SemanticProcess.LoweringIdentity
public import BpmnSemantics.SemanticProcessContract

/-! # Activity host lowering

ACTH-ADMIT-01 of the [Activity host specification](../../docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#lowering) and
ACSP-ADMIT-01 of the [split proposal](../../docs/capsules/ACTIVITY-HOST-SPLIT-SPEC.md#lowering): a User, Service or
Send Task with two or more incoming or two or more outgoing flows lowers to one Activity host whose inputs and outputs
are those flows' places in canonical order. A Task with one incoming and one outgoing flow keeps its legacy lowering
(ACSP-ONE-01), so `Lowering` dispatches here only for a merging or splitting Task. Transcribed independently by the
TypeScript `activity-host-lowering` module.
-/

public section

namespace BpmnSemantics.SemanticProcess

/-- Lower one merging or splitting Task to its host over `inputs` and `outputs`, which the caller passes in canonical
order (ACTH-HOST-01, ACSP-HOST-01). -/
def lowerActivityHost? (scopeId : Option DefinitionScopeId) (id : NodeId) (inputs outputs : List ControlPlaceId)
    (work : ActivityWork) : Option (SemanticOperation × DefinitionScopeId) :=
  scopeId.map fun ownedScopeId =>
    let outputs := outputs.map fun place => ({ place } : ActivityOutput)
    (.activity { id := nodeOperationId id, origin := { elementId := id }, inputs, outputs, work }, ownedScopeId)

end BpmnSemantics.SemanticProcess
