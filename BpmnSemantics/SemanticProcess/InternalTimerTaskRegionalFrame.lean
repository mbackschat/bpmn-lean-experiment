import BpmnSemantics.SemanticProcess.InternalTimerTaskPreparationFrames
import BpmnSemantics.SemanticProcess.InternalRegionalArmingFrames
import BpmnSemantics.SemanticProcess.InternalTimerTaskValidity
import BpmnSemantics.SemanticProcess.InternalRegionalOrderFacts
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionPatch

/-! Regional retirement cannot issue a Timer-task identity or create an association collision.
The existing removal-only resource law therefore protects both wait anchors and the joined record.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalTimerTaskContract_retirement_frame
    (program : Program) (before after : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (found : prepareInternalTimerTaskContract? program before contract = some patch)
    (retirement : RegionalArmingRetirement before after)
    (owner : onlyTokenOwner? after patch.arm.input = some patch.arm.owner)
    (live : exactLiveOccurrence after patch.arm.owner = true)
    (control : after.control = before.control)
    (time : after.logicalTimeMs = before.logicalTimeMs) :
    prepareInternalTimerTaskContract? program after contract = some patch := by
  obtain ⟨snapshots, selectedOwner, instanceId, origin, processId, _, running, selected, _,
    originFound, processFound, uniqueTask, uniqueTimer, taskAbsent, timerAbsent, recordAbsent, patchEq⟩ :=
    prepareInternalTimerTaskContract_facts program before contract patch found
  have patchFrame : makeInternalTimerTaskPatch program after contract selectedOwner instanceId
      processId origin = patch := by
    rw [patchEq]
    simp only [makeInternalTimerTaskPatch, activationCount, activityActivationCount,
      timerActivationCount, retirement.tasks, retirement.activities, retirement.timers, time]
  have recordFrame : after.activityOccurrences.any
      (regionalActivityAssociationsConflict · patch.record) = false :=
    List.any_eq_false.mpr fun record member =>
      List.any_eq_false.mp recordAbsent record (retirement.records member)
  have ownerEq : patch.arm.owner = selectedOwner := by rw [patchEq]; rfl
  have inputEq : patch.arm.input = contract.input := by rw [patchEq]; rfl
  rw [ownerEq, inputEq] at owner
  rw [ownerEq] at live
  have runningAfter : runningInstance? after = some instanceId := by
    simpa only [runningInstance?, control] using running
  simp [prepareInternalTimerTaskContract?, snapshots, owner, runningAfter, selected, live,
    originFound, processFound, patchFrame, uniqueTask, uniqueTimer,
    retirement.anchor_absent _ taskAbsent, retirement.anchor_absent _ timerAbsent]
  intro record member
  exact Bool.eq_false_iff.mpr (List.any_eq_false.mp recordFrame record member)

theorem prepareInternalTimerTaskContract_after_independent_regional
    (program : Program) (before after : RuntimeState)
    (contract : InternalTimerTaskContract) (timer : InternalTimerTaskPatch)
    (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program timer.arm.runtimeInstanceId before = true)
    (timerPrepared : prepareInternalTimerTaskContract? program before contract = some timer)
    (regionalPrepared : prepareInternalRegional? program before operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint (timerTaskStateFootprint timer) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after) :
    prepareInternalTimerTaskContract? program after contract = some timer := by
  have retirement := preparedRegional_arming_retirement program before after operation regional
    regionalPrepared applied
  have footprint := (prepareInternalRegional_facts program before operation regional regionalPrepared).2.2.2.2.2.1
  have separate := regional_independent_read_write _ _ independent
  have outside : regional.region.contains timer.arm.owner = false := by
    have conflict := separate (.occurrenceRegion regional.region) (.ordinary (.scopeOccurrence timer.arm.owner))
      (regionalStateFootprint_region_write before regional.selection regional.region regional.footprint footprint)
      (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    simpa [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using conflict
  have untouched : .ordinary (.tokenOwners timer.arm.input) ∉ regional.footprint.writes := by
    intro written
    have conflict := separate _ (.ordinary (.tokenOwners timer.arm.input)) written
      (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    simp [regionalStateAtomsConflict] at conflict
  have controlUntouched : .ordinary (.runtimeControl timer.arm.runtimeInstanceId) ∉ regional.footprint.writes := by
    intro written
    have conflict := separate _ (.ordinary (.runtimeControl timer.arm.runtimeInstanceId)) written
      (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    simp [regionalStateAtomsConflict] at conflict
  have facts : onlyTokenOwner? before timer.arm.input = some timer.arm.owner ∧
      exactLiveOccurrence before timer.arm.owner = true ∧
      before.control = .running timer.arm.runtimeInstanceId := by
    obtain ⟨_, owner, instanceId, origin, processId, owned, running, _, live, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalTimerTaskContract_facts program before contract timer timerPrepared
    refine ⟨owned, live, ?_⟩
    cases control : before.control <;> simp_all [runningInstance?, makeInternalTimerTaskPatch]
  have removed := (preparedRegional_removed_censuses program before operation regional regionalPrepared).1
  have frame := preparedRegional_control_filters program before after timer.arm.runtimeInstanceId
    operation regional valid facts.2.2 regionalPrepared applied
    (fun scope => decide (scope.id = timer.arm.owner))
    (fun token => decide (token.placeId = timer.arm.input)) (fun _ => false)
    (by
      intro scope _ seen
      have same : scope.id = timer.arm.owner := by simpa using seen
      simpa [same] using outside)
    (by
      intro token member seen
      have same : token.placeId = timer.arm.input := by simpa using seen
      apply Bool.eq_false_iff.mpr
      intro inside
      exact untouched (same ▸ removed token member inside))
    (by simp)
    (by
      intro owner output _ written
      apply Bool.eq_false_iff.mpr
      intro seen
      have same : output = timer.arm.input := by simpa using seen
      exact untouched (same ▸ written))
    controlUntouched
  apply prepareInternalTimerTaskContract_retirement_frame program before after contract timer
    timerPrepared retirement
  · simpa only [onlyTokenOwner?, tokenOwners, frame.2.2.2.2.1] using facts.1
  · simpa only [exactLiveOccurrence, frame.2.2.2.1] using facts.2.1
  · exact frame.1
  · exact frame.2.1

theorem timer_task_cancellation_commutes (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (canonical : canonicalCollectionOrder state = true)
    (live : activityRecordsOwnLiveWork state = true)
    (outside : (occurrenceInSubtree state.scopeOccurrences root patch.arm.owner ||
      (calledInstanceClosure state root).contains patch.arm.owner.processInstanceId) = false) :
    cancelScopeSubtree (applyInternalTimerTaskPatch state patch) root disposition =
      applyInternalTimerTaskPatch (cancelScopeSubtree state root disposition) patch := by
  have fresh := prepared_timer_task_timer_keys_fresh program state contract patch prepared
  have unclaimed := activityRecords_do_not_claim_fresh_timer state patch.timer
    (fun old member => (fresh old member).1) live
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let patch := makeInternalTimerTaskPatch program state contract owner instanceId processId origin
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  change cancelled owner = false at outside
  have populations : withdrawnByRegion cancelled (insertActivityOccurrence patch.record state.activityOccurrences) (retainedCancellationRoot root disposition) =
      withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition) := by
    rw [withdrawnByRegion, insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ (by
        simp [patch, makeInternalTimerTaskPatch, recordInRegion, outside])]
    rfl
  have unattached : anyTimerIdNamesWait
      (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition))) patch.timer = false := by
    apply List.any_eq_false.mpr
    intro id member
    obtain ⟨record, recordMember, timerMember⟩ := List.mem_flatMap.mp member
    exact List.any_eq_false.mp (unclaimed record (List.mem_filter.mp recordMember).1) id timerMember
  have keptTimer : (!cancelled patch.timer.owner && !anyTimerIdNamesWait
      (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition))) patch.timer) = true := by
    simp [patch, makeInternalTimerTaskPatch, outside] at unattached ⊢
    exact unattached
  have tokenFrame : (removeToken state.tokens contract.input owner).filter (fun token => !cancelled token.owner) =
      removeToken (state.tokens.filter (fun token => !cancelled token.owner)) contract.input owner := by
    rw [removeToken_eq_erase, ← List.erase_filter, removeToken_eq_erase]
  have taskOrder : orderedBy userTaskWaitBefore state.waits = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have timerOrder : orderedBy timerWaitBefore state.timerWaits = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have recordOrder : orderedBy activityOccurrenceBefore state.activityOccurrences = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have taskFrame := filter_canonicalInsertBy_retained userTaskWaitBefore userTaskWaitBefore_compose
    (fun wait => !cancelled wait.owner)
    { processInstanceId := owner.processInstanceId, owner, task := { id := contract.task.id, name := contract.task.name },
      activation := activationCount state contract.task.id + 1, output := contract.task.output }
    state.waits taskOrder (by simp [outside])
  have timerFrame := filter_canonicalInsertBy_retained timerWaitBefore regional_timerWaitBefore_compose
    (fun wait => !cancelled wait.owner &&
      !anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition))) wait)
    patch.timer state.timerWaits timerOrder keptTimer
  have recordFrame := filter_canonicalInsertBy_retained activityOccurrenceBefore
    regional_activityOccurrenceBefore_compose (fun record => !recordInRegion cancelled record (retainedCancellationRoot root disposition))
    patch.record state.activityOccurrences recordOrder (by simp [patch, makeInternalTimerTaskPatch, recordInRegion, outside])
  dsimp only [cancelled, patch, makeInternalTimerTaskPatch] at populations taskFrame timerFrame recordFrame tokenFrame
  simp only [calledInstanceClosure] at populations taskFrame timerFrame recordFrame tokenFrame
  simp only [applyInternalTimerTaskPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch]
  dsimp only [cancelScopeSubtree, calledInstanceClosure]
  rw [populations]
  simp only [insertUserTaskWait_eq_canonicalInsertBy, insertTimerWait,
    retainedByRegion, insertActivityOccurrence_eq_canonicalInsertBy]
  rw [taskFrame, timerFrame, recordFrame, tokenFrame]
  congr 1 <;> rfl

end BpmnSemantics.SemanticProcess.InternalCommutation
