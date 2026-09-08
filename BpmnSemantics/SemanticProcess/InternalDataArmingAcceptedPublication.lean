import BpmnSemantics.SemanticProcess.InternalDataArmingExecution
import BpmnSemantics.SemanticProcess.InternalDataArmingPublication
import BpmnSemantics.SemanticProcess.InternalDataArmingFootprintCommutation
import BpmnSemantics.SemanticProcess.InternalCommutationPublication

/-! # Complete accepted composed data-arming publication

Prepared footprints share the traced evaluator's record, lifecycle acceptance, position delta, and
canonical numbering. Their availability to the production classifier is a separate boundary.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_data_arm_preserves_runtime_and_open_set
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    runtimeStateWellFormed program instanceId (applyInternalDataArmingPatch state patch) = true ∧
      (projectOpenFlowNodeOccurrences? program (applyInternalDataArmingPatch state patch)).isSome =
        true := by
  obtain ⟨_, _, _, _, _, projected, _, valid⟩ :=
    prepared_data_arm_preserves_runtime_and_open_projection_exact program state contract patch
      instanceId programValid stateValid openBefore prepared
  exact ⟨valid, by rw [projected]; rfl⟩

theorem acceptedInternalPublicationForFootprint_prepared_data
    (program : Program) (instanceId commandId : SemanticId) (state : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    ∃ newStart,
      waitStart? program state patch.arm.owner patch.arm.write.elementId
          patch.arm.write.occurrence.activation = some newStart ∧
      acceptedInternalPublicationForFootprint? program instanceId state
          (applyInternalDataArmingPatch state patch) contract.operation commandId
          (footprintOfDataPatch contract patch) =
        some
          { pair :=
              { footprint := footprintOfDataPatch contract patch
                record :=
                  { operationId := contract.operation.id
                    operationKind := contract.operation.kind
                    origin := contract.operation.origin
                    owner := patch.arm.owner }
                lifecycle := canonicalFlowNodeOccurrenceDelta [newStart] [] }
            logicalTimeMs := state.logicalTimeMs
            positionDelta :=
              { consumedTokens :=
                  [PublicControlTokenPosition.mk patch.arm.inputOrigin.elementId patch.arm.owner 1]
                producedTokens := [], enteredScopes := [], exitedScopes := [] } } := by
  obtain ⟨newStart, started, lifecycle⟩ := prepared_data_arm_lifecycle_singleton program state
    contract patch instanceId commandId 0 programValid stateValid openBefore prepared
  have record := internalTransitionRecord_prepared_data program state contract patch
    programValid prepared
  have position := controlPositionDelta_prepared_data_arm program instanceId state contract patch
    (runtimeStateWellFormed_position program instanceId state stateValid) prepared
  refine ⟨newStart, started, ?_⟩
  simp only [acceptedInternalPublicationForFootprint?, internalPublicationPairForFootprint?]
  rw [record, lifecycle, position]
  rfl

theorem prepared_data_publication_frame
    (program : Program) (instanceId commandId : SemanticId) (before after : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (programValid : programWellFormed program = true)
    (beforeValid : runtimeStateWellFormed program instanceId before = true)
    (afterValid : runtimeStateWellFormed program instanceId after = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program before).isSome = true)
    (openAfter : (projectOpenFlowNodeOccurrences? program after).isSome = true)
    (beforePrepared : prepareInternalDataArmingContract? program before contract = some patch)
    (afterPrepared : prepareInternalDataArmingContract? program after contract = some patch)
    (timeFrame : after.logicalTimeMs = before.logicalTimeMs)
    (startFrame : waitStart? program after patch.arm.owner patch.arm.write.elementId
        patch.arm.write.occurrence.activation =
      waitStart? program before patch.arm.owner patch.arm.write.elementId
        patch.arm.write.occurrence.activation) :
    ∃ publication,
      publication.pair.footprint = footprintOfDataPatch contract patch ∧
      acceptedInternalPublicationForFootprint? program instanceId before
          (applyInternalDataArmingPatch before patch) contract.operation commandId
          (footprintOfDataPatch contract patch) = some publication ∧
      acceptedInternalPublicationForFootprint? program instanceId after
          (applyInternalDataArmingPatch after patch) contract.operation commandId
          (footprintOfDataPatch contract patch) = some publication := by
  obtain ⟨beforeStart, beforeStarted, beforeAccepted⟩ :=
    acceptedInternalPublicationForFootprint_prepared_data program instanceId commandId before
      contract patch programValid beforeValid openBefore beforePrepared
  obtain ⟨afterStart, afterStarted, afterAccepted⟩ :=
    acceptedInternalPublicationForFootprint_prepared_data program instanceId commandId after
      contract patch programValid afterValid openAfter afterPrepared
  rw [startFrame, beforeStarted] at afterStarted
  cases afterStarted
  refine ⟨_, rfl, beforeAccepted, ?_⟩
  simpa only [timeFrame] using afterAccepted

theorem prepared_ordinary_publication_frame
    (program : Program) (instanceId commandId : SemanticId) (before after : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (programValid : programWellFormed program = true)
    (beforeValid : runtimeStateWellFormed program instanceId before = true)
    (afterValid : runtimeStateWellFormed program instanceId after = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program before).isSome = true)
    (openAfter : (projectOpenFlowNodeOccurrences? program after).isSome = true)
    (beforePrepared : prepareInternalArm? program before operation = some patch)
    (afterPrepared : prepareInternalArm? program after operation = some patch)
    (timeFrame : after.logicalTimeMs = before.logicalTimeMs)
    (startFrame : waitStart? program after patch.owner patch.write.elementId
        patch.write.occurrence.activation =
      waitStart? program before patch.owner patch.write.elementId patch.write.occurrence.activation) :
    ∃ publication,
      publication.pair.footprint = footprintOfPatch patch ∧
      acceptedInternalPublicationForFootprint? program instanceId before
          (applyInternalArmingPatch before patch) operation commandId (footprintOfPatch patch) =
        some publication ∧
      acceptedInternalPublicationForFootprint? program instanceId after
          (applyInternalArmingPatch after patch) operation commandId (footprintOfPatch patch) =
        some publication := by
  obtain ⟨beforeStart, beforeStarted, beforeAccepted⟩ :=
    acceptedInternalPublicationForFootprint_prepared program instanceId commandId before
      operation patch programValid beforeValid openBefore beforePrepared
  obtain ⟨afterStart, afterStarted, afterAccepted⟩ :=
    acceptedInternalPublicationForFootprint_prepared program instanceId commandId after
      operation patch programValid afterValid openAfter afterPrepared
  rw [startFrame, beforeStarted] at afterStarted
  cases afterStarted
  refine ⟨_, rfl, beforeAccepted, ?_⟩
  simpa only [timeFrame] using afterAccepted

end BpmnSemantics.SemanticProcess.InternalCommutation
