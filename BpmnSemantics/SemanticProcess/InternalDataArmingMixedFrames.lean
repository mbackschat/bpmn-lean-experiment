import BpmnSemantics.SemanticProcess.InternalDataArmingFootprint
import BpmnSemantics.SemanticProcess.InternalDataArmingPreparationPreservation
import BpmnSemantics.SemanticProcess.InternalCommutation

/-! # Complete mixed data and ordinary arming frames

One predecessor and footprint separation determine both complete re-preparations. The composed
Activity supplement preserves ordinary reads through the discriminated local-owner contract.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem noninterfering_data_ordinary_inputs_ne (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (data : InternalDataArmingPatch)
    (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (dataPrepared : prepareInternalDataArmingContract? program state contract = some data)
    (ordinaryPrepared : prepareInternalArm? program state operation = some ordinary)
    (separated : footprintsNonInterfering (footprintOfDataPatch contract data)
      (footprintOfPatch ordinary) = true) : data.arm.input ≠ ordinary.input := by
  obtain ⟨owner, origin, source, owned, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract data dataPrepared
  have ordinaryOwned := prepared_owner_lookup program state operation ordinary ordinaryPrepared
  have baseSeparated := data_ordinary_noninterfering_arms contract
    (makeInternalDataArmingPatch program state contract owner origin source) ordinary separated
  intro sameInput
  change contract.input = ordinary.input at sameInput
  rw [sameInput, ordinaryOwned] at owned
  have sameOwner := Option.some.inj owned
  simp_all [footprintsNonInterfering, listsDisjoint, footprintOfPatch,
    makeInternalDataArmingPatch, canonicalStateAtomSet, mem_sortBy]

theorem ordinary_arming_activity_counts (state : RuntimeState) (patch : InternalArmingPatch) :
    (applyInternalArmingPatch state patch).activityActivations = state.activityActivations := by
  cases writeEq : patch.write <;> simp [applyInternalArmingPatch, writeEq]

theorem ordinary_arming_activity_records (state : RuntimeState) (patch : InternalArmingPatch) :
    (applyInternalArmingPatch state patch).activityOccurrences = state.activityOccurrences := by
  cases writeEq : patch.write <;> simp [applyInternalArmingPatch, writeEq]

theorem ordinary_arming_activity_scope_read (state : RuntimeState) (patch : InternalArmingPatch)
    (owner : ActivityOccurrenceId) :
    (applyInternalArmingPatch state patch).variables.activities.any
        (activityOccurrenceScopeMatches owner) =
      state.variables.activities.any (activityOccurrenceScopeMatches owner) := by
  cases writeEq : patch.write <;> simp [applyInternalArmingPatch, writeEq]
  simp [List.not_any_eq_all_not, insertActivityVariableScope_eq_canonicalInsertBy,
    all_canonicalInsertBy, activityOccurrenceScopeMatches, localDataOwnerMatches,
    ← Bool.not_inj_iff]

theorem makeInternalDataArmingPatch_ordinary_frame (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (owner : ScopeOccurrenceId)
    (origin : BpmnSequenceFlowOrigin) (source : VariableBinding) (ordinary : InternalArmingPatch)
    (different : ordinary.write.kind = .userTask →
      ordinary.write.elementId ≠ (⟨contract.taskId.value⟩ : NodeId)) :
    makeInternalDataArmingPatch program (applyInternalArmingPatch state ordinary)
        contract owner origin source =
      makeInternalDataArmingPatch program state contract owner origin source := by
  have taskFrame := armingActivationRead_frame state ordinary .userTask
    ⟨contract.taskId.value⟩ different
  simp only [internalActivationCount] at taskFrame
  simp only [makeInternalDataArmingPatch, dataInputOutputActivityRecord,
    armingTimeRead_frame, taskFrame, activityActivationCount,
    ordinary_arming_activity_counts]

/-- Complete data preparation survives any independent ordinary arm, including Effect locals. -/
theorem prepareInternalDataArmingContract_ordinary_preserved
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (data : InternalDataArmingPatch) (operation : SemanticOperation)
    (ordinary : InternalArmingPatch)
    (dataPrepared : prepareInternalDataArmingContract? program state contract = some data)
    (ordinaryPrepared : prepareInternalArm? program state operation = some ordinary)
    (separated : footprintsNonInterfering (footprintOfDataPatch contract data)
      (footprintOfPatch ordinary) = true) :
    prepareInternalDataArmingContract? program (applyInternalArmingPatch state ordinary)
      contract = some data := by
  have inputDistinct := noninterfering_data_ordinary_inputs_ne program state contract data
    operation ordinary dataPrepared ordinaryPrepared separated
  have baseSeparated := data_ordinary_noninterfering_arms contract data ordinary separated
  have occurrenceDistinct := noninterfering_occurrence_ne data.arm ordinary baseSeparated
  have elementDistinct := fun same => noninterfering_same_kind_element_ne
    data.arm ordinary same baseSeparated
  obtain ⟨owner, origin, source, owned, running, selected, live, originFound, sourceFound,
    unique, anchorAbsent, scopeAbsent, recordAbsent, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract data dataPrepared
  have taskDistinct : ordinary.write.kind = .userTask →
      ordinary.write.elementId ≠ (⟨contract.taskId.value⟩ : NodeId) := by
    intro same
    exact (elementDistinct same.symm).symm
  have patchFrame := makeInternalDataArmingPatch_ordinary_frame program state contract owner
    origin source ordinary taskDistinct
  have ownerFrame := armingOwnerRead_frame state ordinary contract.input inputDistinct.symm
  have anchorFrame := armingOpenAnchorRead_frame state ordinary _ occurrenceDistinct.symm
  have sourceFrame : dataInputOutputSourceBinding? (applyInternalArmingPatch state ordinary)
      contract.directInput = dataInputOutputSourceBinding? state contract.directInput := by
    unfold dataInputOutputSourceBinding? dataInputSourceBinding?
    rw [armingProcessVariablesRead_frame]
  simp [prepareInternalDataArmingContract?, ownerFrame, owned,
    armingControlRead_frame, running, armingLiveOwnerRead_frame, selected, live,
    originFound, sourceFrame, sourceFound, patchFrame, unique, anchorFrame,
    anchorAbsent, ordinary_arming_activity_scope_read, ordinary_arming_activity_records]
  simpa using And.intro scopeAbsent recordAbsent

def applyInternalDataArmingActivityPatch (state : RuntimeState)
    (patch : InternalDataArmingPatch) : RuntimeState :=
  { state with
    activityOccurrences := insertActivityOccurrence patch.record state.activityOccurrences
    activityActivations := setActivationCount state.activityActivations
      ⟨patch.record.activityElementId.value⟩ patch.record.activation
    variables := addActivityOccurrenceVariableScope state.variables
      (activityOwnerForRecord patch.record) [patch.inputBinding] }

theorem prepared_data_activity_patch_issuesFreshActivity
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    activityIdentityIssuingDiscipline state
      (applyInternalDataArmingActivityPatch state patch) = true :=
  prepareInternalDataArmingContract_issuesFreshActivity program state contract patch prepared

theorem prepared_data_activity_patch_preserves_claims
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (unique : activityBodyClaimsUnique state.activityOccurrences = true)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    activityBodyClaimsUnique (applyInternalDataArmingActivityPatch state patch).activityOccurrences =
      true := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, absent, _⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  apply activityBodyClaimsUnique_insertActivityOccurrence patch.record _ _ unique
  simp only [List.all_eq_true]
  intro record member
  have disjoint := Bool.eq_false_iff.mpr ((List.any_eq_false.mp absent) record member)
  simpa [activityBodyClaimsDisjoint_comm] using (Bool.or_eq_false_iff.mp disjoint).2

theorem ordinary_available_activity_patch (state : RuntimeState)
    (patch : InternalDataArmingPatch) (write : InternalArmingWrite) :
    write.available (applyInternalDataArmingActivityPatch state patch) =
      write.available state := by
  cases write <;> simp [InternalArmingWrite.available]
  simp [applyInternalDataArmingActivityPatch, addActivityOccurrenceVariableScope,
    List.not_any_eq_all_not, insertActivityVariableScope_eq_canonicalInsertBy,
    all_canonicalInsertBy, activityScopeMatches, localDataOwnerMatches,
    ← Bool.not_inj_iff]

theorem prepareInternalArm_activity_patch (program : Program) (state : RuntimeState)
    (patch : InternalDataArmingPatch) (operation : SemanticOperation) :
    prepareInternalArm? program (applyInternalDataArmingActivityPatch state patch) operation =
      prepareInternalArm? program state operation := by
  have ownerFrame (input) :
      onlyTokenOwner? (applyInternalDataArmingActivityPatch state patch) input =
        onlyTokenOwner? state input := rfl
  have liveFrame (owner) :
      exactLiveOccurrence (applyInternalDataArmingActivityPatch state patch) owner =
        exactLiveOccurrence state owner := rfl
  have anchorFrame (occurrence) :
      openWaitAnchorAbsent (applyInternalDataArmingActivityPatch state patch) occurrence =
        openWaitAnchorAbsent state occurrence := rfl
  cases operation <;>
    simp [prepareInternalArm?, internalArmInput?, internalArmOrigin?, ownerFrame, liveFrame,
      anchorFrame, ordinary_available_activity_patch]
  all_goals rfl

/-- The Activity supplement is outside every ordinary preparation read, including tagged locals. -/
theorem prepareInternalArm_data_preserved (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (data : InternalDataArmingPatch)
    (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (dataPrepared : prepareInternalDataArmingContract? program state contract = some data)
    (ordinaryPrepared : prepareInternalArm? program state operation = some ordinary)
    (separated : footprintsNonInterfering (footprintOfDataPatch contract data)
      (footprintOfPatch ordinary) = true) :
    prepareInternalArm? program (applyInternalDataArmingPatch state data) operation =
      some ordinary := by
  have framed := prepared_patch_frame_of_inputs_ne program state operation data.arm ordinary
    ordinaryPrepared
    (noninterfering_data_ordinary_inputs_ne program state contract data operation ordinary
      dataPrepared ordinaryPrepared separated)
    (data_ordinary_noninterfering_arms contract data ordinary separated)
  have decomposition : applyInternalDataArmingPatch state data =
      applyInternalDataArmingActivityPatch (applyInternalArmingPatch state data.arm) data := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalDataArmingContract_facts program state contract data dataPrepared
    rfl
  rw [decomposition, prepareInternalArm_activity_patch]
  exact framed

end BpmnSemantics.SemanticProcess.InternalCommutation
