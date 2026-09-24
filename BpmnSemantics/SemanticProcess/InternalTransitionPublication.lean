import BpmnSemantics.SemanticProcess.InternalPreparedTransition
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationCore

/-! Complete prepared templates and accepted batch execution follow the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md). -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def internalEndPublicationTemplate (prepared : PreparedInternalEnd) :
    InternalTransitionPublicationTemplate :=
  { record :=
      { operationId := prepared.operation.id, operationKind := prepared.operation.kind
        origin := prepared.operation.origin, owner := prepared.selection.owner }
    logicalTimeMs := prepared.publicationTemplate.logicalTimeMs
    positionDelta := prepared.publicationTemplate.positionDelta
    lifecycle := .instantaneous prepared.publicationTemplate.identity }

def internalMessageTaskPublicationTemplate? (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch) :
    Option InternalTransitionPublicationTemplate := do
  let task ← waitStart? program state patch.arm.owner patch.arm.write.elementId patch.arm.write.occurrence.activation
  let message ← waitStart? program state patch.message.owner patch.message.elementId patch.message.activation
  let base := internalArmingPublicationTemplate contract.operation patch.arm state.logicalTimeMs task
  some { base with lifecycle := .waits [task, message] }

/-- Templates use the complete predecessor preparation and owner ancestry; no successor projection
or command/index assignment participates in constructing this value. -/
def preparedTransitionPublicationTemplate? (program : Program) (state : RuntimeState) :
    PreparedInternalTransition → Option InternalTransitionPublicationTemplate
  | .arming (.ordinary operation patch) => internalArmingPublicationTemplate? program state operation patch
  | .arming (.data contract patch) => internalArmingPublicationTemplate? program state contract.operation patch.arm
  | .timerTask contract patch => internalArmingPublicationTemplate? program state contract.operation patch.arm
  | .messageTask contract patch => internalMessageTaskPublicationTemplate? program state contract patch
  | .boundedScope contract prepared =>
      if prepared.selection.creation.operation = contract.operation then
        some (internalBoundedScopePublicationTemplate prepared)
      else none
  | .localControl prepared => some (internalLocalControlPublicationTemplate prepared)
  | .scopeCreation prepared => some (internalScopeCreationPublicationTemplate prepared)
  | .regional prepared => some (internalRegionalPublicationTemplate prepared)
  | .ordinaryEnd prepared => some (internalEndPublicationTemplate prepared)
  | .mergeInput prepared => some (internalMergePublicationTemplate prepared)

/-- A raw bounded-child constructor cannot publish metadata from a different operation. -/
theorem bounded_scope_template_refuses_operation_mismatch (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (prepared : PreparedInternalBoundedScope)
    (different : prepared.selection.creation.operation ≠ contract.operation) :
    preparedTransitionPublicationTemplate? program state (.boundedScope contract prepared) = none := by
  simp [preparedTransitionPublicationTemplate?, different]

def runPreparedTransitionBatchPublication? (program : Program) (instanceId commandId : SemanticId)
    (indexForOperation : OperationId → Nat) (state : RuntimeState) :
    List PreparedInternalTransition →
    Option (RuntimeState × List InstantiatedInternalTransitionPublication)
  | [] => some (state, [])
  | head :: tail => do
      let next ← applyPreparedInternalTransition? program state head
      let publication ← actualInternalAlternativePublication? program instanceId state next
        head.operation head.alternative commandId (indexForOperation head.operation.id)
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
