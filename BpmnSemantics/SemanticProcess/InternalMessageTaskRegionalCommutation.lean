import BpmnSemantics.SemanticProcess.InternalMessageTaskRegionalCompletion

/-! Regional retirement and joined Message-host insertion commute from predecessor preparations.
The selected admission binds actual completion and Terminate execution, including continuations. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem regional_messageTask_continuation_separated (footprint : InternalRegionalStateFootprint)
    (patch : InternalMessageTaskPatch) (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (independent : regionalStateFootprintsIndependent footprint (messageTaskStateFootprint patch) = true)
    (written : .ordinary (.controlToken owner output) ∈ footprint.writes) :
    ({ placeId := output, owner } : ControlToken) ≠
      { placeId := patch.arm.input, owner := patch.arm.owner } := by
  have separated := regional_independent_read_write _ _ independent
    (.ordinary (.controlToken owner output)) (.ordinary (.controlToken patch.arm.owner patch.arm.input))
    written (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
  intro same
  have fields := ControlToken.mk.inj same
  simp [regionalStateAtomsConflict, fields.1, fields.2] at separated

private theorem regional_messageTask_successors_equal (program : Program) (before after afterTask : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program patch.arm.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (taskFound : prepareInternalMessageTaskContract? program before contract = some patch)
    (independent : regionalStateFootprintsIndependent regional.footprint (messageTaskStateFootprint patch) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after)
    (taskApplied : applyPreparedInternalRegional? program (applyInternalMessageTaskPatch before patch)
      regional = some afterTask) :
    afterTask = applyInternalMessageTaskPatch after patch := by
  have regionalFrame := prepareInternalRegional_after_independent_message_task program before operation regional
    contract patch admitted programWF beforeWF regionalFound taskFound independent
  obtain ⟨snapshots, _, _, closed, derived, footprint, publication⟩ :=
    prepareInternalRegional_facts program before operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program before operation regional.selection closed).1
  have taskSelected := (ownershipClosedSelection_facts program (applyInternalMessageTaskPatch before patch)
    operation regional.selection (prepareInternalRegional_facts program (applyInternalMessageTaskPatch before patch)
      operation regional regionalFrame).2.2.2.1).1
  have running := (preparedMessageTask_owner_facts program before contract patch taskFound).2.2
  have position : runtimePositionValid program patch.arm.runtimeInstanceId before = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  have canonical := runtimeStateWellFormed_canonicalCollectionOrder program _ before beforeWF
  have ordered : orderedBy controlTokenBefore before.tokens = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have live : activityRecordsOwnLiveWork before = true := by
    simp_all only [runtimeStateWellFormed, Bool.and_eq_true]
  have outside := messageTask_regional_scope_outside before regional.selection regional.region regional.footprint
    patch footprint independent
  have cancelledOutside := messageTask_cancelled_outside program before contract patch regional.selection.root.id
    regional.region position taskFound derived outside
  have operationEq := regionalSelection_operation program before operation regional.selection selected
  obtain ⟨base, baseFound, baseWrites⟩ := regional_footprint_base before patch.arm.runtimeInstanceId
    regional.selection regional.region regional.footprint running footprint
  have continuation := regional_messageTask_continuation_separated regional.footprint patch
  have rawResult (state successor : RuntimeState)
      (prepared : prepareInternalRegional? program state operation = some regional)
      (result : applyPreparedInternalRegional? program state regional = some successor) :
      fire? program operation state = some successor := by
    simpa only [applyPreparedInternalRegional?, operationEq, prepared, ↓reduceIte] using result
  have fired := rawResult before after regionalFound applied
  have taskFired := rawResult (applyInternalMessageTaskPatch before patch) afterTask regionalFrame taskApplied
  have cancelled (disposition : SelectedScopeDisposition) :
      cancelScopeSubtree (applyInternalMessageTaskPatch before patch) regional.selection.root.id disposition =
        applyInternalMessageTaskPatch (cancelScopeSubtree before regional.selection.root.id disposition) patch :=
    message_task_cancellation_commutes program before contract patch _ disposition
      taskFound canonical live cancelledOutside
  have declared := (prepareInternalRegional_facts program before operation regional regionalFound).2.1
  have member : operation ∈ program.operations :=
    (List.mem_filter.mp (show operation ∈ program.operations.filter
      (fun candidate => decide (candidate.id = operation.id)) by rw [declared]; simp)).1
  have allowed := repeatableSubscriptionProgramGraph_operation program admitted operation member
  cases operation with
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
      have quiet := messageTask_quiescent_frame program before contract patch regional.selection.root.id taskFound distinct
      have tokenFrame (owner : ScopeOccurrenceId) (place : ControlPlaceId)
          (parent : regional.selection.root.parent = some owner) (produced : output = some place) :
          addToken (removeToken before.tokens patch.arm.input patch.arm.owner) place owner =
            removeToken (addToken before.tokens place owner) patch.arm.input patch.arm.owner := by
        simp only [regionalBaseFootprint?, operationEq, kind, parent, produced] at baseFound
        cases baseFound
        have result := congrArg RuntimeState.tokens (messageTask_addToken_commutes before patch owner place ordered
          (continuation owner place independent (baseWrites _ (by simp))))
        cases write : patch.arm.write <;>
          simpa only [applyInternalMessageTaskPatch, applyInternalArmingPatch, write] using result
      have raw : completeSelectedScope? program before definition output = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have taskRaw : completeSelectedScope? program (applyInternalMessageTaskPatch before patch)
          definition output = some afterTask := by
        simp only [fire?, snapshots] at taskFired
        exact taskFired
      exact messageTask_selected_completion_successors_equal program before after afterTask contract patch _ definition output
        regional.selection.root withdrawal taskFound canonical running census withdrawn quiet tokenFrame raw taskRaw
  | terminateScope id origin input definition =>
      have chosen := (regionalSelection_terminate_owner program before id origin input definition regional.selection selected).1
      have taskChosen := (regionalSelection_terminate_owner program (applyInternalMessageTaskPatch before patch)
        id origin input definition regional.selection taskSelected).1
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      have taskRaw : terminateScopeState? program (applyInternalMessageTaskPatch before patch)
          id origin input definition = some afterTask := by
        simp only [fire?, snapshots] at taskFired
        exact taskFired
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      simp only [terminateScopeState?, taskChosen, Option.some.injEq] at taskRaw
      subst after afterTask
      have ends : (applyInternalMessageTaskPatch before patch).endOccurrences = before.endOccurrences := by
        cases write : patch.arm.write <;> simp only [applyInternalMessageTaskPatch, applyInternalArmingPatch, write]
      change { cancelScopeSubtree (applyInternalMessageTaskPatch before patch) regional.selection.root.id .retain with
          endOccurrences := (applyInternalMessageTaskPatch before patch).endOccurrences + 1 } =
        applyInternalMessageTaskPatch { cancelScopeSubtree before regional.selection.root.id .retain with
          endOccurrences := before.endOccurrences + 1 } patch
      rw [ends, cancelled]
      cases write : patch.arm.write <;> simp only [applyInternalMessageTaskPatch, applyInternalArmingPatch, write]
  | returnProcess _ _ _ _ _ | throwError _ _ _ _ _ =>
      simp [repeatableSubscriptionOperationAllowed] at allowed
  | _ => simp [selectInternalRegional?] at selected

/-- Both complete orders and literal successor equality follow from predecessor facts. -/
theorem prepared_regional_message_task_pair_commutes (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program patch.arm.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (taskFound : prepareInternalMessageTaskContract? program before contract = some patch)
    (independent : regionalStateFootprintsIndependent regional.footprint (messageTaskStateFootprint patch) = true) :
    prepareInternalRegional? program (applyInternalMessageTaskPatch before patch) operation = some regional ∧
      ∃ afterRegional,
        applyPreparedInternalRegional? program before regional = some afterRegional ∧
        prepareInternalMessageTaskContract? program afterRegional contract = some patch ∧
        applyPreparedInternalRegional? program (applyInternalMessageTaskPatch before patch) regional =
          some (applyInternalMessageTaskPatch afterRegional patch) := by
  have regionalFrame := prepareInternalRegional_after_independent_message_task program before operation regional
    contract patch admitted programWF beforeWF regionalFound taskFound independent
  obtain ⟨after, _, applied⟩ := prepareInternalRegional_executes program before operation regional regionalFound
  obtain ⟨afterTask, _, taskApplied⟩ := prepareInternalRegional_executes program
    (applyInternalMessageTaskPatch before patch) operation regional regionalFrame
  have commute := regional_messageTask_successors_equal program before after afterTask operation regional
    contract patch admitted programWF beforeWF regionalFound taskFound independent applied taskApplied
  exact ⟨regionalFrame, after, applied,
    prepareInternalMessageTaskContract_after_independent_regional program before after contract patch
      operation regional beforeWF taskFound regionalFound independent applied,
    by simpa only [commute] using taskApplied⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
