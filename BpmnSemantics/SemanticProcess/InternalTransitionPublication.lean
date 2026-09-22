import BpmnSemantics.SemanticProcess.InternalPreparedTransition
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationCore

/-! Complete prepared templates and accepted batch execution follow the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md). -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Templates use the complete predecessor preparation and owner ancestry; no successor projection
or command/index assignment participates in constructing this value. -/
def preparedTransitionPublicationTemplate? (program : Program) (state : RuntimeState) :
    PreparedInternalTransition → Option InternalTransitionPublicationTemplate
  | .arming (.ordinary operation patch) => internalArmingPublicationTemplate? program state operation patch
  | .arming (.data contract patch) => internalArmingPublicationTemplate? program state contract.operation patch.arm
  | .localControl prepared => some (internalLocalControlPublicationTemplate prepared)
  | .scopeCreation prepared => some (internalScopeCreationPublicationTemplate prepared)
  | .regional prepared => some (internalRegionalPublicationTemplate prepared)

def runPreparedTransitionBatchPublication? (program : Program) (instanceId commandId : SemanticId)
    (indexForOperation : OperationId → Nat) (state : RuntimeState) :
    List PreparedInternalTransition →
    Option (RuntimeState × List InstantiatedInternalTransitionPublication)
  | [] => some (state, [])
  | head :: tail => do
      let next ← applyPreparedInternalTransition? program state head
      let publication ← actualInternalTransitionPublication? program instanceId state next
        head.operation commandId (indexForOperation head.operation.id)
      let (final, publications) ← runPreparedTransitionBatchPublication? program instanceId commandId
        indexForOperation next tail
      some (final, publication :: publications)

def acceptedPreparedTransitionBatch? (program : Program) (instanceId commandId : SemanticId)
    (first : Nat) (state : RuntimeState) (prepared : List PreparedInternalTransition) :
    Option (RuntimeState × List InstantiatedInternalTransitionPublication) := do
  let templates ← prepared.mapM (preparedTransitionPublicationTemplate? program state)
  let (final, publications) ← runPreparedTransitionBatchPublication? program instanceId commandId
    (internalTransitionPublicationIndex first templates) state prepared
  some (final, canonicalInstantiatedTransitionPublications publications)

end BpmnSemantics.SemanticProcess.InternalCommutation
