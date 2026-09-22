import BpmnSemantics.SemanticProcess.InternalLocalControlRegionPatch
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionalPreparationFrame
import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlPreparationFrame

/-! Exact regional/local-control commutation is derived from predecessor preparation and
footprint independence. The two evaluation orders share the complete prepared artifacts. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem regional_continuation_separated (before : RuntimeState)
    (footprint : InternalRegionalStateFootprint) (control : InternalLocalControlSelection)
    (hosting : SemanticId)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint control.owner (internalLocalControlStateFootprint before control hosting)) = true)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (written : .ordinary (.controlToken owner output) ∈ footprint.writes) :
    ∀ place ∈ control.tokens.consumed,
      ({ placeId := output, owner } : ControlToken) ≠ { placeId := place, owner := control.owner } := by
  intro place member same
  have tokenWrite := localControl_token_write before control hosting place (List.mem_append_left _ member)
  have lifted : .ordinary (.controlToken control.owner place) ∈
      (liftRegionalStateFootprint control.owner (internalLocalControlStateFootprint before control hosting)).writes :=
    List.mem_map.mpr ⟨_, tokenWrite, rfl⟩
  have conflict := regional_independent_write_write _ _ independent _ _ written lifted
  have equalities := ControlToken.mk.inj same
  simp [regionalStateAtomsConflict, equalities.1, equalities.2] at conflict

theorem regional_localPatch_successors_equal (program : Program) (before after afterLocal : RuntimeState)
    (regionalOperation : SemanticOperation) (regional : PreparedInternalRegional)
    (patch : InternalLocalControlSelection) (hosting : SemanticId)
    (beforeWF : runtimeStateWellFormed program hosting before = true)
    (localWF : runtimeStateWellFormed program hosting (patch.apply before) = true)
    (running : before.control = .running hosting)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (regionalFrame : prepareInternalRegional? program (patch.apply before) regionalOperation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint patch.owner (internalLocalControlStateFootprint before patch hosting)) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after)
    (localApplied : applyPreparedInternalRegional? program (patch.apply before) regional = some afterLocal) :
    afterLocal = patch.apply after := by
  obtain ⟨snapshots, _, _, closed, derived, footprint, _⟩ :=
    prepareInternalRegional_facts program before regionalOperation regional regionalFound
  obtain ⟨_, _, _, localClosed, localDerived, _, _⟩ :=
    prepareInternalRegional_facts program (patch.apply before) regionalOperation regional regionalFrame
  have selected := (ownershipClosedSelection_facts program before regionalOperation regional.selection closed).1
  have localSelected := (ownershipClosedSelection_facts program (patch.apply before) regionalOperation regional.selection localClosed).1
  have operationEq := regionalSelection_operation program before regionalOperation regional.selection selected
  have tokenOutside := regional_localControl_token_outside before regional.selection regional.region
    regional.footprint patch hosting footprint independent
  have branchOutside := regional_localControl_branch_outside before regional.selection regional.region
    regional.footprint patch hosting footprint independent
  have ordered : orderedBy controlTokenBefore before.tokens = true := by
    have allOrder := runtimeStateWellFormed_canonicalCollectionOrder program hosting before beforeWF
    simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at allOrder
    exact allOrder.1
  have continuation := regional_continuation_separated before regional.footprint patch hosting independent
  obtain ⟨base, baseFound, baseWrites⟩ := regional_footprint_base before hosting
    regional.selection regional.region regional.footprint running footprint
  have rawResult (state successor : RuntimeState)
      (prepared : prepareInternalRegional? program state regionalOperation = some regional)
      (result : applyPreparedInternalRegional? program state regional = some successor) :
      fire? program regionalOperation state = some successor := by
    simpa only [applyPreparedInternalRegional?, operationEq, prepared, ↓reduceIte] using result
  have fired := rawResult before after regionalFound applied
  have localFired := rawResult (patch.apply before) afterLocal regionalFrame localApplied
  have cancelled (disposition : SelectedScopeDisposition) := localControl_cancellation_commutes
    program before patch hosting regional.selection.root.id regional.region disposition beforeWF localWF
    running derived localDerived
    (fun place member => tokenOutside place (List.mem_append_right _ member))
    (fun record inserted => branchOutside record (.inl inserted))
  cases regionalOperation with
  | returnProcess id origin process definition output =>
      obtain ⟨returned, record, root, returnedApply, kind, _, _, _, _, update,
        _, _, _, _, _, _, _, branches, _, _⟩ :=
        preparedReturn_quiescent_fields program before hosting id origin process definition output regional beforeWF regionalFound
      obtain ⟨returnedLocal, localRecord, localRoot, returnedLocalApply, localKind, _, _, _, _, localUpdate,
        _, _, _, _, _, _, _, localBranches, _, _⟩ :=
        preparedReturn_quiescent_fields program (patch.apply before) hosting id origin process definition output regional localWF regionalFrame
      have same : returned = after := Option.some.inj (returnedApply.symm.trans applied)
      have sameLocal : returnedLocal = afterLocal := Option.some.inj (returnedLocalApply.symm.trans localApplied)
      have sameRecord : localRecord = record := by simpa using localKind.symm.trans kind
      subst localRecord
      rw [same] at update branches
      rw [sameLocal] at localUpdate localBranches
      simp only [regionalBaseFootprint?, operationEq, kind] at baseFound
      cases baseFound
      have different := continuation record.caller output (baseWrites _ (by simp))
      have tokenFrame := congrArg RuntimeState.tokens (localControl_addToken_commutes before patch
        record.caller output ordered different)
      rw [update] at branches
      rw [localUpdate] at localBranches
      rw [update, localUpdate]
      simp only [InternalLocalControlSelection.apply, removeCalledProcessTree] at branches localBranches ⊢
      change addToken (patch.tokens.apply before.tokens) output record.caller =
        patch.tokens.apply (addToken before.tokens output record.caller) at tokenFrame
      rw [tokenFrame, branches, localBranches]
  | completeScope id origin definition output =>
      obtain ⟨withdrawal, kind, census⟩ := regionalSelection_complete_census program before id origin definition output
        regional.selection selected
      have rootInside : regional.region.contains regional.selection.root.id = true :=
        List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec before _ _ derived).2.1
      have quiet := localControl_quiescent_frame before patch regional.selection.root.id
        (by intro place member same; have outside := tokenOutside place member; rw [same, rootInside] at outside; contradiction)
        (by intro record changed same; have outside := branchOutside record changed; rw [same, rootInside] at outside; contradiction)
      have commute := localControl_completion_commutes program before patch hosting definition output regional.selection.root
        running census quiet (by
          intro owner place parent produced
          simp only [regionalBaseFootprint?, operationEq, kind, parent, produced] at baseFound
          cases baseFound
          exact congrArg RuntimeState.tokens (localControl_addToken_commutes before patch owner place ordered
            (continuation owner place (baseWrites _ (by simp)))))
      have raw : completeBoundedScope? program before definition output = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have localRaw : completeBoundedScope? program (patch.apply before) definition output = some afterLocal := by
        simp only [fire?, snapshots] at localFired
        exact localFired
      rw [raw] at commute
      exact Option.some.inj (localRaw.symm.trans commute)
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have localRaw : throwErrorState? (patch.apply before) input error handler = some afterLocal := by
        simp only [fire?, snapshots] at localFired
        exact localFired
      obtain ⟨parent, kind, _, update⟩ := regionalSelection_error_execution program before after
        id origin input error handler regional.selection selected raw
      obtain ⟨localParent, localKind, _, localUpdate⟩ := regionalSelection_error_execution program (patch.apply before) afterLocal
        id origin input error handler regional.selection localSelected localRaw
      have sameParent : localParent = parent := by simpa using localKind.symm.trans kind
      subst localParent
      simp only [regionalBaseFootprint?, operationEq, kind] at baseFound
      cases baseFound
      have different := continuation parent handler.output (baseWrites _ (by simp))
      have cancelledOrder : orderedBy controlTokenBefore (cancelScopeSubtree before regional.selection.root.id .remove).tokens = true :=
        orderedBy_token_filter before.tokens _ ordered
      rw [update, localUpdate]
      unfold interruptScope
      rw [cancelled]
      exact localControl_addToken_commutes _ patch parent handler.output cancelledOrder different
  | terminateScope id origin input definition =>
      have chosen := (regionalSelection_terminate_owner program before id origin input definition regional.selection selected).1
      have localChosen := (regionalSelection_terminate_owner program (patch.apply before) id origin input definition regional.selection localSelected).1
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have localRaw : terminateScopeState? program (patch.apply before) id origin input definition = some afterLocal := by
        simp only [fire?, snapshots] at localFired
        exact localFired
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      simp only [terminateScopeState?, localChosen, Option.some.injEq] at localRaw
      subst after afterLocal
      change { cancelScopeSubtree (patch.apply before) regional.selection.root.id .retain with endOccurrences := before.endOccurrences + 1 } = _
      rw [cancelled]
      rfl
  | _ => simp [selectInternalRegional?] at selected

private theorem regional_localControl_successors_equal (program : Program) (before after afterLocal : RuntimeState)
    (regionalOperation localOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (control : PreparedInternalLocalControl)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program control.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (localFound : prepareInternalLocalControl? program before localOperation = some control)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint control.selection.owner control.footprint) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after)
    (localApplied : applyPreparedInternalRegional? program (control.selection.apply before) regional = some afterLocal) :
    afterLocal = control.selection.apply after := by
  have regionalFrame := prepareInternalRegional_after_independent_localControl program before
    regionalOperation localOperation regional control beforeWF regionalFound localFound independent
  obtain ⟨patch, origin, hosting, identity, delta, _, _, running, _,
    _, _, _, _, _, _, rfl⟩ := prepareInternalLocalControl_facts program before localOperation control localFound
  have localWF := prepareInternalLocalControl_preserves_runtimeStateWellFormed program before localOperation
    (makeInternalLocalControlPreparation before patch hosting identity delta) hosting programWF beforeWF running localFound
  exact regional_localPatch_successors_equal program before after afterLocal regionalOperation regional patch hosting
    beforeWF localWF running regionalFound regionalFrame independent applied localApplied

/-- Both complete preparations survive and actual evaluation reaches one exact canonical state.
No intermediate validity, successor equality, or family-specific frame is assumed. -/
theorem prepared_regional_local_control_pair_commutes (program : Program) (before : RuntimeState)
    (regionalOperation localOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (control : PreparedInternalLocalControl)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program control.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (localFound : prepareInternalLocalControl? program before localOperation = some control)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint control.selection.owner control.footprint) = true) :
    prepareInternalRegional? program (control.selection.apply before) regionalOperation = some regional ∧
      ∃ afterRegional,
        applyPreparedInternalRegional? program before regional = some afterRegional ∧
        prepareInternalLocalControl? program afterRegional localOperation = some control ∧
        applyPreparedInternalRegional? program (control.selection.apply before) regional =
          some (control.selection.apply afterRegional) := by
  have regionalFrame := prepareInternalRegional_after_independent_localControl program before regionalOperation localOperation
    regional control beforeWF regionalFound localFound independent
  obtain ⟨after, _, applied⟩ := prepareInternalRegional_executes program before regionalOperation regional regionalFound
  obtain ⟨afterLocal, _, localApplied⟩ := prepareInternalRegional_executes program (control.selection.apply before)
    regionalOperation regional regionalFrame
  have commute := regional_localControl_successors_equal program before after afterLocal regionalOperation localOperation
    regional control programWF beforeWF regionalFound localFound independent applied localApplied
  exact ⟨regionalFrame, after, applied,
    prepareInternalLocalControl_after_independent_regional program before after regionalOperation localOperation regional control
      beforeWF regionalFound localFound independent applied,
    by simpa only [commute] using localApplied⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
