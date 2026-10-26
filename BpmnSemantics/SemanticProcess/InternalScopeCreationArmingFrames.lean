module

import BpmnSemantics.SemanticProcess.InternalScopeCreationFootprintFrames
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
public import BpmnSemantics.SemanticProcess.InternalPreparedArming
public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.InternalCommutation
import BpmnSemantics.SemanticProcess.InternalCommutationStateFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlArmingFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationFreshness
import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparationFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationSelectionFrames
import BpmnSemantics.SemanticProcess.SequentialScopeRuntimeLaws
import BpmnSemantics.SemanticProcess.TokenPatchLaws

/-! Mixed scope/arming frames retain the complete predecessor artifact required by the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md). Scope insertion
preserves an already-live arming owner; arbitrary absent-owner queries need not be preserved.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem scopeArming_input_read (arm : PreparedInternalArming) :
    .tokenOwners arm.scopeFramePatch.input ∈ arm.stateFootprint.reads := by
  cases arm with
  | ordinary operation patch => exact tokenOwners_mem_footprint_reads patch
  | data contract patch =>
      exact ordinary_reads_subset_data_reads contract patch (tokenOwners_mem_footprint_reads patch.arm)

theorem scopeArming_input_write (arm : PreparedInternalArming) :
    .tokenOwners arm.scopeFramePatch.input ∈ arm.stateFootprint.writes := by
  cases arm with
  | ordinary operation patch => exact tokenOwners_mem_footprint_writes patch
  | data contract patch =>
      exact ordinary_writes_subset_data_writes contract patch (tokenOwners_mem_footprint_writes patch.arm)

theorem scopeArming_token_write (arm : PreparedInternalArming) :
    .controlToken arm.scopeFramePatch.owner arm.scopeFramePatch.input ∈ arm.stateFootprint.writes := by
  have ordinary (patch : InternalArmingPatch) :
      .controlToken patch.owner patch.input ∈ (footprintOfPatch patch).writes := by
    simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]
  cases arm with
  | ordinary operation patch => exact ordinary patch
  | data contract patch => exact ordinary_writes_subset_data_writes contract patch (ordinary patch.arm)

theorem scopeArming_scope_read_projections (state : RuntimeState) (arm : PreparedInternalArming) :
    (arm.apply state).control = state.control ∧
      (arm.apply state).logicalTimeMs = state.logicalTimeMs ∧
      (arm.apply state).scopeOccurrences = state.scopeOccurrences ∧
      (arm.apply state).calledProcessOccurrences = state.calledProcessOccurrences ∧
      (arm.apply state).scopeActivations = state.scopeActivations ∧
      (arm.apply state).callActivations = state.callActivations ∧
      (arm.apply state).tokens = removeToken state.tokens arm.scopeFramePatch.input arm.scopeFramePatch.owner := by
  cases arm with
  | ordinary operation patch =>
      cases write : patch.write <;>
        simp [PreparedInternalArming.apply, PreparedInternalArming.scopeFramePatch,
          applyInternalArmingPatch, write]
  | data contract patch =>
      cases write : patch.arm.write <;>
        simp [PreparedInternalArming.apply, PreparedInternalArming.scopeFramePatch,
          applyInternalDataArmingPatch, applyInternalArmingPatch, write]

theorem scopeArming_untouched_input (selected : InternalScopeCreationSelection)
    (instanceId : SemanticId) (owner : RuntimeScopeOccurrence) (arm : PreparedInternalArming)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint selected instanceId owner) arm.stateFootprint = true) :
    selected.input ≠ arm.scopeFramePatch.input ∧ selected.entry ≠ arm.scopeFramePatch.input := by
  have distinct (place : ControlPlaceId) (member : place ∈ [selected.input, selected.entry]) :
      place ≠ arm.scopeFramePatch.input := by
    intro same
    have written := scopeCreation_census_write selected instanceId owner place member
    rw [same] at written
    simp only [localControlStateFootprintsNonInterfering, Bool.and_eq_true] at separated
    exact not_mem_right_of_listsDisjoint _ _ separated.1.1.1 _ written (scopeArming_input_read arm)
  exact ⟨distinct _ (by simp), distinct _ (by simp)⟩

theorem scopeCreation_effect_input_frames (program : Program) (state : RuntimeState)
    (scopeOperation : SemanticOperation) (scope : InternalScopeCreationSelection)
    (scopeFound : selectInternalScopeCreation? state scopeOperation = some scope)
    (owner : ScopeOccurrenceId) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (evaluated : (evaluateEffectInputs? program state owner effect.inputMappings).isNone = false) :
    (∀ mappings, evaluateEffectInputs? program (scope.apply state) owner mappings =
      evaluateEffectInputs? program state owner mappings) ∧
    scopedEffectInputReads? program (scope.apply state) owner (.awaitEffect id origin input output effect route) =
      scopedEffectInputReads? program state owner (.awaitEffect id origin input output effect route) := by
  cases scopeSelected : sequentialScopeProgramSelected program && hasSequentialScopeDefinition program owner with
  | false =>
      constructor
      · intro mappings
        simp only [evaluateEffectInputs?, scopeSelected]
        cases kind : scope.kind <;> simp [InternalScopeCreationSelection.apply, kind]
      · simp only [scopedEffectInputReads?, scopeSelected]
        rfl
  | true =>
      cases binding : sequentialScopeBindingForOwner? program state owner with
      | none =>
          simp only [evaluateEffectInputs?, scopeSelected] at evaluated
          simp [evaluateSequentialScopeInputs?, binding] at evaluated
      | some bound =>
          have afterBinding : sequentialScopeBindingForOwner? program (scope.apply state) owner = some bound := by
            have inserted := sequentialScopeBindingForOwner_insert_scope program state scope.created owner bound
              (selectInternalScopeCreation_fresh state scopeOperation scope scopeFound) binding
            cases kind : scope.kind <;> simpa only [InternalScopeCreationSelection.apply, kind, sequentialScopeBindingForOwner?,
              sequentialScopeBindingForEntry?] using inserted
          constructor
          · intro mappings
            simp only [evaluateEffectInputs?, scopeSelected]
            simp [evaluateSequentialScopeInputs?, binding, afterBinding]
            cases kind : scope.kind <;> simp [InternalScopeCreationSelection.apply, kind, readSequentialScopeVariable?]
          · simp only [scopedEffectInputReads?, scopeSelected]
            simp [binding, afterBinding]

theorem prepared_scopeCreation_input_frames (program : Program) (state : RuntimeState)
    (scopeOperation : SemanticOperation) (scope : InternalScopeCreationSelection)
    (scopeFound : selectInternalScopeCreation? state scopeOperation = some scope)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) :
    (match operation with
      | .awaitEffect .. => ∀ mappings, evaluateEffectInputs? program (scope.apply state) patch.owner mappings =
          evaluateEffectInputs? program state patch.owner mappings
      | _ => True) ∧
    scopedEffectInputReads? program (scope.apply state) patch.owner operation =
      scopedEffectInputReads? program state patch.owner operation := by
  cases operation <;> try exact ⟨True.intro, rfl⟩
  rename_i id origin input output effect route
  simp [prepareInternalArm?, internalArmInput?, internalArmOrigin?] at prepared
  obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  split at prepared
  · simp at prepared
  · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases controlEq : state.control <;> simp_all
    all_goals
      rcases prepared with ⟨evaluated, _, _, rfl⟩
      exact scopeCreation_effect_input_frames program state scopeOperation scope scopeFound
        owner id origin input output effect route (by
          cases value : evaluateEffectInputs? program state owner effect.inputMappings <;> simp_all)

theorem prepareInternalArm_after_scope_creation (program : Program) (state : RuntimeState)
    (operation scopeOperation : SemanticOperation) (patch : InternalArmingPatch)
    (selected : InternalScopeCreationSelection)
    (found : prepareInternalArm? program state operation = some patch)
    (scopeFound : selectInternalScopeCreation? state scopeOperation = some selected)
    (input : selected.input ≠ patch.input) (entry : selected.entry ≠ patch.input) :
    prepareInternalArm? program (selected.apply state) operation = some patch := by
  have inputFrames := prepared_scopeCreation_input_frames program state scopeOperation selected scopeFound
    operation patch found
  have inputFound := prepareInternalArm_input program state operation patch found
  have ownerFound := prepared_owner_lookup program state operation patch found
  have live := (prepared_arm_live_running program state operation patch found).1
  have liveAfter := selectInternalScopeCreation_preserves_live state scopeOperation selected
    patch.owner scopeFound live
  have ownerAfter : onlyTokenOwner? (selected.apply state) patch.input = some patch.owner := by
    simpa only [onlyTokenOwner?, scopeCreation_apply_census state selected patch.input input entry]
      using ownerFound
  unfold prepareInternalArm? at found ⊢
  simp only [inputFound, bind, Option.bind] at found ⊢
  cases originFound : internalArmOrigin? operation with
  | none => simp [originFound] at found
  | some origin =>
    simp only [originFound, ownerFound, ownerAfter, live, liveAfter] at found ⊢
    cases operation <;> simp only [inputFrames.1, inputFrames.2]
    all_goals cases kind : selected.kind <;>
      simp only [InternalScopeCreationSelection.apply, kind, activationCount,
        messageActivationCount, timerActivationCount, effectActivationCount,
        openWaitAnchorAbsent, openWaitAnchors, InternalArmingWrite.available] at found ⊢
    all_goals exact found

theorem prepareInternalDataArm_after_scope_creation (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (scopeOperation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (found : prepareInternalDataArmingContract? program state contract = some patch)
    (scopeFound : selectInternalScopeCreation? state scopeOperation = some selected)
    (input : selected.input ≠ contract.input) (entry : selected.entry ≠ contract.input) :
    prepareInternalDataArmingContract? program (selected.apply state) contract = some patch := by
  obtain ⟨owner, inputOrigin, source, owned, running, programSelection, live, origin,
    available, declarer, absent, fresh, bodyFresh, patchEq⟩ :=
      prepareInternalDataArmingContract_facts program state contract patch found
  have liveAfter := selectInternalScopeCreation_preserves_live state scopeOperation selected
    owner scopeFound live
  have ownerAfter : onlyTokenOwner? (selected.apply state) contract.input = some owner := by
    simpa only [onlyTokenOwner?, scopeCreation_apply_census state selected contract.input input entry]
      using owned
  have hostFrame : dataArmingHostValid (selected.apply state) owner contract.data = true := by
    cases kind : selected.kind <;>
      simpa only [InternalScopeCreationSelection.apply, kind, dataArmingHostValid] using running
  have sourceFrame : dataArmingBindings? (programPropertyPathValuePolicy program) (selected.apply state) owner contract.data = some source := by
    rw [dataArmingBindings_process_frame (programPropertyPathValuePolicy program) state (selected.apply state) owner contract.data
      (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]) (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
      (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])]
    exact available
  have patchFrame : makeInternalDataArmingPatch program (selected.apply state)
      contract owner inputOrigin source = patch := by
    rw [patchEq]
    cases kind : selected.kind <;>
      simp only [InternalScopeCreationSelection.apply, kind, makeInternalDataArmingPatch,
        dataInputOutputRunningInstance?, activationCount, activityActivationCount, dataInputOutputActivityRecord]
  have anchorFrame : openWaitAnchorAbsent (selected.apply state) patch.arm.write.occurrence = true := by
    cases kind : selected.kind <;>
      simpa only [InternalScopeCreationSelection.apply, kind, openWaitAnchorAbsent, openWaitAnchors] using absent
  have scopeFrame : (selected.apply state).variables.activities.any
      (activityOccurrenceScopeMatches (activityOwnerForRecord patch.record)) = false := by
    cases kind : selected.kind <;> simpa only [InternalScopeCreationSelection.apply, kind] using fresh
  have recordFrame : (selected.apply state).activityOccurrences.any (fun record =>
      sameActivityOccurrence record patch.record || !activityBodyClaimsDisjoint record patch.record) = false := by
    cases kind : selected.kind <;> simpa only [InternalScopeCreationSelection.apply, kind] using bodyFresh
  simp only [prepareInternalDataArmingContract?, ownerAfter, hostFrame, programSelection,
    liveAfter, origin, sourceFrame, patchFrame, declarer, anchorFrame, scopeFrame, recordFrame,
    bind, Option.bind, Bool.not_true, Bool.false_or, Bool.or_false, Bool.false_eq_true, ite_false]

theorem scopeArming_bucket_frame (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (instanceId : SemanticId)
    (ownerRecord : RuntimeScopeOccurrence) (arm : PreparedInternalArming)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint selected instanceId ownerRecord) arm.stateFootprint = true)
    (token : ControlToken)
    (member : token ∈ [{ placeId := selected.input, owner := selected.owner },
      { placeId := selected.entry, owner := selected.created.id }]) :
    (arm.apply state).tokens.filter (fun candidate =>
        decide (candidate.placeId = token.placeId && candidate.owner = token.owner)) =
      state.tokens.filter (fun candidate =>
        decide (candidate.placeId = token.placeId && candidate.owner = token.owner)) := by
  rw [(scopeArming_scope_read_projections state arm).2.2.2.2.2.2]
  apply filter_removeToken_of_rejected
  apply Bool.eq_false_iff.mpr
  intro matched
  simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
  have written := scopeArming_token_write arm
  rw [matched.1, matched.2] at written
  simp only [localControlStateFootprintsNonInterfering, Bool.and_eq_true] at separated
  exact not_mem_right_of_listsDisjoint _ _ separated.1.2 _ written
    (scopeCreation_token_read selected instanceId ownerRecord token member)

theorem prepareInternalScopeCreation_after_arming (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (arm : PreparedInternalArming)
    (found : prepareInternalScopeCreation? program state operation = some prepared)
    (separated : localControlStateFootprintsNonInterfering prepared.footprint arm.stateFootprint = true) :
    prepareInternalScopeCreation? program (arm.apply state) operation = some prepared := by
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    selection, running, snapshots, operations, ownerExact, originFound, definitionFound,
    checks, startFound, deltaFound, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  have projections := scopeArming_scope_read_projections state arm
  have untouched := scopeArming_untouched_input selected instanceId ownerRecord arm separated
  have inputFrame := scopeArming_bucket_frame state selected instanceId ownerRecord arm separated
    { placeId := selected.input, owner := selected.owner } (by simp)
  have entryFrame := scopeArming_bucket_frame state selected instanceId ownerRecord arm separated
    { placeId := selected.entry, owner := selected.created.id } (by simp)
  have ownerFrame : (arm.apply state).scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id = selected.owner)) = state.scopeOccurrences.filter
        (fun occurrence => decide (occurrence.id = selected.owner)) := by rw [projections.2.2.1]
  have selectedAfter : selectInternalScopeCreation? (arm.apply state) operation = some selected := by
    refine selectInternalScopeCreation_read_frame state (arm.apply state) operation selected selection
      projections.1 ?_ inputFrame ownerFrame ?_ ?_
    · unfold tokenOwners
      rw [projections.2.2.2.2.2.2,
        filterTokens_removeToken_other _ _ _ _ (Ne.symm untouched.1)]
    · intro child
      rw [projections.2.2.1]
      simp only [scopeActivationCount, projections.2.2.2.2.1, and_self]
    · intro record called
      have facts := scopeCreation_selection_call_facts state operation selected record instanceId
        running selection called
      refine ⟨?_, ?_, ?_, ?_, ?_⟩
      · rw [calledProcessAssociationsValid_frame state (arm.apply state) projections.1
          projections.2.2.1 projections.2.2.2.1]
        exact scopeCreation_selection_call_associations state operation selected record selection called
      · simp only [callActivationCount, projections.2.2.2.2.2.1]
      · simpa only [projections.2.2.2.1] using facts.2.2.2.2.2.1
      · simpa only [projections.2.2.1] using facts.2.2.2.2.2.2.1
      · simpa only [projections.2.2.2.1] using facts.2.2.2.2.2.2.2
  apply prepareInternalScopeCreation_read_frame program state (arm.apply state) operation _ found
    selectedAfter projections.1 projections.2.1 ownerFrame inputFrame entryFrame
  apply scopeCreation_counter_read_frame
  · intro child
    rw [projections.2.2.2.2.1]
  · intro record called
    rw [projections.2.2.2.2.2.1]

end BpmnSemantics.SemanticProcess.InternalCommutation
