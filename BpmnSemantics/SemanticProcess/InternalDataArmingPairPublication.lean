import BpmnSemantics.SemanticProcess.InternalDataArmingAcceptedPublication

/-! # Accepted mixed and data-pair publication

One admitted predecessor supplies every preparation, intermediate invariant, evaluator step, and
accepted publication. Canonical numbering follows only after complete publications agree.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_data_operation_eq
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    patch.arm.operation = contract.operation := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  rfl

theorem prepared_data_ordinary_operation_ids_ne
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (data : InternalDataArmingPatch) (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (programValid : programWellFormed program = true)
    (dataPrepared : prepareInternalDataArmingContract? program state contract = some data)
    (ordinaryPrepared : prepareInternalArm? program state operation = some ordinary) :
    contract.operation.id ≠ operation.id := by
  intro sameId
  have dataRecord := internalTransitionRecord_prepared_data program state contract data
    programValid dataPrepared
  have ordinaryRecord := internalTransitionRecord_prepared program state operation ordinary
    programValid ordinaryPrepared
  have sameOperation := internalTransitionRecords_same_id_same_operation program state
    contract.operation operation _ _ dataRecord ordinaryRecord sameId
  rw [← sameOperation] at ordinaryPrepared
  cases dataEq : contract.data <;>
    simp [prepareInternalArm?, internalArmInput?, internalArmOrigin?,
      InternalDataArmingContract.operation, dataEq] at ordinaryPrepared

theorem prepared_data_ordinary_publication_commutes
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (data : InternalDataArmingPatch) (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (instanceId commandId : SemanticId) (firstTransitionIndex : Nat)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (dataPrepared : prepareInternalDataArmingContract? program state contract = some data)
    (ordinaryPrepared : prepareInternalArm? program state operation = some ordinary)
    (separated : footprintsNonInterfering (footprintOfDataPatch contract data)
      (footprintOfPatch ordinary) = true) :
    ∃ final publications,
      runtimeStateWellFormed program instanceId final = true ∧
      (projectOpenFlowNodeOccurrences? program final).isSome = true ∧
      acceptedInternalPairPublicationForFootprints? program instanceId state contract.operation
          operation commandId firstTransitionIndex (footprintOfDataPatch contract data)
          (footprintOfPatch ordinary) = some (final, publications) ∧
      acceptedInternalPairPublicationForFootprints? program instanceId state operation
          contract.operation commandId firstTransitionIndex (footprintOfPatch ordinary)
          (footprintOfDataPatch contract data) = some (final, publications) := by
  have frames := prepared_data_ordinary_pair_commutes program state contract data operation ordinary
    dataPrepared ordinaryPrepared
    (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid) separated
  let dataAfter := applyInternalDataArmingPatch state data
  let ordinaryAfter := applyInternalArmingPatch state ordinary
  let final := applyInternalArmingPatch dataAfter ordinary
  have reverseFinal : applyInternalDataArmingPatch ordinaryAfter data = final := frames.2.2.symm
  have dataValid := prepared_data_arm_preserves_runtime_and_open_set program state contract data
    instanceId programValid stateValid openBefore dataPrepared
  have ordinaryValid := prepared_arm_preserves_runtime_and_open_set program state operation ordinary
    instanceId programValid stateValid openBefore ordinaryPrepared
  have finalValid := prepared_arm_preserves_runtime_and_open_set program dataAfter operation ordinary
    instanceId programValid dataValid.1 dataValid.2 frames.2.1
  obtain ⟨dataPublication, dataFootprint, dataFirst, dataSecond⟩ := prepared_data_publication_frame
    program instanceId commandId state ordinaryAfter contract data programValid stateValid
    ordinaryValid.1 openBefore ordinaryValid.2 dataPrepared frames.1
    (armingTimeRead_frame state ordinary) (armingWaitStart_frame program state ordinary _ _ _)
  obtain ⟨ordinaryPublication, ordinaryFootprint, ordinaryFirst, ordinarySecond⟩ :=
    prepared_ordinary_publication_frame program instanceId commandId state dataAfter operation ordinary
      programValid stateValid dataValid.1 openBefore dataValid.2 ordinaryPrepared frames.2.1
      (armingTimeRead_frame state data.arm) (dataArmingWaitStart_frame program state data _ _ _)
  rw [reverseFinal] at dataSecond
  have different : dataPublication.pair.footprint.operationId ≠
      ordinaryPublication.pair.footprint.operationId := by
    rw [dataFootprint, ordinaryFootprint]
    change data.arm.operation.id ≠ ordinary.operation.id
    rw [prepared_data_operation_eq program state contract data dataPrepared,
      prepared_operation_eq program state operation ordinary ordinaryPrepared]
    exact prepared_data_ordinary_operation_ids_ne program state contract data operation ordinary
      programValid dataPrepared ordinaryPrepared
  have dataStep := prepareInternalDataArmingContract_applies program state contract data
    snapshotAbsent dataPrepared
  have ordinaryStep := prepareInternalArm_applies program state operation ordinary
    snapshotAbsent ordinaryPrepared
  have ordinarySecondStep := prepareInternalArm_applies program dataAfter operation ordinary
    snapshotAbsent frames.2.1
  have dataSecondStep := prepareInternalDataArmingContract_applies program ordinaryAfter contract data
    snapshotAbsent frames.1
  rw [reverseFinal] at dataSecondStep
  obtain ⟨publications, forward, backward⟩ := accepted_pair_publication_commutes_of_frames program
    instanceId commandId firstTransitionIndex state dataAfter ordinaryAfter final
    contract.operation operation (footprintOfDataPatch contract data) (footprintOfPatch ordinary)
    dataPublication ordinaryPublication dataStep ordinaryStep ordinarySecondStep dataSecondStep
    dataFirst ordinaryFirst ordinarySecond dataSecond different
  exact ⟨final, publications, finalValid.1, finalValid.2, forward, backward⟩

theorem prepared_data_pair_publication_commutes
    (program : Program) (state : RuntimeState) (left right : InternalDataArmingContract)
    (leftPatch rightPatch : InternalDataArmingPatch)
    (instanceId commandId : SemanticId) (firstTransitionIndex : Nat)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (leftPrepared : prepareInternalDataArmingContract? program state left = some leftPatch)
    (rightPrepared : prepareInternalDataArmingContract? program state right = some rightPatch)
    (separated : footprintsNonInterfering (footprintOfDataPatch left leftPatch)
      (footprintOfDataPatch right rightPatch) = true) :
    ∃ final publications,
      runtimeStateWellFormed program instanceId final = true ∧
      (projectOpenFlowNodeOccurrences? program final).isSome = true ∧
      acceptedInternalPairPublicationForFootprints? program instanceId state left.operation
          right.operation commandId firstTransitionIndex (footprintOfDataPatch left leftPatch)
          (footprintOfDataPatch right rightPatch) = some (final, publications) ∧
      acceptedInternalPairPublicationForFootprints? program instanceId state right.operation
          left.operation commandId firstTransitionIndex (footprintOfDataPatch right rightPatch)
          (footprintOfDataPatch left leftPatch) = some (final, publications) := by
  have frames := prepared_data_pair_commutes program state left right leftPatch rightPatch
    leftPrepared rightPrepared
    (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid) separated
  let leftAfter := applyInternalDataArmingPatch state leftPatch
  let rightAfter := applyInternalDataArmingPatch state rightPatch
  let final := applyInternalDataArmingPatch leftAfter rightPatch
  have reverseFinal : applyInternalDataArmingPatch rightAfter leftPatch = final := frames.2.2.symm
  have leftValid := prepared_data_arm_preserves_runtime_and_open_set program state left leftPatch
    instanceId programValid stateValid openBefore leftPrepared
  have rightValid := prepared_data_arm_preserves_runtime_and_open_set program state right rightPatch
    instanceId programValid stateValid openBefore rightPrepared
  have finalValid := prepared_data_arm_preserves_runtime_and_open_set program leftAfter right rightPatch
    instanceId programValid leftValid.1 leftValid.2 frames.1
  obtain ⟨leftPublication, leftFootprint, leftFirst, leftSecond⟩ := prepared_data_publication_frame
    program instanceId commandId state rightAfter left leftPatch programValid stateValid
    rightValid.1 openBefore rightValid.2 leftPrepared frames.2.1
    (armingTimeRead_frame state rightPatch.arm) (dataArmingWaitStart_frame program state rightPatch _ _ _)
  obtain ⟨rightPublication, rightFootprint, rightFirst, rightSecond⟩ := prepared_data_publication_frame
    program instanceId commandId state leftAfter right rightPatch programValid stateValid
    leftValid.1 openBefore leftValid.2 rightPrepared frames.1
    (armingTimeRead_frame state leftPatch.arm) (dataArmingWaitStart_frame program state leftPatch _ _ _)
  rw [reverseFinal] at leftSecond
  have different : leftPublication.pair.footprint.operationId ≠
      rightPublication.pair.footprint.operationId := by
    rw [leftFootprint, rightFootprint]
    change leftPatch.arm.operation.id ≠ rightPatch.arm.operation.id
    rw [prepared_data_operation_eq program state left leftPatch leftPrepared,
      prepared_data_operation_eq program state right rightPatch rightPrepared]
    intro sameId
    have sameOperation := internalTransitionRecords_same_id_same_operation program state
      left.operation right.operation _ _
      (internalTransitionRecord_prepared_data program state left leftPatch programValid leftPrepared)
      (internalTransitionRecord_prepared_data program state right rightPatch programValid rightPrepared)
      sameId
    have sameContract : left = right := by
      exact Option.some.inj (by
        simpa only [dataArmingContract_roundtrip] using (congrArg dataArmingContract? sameOperation))
    exact (noninterfering_data_inputs_and_tasks_ne program state left right leftPatch rightPatch
      leftPrepared rightPrepared separated).2 (congrArg (fun contract => contract.taskId) sameContract)
  have leftStep := prepareInternalDataArmingContract_applies program state left leftPatch
    snapshotAbsent leftPrepared
  have rightStep := prepareInternalDataArmingContract_applies program state right rightPatch
    snapshotAbsent rightPrepared
  have rightSecondStep := prepareInternalDataArmingContract_applies program leftAfter right rightPatch
    snapshotAbsent frames.1
  have leftSecondStep := prepareInternalDataArmingContract_applies program rightAfter left leftPatch
    snapshotAbsent frames.2.1
  rw [reverseFinal] at leftSecondStep
  obtain ⟨publications, forward, backward⟩ := accepted_pair_publication_commutes_of_frames program
    instanceId commandId firstTransitionIndex state leftAfter rightAfter final left.operation
    right.operation (footprintOfDataPatch left leftPatch) (footprintOfDataPatch right rightPatch)
    leftPublication rightPublication leftStep rightStep rightSecondStep leftSecondStep
    leftFirst rightFirst rightSecond leftSecond different
  exact ⟨final, publications, finalValid.1, finalValid.2, forward, backward⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
