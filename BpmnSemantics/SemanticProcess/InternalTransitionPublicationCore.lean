import BpmnSemantics.SemanticProcess.InternalScopeCreationAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalPreparedArming
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import BpmnSemantics.SemanticProcess.TransitionRecord
import BpmnSemantics.SemanticProcess.ControlPositionProjection
import BpmnSemantics.SemanticProcess.InternalRegionalPreparation

/-! Family publication values stay below the unified prepared dispatcher, so its pair laws can reuse acceptance without an import cycle. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalTransitionLifecycleTemplate where
  | wait (start : OpenSemanticFlowNodeOccurrence)
  | instantaneous (identity : FlowNodeIdentity)
  | scopeCreation (delta : UnnumberedFlowNodeOccurrenceDelta)
  | regional (instantaneous : List FlowNodeIdentity) (retainedEnds : List UnnumberedFlowNodeOccurrenceEnd)
  deriving Repr, DecidableEq

def InternalTransitionLifecycleTemplate.instantiate (commandId : SemanticId)
    (transitionIndex : Nat) : InternalTransitionLifecycleTemplate → UnnumberedFlowNodeOccurrenceDelta
  | .wait start => canonicalFlowNodeOccurrenceDelta [start] []
  | .instantaneous identity => instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [identity]
  | .scopeCreation delta => delta
  | .regional identities ends => instantaneousFlowNodeOccurrenceDeltaWithEnds commandId transitionIndex identities ends

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

def internalScopeCreationPublicationTemplate (prepared : PreparedInternalScopeCreation) :
    InternalTransitionPublicationTemplate :=
  { record :=
      { operationId := prepared.selection.operation.id, operationKind := prepared.selection.operation.kind
        origin := prepared.selection.operation.origin, owner := prepared.selection.owner }
    logicalTimeMs := prepared.publicationTemplate.logicalTimeMs
    positionDelta := prepared.publicationTemplate.positionDelta
    lifecycle := .scopeCreation prepared.publicationTemplate.lifecycle }

def internalRegionalPublicationTemplate (prepared : PreparedInternalRegional) :
    InternalTransitionPublicationTemplate :=
  { record :=
      { operationId := prepared.selection.operation.id, operationKind := prepared.selection.operation.kind
        origin := prepared.selection.operation.origin, owner := prepared.publicationTemplate.owner }
    logicalTimeMs := prepared.publicationTemplate.logicalTimeMs
    positionDelta := prepared.publicationTemplate.positionDelta
    lifecycle := .regional prepared.publicationTemplate.instantaneous prepared.publicationTemplate.retainedEnds }

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

end BpmnSemantics.SemanticProcess.InternalCommutation
