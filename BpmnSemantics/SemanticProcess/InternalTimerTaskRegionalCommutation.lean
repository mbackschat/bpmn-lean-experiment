import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalCompletion

/-! Regional retirement and joined Timer-task insertion commute from predecessor preparations.
The proof binds actual Return, completion, Error, and Terminate execution, including continuations. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem regional_timerTask_continuation_separated (footprint : InternalRegionalStateFootprint)
    (patch : InternalTimerTaskPatch) (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (independent : regionalStateFootprintsIndependent footprint (timerTaskStateFootprint patch) = true)
    (written : .ordinary (.controlToken owner output) ∈ footprint.writes) :
    ({ placeId := output, owner } : ControlToken) ≠
      { placeId := patch.arm.input, owner := patch.arm.owner } := by
  have separated := regional_independent_read_write _ _ independent
    (.ordinary (.controlToken owner output)) (.ordinary (.controlToken patch.arm.owner patch.arm.input))
    written (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
  intro same
  have fields := ControlToken.mk.inj same
  simp [regionalStateAtomsConflict, fields.1, fields.2] at separated

private theorem regional_timerTask_successors_equal (program : Program) (before after afterTask : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program patch.arm.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (taskFound : prepareInternalTimerTaskContract? program before contract = some patch)
    (independent : regionalStateFootprintsIndependent regional.footprint (timerTaskStateFootprint patch) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after)
    (taskApplied : applyPreparedInternalRegional? program (applyInternalTimerTaskPatch before patch)
      regional = some afterTask) :
    afterTask = applyInternalTimerTaskPatch after patch := by
  have regionalFrame := prepareInternalRegional_after_independent_timer_task program before operation regional
    contract patch programWF beforeWF regionalFound taskFound independent
  obtain ⟨snapshots, _, _, closed, derived, footprint, publication⟩ :=
    prepareInternalRegional_facts program before operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program before operation regional.selection closed).1
  have taskSelected := (ownershipClosedSelection_facts program (applyInternalTimerTaskPatch before patch)
    operation regional.selection (prepareInternalRegional_facts program (applyInternalTimerTaskPatch before patch)
      operation regional regionalFrame).2.2.2.1).1
  have running := (preparedTimerTask_owner_facts program before contract patch taskFound).2.2
  have position : runtimePositionValid program patch.arm.runtimeInstanceId before = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  have canonical := runtimeStateWellFormed_canonicalCollectionOrder program _ before beforeWF
  have ordered : orderedBy controlTokenBefore before.tokens = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have live : activityRecordsOwnLiveWork before = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  have outside := timerTask_regional_scope_outside before regional.selection regional.region regional.footprint
    patch footprint independent
  have cancelledOutside := timerTask_cancelled_outside program before contract patch regional.selection.root.id
    regional.region position taskFound derived outside
  have operationEq := regionalSelection_operation program before operation regional.selection selected
  obtain ⟨base, baseFound, baseWrites⟩ := regional_footprint_base before patch.arm.runtimeInstanceId
    regional.selection regional.region regional.footprint running footprint
  have continuation := regional_timerTask_continuation_separated regional.footprint patch
  have rawResult (state successor : RuntimeState)
      (prepared : prepareInternalRegional? program state operation = some regional)
      (result : applyPreparedInternalRegional? program state regional = some successor) :
      fire? program operation state = some successor := by
    simpa only [applyPreparedInternalRegional?, operationEq, prepared, ↓reduceIte] using result
  have fired := rawResult before after regionalFound applied
  have taskFired := rawResult (applyInternalTimerTaskPatch before patch) afterTask regionalFrame taskApplied
  have cancelled (disposition : SelectedScopeDisposition) :
      cancelScopeSubtree (applyInternalTimerTaskPatch before patch) regional.selection.root.id disposition =
        applyInternalTimerTaskPatch (cancelScopeSubtree before regional.selection.root.id disposition) patch :=
    timer_task_cancellation_commutes program before contract patch _ disposition
      taskFound canonical live cancelledOutside
  cases operation with
  | returnProcess id origin process definition output =>
      obtain ⟨returned, record, root, returnedApply, kind, _, _, _, _, update, _⟩ :=
        preparedReturn_quiescent_fields program before patch.arm.runtimeInstanceId id origin process definition output
          regional beforeWF regionalFound
      have taskWF := prepared_timer_task_preserves_runtime program before contract patch
        patch.arm.runtimeInstanceId taskFound beforeWF
      obtain ⟨returnedTask, taskRecord, taskRoot, returnedTaskApply, taskKind, _, _, _, _, taskUpdate, _⟩ :=
        preparedReturn_quiescent_fields program (applyInternalTimerTaskPatch before patch) patch.arm.runtimeInstanceId
          id origin process definition output regional taskWF regionalFrame
      have same : returned = after := Option.some.inj (returnedApply.symm.trans applied)
      have sameTask : returnedTask = afterTask := Option.some.inj (returnedTaskApply.symm.trans taskApplied)
      have sameRecord : taskRecord = record := by simpa using taskKind.symm.trans kind
      rw [same] at update
      rw [sameTask, sameRecord] at taskUpdate
      have kept := timerTask_return_outside program before _ regional.selection regional.region contract patch
        position selected taskFound derived outside record kind
      have removed := timerTask_return_removal_commutes program before contract patch record taskFound canonical kept
      simp only [regionalBaseFootprint?, operationEq, kind] at baseFound
      cases baseFound
      have different := continuation record.caller output independent (baseWrites _ (by simp))
      have tokens := congrArg RuntimeState.tokens
        (timerTask_addToken_commutes before patch record.caller output ordered different)
      rw [update, taskUpdate, removed]
      cases write : patch.arm.write <;>
        simp only [applyInternalTimerTaskPatch, applyInternalArmingPatch, write] at tokens ⊢ <;>
        rw [tokens]
  | completeScope id origin definition output =>
      obtain ⟨withdrawal, kind, census⟩ := regionalSelection_complete_census program before id origin definition output
        regional.selection selected
      have withdrawn := regionalSelection_completion_withdrawal program before id origin definition output
        regional.selection withdrawal selected kind
      have inside : regional.region.contains regional.selection.root.id = true :=
        List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec before _ _ derived).2.1
      have distinct : patch.arm.owner ≠ regional.selection.root.id := by
        intro same
        rw [same, inside] at outside
        contradiction
      have quiet := timerTask_quiescent_frame program before contract patch regional.selection.root.id taskFound distinct
      have tokenFrame (owner : ScopeOccurrenceId) (place : ControlPlaceId)
          (parent : regional.selection.root.parent = some owner) (produced : output = some place) :
          addToken (removeToken before.tokens patch.arm.input patch.arm.owner) place owner =
            removeToken (addToken before.tokens place owner) patch.arm.input patch.arm.owner := by
        simp only [regionalBaseFootprint?, operationEq, kind, parent, produced] at baseFound
        cases baseFound
        have result := congrArg RuntimeState.tokens (timerTask_addToken_commutes before patch owner place ordered
          (continuation owner place independent (baseWrites _ (by simp))))
        cases write : patch.arm.write <;>
          simpa only [applyInternalTimerTaskPatch, applyInternalArmingPatch, write] using result
      have raw : completeSelectedScope? program before definition output = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have taskRaw : completeSelectedScope? program (applyInternalTimerTaskPatch before patch)
          definition output = some afterTask := by
        simp only [fire?, snapshots] at taskFired
        exact taskFired
      exact timerTask_selected_completion_successors_equal program before after afterTask contract patch _ definition output
        regional.selection.root withdrawal taskFound canonical running census withdrawn quiet tokenFrame raw taskRaw
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have taskRaw : throwErrorState? (applyInternalTimerTaskPatch before patch) input error handler = some afterTask := by
        simp only [fire?, snapshots] at taskFired
        exact taskFired
      obtain ⟨parent, kind, _, update⟩ := regionalSelection_error_execution program before after
        id origin input error handler regional.selection selected raw
      obtain ⟨taskParent, taskKind, _, taskUpdate⟩ := regionalSelection_error_execution program
        (applyInternalTimerTaskPatch before patch) afterTask id origin input error handler
        regional.selection taskSelected taskRaw
      have sameParent : taskParent = parent := by simpa using taskKind.symm.trans kind
      subst taskParent
      simp only [regionalBaseFootprint?, operationEq, kind] at baseFound
      cases baseFound
      have different := continuation parent handler.output independent (baseWrites _ (by simp))
      have cancelledOrder : orderedBy controlTokenBefore
          (cancelScopeSubtree before regional.selection.root.id .remove).tokens = true :=
        orderedBy_token_filter before.tokens _ ordered
      rw [update, taskUpdate]
      unfold interruptScope
      rw [cancelled]
      exact timerTask_addToken_commutes _ patch parent handler.output cancelledOrder different
  | terminateScope id origin input definition =>
      have chosen := (regionalSelection_terminate_owner program before id origin input definition regional.selection selected).1
      have taskChosen := (regionalSelection_terminate_owner program (applyInternalTimerTaskPatch before patch)
        id origin input definition regional.selection taskSelected).1
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have taskRaw : terminateScopeState? program (applyInternalTimerTaskPatch before patch)
          id origin input definition = some afterTask := by
        simp only [fire?, snapshots] at taskFired
        exact taskFired
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      simp only [terminateScopeState?, taskChosen, Option.some.injEq] at taskRaw
      subst after afterTask
      have ends : (applyInternalTimerTaskPatch before patch).endOccurrences = before.endOccurrences := by
        cases write : patch.arm.write <;> simp only [applyInternalTimerTaskPatch, applyInternalArmingPatch, write]
      change { cancelScopeSubtree (applyInternalTimerTaskPatch before patch) regional.selection.root.id .retain with
          endOccurrences := (applyInternalTimerTaskPatch before patch).endOccurrences + 1 } =
        applyInternalTimerTaskPatch { cancelScopeSubtree before regional.selection.root.id .retain with
          endOccurrences := before.endOccurrences + 1 } patch
      rw [ends, cancelled]
      cases write : patch.arm.write <;> simp only [applyInternalTimerTaskPatch, applyInternalArmingPatch, write]
  | _ => simp [selectInternalRegional?] at selected

/-- Both complete orders and literal successor equality follow from predecessor facts. -/
theorem prepared_regional_timer_task_pair_commutes (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program patch.arm.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (taskFound : prepareInternalTimerTaskContract? program before contract = some patch)
    (independent : regionalStateFootprintsIndependent regional.footprint (timerTaskStateFootprint patch) = true) :
    prepareInternalRegional? program (applyInternalTimerTaskPatch before patch) operation = some regional ∧
      ∃ afterRegional,
        applyPreparedInternalRegional? program before regional = some afterRegional ∧
        prepareInternalTimerTaskContract? program afterRegional contract = some patch ∧
        applyPreparedInternalRegional? program (applyInternalTimerTaskPatch before patch) regional =
          some (applyInternalTimerTaskPatch afterRegional patch) := by
  have regionalFrame := prepareInternalRegional_after_independent_timer_task program before operation regional
    contract patch programWF beforeWF regionalFound taskFound independent
  obtain ⟨after, _, applied⟩ := prepareInternalRegional_executes program before operation regional regionalFound
  obtain ⟨afterTask, _, taskApplied⟩ := prepareInternalRegional_executes program
    (applyInternalTimerTaskPatch before patch) operation regional regionalFrame
  have commute := regional_timerTask_successors_equal program before after afterTask operation regional
    contract patch programWF beforeWF regionalFound taskFound independent applied taskApplied
  exact ⟨regionalFrame, after, applied,
    prepareInternalTimerTaskContract_after_independent_regional program before after contract patch
      operation regional beforeWF taskFound regionalFound independent applied,
    by simpa only [commute] using taskApplied⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
