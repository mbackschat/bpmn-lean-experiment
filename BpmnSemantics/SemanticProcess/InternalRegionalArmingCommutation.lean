import BpmnSemantics.SemanticProcess.InternalArmingRegionalCompletion
import BpmnSemantics.SemanticProcess.InternalDataArmingRegionalPatch

/-! The regional/arming pair closes both evaluation orders from the original preparations.
Regional removal commutes with retained wait, Activity, and local-data insertion; footprint
separation also protects the consumed token from a regional continuation. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem regional_arming_continuation_separated (footprint : InternalRegionalStateFootprint)
    (arm : PreparedInternalArming) (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true)
    (written : .ordinary (.controlToken owner output) ∈ footprint.writes) :
    ({ placeId := output, owner } : ControlToken) ≠
      { placeId := arm.scopeFramePatch.input, owner := arm.scopeFramePatch.owner } := by
  have read : .controlToken arm.scopeFramePatch.owner arm.scopeFramePatch.input ∈ arm.stateFootprint.reads := by
    apply arming_ordinary_read_subset arm
    simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]
  have separated := arming_regional_read_separation footprint arm independent _ _ written read
  intro same
  have fields := ControlToken.mk.inj same
  simp [liftRegionalStateAtom, regionalStateAtomsConflict, fields.1, fields.2] at separated

private theorem regional_arming_successors_equal (program : Program) (before after afterArm : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional) (arm : PreparedInternalArming)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program arm.scopeFramePatch.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (armFound : arm.Prepared program before)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after)
    (armApplied : applyPreparedInternalRegional? program (arm.apply before) regional = some afterArm) :
    afterArm = arm.apply after := by
  have regionalFrame := prepareInternalRegional_after_independent_arming program before operation regional arm
    programWF beforeWF regionalFound armFound independent
  obtain ⟨snapshots, _, _, closed, derived, footprint, publication⟩ :=
    prepareInternalRegional_facts program before operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program before operation regional.selection closed).1
  have armSelected := (ownershipClosedSelection_facts program (arm.apply before) operation regional.selection
    (prepareInternalRegional_facts program (arm.apply before) operation regional regionalFrame).2.2.2.1).1
  have running := (preparedArming_owner_facts program before arm armFound).2.2
  have position : runtimePositionValid program arm.scopeFramePatch.runtimeInstanceId before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at beforeWF
    exact beforeWF.1
  have canonical := runtimeStateWellFormed_canonicalCollectionOrder program _ before beforeWF
  have ordered : orderedBy controlTokenBefore before.tokens = true := by
    simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at canonical
    exact canonical.1
  have live : activityRecordsOwnLiveWork before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at beforeWF
    simp_all only
  have incidents : effectIncidentAssociationsValid before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at beforeWF
    simp_all only
  have outside := arming_regional_scope_outside before regional.selection regional.region regional.footprint
    arm footprint independent
  have cancelledOutside := preparedArming_cancelled_outside program before arm regional.selection.root.id regional.region
    position armFound derived outside
  have operationEq := regionalSelection_operation program before operation regional.selection selected
  obtain ⟨base, baseFound, baseWrites⟩ := regional_footprint_base before arm.scopeFramePatch.runtimeInstanceId
    regional.selection regional.region regional.footprint running footprint
  have continuation := regional_arming_continuation_separated regional.footprint arm
  have rawResult (state successor : RuntimeState)
      (prepared : prepareInternalRegional? program state operation = some regional)
      (result : applyPreparedInternalRegional? program state regional = some successor) :
      fire? program operation state = some successor := by
    simpa only [applyPreparedInternalRegional?, operationEq, prepared, ↓reduceIte] using result
  have fired := rawResult before after regionalFound applied
  have armFired := rawResult (arm.apply before) afterArm regionalFrame armApplied
  have cancelled (disposition : SelectedScopeDisposition) :
      cancelScopeSubtree (arm.apply before) regional.selection.root.id disposition =
        arm.apply (cancelScopeSubtree before regional.selection.root.id disposition) := by
    cases arm with
    | ordinary armOperation patch =>
        exact arming_cancellation_commutes program before armOperation patch _ disposition
          armFound canonical live incidents cancelledOutside
    | data contract patch =>
        exact dataArming_cancellation_commutes program before contract patch _ disposition
          armFound canonical cancelledOutside
  cases operation with
  | returnProcess id origin process definition output =>
      obtain ⟨returned, record, root, returnedApply, kind, _, _, _, _, update, _⟩ :=
        preparedReturn_quiescent_fields program before arm.scopeFramePatch.runtimeInstanceId id origin process definition output
          regional beforeWF regionalFound
      obtain ⟨_, _, _, _, _, _, _, _, opened, _, _, _⟩ :=
        regionalPublicationTemplate_facts program before regional.selection regional.region regional.publicationTemplate publication
      obtain ⟨_, _, _, _, _, _, _, armWF⟩ := preparedArming_open_projection_exact program before arm
        arm.scopeFramePatch.runtimeInstanceId programWF beforeWF (by simp [opened]) armFound
      obtain ⟨returnedArm, armRecord, armRoot, returnedArmApply, armKind, _, _, _, _, armUpdate, _⟩ :=
        preparedReturn_quiescent_fields program (arm.apply before) arm.scopeFramePatch.runtimeInstanceId id origin process
          definition output regional armWF regionalFrame
      have same : returned = after := Option.some.inj (returnedApply.symm.trans applied)
      have sameArm : returnedArm = afterArm := Option.some.inj (returnedArmApply.symm.trans armApplied)
      have sameRecord : armRecord = record := by simpa using armKind.symm.trans kind
      rw [same] at update
      rw [sameArm, sameRecord] at armUpdate
      have kept := preparedArming_return_outside program before _ regional.selection regional.region arm
        position selected armFound derived outside record kind
      have removed := arming_return_removal_commutes program before arm record armFound canonical kept
      simp only [regionalBaseFootprint?, operationEq, kind] at baseFound
      cases baseFound
      have different := continuation record.caller output independent (baseWrites _ (by simp))
      have tokens := congrArg RuntimeState.tokens (arming_addToken_commutes before arm record.caller output ordered different)
      rw [update, armUpdate, removed]
      cases arm with
      | ordinary armOperation patch =>
          cases write : patch.write <;>
            simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write] at tokens ⊢ <;>
            rw [tokens]
      | data contract patch =>
          cases write : patch.arm.write <;>
            simp only [PreparedInternalArming.apply, applyInternalDataArmingPatch, applyInternalArmingPatch, write] at tokens ⊢ <;>
            rw [tokens]
  | completeScope id origin definition output =>
      obtain ⟨withdrawal, kind, census⟩ := regionalSelection_complete_census program before id origin definition output
        regional.selection selected
      have withdrawn := regionalSelection_completion_withdrawal program before id origin definition output regional.selection
        withdrawal selected kind
      have inside : regional.region.contains regional.selection.root.id = true :=
        List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec before _ _ derived).2.1
      have distinct : arm.scopeFramePatch.owner ≠ regional.selection.root.id := by
        intro same
        rw [same, inside] at outside
        contradiction
      have quiet := preparedArming_quiescent_frame program before arm regional.selection.root.id armFound distinct
      have tokenFrame (owner : ScopeOccurrenceId) (place : ControlPlaceId)
          (parent : regional.selection.root.parent = some owner) (produced : output = some place) :
          addToken (removeToken before.tokens arm.scopeFramePatch.input arm.scopeFramePatch.owner) place owner =
            removeToken (addToken before.tokens place owner) arm.scopeFramePatch.input arm.scopeFramePatch.owner := by
        simp only [regionalBaseFootprint?, operationEq, kind, parent, produced] at baseFound
        cases baseFound
        have tokens (state : RuntimeState) := (scopeArming_scope_read_projections state arm).2.2.2.2.2.2
        simpa only [tokens] using congrArg RuntimeState.tokens (arming_addToken_commutes before arm owner place ordered
          (continuation owner place independent (baseWrites _ (by simp))))
      have raw : completeSelectedScope? program before definition output = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have armRaw : completeSelectedScope? program (arm.apply before) definition output = some afterArm := by
        simp only [fire?, snapshots] at armFired
        exact armFired
      exact arming_selected_completion_successors_equal program before after afterArm arm _ definition output regional.selection.root
        withdrawal armFound canonical running census withdrawn quiet tokenFrame raw armRaw
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have armRaw : throwErrorState? (arm.apply before) input error handler = some afterArm := by
        simp only [fire?, snapshots] at armFired
        exact armFired
      obtain ⟨parent, kind, _, update⟩ := regionalSelection_error_execution program before after
        id origin input error handler regional.selection selected raw
      obtain ⟨armParent, armKind, _, armUpdate⟩ := regionalSelection_error_execution program (arm.apply before) afterArm
        id origin input error handler regional.selection armSelected armRaw
      have sameParent : armParent = parent := by simpa using armKind.symm.trans kind
      subst armParent
      simp only [regionalBaseFootprint?, operationEq, kind] at baseFound
      cases baseFound
      have different := continuation parent handler.output independent (baseWrites _ (by simp))
      have cancelledOrder : orderedBy controlTokenBefore (cancelScopeSubtree before regional.selection.root.id .remove).tokens = true :=
        orderedBy_token_filter before.tokens _ ordered
      rw [update, armUpdate]
      unfold interruptScope
      rw [cancelled]
      exact arming_addToken_commutes _ arm parent handler.output cancelledOrder different
  | terminateScope id origin input definition =>
      have chosen := (regionalSelection_terminate_owner program before id origin input definition regional.selection selected).1
      have armChosen := (regionalSelection_terminate_owner program (arm.apply before) id origin input definition regional.selection armSelected).1
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have armRaw : terminateScopeState? program (arm.apply before) id origin input definition = some afterArm := by
        simp only [fire?, snapshots] at armFired
        exact armFired
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      simp only [terminateScopeState?, armChosen, Option.some.injEq] at armRaw
      subst after afterArm
      have ends : (arm.apply before).endOccurrences = before.endOccurrences := by
        cases arm with
        | ordinary _ patch => cases write : patch.write <;> simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write]
        | data _ patch => cases write : patch.arm.write <;> simp only [PreparedInternalArming.apply, applyInternalDataArmingPatch, applyInternalArmingPatch, write]
      change { cancelScopeSubtree (arm.apply before) regional.selection.root.id .retain with
          endOccurrences := (arm.apply before).endOccurrences + 1 } =
        arm.apply { cancelScopeSubtree before regional.selection.root.id .retain with endOccurrences := before.endOccurrences + 1 }
      rw [ends, cancelled]
      cases arm with
      | ordinary _ patch => cases write : patch.write <;> simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write]
      | data _ patch => cases write : patch.arm.write <;> simp only [PreparedInternalArming.apply, applyInternalDataArmingPatch, applyInternalArmingPatch, write]
  | _ => simp [selectInternalRegional?] at selected

/-- Original preparation and independence suffice for both complete orders and exact state equality. -/
theorem prepared_regional_arming_pair_commutes (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional) (arm : PreparedInternalArming)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program arm.scopeFramePatch.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (armFound : arm.Prepared program before)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    prepareInternalRegional? program (arm.apply before) operation = some regional ∧
      ∃ afterRegional,
        applyPreparedInternalRegional? program before regional = some afterRegional ∧
        arm.Prepared program afterRegional ∧
        applyPreparedInternalRegional? program (arm.apply before) regional = some (arm.apply afterRegional) := by
  have regionalFrame := prepareInternalRegional_after_independent_arming program before operation regional arm
    programWF beforeWF regionalFound armFound independent
  obtain ⟨after, _, applied⟩ := prepareInternalRegional_executes program before operation regional regionalFound
  obtain ⟨afterArm, _, armApplied⟩ := prepareInternalRegional_executes program (arm.apply before) operation regional regionalFrame
  have commute := regional_arming_successors_equal program before after afterArm operation regional arm
    programWF beforeWF regionalFound armFound independent applied armApplied
  exact ⟨regionalFrame, after, applied,
    prepareInternalArming_after_independent_regional program before after operation regional arm
      beforeWF regionalFound armFound independent applied,
    by simpa only [commute] using armApplied⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
