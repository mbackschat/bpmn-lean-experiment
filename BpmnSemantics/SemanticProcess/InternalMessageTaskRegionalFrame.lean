import BpmnSemantics.SemanticProcess.InternalMessageTaskOrdinaryFrames
import BpmnSemantics.SemanticProcess.InternalRegionalArmingFrames
import BpmnSemantics.SemanticProcess.InternalMessageTaskValidity
import BpmnSemantics.SemanticProcess.InternalRegionalOrderFacts
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionPatch

/-! Regional retirement cannot issue a Message-task identity or create an association collision.
The existing removal-only resource law therefore protects both wait anchors and the joined record.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalMessageTaskContract_retirement_frame
    (program : Program) (before after : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (found : prepareInternalMessageTaskContract? program before contract = some patch)
    (retirement : RegionalArmingRetirement before after)
    (owner : onlyTokenOwner? after patch.arm.input = some patch.arm.owner)
    (live : exactLiveOccurrence after patch.arm.owner = true)
    (control : after.control = before.control)
    (time : after.logicalTimeMs = before.logicalTimeMs) :
    prepareInternalMessageTaskContract? program after contract = some patch := by
  obtain ⟨snapshots, selectedOwner, instanceId, origin, processId, _, running, selected, _,
    originFound, processFound, uniqueTask, uniqueMessage, taskAbsent, messageAbsent, recordAbsent, armAdmitted, patchEq⟩ :=
    prepareInternalMessageTaskContract_facts program before contract patch found
  have patchFrame : makeInternalMessageTaskPatch program after contract selectedOwner instanceId
      processId origin = patch := by
    rw [patchEq]
    simp only [makeInternalMessageTaskPatch, activationCount, activityActivationCount,
      messageActivationCount, retirement.tasks, retirement.activities, retirement.messages, time]
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
  simp [prepareInternalMessageTaskContract?, snapshots, owner, runningAfter, selected, live,
    originFound, processFound, patchFrame, uniqueTask, uniqueMessage,
    retirement.anchor_absent _ taskAbsent, retirement.anchor_absent _ messageAbsent, armAdmitted]
  intro record member
  exact Bool.eq_false_iff.mpr (List.any_eq_false.mp recordFrame record member)

theorem prepareInternalMessageTaskContract_after_independent_regional
    (program : Program) (before after : RuntimeState)
    (contract : InternalMessageTaskContract) (message : InternalMessageTaskPatch)
    (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program message.arm.runtimeInstanceId before = true)
    (messagePrepared : prepareInternalMessageTaskContract? program before contract = some message)
    (regionalPrepared : prepareInternalRegional? program before operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint (messageTaskStateFootprint message) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after) :
    prepareInternalMessageTaskContract? program after contract = some message := by
  have retirement := preparedRegional_arming_retirement program before after operation regional
    regionalPrepared applied
  have footprint := (prepareInternalRegional_facts program before operation regional regionalPrepared).2.2.2.2.2.1
  have separate := regional_independent_read_write _ _ independent
  have outside : regional.region.contains message.arm.owner = false := by
    have conflict := separate (.occurrenceRegion regional.region) (.ordinary (.scopeOccurrence message.arm.owner))
      (regionalStateFootprint_region_write before regional.selection regional.region regional.footprint footprint)
      (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    simpa [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using conflict
  have untouched : .ordinary (.tokenOwners message.arm.input) ∉ regional.footprint.writes := by
    intro written
    have conflict := separate _ (.ordinary (.tokenOwners message.arm.input)) written
      (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    simp [regionalStateAtomsConflict] at conflict
  have controlUntouched : .ordinary (.runtimeControl message.arm.runtimeInstanceId) ∉ regional.footprint.writes := by
    intro written
    have conflict := separate _ (.ordinary (.runtimeControl message.arm.runtimeInstanceId)) written
      (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    simp [regionalStateAtomsConflict] at conflict
  have facts : onlyTokenOwner? before message.arm.input = some message.arm.owner ∧
      exactLiveOccurrence before message.arm.owner = true ∧
      before.control = .running message.arm.runtimeInstanceId := by
    obtain ⟨_, owner, instanceId, origin, processId, owned, running, _, live, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalMessageTaskContract_facts program before contract message messagePrepared
    refine ⟨owned, live, ?_⟩
    cases control : before.control <;> simp_all [runningInstance?, makeInternalMessageTaskPatch]
  have removed := (preparedRegional_removed_censuses program before operation regional regionalPrepared).1
  have frame := preparedRegional_control_filters program before after message.arm.runtimeInstanceId
    operation regional valid facts.2.2 regionalPrepared applied
    (fun scope => decide (scope.id = message.arm.owner))
    (fun token => decide (token.placeId = message.arm.input)) (fun _ => false)
    (by
      intro scope _ seen
      have same : scope.id = message.arm.owner := by simpa using seen
      simpa [same] using outside)
    (by
      intro token member seen
      have same : token.placeId = message.arm.input := by simpa using seen
      apply Bool.eq_false_iff.mpr
      intro inside
      exact untouched (same ▸ removed token member inside))
    (by simp)
    (by
      intro owner output _ written
      apply Bool.eq_false_iff.mpr
      intro seen
      have same : output = message.arm.input := by simpa using seen
      exact untouched (same ▸ written))
    controlUntouched
  apply prepareInternalMessageTaskContract_retirement_frame program before after contract message
    messagePrepared retirement
  · simpa only [onlyTokenOwner?, tokenOwners, frame.2.2.2.2.1] using facts.1
  · simpa only [exactLiveOccurrence, frame.2.2.2.1] using facts.2.1
  · exact frame.1
  · exact frame.2.1

theorem preparedMessageTask_new_wait_unattached (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (records : List ActivityOccurrence) (subset : records ⊆ state.activityOccurrences)
    (live : activityRecordsOwnLiveWork state = true)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    activityRecordsAttachMessageWait records patch.message = false := by
  have fresh := prepared_message_task_message_keys_fresh program state contract patch prepared
  apply Bool.eq_false_iff.mpr
  intro attached
  obtain ⟨record, member, named⟩ := List.any_eq_true.mp attached
  obtain ⟨id, handler, matched⟩ := List.any_eq_true.mp named
  have owned := List.all_eq_true.mp live record (subset member)
  have targetLive := List.all_eq_true.mp (Bool.and_eq_true_iff.mp owned).2 id handler
  obtain ⟨old, oldMember, oldMatch⟩ := List.any_eq_true.mp targetLive
  have namedOld := (Bool.and_eq_true_iff.mp oldMatch).1
  simp only [messageIdNamesWait, Bool.and_eq_true, beq_iff_eq] at matched namedOld
  have element : patch.message.elementId = old.elementId :=
    congrArg NodeId.mk (matched.1.2.symm.trans namedOld.1.2)
  have collision : messageWaitKeyMatches patch.message old = true := by
    simp [messageWaitKeyMatches, matched.1.1.symm.trans namedOld.1.1,
      element, matched.2.symm.trans namedOld.2]
  rw [(fresh old oldMember).1] at collision
  contradiction

theorem message_task_cancellation_commutes (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (canonical : canonicalCollectionOrder state = true)
    (live : activityRecordsOwnLiveWork state = true)
    (outside : (occurrenceInSubtree state.scopeOccurrences root patch.arm.owner ||
      (calledInstanceClosure state root).contains patch.arm.owner.processInstanceId) = false) :
    cancelScopeSubtree (applyInternalMessageTaskPatch state patch) root disposition =
      applyInternalMessageTaskPatch (cancelScopeSubtree state root disposition) patch := by
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let patch := makeInternalMessageTaskPatch program state contract owner instanceId processId origin
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  change cancelled owner = false at outside
  have populations : withdrawnByRegion cancelled (insertActivityOccurrence patch.record state.activityOccurrences) (retainedCancellationRoot root disposition) =
      withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition) := by
    rw [withdrawnByRegion, insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ (by
        simp [patch, makeInternalMessageTaskPatch, recordInRegion, outside])]
    rfl
  have unattached := preparedMessageTask_new_wait_unattached program state contract patch
    (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition))
    (fun _ member => (List.mem_filter.mp member).1) live prepared
  have keptMessage : (!cancelled patch.message.owner && !activityRecordsAttachMessageWait
      (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)) patch.message) = true := by
    simp [patch, makeInternalMessageTaskPatch, outside] at unattached ⊢
    exact unattached
  have tokenFrame : (removeToken state.tokens contract.input owner).filter (fun token => !cancelled token.owner) =
      removeToken (state.tokens.filter (fun token => !cancelled token.owner)) contract.input owner := by
    rw [removeToken_eq_erase, ← List.erase_filter, removeToken_eq_erase]
  have taskOrder : orderedBy userTaskWaitBefore state.waits = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have messageOrder : orderedBy messageWaitBefore state.messageWaits = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have recordOrder : orderedBy activityOccurrenceBefore state.activityOccurrences = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have taskFrame := filter_canonicalInsertBy_retained userTaskWaitBefore userTaskWaitBefore_compose
    (fun wait => !cancelled wait.owner)
    { processInstanceId := instanceId, owner, task := { id := contract.task.id, name := contract.task.name },
      activation := activationCount state contract.task.id + 1, output := contract.task.output }
    state.waits taskOrder (by simp [outside])
  have messageFrame := filter_canonicalInsertBy_retained messageWaitBefore regional_messageWaitBefore_compose
    (fun wait => !cancelled wait.owner &&
      !activityRecordsAttachMessageWait (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)) wait)
    patch.message state.messageWaits messageOrder keptMessage
  have recordFrame := filter_canonicalInsertBy_retained activityOccurrenceBefore
    regional_activityOccurrenceBefore_compose (fun record => !recordInRegion cancelled record (retainedCancellationRoot root disposition))
    patch.record state.activityOccurrences recordOrder (by simp [patch, makeInternalMessageTaskPatch, recordInRegion, outside])
  dsimp only [cancelled, patch, makeInternalMessageTaskPatch] at populations taskFrame messageFrame recordFrame tokenFrame
  simp only [calledInstanceClosure] at populations taskFrame messageFrame recordFrame tokenFrame
  simp only [applyInternalMessageTaskPatch, makeInternalMessageTaskPatch, applyInternalArmingPatch]
  dsimp only [cancelScopeSubtree, calledInstanceClosure]
  rw [populations]
  simp only [insertUserTaskWait_eq_canonicalInsertBy, insertMessageWait,
    retainedByRegion, insertActivityOccurrence_eq_canonicalInsertBy]
  rw [taskFrame, messageFrame, recordFrame, tokenFrame]
  congr 1 <;> rfl


end BpmnSemantics.SemanticProcess.InternalCommutation
