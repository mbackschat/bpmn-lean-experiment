import BpmnSemantics.SemanticProcess.InternalBoundedScopePreparationFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingCommutation
import BpmnSemantics.SemanticProcess.InternalDataArmingMixedFrames
import BpmnSemantics.SemanticProcess.InternalRegionalPairDependencies

/-! Ordinary waits preserve complete bounded-entry preparation. The shared child-entry laws
handle token populations; regional separation additionally protects the joined deadline.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem boundedScope_ordinary_independent_separation
    (selected : InternalBoundedScopeSelection) (instanceId : SemanticId)
    (owner : RuntimeScopeOccurrence) (ordinary : InternalArmingPatch)
    (independent : regionalStateFootprintsIndependent
      (boundedScopeStateFootprint selected instanceId owner)
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary ordinary.operation ordinary).stateFootprint) = true) :
    selected.creation.input ≠ ordinary.input ∧ selected.creation.entry ≠ ordinary.input ∧
      (ordinary.write.kind = .timer → ordinary.write.elementId ≠ selected.timer.elementId) ∧
      ordinary.write.occurrence ≠ timerWaitOccurrence selected.timer := by
  have separated := regional_independent_write_write _ _ independent
  have ordinaryWrite (atom : InternalStateAtom) (member : atom ∈ (footprintOfPatch ordinary).writes) :
      liftRegionalStateAtom ordinary.owner atom ∈
        (liftRegionalStateFootprint ordinary.owner
          (PreparedInternalArming.ordinary ordinary.operation ordinary).stateFootprint).writes :=
    List.mem_map.mpr ⟨atom, member, rfl⟩
  have input (place : ControlPlaceId) (member : place ∈ [selected.creation.input, selected.creation.entry]) :
      place ≠ ordinary.input := by
    have child : .ordinary (.tokenOwners place) ∈
        (liftRegionalStateFootprint selected.creation.owner
          (internalScopeCreationStateFootprint selected.creation instanceId owner)).writes :=
      List.mem_map.mpr ⟨.tokenOwners place,
      scopeCreation_census_write selected.creation instanceId owner place member, rfl⟩
    have conflict := separated (.ordinary (.tokenOwners place))
      (.ordinary (.tokenOwners ordinary.input))
      (by simp only [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem, List.mem_append]
          exact Or.inl child)
      (ordinaryWrite _ (tokenOwners_mem_footprint_writes ordinary))
    intro same
    simp [regionalStateAtomsConflict, same] at conflict
  refine ⟨input _ (by simp), input _ (by simp), ?_, ?_⟩
  · intro kind same
    have conflict := separated (.ordinary (.activation .timer selected.timer.elementId))
      (liftRegionalStateAtom ordinary.owner
        (.activation ordinary.write.kind.activationKind ordinary.write.elementId))
      (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
      (ordinaryWrite (.activation ordinary.write.kind.activationKind ordinary.write.elementId)
        (by simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]))
    simp [liftRegionalStateAtom, regionalStateAtomsConflict, kind,
      InternalWaitKind.activationKind, same] at conflict
  · intro same
    have conflict := separated
      (.owned (.openWaitAnchor (timerWaitOccurrence selected.timer)) selected.creation.owner)
      (.owned (.openWaitAnchor ordinary.write.occurrence) ordinary.owner)
      (by simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem])
      (ordinaryWrite (.openWaitAnchor ordinary.write.occurrence)
        (by simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]))
    simp [regionalStateAtomsConflict, same] at conflict

theorem prepareInternalBoundedScope_after_ordinary
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (ordinary : InternalArmingPatch)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (independent : regionalStateFootprintsIndependent prepared.footprint
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary ordinary.operation ordinary).stateFootprint) = true) :
    prepareInternalBoundedScope? program (applyInternalArmingPatch state ordinary)
      contract = some prepared := by
  obtain ⟨selected, instanceId, ownerRecord, definition, start, delta,
    selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨inputs, entries, timers, anchors⟩ :=
    boundedScope_ordinary_independent_separation selected instanceId ownerRecord ordinary independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  let after := applyInternalArmingPatch state ordinary
  have projections := scopeArming_scope_read_projections state (.ordinary ordinary.operation ordinary)
  dsimp only [PreparedInternalArming.apply, PreparedInternalArming.scopeFramePatch] at projections
  have ownerFrame := armingOwnerRead_frame state ordinary contract.input
    (by simpa only [makeInternalBoundedScopeSelection, fields.1] using inputs.symm)
  have entryFrame : selectInternalScopeCreation? after contract.entryOperation =
      selectInternalScopeCreation? state contract.entryOperation := by
    simp only [selectInternalScopeCreation?, InternalBoundedScopeContract.entryOperation,
      after, projections.1, projections.2.2.1, scopeActivationCount,
      projections.2.2.2.2.1, ownerFrame]
  have timerFrame := armingActivationRead_frame state ordinary .timer contract.timer.elementId timers
  have selectedAfter := selectInternalBoundedScope_read_frame state after contract
    (makeInternalBoundedScopeSelection state contract entry) selection entryFrame
    (armingTimeRead_frame state ordinary) timerFrame
    (by simp only [after, activityActivationCount, ordinary_arming_activity_counts])
  have bucket (place : ControlPlaceId) (owner : ScopeOccurrenceId) (different : place ≠ ordinary.input) :
      after.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) =
        state.tokens.filter (fun token => decide (token.placeId = place && token.owner = owner)) := by
    rw [show after.tokens = removeToken state.tokens ordinary.input ordinary.owner from
      projections.2.2.2.2.2.2]
    apply filter_removeToken_of_rejected
    simp [Ne.symm different]
  apply prepareInternalBoundedScope_read_frame program state after contract _ found selectedAfter
    projections.1 projections.2.1
  · rw [show after.scopeOccurrences = state.scopeOccurrences from projections.2.2.1]
  · exact bucket _ _ inputs
  · exact bucket _ _ entries
  · apply scopeCreation_counter_read_frame
    · intro child
      rw [show after.scopeActivations = state.scopeActivations from projections.2.2.2.2.1]
    · intro record called
      rw [show after.callActivations = state.callActivations from projections.2.2.2.2.2.1]
  · have anchorFrame := armingOpenAnchorRead_frame state ordinary
      (timerWaitOccurrence (makeInternalBoundedScopeSelection state contract entry).timer) anchors
    simp only [makeInternalBoundedScopePreparation, boundedScopeJointResourcesAvailable,
      after, anchorFrame, ordinary_arming_activity_records]

theorem prepareInternalArm_after_bounded_scope
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (operation : SemanticOperation)
    (ordinary : InternalArmingPatch)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (ordinaryFound : prepareInternalArm? program state operation = some ordinary)
    (independent : regionalStateFootprintsIndependent prepared.footprint
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary ordinary.operation ordinary).stateFootprint) = true) :
    prepareInternalArm? program (prepared.selection.apply state) operation = some ordinary := by
  obtain ⟨selected, instanceId, ownerRecord, definition, start, delta,
    selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨inputs, entries, timers, anchors⟩ :=
    boundedScope_ordinary_independent_separation selected instanceId ownerRecord ordinary independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  have childPrepared := prepareInternalArm_after_scope_creation program state operation
    contract.entryOperation ordinary entry ordinaryFound entryFound inputs entries
  let child := entry.apply state
  let after := (makeInternalBoundedScopeSelection state contract entry).apply state
  have counts : internalActivationCount after ordinary.write.kind ordinary.write.elementId =
      internalActivationCount child ordinary.write.kind ordinary.write.elementId := by
    cases kind : ordinary.write.kind with
    | timer =>
        simpa only [after, child, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
          InternalScopeCreationSelection.apply, fields.2.2, internalActivationCount,
          timerActivationCount] using
          timerActivationRead_set_other state contract.timer.elementId ordinary.write.elementId
            (timerActivationCount state contract.timer.elementId + 1) (timers kind).symm
    | userTask | message | effect =>
        simp only [after, child, InternalBoundedScopeSelection.apply,
          makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, fields.2.2,
          internalActivationCount, activationCount, messageActivationCount, effectActivationCount]
  have anchorFrame := armingOpenAnchorRead_frame child
    { ordinary with write := .timer (makeInternalBoundedScopeSelection state contract entry).timer }
    ordinary.write.occurrence anchors.symm
  apply prepared_arm_read_frame program child after operation ordinary childPrepared
  · simp only [after, child, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2, onlyTokenOwner?, tokenOwners]
  · simp only [after, child, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2]
  · simp only [after, child, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2]
  · intro owner
    simp only [after, child, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2, exactLiveOccurrence]
  · simp only [after, child, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2]
  · exact counts
  · simpa only [after, child, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2, applyInternalArmingPatch,
      openWaitAnchorAbsent, openWaitAnchors] using anchorFrame
  · cases write : ordinary.write <;>
      simp only [after, child, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
        InternalScopeCreationSelection.apply, fields.2.2, InternalArmingWrite.available]

theorem bounded_scope_ordinary_patches_commute
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (ordinary : InternalArmingPatch)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent prepared.footprint
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary ordinary.operation ordinary).stateFootprint) = true) :
    applyInternalArmingPatch (prepared.selection.apply state) ordinary =
      prepared.selection.apply (applyInternalArmingPatch state ordinary) := by
  obtain ⟨selected, instanceId, ownerRecord, definition, start, delta,
    selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨_, entries, timers, _⟩ :=
    boundedScope_ordinary_independent_separation selected instanceId ownerRecord ordinary independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  have tokens := congrArg RuntimeState.tokens
    (scope_creation_arm_patches_commute state entry ordinary canonical entries)
  have timerOrder : orderedBy timerActivationBefore state.timerActivations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  cases write : ordinary.write with
  | timer wait =>
      have different : wait.elementId ≠ contract.timer.elementId := by
        simpa only [write, InternalArmingWrite.elementId, makeInternalBoundedScopeSelection] using
          timers (by simp [write, InternalArmingWrite.kind])
      simp only [InternalScopeCreationSelection.apply, applyInternalArmingPatch,
        fields.2.2, write] at tokens
      simp only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
        makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply,
        fields.2.2, applyInternalArmingPatch, write]
      congr 1
      · exact insertTimerWait_commutes _ _ different state.timerWaits
      · exact (setTimerActivationCount_commutes_of_ordered _ _ _ _ different _ timerOrder).symm
  | userTask wait | message wait | effect wait bindings =>
      simp only [InternalScopeCreationSelection.apply, applyInternalArmingPatch,
        fields.2.2, write] at tokens
      simp only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
        makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply,
        fields.2.2, applyInternalArmingPatch, write]
      congr 1

theorem prepared_bounded_scope_ordinary_pair
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (operation : SemanticOperation)
    (ordinary : InternalArmingPatch)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (ordinaryFound : prepareInternalArm? program state operation = some ordinary)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent prepared.footprint
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary ordinary.operation ordinary).stateFootprint) = true) :
    prepareInternalBoundedScope? program (applyInternalArmingPatch state ordinary)
        contract = some prepared ∧
      prepareInternalArm? program (prepared.selection.apply state) operation = some ordinary ∧
      applyInternalArmingPatch (prepared.selection.apply state) ordinary =
        prepared.selection.apply (applyInternalArmingPatch state ordinary) :=
  ⟨prepareInternalBoundedScope_after_ordinary program state contract prepared ordinary found independent,
   prepareInternalArm_after_bounded_scope program state contract prepared operation ordinary
    found ordinaryFound independent,
   bounded_scope_ordinary_patches_commute program state contract prepared ordinary found canonical independent⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
