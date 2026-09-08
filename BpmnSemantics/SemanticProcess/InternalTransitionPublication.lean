import BpmnSemantics.SemanticProcess.InternalPreparedTransition
import BpmnSemantics.SemanticProcess.TransitionRecord
import BpmnSemantics.SemanticProcess.ControlPositionProjection

/-! Complete prepared templates, canonical numbering, and actual accepted batch execution
are shared by closure and its proof consumers under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md). -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalTransitionLifecycleTemplate where
  | wait (start : OpenSemanticFlowNodeOccurrence)
  | instantaneous (identity : FlowNodeIdentity)
  deriving Repr, DecidableEq

def InternalTransitionLifecycleTemplate.instantiate (commandId : SemanticId)
    (transitionIndex : Nat) : InternalTransitionLifecycleTemplate → UnnumberedFlowNodeOccurrenceDelta
  | .wait start => canonicalFlowNodeOccurrenceDelta [start] []
  | .instantaneous identity => instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [identity]

structure InternalTransitionPublicationTemplate where
  record : InternalTransitionRecord
  logicalTimeMs : Nat
  positionDelta : PublicControlPositionDelta
  lifecycle : InternalTransitionLifecycleTemplate
  deriving Repr, DecidableEq

structure InstantiatedInternalTransitionPublication where
  transitionIndex : Nat
  record : InternalTransitionRecord
  logicalTimeMs : Nat
  positionDelta : PublicControlPositionDelta
  lifecycle : UnnumberedFlowNodeOccurrenceDelta
  deriving Repr, DecidableEq

def InternalTransitionPublicationTemplate.instantiate (commandId : SemanticId)
    (transitionIndex : Nat) (template : InternalTransitionPublicationTemplate) :
    InstantiatedInternalTransitionPublication :=
  { transitionIndex, record := template.record, logicalTimeMs := template.logicalTimeMs
    positionDelta := template.positionDelta
    lifecycle := template.lifecycle.instantiate commandId transitionIndex }

def internalArmingPublicationTemplate (operation : SemanticOperation) (patch : InternalArmingPatch)
    (logicalTimeMs : Nat) (start : OpenSemanticFlowNodeOccurrence) : InternalTransitionPublicationTemplate :=
  { record :=
      { operationId := operation.id, operationKind := operation.kind
        origin := operation.origin, owner := patch.owner }
    logicalTimeMs
    positionDelta :=
      { consumedTokens := [⟨patch.inputOrigin.elementId, patch.owner, 1⟩]
        producedTokens := [], enteredScopes := [], exitedScopes := [] }
    lifecycle := .wait start }

def internalArmingPublicationTemplate? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch) :
    Option InternalTransitionPublicationTemplate :=
  (waitStart? program state patch.owner patch.write.elementId patch.write.occurrence.activation).map
    (internalArmingPublicationTemplate operation patch state.logicalTimeMs)

def internalLocalControlPublicationTemplate (prepared : PreparedInternalLocalControl) :
    InternalTransitionPublicationTemplate :=
  { record :=
      { operationId := prepared.operation.id, operationKind := prepared.operation.kind
        origin := prepared.operation.origin, owner := prepared.selection.owner }
    logicalTimeMs := prepared.publicationTemplate.logicalTimeMs
    positionDelta := prepared.publicationTemplate.positionDelta
    lifecycle := .instantaneous prepared.publicationTemplate.identity }

/-- Templates use the complete predecessor preparation and owner ancestry; no successor projection
or command/index assignment participates in constructing this value. -/
def preparedTransitionPublicationTemplate? (program : Program) (state : RuntimeState) :
    PreparedInternalTransition → Option InternalTransitionPublicationTemplate
  | .arming (.ordinary operation patch) => internalArmingPublicationTemplate? program state operation patch
  | .arming (.data contract patch) => internalArmingPublicationTemplate? program state contract.operation patch.arm
  | .localControl prepared => some (internalLocalControlPublicationTemplate prepared)

def actualInternalTransitionPublication? (program : Program) (instanceId : SemanticId)
    (before after : RuntimeState) (operation : SemanticOperation) (commandId : SemanticId)
    (transitionIndex : Nat) : Option InstantiatedInternalTransitionPublication := do
  let record ← internalTransitionRecord? program before operation
  let lifecycle ← flowNodeOccurrenceDeltaForOperation? program before after operation commandId transitionIndex
  let positionDelta ← controlPositionDelta? program instanceId before after
  some { transitionIndex, record, logicalTimeMs := before.logicalTimeMs, positionDelta, lifecycle }

def canonicalTransitionPublicationTemplates (templates : List InternalTransitionPublicationTemplate) :
    List InternalTransitionPublicationTemplate :=
  sortBy (fun left right => left.record.operationId.value < right.record.operationId.value) templates

def numberTransitionPublicationTemplates (commandId : SemanticId) :
    Nat → List InternalTransitionPublicationTemplate → List InstantiatedInternalTransitionPublication
  | _, [] => []
  | first, template :: rest => template.instantiate commandId first ::
      numberTransitionPublicationTemplates commandId (first + 1) rest

def instantiateTransitionPublicationBatch (commandId : SemanticId) (first : Nat)
    (templates : List InternalTransitionPublicationTemplate) : List InstantiatedInternalTransitionPublication :=
  numberTransitionPublicationTemplates commandId first (canonicalTransitionPublicationTemplates templates)

def internalTransitionPublicationIndex (first : Nat)
    (templates : List InternalTransitionPublicationTemplate) (operationId : OperationId) : Nat :=
  first + (canonicalTransitionPublicationTemplates templates).findIdx
    (fun template => template.record.operationId == operationId)

def canonicalInstantiatedTransitionPublications (publications : List InstantiatedInternalTransitionPublication) :
    List InstantiatedInternalTransitionPublication :=
  sortBy (fun left right => left.record.operationId.value < right.record.operationId.value) publications

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
