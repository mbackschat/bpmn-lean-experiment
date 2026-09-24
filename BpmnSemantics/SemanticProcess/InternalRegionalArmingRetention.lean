import BpmnSemantics.SemanticProcess.InternalRegionalArmingOwnership

/-! Prepared arming freshness and predecessor ownership exclude aliases with the
regional removal set; complete regional preparation depends on those exclusions. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- AOO-BODY-01 resolves every attached identity to an existing wait. The arming freshness
check therefore excludes aliases with handlers removed through an Activity association. -/
theorem preparedArm_new_wait_unattached (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (records : List ActivityOccurrence) (subset : records ⊆ state.activityOccurrences)
    (live : activityRecordsOwnLiveWork state = true)
    (prepared : prepareInternalArm? program state operation = some patch) :
    match patch.write with
    | .message wait => activityRecordsAttachMessageWait records wait = false
    | .timer wait => anyTimerIdNamesWait (attachedTimersOf records) wait = false
    | _ => True := by
  have fresh := prepared_arm_key_fresh program state operation patch prepared
  cases write : patch.write with
  | userTask _ => trivial
  | effect _ _ => trivial
  | message inserted =>
      rw [write] at fresh
      apply Bool.eq_false_iff.mpr
      intro attached
      obtain ⟨record, member, named⟩ := List.any_eq_true.mp attached
      obtain ⟨id, handler, matched⟩ := List.any_eq_true.mp named
      have owned := List.all_eq_true.mp live record (subset member)
      have targetLive := List.all_eq_true.mp (Bool.and_eq_true_iff.mp owned).2 id handler
      obtain ⟨old, oldMember, oldMatch⟩ := List.any_eq_true.mp targetLive
      have namedOld := (Bool.and_eq_true_iff.mp oldMatch).1
      simp only [messageIdNamesWait, Bool.and_eq_true, beq_iff_eq] at matched namedOld
      have element : inserted.elementId = old.elementId :=
        congrArg NodeId.mk (matched.1.2.symm.trans namedOld.1.2)
      have collision : messageWaitKeyMatches inserted old = true := by
        simp [messageWaitKeyMatches, matched.1.1.symm.trans namedOld.1.1,
          element, matched.2.symm.trans namedOld.2]
      rw [(fresh old oldMember).1] at collision
      contradiction
  | timer inserted =>
      rw [write] at fresh
      apply Bool.eq_false_iff.mpr
      intro attached
      obtain ⟨id, member, matched⟩ := List.any_eq_true.mp attached
      obtain ⟨record, recordMember, handler⟩ := List.mem_flatMap.mp member
      have owned := List.all_eq_true.mp live record (subset recordMember)
      have targetLive := List.all_eq_true.mp
        (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp owned).1).2 id handler
      obtain ⟨old, oldMember, oldMatch⟩ := List.any_eq_true.mp targetLive
      have namedOld := (Bool.and_eq_true_iff.mp oldMatch).1
      simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq] at matched namedOld
      have element : inserted.elementId = old.elementId :=
        congrArg NodeId.mk (matched.1.2.symm.trans namedOld.1.2)
      have collision : timerWaitKeyMatches inserted old = true := by
        simp [timerWaitKeyMatches, matched.1.1.symm.trans namedOld.1.1,
          element, matched.2.symm.trans namedOld.2]
      rw [(fresh old oldMember).1] at collision
      contradiction

theorem regionalSelection_return_root (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (record : CalledProcessOccurrence)
    (found : selectInternalRegional? program state operation = some selected)
    (kind : selected.kind = .returning record) :
    selected.root.id = record.calledRoot ∧ selected.root.parent = none := by
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals
    dsimp only at found
    repeat' first
      | (solve | simp at found)
      | (solve | cases found; simp at kind)
      | (solve |
          cases found
          cases kind
          exact ⟨scope_identity_of_census state _ _ (by assumption),
            Option.isNone_iff_eq_none.mp (by assumption)⟩)
      | split at found
      | obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found

private theorem completing_withdrawal (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (withdrawal : InternalCompletionWithdrawal)
    (found : selectInternalRegional? program state operation = some selected)
    (kind : selected.kind = .completing withdrawal) :
    ∃ definition output, selectSubscribedCompletionWithdrawal? program state definition output = some withdrawal := by
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals
    dsimp only at found
    repeat' first
      | (solve | simp at found)
      | (solve | cases found; simp at kind)
      | (solve | cases found; cases kind; exact ⟨_, _, by assumption⟩)
      | split at found
      | obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found

theorem regionalSelection_bounded_deadline (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (record : ActivityOccurrence) (deadline : TimerWait)
    (found : selectInternalRegional? program state operation = some selected)
    (kind : selected.kind = .completing (.bounded record deadline)) : deadline ∈ state.timerWaits := by
  obtain ⟨scope, output, withdrawal⟩ := completing_withdrawal program state operation selected _ found kind
  unfold selectSubscribedCompletionWithdrawal? at withdrawal
  split at withdrawal
  · obtain ⟨_, _, withdrawal⟩ := Option.bind_eq_some_iff.mp withdrawal
    split at withdrawal <;> simp at withdrawal
  · obtain ⟨_, _, _, attached, _, _, _, _, _, _, _, census, _⟩ :=
      completionWithdrawal_bounded_facts program state scope record deadline withdrawal
    have present : deadline ∈ state.timerWaits.filter (timerIdNamesWait attached) := by rw [census]; simp
    exact (List.mem_filter.mp present).1

theorem regionalSelection_monitored_deadline (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (record : ActivityOccurrence) (deadline : TimerWait)
    (found : selectInternalRegional? program state operation = some selected)
    (kind : selected.kind = .completing (.monitored record (some deadline))) :
    deadline ∈ state.timerWaits := by
  obtain ⟨scope, output, withdrawal⟩ := completing_withdrawal program state operation selected _ found kind
  obtain ⟨pair, _, _, _, _, _, timerEq⟩ :=
    subscribedWithdrawal_monitored_facts program state scope output record (some deadline) withdrawal
  have timerBinding := pair.property.2.2
  simp only [MonitoredScopeTimerBinding, timerEq] at timerBinding
  exact (List.mem_filter.mp (show deadline ∈ state.timerWaits.filter (monitoredScopeTimerNames pair.val) by
    rw [timerBinding.2.1]; simp)).1

theorem preparedArming_return_outside (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (arm : PreparedInternalArming)
    (valid : runtimePositionValid program arm.scopeFramePatch.runtimeInstanceId state = true)
    (selectedBefore : selectInternalRegional? program state operation = some selected)
    (prepared : arm.Prepared program state)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (outside : region.contains arm.scopeFramePatch.owner = false)
    (record : CalledProcessOccurrence) (kind : selected.kind = .returning record) :
    (processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
      (state.calledProcessOccurrences.length + 1)).contains arm.scopeFramePatch.owner.processInstanceId = false := by
  have facts := preparedArming_owner_facts program state arm prepared
  obtain ⟨scope, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true facts.2.1)
  have member : scope ∈ state.scopeOccurrences.filter
      (fun value => decide (value.id = arm.scopeFramePatch.owner)) := by rw [census]; simp
  obtain ⟨member, same⟩ := List.mem_filter.mp member
  have live := List.mem_map.mpr ⟨scope, member, of_decide_eq_true same⟩
  have root := regionalSelection_return_root program state operation selected record selectedBefore kind
  have mask := regional_called_tree_mask program state _ _ valid facts.2.2 selected.root region
    derived (regionalSelection_root_member program state operation selected selectedBefore) root.2
    arm.scopeFramePatch.owner live
  rw [root.1] at mask
  exact mask.trans outside

theorem preparedArm_regional_wait_retained (program : Program) (state : RuntimeState)
    (regionalOperation operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (footprint : InternalRegionalStateFootprint) (patch : InternalArmingPatch)
    (valid : runtimePositionValid program patch.runtimeInstanceId state = true)
    (live : activityRecordsOwnLiveWork state = true)
    (selectedBefore : selectInternalRegional? program state regionalOperation = some selected)
    (prepared : prepareInternalArm? program state operation = some patch)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (footprintFound : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint patch.owner (PreparedInternalArming.ordinary operation patch).stateFootprint) = true) :
    match patch.write with
    | .userTask wait => (regionalSelectionReferenceRetention state selected).task wait = true
    | .message wait => (regionalSelectionReferenceRetention state selected).message wait = true
    | .timer wait => (regionalSelectionReferenceRetention state selected).timer wait = true
    | .effect _ _ => True := by
  have outside := arming_regional_scope_outside state selected region footprint
    (.ordinary operation patch) footprintFound independent
  have cancelled := preparedArming_cancelled_outside program state (.ordinary operation patch)
    selected.root.id region valid prepared derived outside
  change (occurrenceInSubtree state.scopeOccurrences selected.root.id patch.owner ||
    (calledInstanceClosure state selected.root.id).contains patch.owner.processInstanceId) = false at cancelled
  have called := preparedArming_return_outside program state regionalOperation selected region
    (.ordinary operation patch) valid selectedBefore prepared derived outside
  have assigned := (prepared_arm_selection_unique program state operation patch prepared).2.2
  have unattached := fun retainedRoot => preparedArm_new_wait_unattached program state operation patch
    (withdrawnByRegion (fun owner => occurrenceInSubtree state.scopeOccurrences selected.root.id owner ||
      (calledInstanceClosure state selected.root.id).contains owner.processInstanceId) state.activityOccurrences retainedRoot)
    (fun _ member => (List.mem_filter.mp member).1) live prepared
  cases kind : selected.kind with
  | returning record =>
      have kept := called record kind
      change (processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
        (state.calledProcessOccurrences.length + 1)).contains patch.owner.processInstanceId = false at kept
      cases write : patch.write <;> simp only [write, InternalArmingWrite.owner] at assigned
      all_goals simp only [regionalSelectionReferenceRetention, kind, callReferenceRetention,
        assigned, kept, Bool.not_false]
  | completing withdrawal =>
      cases withdrawal with
      | unbounded => cases patch.write <;>
          simp only [regionalSelectionReferenceRetention, kind, ordinaryCompletionReferenceRetention]
      | bounded record deadline =>
          have member := regionalSelection_bounded_deadline program state regionalOperation selected record deadline selectedBefore kind
          have fresh := prepared_arm_key_fresh program state operation patch prepared
          cases write : patch.write with
          | timer inserted =>
              rw [write] at fresh
              have different : inserted ≠ deadline := by
                intro same
                have collision := (fresh deadline member).1
                simp [same, timerWaitKeyMatches] at collision
              simpa [regionalSelectionReferenceRetention, kind, boundedCompletionReferenceRetention] using different
          | _ => simp only [regionalSelectionReferenceRetention, kind,
              boundedCompletionReferenceRetention, ordinaryCompletionReferenceRetention]
      | monitored record timer =>
          cases timer with
          | none => cases patch.write <;>
              simp only [regionalSelectionReferenceRetention, kind, monitoredCompletionReferenceRetention,
                ordinaryCompletionReferenceRetention]
          | some deadline =>
              have member := regionalSelection_monitored_deadline program state regionalOperation selected record deadline selectedBefore kind
              have fresh := prepared_arm_key_fresh program state operation patch prepared
              cases write : patch.write with
              | timer inserted =>
                  rw [write] at fresh
                  have rejected : timerIdNamesWait (boundaryTimerWaitIdentity deadline) inserted = false := by
                    apply Bool.eq_false_iff.mpr
                    intro same
                    simp only [timerIdNamesWait, boundaryTimerWaitIdentity,
                      Bool.and_eq_true, beq_iff_eq] at same
                    have element : inserted.elementId = deadline.elementId :=
                      congrArg NodeId.mk same.1.2.symm
                    have collision : timerWaitKeyMatches inserted deadline = true := by
                      simp [timerWaitKeyMatches, same.1.1.symm, element, same.2.symm]
                    rw [(fresh deadline member).1] at collision
                    contradiction
                  simp only [regionalSelectionReferenceRetention, kind, monitoredCompletionReferenceRetention,
                    rejected, Bool.not_false]
              | _ => simp only [regionalSelectionReferenceRetention, kind,
                  monitoredCompletionReferenceRetention, ordinaryCompletionReferenceRetention]
  | interrupting parent | terminating =>
      cases write : patch.write <;>
        simp only [write, InternalArmingWrite.owner] at assigned unattached
      all_goals simp only [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention,
        assigned, cancelled, unattached _, Bool.not_false, Bool.true_and]

theorem preparedDataArming_record_retained (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (footprint : InternalRegionalStateFootprint)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (valid : runtimePositionValid program patch.arm.runtimeInstanceId state = true)
    (selectedBefore : selectInternalRegional? program state operation = some selected)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (footprintFound : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint patch.arm.owner (PreparedInternalArming.data contract patch).stateFootprint) = true) :
    (regionalSelectionReferenceRetention state selected).activity patch.record = true := by
  have outside := arming_regional_scope_outside state selected region footprint
    (.data contract patch) footprintFound independent
  have cancelled := preparedArming_cancelled_outside program state (.data contract patch)
    selected.root.id region valid prepared derived outside
  have called := preparedArming_return_outside program state operation selected region
    (.data contract patch) valid selectedBefore prepared derived outside
  obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  subst patch
  change (occurrenceInSubtree state.scopeOccurrences selected.root.id owner ||
    (calledInstanceClosure state selected.root.id).contains owner.processInstanceId) = false at cancelled
  cases kind : selected.kind with
  | returning record =>
      have retained := called record kind
      simpa [regionalSelectionReferenceRetention, kind, callReferenceRetention,
        PreparedInternalArming.scopeFramePatch, makeInternalDataArmingPatch,
        dataInputOutputActivityRecord] using retained
  | completing withdrawal =>
      cases withdrawal <;>
        simp [regionalSelectionReferenceRetention, kind, ordinaryCompletionReferenceRetention,
          boundedCompletionReferenceRetention, monitoredCompletionReferenceRetention,
          makeInternalDataArmingPatch, dataInputOutputActivityRecord]
  | interrupting parent =>
      simp only [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention,
        makeInternalDataArmingPatch, dataInputOutputActivityRecord, recordInRegion,
        Bool.or_false, cancelled, Bool.not_false]
  | terminating =>
      simp only [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention,
        makeInternalDataArmingPatch, dataInputOutputActivityRecord, recordInRegion,
        Bool.or_false, cancelled, Bool.not_false]

theorem preparedArming_regional_local_data_preserved (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional) (arm : PreparedInternalArming)
    (valid : runtimePositionValid program arm.scopeFramePatch.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (armFound : arm.Prepared program state)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    regionalRetainedLocalDataClosed (arm.apply state)
      (regionalSelectionReferenceRetention (arm.apply state) regional.selection).activity
      (regionalSelectionLocalDataRetention (arm.apply state) regional.selection) = true := by
  obtain ⟨_, _, _, closed, derived, footprint, _⟩ :=
    prepareInternalRegional_facts program state operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program state operation regional.selection closed).1
  have prior := ownershipClosedSelection_local_data program state operation regional.selection closed
  have outside := arming_regional_scope_outside state regional.selection regional.region regional.footprint
    arm footprint independent
  have cancelled := preparedArming_cancelled_outside program state arm regional.selection.root.id
    regional.region valid armFound derived outside
  have masks := preparedArming_regional_retention_frame program state arm regional.selection armFound cancelled
  rw [masks.1, masks.2]
  cases arm with
  | ordinary operation patch =>
      exact (arming_regional_local_data_frame state patch _ _).trans prior
  | data contract patch =>
      have kept := preparedDataArming_record_retained program state operation regional.selection
        regional.region regional.footprint contract patch valid selected armFound derived footprint independent
      exact (preparedDataArming_regional_local_data_frame program state contract patch _ _ armFound kept).trans prior

theorem preparedDataArming_task_retained (program : Program) (state : RuntimeState)
    (selected : InternalRegionalSelection) (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch)
    (recordKept : (regionalSelectionReferenceRetention state selected).activity patch.record = true) :
    match patch.arm.write with
    | .userTask wait => (regionalSelectionReferenceRetention state selected).task wait = true
    | _ => False := by
  obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  subst patch
  cases kind : selected.kind with
  | completing withdrawal =>
      cases withdrawal <;>
        simp [makeInternalDataArmingPatch, regionalSelectionReferenceRetention, kind,
          boundedCompletionReferenceRetention, monitoredCompletionReferenceRetention,
          ordinaryCompletionReferenceRetention]
  | _ =>
      simpa only [makeInternalDataArmingPatch, dataInputOutputActivityRecord,
        regionalSelectionReferenceRetention, kind, callReferenceRetention,
        cancellationReferenceRetention, recordInRegion, Bool.or_false] using recordKept

theorem preparedArming_scope_retained (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (footprint : InternalRegionalStateFootprint) (arm : PreparedInternalArming)
    (valid : runtimePositionValid program arm.scopeFramePatch.runtimeInstanceId state = true)
    (selectedBefore : selectInternalRegional? program state operation = some selected)
    (armFound : arm.Prepared program state)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (footprintFound : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true)
    (scope : RuntimeScopeOccurrence) (same : scope.id = arm.scopeFramePatch.owner) :
    (regionalSelectionReferenceRetention state selected).scope scope = true := by
  have outside := arming_regional_scope_outside state selected region footprint arm footprintFound independent
  have cancelled := preparedArming_cancelled_outside program state arm selected.root.id region valid armFound derived outside
  have called := preparedArming_return_outside program state operation selected region arm
    valid selectedBefore armFound derived outside
  have distinct : arm.scopeFramePatch.owner ≠ selected.root.id := by
    intro equal
    have rootInside := List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec state _ _ derived).2.1
    change region.contains selected.root.id = true at rootInside
    rw [equal, rootInside] at outside
    contradiction
  cases kind : selected.kind with
  | returning record =>
      simp only [regionalSelectionReferenceRetention, kind, callReferenceRetention, same,
        called record kind, Bool.not_false]
  | completing withdrawal =>
      have nonRoot : selected.root.parent ≠ none := by
        intro parentless
        have running := (preparedArming_owner_facts program state arm armFound).2.2
        have notWritten := arming_regional_control_not_written footprint arm independent
        obtain ⟨base, baseFound, writes⟩ := regional_footprint_base state _ selected region footprint running footprintFound
        cases operationEq : selected.operation <;>
          simp only [regionalBaseFootprint?, operationEq, kind, parentless] at baseFound
        all_goals repeat' first
          | contradiction
          | (solve | simp at baseFound)
          | (solve | cases baseFound; exact notWritten (writes _ (by simp)))
          | split at baseFound
      cases parentEq : selected.root.parent with
      | none => exact False.elim (nonRoot parentEq)
      | some parent => cases withdrawal <;>
          simp [regionalSelectionReferenceRetention, kind, boundedCompletionReferenceRetention,
            monitoredCompletionReferenceRetention, ordinaryCompletionReferenceRetention, parentEq, same, distinct]
  | interrupting parent | terminating =>
      simp only [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention,
        same, cancelled, Bool.not_false, Bool.or_true]

theorem preparedArming_regional_footprint_frame (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (footprint : InternalRegionalStateFootprint) (arm : PreparedInternalArming)
    (valid : runtimePositionValid program arm.scopeFramePatch.runtimeInstanceId state = true)
    (selectedBefore : selectInternalRegional? program state operation = some selected)
    (armFound : arm.Prepared program state)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (footprintFound : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    regionalStateFootprint? (arm.apply state) selected region = some footprint := by
  have outside := arming_regional_scope_outside state selected region footprint arm footprintFound independent
  have cancelled := preparedArming_cancelled_outside program state arm selected.root.id region valid armFound derived outside
  have masks := preparedArming_regional_retention_frame program state arm selected armFound cancelled
  have tokenFrame := filter_removeToken_of_rejected state.tokens arm.scopeFramePatch.input arm.scopeFramePatch.owner
    (fun token => region.contains token.owner) outside
  have tokens : (arm.apply state).tokens.filter (fun token => region.contains token.owner) =
      state.tokens.filter (fun token => region.contains token.owner) := by
    rw [(scopeArming_scope_read_projections state arm).2.2.2.2.2.2]
    exact tokenFrame
  have stable : (arm.apply state).selectedBranchSets = state.selectedBranchSets ∧
      runningInstance? (arm.apply state) = runningInstance? state := by
    cases arm with
    | ordinary operation patch => cases write : patch.write <;>
        simp [PreparedInternalArming.apply, applyInternalArmingPatch, write, runningInstance?]
    | data contract patch => cases write : patch.arm.write <;>
        simp [PreparedInternalArming.apply, applyInternalDataArmingPatch, applyInternalArmingPatch, write, runningInstance?]
  have withdrawals : regionalWithdrawnActivityWrites (arm.apply state) selected =
      regionalWithdrawnActivityWrites state selected := by
    simp only [regionalWithdrawnActivityWrites, masks.1]
    cases arm with
    | ordinary operation patch => cases write : patch.write <;>
        simp [PreparedInternalArming.apply, applyInternalArmingPatch, write]
    | data contract patch =>
        have kept := preparedDataArming_record_retained program state operation selected region footprint
          contract patch valid selectedBefore armFound derived footprintFound independent
        change ((insertActivityOccurrence patch.record state.activityOccurrences).filter _).map _ = _
        rw [insertActivityOccurrence_eq_canonicalInsertBy,
          filter_canonicalInsertBy_rejected _ _ _ _ (by simp [kept])]
  have base (hosting : SemanticId) : regionalBaseFootprint? (arm.apply state) hosting selected region =
      regionalBaseFootprint? state hosting selected region := by
    simp only [regionalBaseFootprint?, regionalCensusWrites, tokens, stable.1]
  simpa only [regionalStateFootprint?, stable.2, base, withdrawals] using footprintFound

theorem preparedArming_regional_ownership_preserved (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional) (arm : PreparedInternalArming)
    (valid : runtimePositionValid program arm.scopeFramePatch.runtimeInstanceId state = true)
    (live : activityRecordsOwnLiveWork state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (armFound : arm.Prepared program state)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    regionalOwnershipClosed (arm.apply state)
        (regionalSelectionReferenceRetention (arm.apply state) regional.selection) = true ∧
      regionalActivityOwnersClosed (arm.apply state)
        (regionalSelectionReferenceRetention (arm.apply state) regional.selection) = true := by
  obtain ⟨_, _, _, closed, derived, footprint, _⟩ :=
    prepareInternalRegional_facts program state operation regional regionalFound
  obtain ⟨selected, references⟩ := ownershipClosedSelection_facts program state operation regional.selection closed
  have owners := ownershipClosedSelection_activity_owners program state operation regional.selection closed
  have outside := arming_regional_scope_outside state regional.selection regional.region regional.footprint arm footprint independent
  have cancelled := preparedArming_cancelled_outside program state arm regional.selection.root.id regional.region
    valid armFound derived outside
  have masks := preparedArming_regional_retention_frame program state arm regional.selection armFound cancelled
  rw [masks.1]
  have scopeKept := preparedArming_scope_retained program state operation regional.selection regional.region
    regional.footprint arm valid selected armFound derived footprint independent
  cases arm with
  | ordinary armingOperation patch =>
      have kept := preparedArm_regional_wait_retained program state operation armingOperation regional.selection
        regional.region regional.footprint patch valid live selected armFound derived footprint independent
      exact ⟨(arming_regional_ownership_frame state patch _ kept).trans references,
        (arming_regional_activity_owners_frame state patch _).trans owners⟩
  | data contract patch =>
      have kept := preparedDataArming_record_retained program state operation regional.selection regional.region
        regional.footprint contract patch valid selected armFound derived footprint independent
      have taskKept := preparedDataArming_task_retained program state regional.selection contract patch armFound kept
      have newReferences := preparedDataArming_new_references program state contract patch
        (regionalSelectionReferenceRetention state regional.selection) armFound
      have ownerEq : patch.record.owner = patch.arm.owner := by
        obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
          prepareInternalDataArmingContract_facts program state contract patch armFound
        subst patch
        rfl
      have newOwner : allMatchingRetained state.scopeOccurrences
          (regionalSelectionReferenceRetention state regional.selection).scope
          (fun scope => decide (scope.id = patch.record.owner)) = true := by
        apply List.all_eq_true.mpr
        intro scope _
        by_cases same : scope.id = patch.record.owner
        · have retained := scopeKept scope (same.trans ownerEq)
          simp [same, retained]
        · simp [same]
      exact ⟨(dataArming_regional_ownership_frame state patch _ taskKept newReferences).trans references,
        (dataArming_regional_activity_owners_frame state patch _ newOwner).trans owners⟩

theorem regionalOwnershipSelection_after_independent_arming (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (regional : PreparedInternalRegional) (arm : PreparedInternalArming)
    (valid : runtimePositionValid program arm.scopeFramePatch.runtimeInstanceId state = true)
    (live : activityRecordsOwnLiveWork state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (armFound : arm.Prepared program state)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    selectInternalOwnershipClosedRegional? program (arm.apply state) operation = some regional.selection := by
  obtain ⟨_, _, _, closed, derived, footprint, _⟩ :=
    prepareInternalRegional_facts program state operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program state operation regional.selection closed).1
  have selectionFrame := regionalSelection_after_independent_arming program state operation regional.selection
    regional.region regional.footprint arm selected derived footprint armFound independent
  have references := preparedArming_regional_ownership_preserved program state operation regional arm
    valid live regionalFound armFound independent
  have locals := preparedArming_regional_local_data_preserved program state operation regional arm
    valid regionalFound armFound independent
  simp only [selectInternalOwnershipClosedRegional?, selectionFrame, Option.bind_eq_bind, Option.bind_some,
    references.1, locals, references.2, Bool.true_and, ↓reduceIte]

end BpmnSemantics.SemanticProcess.InternalCommutation
