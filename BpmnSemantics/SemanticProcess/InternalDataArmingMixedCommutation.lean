import BpmnSemantics.SemanticProcess.InternalDataArmingMixedFrames

/-! # Exact mixed data and ordinary arming commutation

The Activity supplement commutes with ordinary updates through separate counter domains and
discriminated local owners, even when the Effect and Activity occurrence coordinates coincide.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem applyInternalDataArmingActivityPatch_ordinary_commutes (state : RuntimeState)
    (data : InternalDataArmingPatch) (ordinary : InternalArmingPatch) :
    applyInternalArmingPatch (applyInternalDataArmingActivityPatch state data) ordinary =
      applyInternalDataArmingActivityPatch (applyInternalArmingPatch state ordinary) data := by
  cases writeEq : ordinary.write <;>
    simp [applyInternalArmingPatch, applyInternalDataArmingActivityPatch, writeEq,
      addActivityOccurrenceVariableScope]
  apply insertActivityVariableScope_commutes
  simp

theorem applyInternalDataArmingPatch_eq_activity_patch (state : RuntimeState)
    (data : InternalDataArmingPatch) (wait : UserTaskWait)
    (shape : data.arm.write = .userTask wait) :
    applyInternalDataArmingPatch state data =
      applyInternalDataArmingActivityPatch (applyInternalArmingPatch state data.arm) data := by
  simp [applyInternalDataArmingPatch, applyInternalDataArmingActivityPatch,
    applyInternalArmingPatch, shape]

/-- Preparation and footprint independence suffice; no opposite preparation is assumed. -/
theorem applyInternalDataArmingPatch_ordinary_commutes (program : Program)
    (state : RuntimeState) (contract : InternalDataArmingContract)
    (data : InternalDataArmingPatch) (ordinary : InternalArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some data)
    (canonical : canonicalCollectionOrder state = true)
    (separated : footprintsNonInterfering (footprintOfDataPatch contract data)
      (footprintOfPatch ordinary) = true) :
    applyInternalArmingPatch (applyInternalDataArmingPatch state data) ordinary =
      applyInternalDataArmingPatch (applyInternalArmingPatch state ordinary) data := by
  have commute := applyInternalArmingPatches_commute state data.arm ordinary canonical
    (data_ordinary_noninterfering_arms contract data ordinary separated)
  obtain ⟨owner, origin, source, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract data prepared
  rw [applyInternalDataArmingPatch_eq_activity_patch _ _ _ rfl,
    applyInternalDataArmingPatch_eq_activity_patch _ _ _ rfl,
    applyInternalDataArmingActivityPatch_ordinary_commutes, commute]

/-- Both complete preparations and both raw execution orders follow from one predecessor. -/
theorem prepared_data_ordinary_pair_commutes (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (data : InternalDataArmingPatch)
    (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (dataPrepared : prepareInternalDataArmingContract? program state contract = some data)
    (ordinaryPrepared : prepareInternalArm? program state operation = some ordinary)
    (canonical : canonicalCollectionOrder state = true)
    (separated : footprintsNonInterfering (footprintOfDataPatch contract data)
      (footprintOfPatch ordinary) = true) :
    prepareInternalDataArmingContract? program (applyInternalArmingPatch state ordinary)
        contract = some data ∧
      prepareInternalArm? program (applyInternalDataArmingPatch state data) operation =
        some ordinary ∧
      applyInternalArmingPatch (applyInternalDataArmingPatch state data) ordinary =
        applyInternalDataArmingPatch (applyInternalArmingPatch state ordinary) data :=
  ⟨prepareInternalDataArmingContract_ordinary_preserved program state contract data operation
      ordinary dataPrepared ordinaryPrepared separated,
    prepareInternalArm_data_preserved program state contract data operation ordinary
      dataPrepared ordinaryPrepared separated,
    applyInternalDataArmingPatch_ordinary_commutes program state contract data ordinary
      dataPrepared canonical separated⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
