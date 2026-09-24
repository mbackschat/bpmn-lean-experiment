import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalSelection
import BpmnSemantics.SemanticProcess.InternalRegionalArmingRetention

/-! Regional cleanup must retain the complete newly inserted Activity group.
Owner separation, fresh Timer identity, and the unchanged ownership graph determine the masks.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedTimerTask_owner_facts (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    onlyTokenOwner? state patch.arm.input = some patch.arm.owner ∧
      exactLiveOccurrence state patch.arm.owner = true ∧
      state.control = .running patch.arm.runtimeInstanceId := by
  obtain ⟨_, owner, instanceId, origin, processId, owned, running, _, live, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  refine ⟨owned, live, ?_⟩
  cases control : state.control <;> simp_all [runningInstance?, makeInternalTimerTaskPatch]

theorem timerTask_cancelled_outside (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (valid : runtimePositionValid program patch.arm.runtimeInstanceId state = true)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (derived : deriveInternalOccurrenceRegion? state root = some region)
    (outside : region.contains patch.arm.owner = false) :
    (occurrenceInSubtree state.scopeOccurrences root patch.arm.owner ||
      (calledInstanceClosure state root).contains patch.arm.owner.processInstanceId) = false := by
  have facts := preparedTimerTask_owner_facts program state contract patch prepared
  obtain ⟨scope, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true facts.2.1)
  have member : scope ∈ state.scopeOccurrences.filter
      (fun value => decide (value.id = patch.arm.owner)) := by rw [census]; simp
  obtain ⟨member, same⟩ := List.mem_filter.mp member
  have live := List.mem_map.mpr ⟨scope, member, of_decide_eq_true same⟩
  exact (regional_cancellation_mask program state _ _ valid facts.2.2 root region derived
    patch.arm.owner live).symm.trans outside

theorem timerTask_return_outside (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (valid : runtimePositionValid program patch.arm.runtimeInstanceId state = true)
    (selectedBefore : selectInternalRegional? program state operation = some selected)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (outside : region.contains patch.arm.owner = false)
    (record : CalledProcessOccurrence) (kind : selected.kind = .returning record) :
    (processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
      (state.calledProcessOccurrences.length + 1)).contains patch.arm.owner.processInstanceId = false := by
  have facts := preparedTimerTask_owner_facts program state contract patch prepared
  obtain ⟨scope, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true facts.2.1)
  have member : scope ∈ state.scopeOccurrences.filter
      (fun value => decide (value.id = patch.arm.owner)) := by rw [census]; simp
  obtain ⟨member, same⟩ := List.mem_filter.mp member
  have live := List.mem_map.mpr ⟨scope, member, of_decide_eq_true same⟩
  have root := regionalSelection_return_root program state operation selected record selectedBefore kind
  have mask := regional_called_tree_mask program state _ _ valid facts.2.2 selected.root region
    derived (regionalSelection_root_member program state operation selected selectedBefore) root.2
    patch.arm.owner live
  rw [root.1] at mask
  exact mask.trans outside

theorem timerTask_regional_retention_frame (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (selected : InternalRegionalSelection)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (outside : (occurrenceInSubtree state.scopeOccurrences selected.root.id patch.arm.owner ||
      (calledInstanceClosure state selected.root.id).contains patch.arm.owner.processInstanceId) = false) :
    regionalSelectionReferenceRetention (applyInternalTimerTaskPatch state patch) selected =
        regionalSelectionReferenceRetention state selected ∧
      regionalSelectionLocalDataRetention (applyInternalTimerTaskPatch state patch) selected =
        regionalSelectionLocalDataRetention state selected := by
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let patch := makeInternalTimerTaskPatch program state contract owner instanceId processId origin
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences selected.root.id owner ||
    (calledInstanceClosure state selected.root.id).contains owner.processInstanceId
  change cancelled owner = false at outside
  have populations (retainedRoot : Option ScopeOccurrenceId) : withdrawnByRegion cancelled (insertActivityOccurrence patch.record state.activityOccurrences) retainedRoot =
      withdrawnByRegion cancelled state.activityOccurrences retainedRoot := by
    rw [withdrawnByRegion, insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ (by simp [patch, makeInternalTimerTaskPatch, recordInRegion, outside])]
    rfl
  dsimp only [patch, cancelled, makeInternalTimerTaskPatch] at populations
  simp only [calledInstanceClosure] at populations
  cases kind : selected.kind <;>
    simp only [regionalSelectionReferenceRetention, regionalSelectionLocalDataRetention, kind,
      callReferenceRetention, cancellationReferenceRetention, applyInternalTimerTaskPatch,
      makeInternalTimerTaskPatch, applyInternalArmingPatch]
  all_goals try dsimp only [calledInstanceClosure]
  all_goals try simp only [populations, and_self]
  all_goals cases ‹InternalCompletionWithdrawal› <;> rfl

theorem timerTask_regional_insertions_retained (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (footprint : InternalRegionalStateFootprint)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (valid : runtimePositionValid program patch.arm.runtimeInstanceId state = true)
    (live : activityRecordsOwnLiveWork state = true)
    (selectedBefore : selectInternalRegional? program state operation = some selected)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (footprintFound : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint (timerTaskStateFootprint patch) = true) :
    (match patch.arm.write with
      | .userTask wait => (regionalSelectionReferenceRetention state selected).task wait = true
      | _ => False) ∧
      (regionalSelectionReferenceRetention state selected).timer patch.timer = true ∧
      (regionalSelectionReferenceRetention state selected).activity patch.record = true := by
  have outside := timerTask_regional_scope_outside state selected region footprint patch footprintFound independent
  have cancelled := timerTask_cancelled_outside program state contract patch selected.root.id region
    valid prepared derived outside
  have called := timerTask_return_outside program state operation selected region contract patch
    valid selectedBefore prepared derived outside
  have fresh := prepared_timer_task_timer_keys_fresh program state contract patch prepared
  have unclaimed := activityRecords_do_not_claim_fresh_timer state patch.timer
    (fun old member => (fresh old member).1) live
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let patch := makeInternalTimerTaskPatch program state contract owner instanceId processId origin
  change (occurrenceInSubtree state.scopeOccurrences selected.root.id owner ||
    (calledInstanceClosure state selected.root.id).contains owner.processInstanceId) = false at cancelled
  have unattached (retainedRoot : Option ScopeOccurrenceId) : anyTimerIdNamesWait (attachedTimersOf
      (withdrawnByRegion (fun owner => occurrenceInSubtree state.scopeOccurrences selected.root.id owner ||
        (calledInstanceClosure state selected.root.id).contains owner.processInstanceId) state.activityOccurrences retainedRoot))
      patch.timer = false := by
    apply List.any_eq_false.mpr
    intro id member
    obtain ⟨record, recordMember, timerMember⟩ := List.mem_flatMap.mp member
    exact List.any_eq_false.mp (unclaimed record (List.mem_filter.mp recordMember).1) id timerMember
  dsimp only [patch, makeInternalTimerTaskPatch] at unattached
  cases kind : selected.kind with
  | returning record =>
      have kept := called record kind
      simpa [makeInternalTimerTaskPatch, regionalSelectionReferenceRetention, kind, callReferenceRetention] using kept
  | completing withdrawal =>
      cases withdrawal with
      | unbounded => simp [makeInternalTimerTaskPatch, regionalSelectionReferenceRetention, kind,
          ordinaryCompletionReferenceRetention]
      | bounded record deadline =>
          have member := regionalSelection_bounded_deadline program state operation selected record deadline selectedBefore kind
          have different : patch.timer ≠ deadline := by
            intro same
            have conflict := (fresh deadline member).1
            change timerWaitKeyMatches patch.timer deadline = false at conflict
            simp [same, timerWaitKeyMatches] at conflict
          simpa [patch, makeInternalTimerTaskPatch, regionalSelectionReferenceRetention, kind,
            boundedCompletionReferenceRetention, ordinaryCompletionReferenceRetention] using different
      | monitored record timer =>
          cases timer with
          | none => simp [makeInternalTimerTaskPatch, regionalSelectionReferenceRetention, kind,
              monitoredCompletionReferenceRetention, ordinaryCompletionReferenceRetention]
          | some deadline =>
              have member := regionalSelection_monitored_deadline program state operation selected record deadline selectedBefore kind
              have rejected : timerIdNamesWait (boundaryTimerWaitIdentity deadline) patch.timer = false := by
                apply Bool.eq_false_iff.mpr
                intro same
                simp only [timerIdNamesWait, boundaryTimerWaitIdentity, Bool.and_eq_true, beq_iff_eq] at same
                have element : patch.timer.elementId = deadline.elementId := congrArg NodeId.mk same.1.2.symm
                have collision : timerWaitKeyMatches patch.timer deadline = true := by
                  simp [timerWaitKeyMatches, same.1.1.symm, element, same.2.symm]
                have absent := (fresh deadline member).1
                change timerWaitKeyMatches patch.timer deadline = false at absent
                rw [absent] at collision
                contradiction
              simpa [patch, makeInternalTimerTaskPatch, regionalSelectionReferenceRetention, kind,
                monitoredCompletionReferenceRetention, ordinaryCompletionReferenceRetention] using rejected
  | interrupting parent | terminating =>
      simp only [makeInternalTimerTaskPatch, regionalSelectionReferenceRetention, kind,
        cancellationReferenceRetention, recordInRegion, cancelled, unattached _,
        Bool.or_false, Bool.not_false, Bool.true_and, and_self]

theorem timerTask_regional_scope_retained (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (footprint : InternalRegionalStateFootprint)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (valid : runtimePositionValid program patch.arm.runtimeInstanceId state = true)
    (selectedBefore : selectInternalRegional? program state operation = some selected)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (footprintFound : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint (timerTaskStateFootprint patch) = true)
    (scope : RuntimeScopeOccurrence) (same : scope.id = patch.arm.owner) :
    (regionalSelectionReferenceRetention state selected).scope scope = true := by
  have outside := timerTask_regional_scope_outside state selected region footprint patch footprintFound independent
  have cancelled := timerTask_cancelled_outside program state contract patch selected.root.id region
    valid prepared derived outside
  have called := timerTask_return_outside program state operation selected region contract patch
    valid selectedBefore prepared derived outside
  have distinct : patch.arm.owner ≠ selected.root.id := by
    intro equal
    have inside := List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec state _ _ derived).2.1
    change region.contains selected.root.id = true at inside
    rw [equal, inside] at outside
    contradiction
  cases kind : selected.kind with
  | returning record =>
      simp only [regionalSelectionReferenceRetention, kind, callReferenceRetention, same,
        called record kind, Bool.not_false]
  | completing withdrawal =>
      have nonRoot : selected.root.parent ≠ none := by
        intro parentless
        have running := (preparedTimerTask_owner_facts program state contract patch prepared).2.2
        have notWritten : .ordinary (.runtimeControl patch.arm.runtimeInstanceId) ∉ footprint.writes := by
          intro written
          have conflict := regional_independent_read_write _ _ independent _
            (.ordinary (.runtimeControl patch.arm.runtimeInstanceId)) written
            (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
          simp [regionalStateAtomsConflict] at conflict
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

theorem timerTask_regional_footprint_frame (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (footprint : InternalRegionalStateFootprint)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (valid : runtimePositionValid program patch.arm.runtimeInstanceId state = true)
    (live : activityRecordsOwnLiveWork state = true)
    (selectedBefore : selectInternalRegional? program state operation = some selected)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (footprintFound : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint (timerTaskStateFootprint patch) = true) :
    regionalStateFootprint? (applyInternalTimerTaskPatch state patch) selected region = some footprint := by
  have outside := timerTask_regional_scope_outside state selected region footprint patch footprintFound independent
  have cancelled := timerTask_cancelled_outside program state contract patch selected.root.id region
    valid prepared derived outside
  have masks := timerTask_regional_retention_frame program state contract patch selected prepared cancelled
  have kept := (timerTask_regional_insertions_retained program state operation selected region footprint
    contract patch valid live selectedBefore prepared derived footprintFound independent).2.2
  have fields := scopeArming_scope_read_projections state (.ordinary patch.arm.operation patch.arm)
  have tokens : (applyInternalTimerTaskPatch state patch).tokens.filter (fun token => region.contains token.owner) =
      state.tokens.filter (fun token => region.contains token.owner) := by
    rw [show (applyInternalTimerTaskPatch state patch).tokens =
      removeToken state.tokens patch.arm.input patch.arm.owner from fields.2.2.2.2.2.2]
    exact filter_removeToken_of_rejected _ _ _ _ outside
  have stable : (applyInternalTimerTaskPatch state patch).selectedBranchSets = state.selectedBranchSets ∧
      runningInstance? (applyInternalTimerTaskPatch state patch) = runningInstance? state := by
    cases write : patch.arm.write <;>
      simp [applyInternalTimerTaskPatch, applyInternalArmingPatch, write, runningInstance?]
  have withdrawals : regionalWithdrawnActivityWrites (applyInternalTimerTaskPatch state patch) selected =
      regionalWithdrawnActivityWrites state selected := by
    simp only [regionalWithdrawnActivityWrites, masks.1]
    change ((insertActivityOccurrence patch.record state.activityOccurrences).filter _).map _ = _
    rw [insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ (by simp [kept])]
  have base (hosting : SemanticId) :
      regionalBaseFootprint? (applyInternalTimerTaskPatch state patch) hosting selected region =
        regionalBaseFootprint? state hosting selected region := by
    simp only [regionalBaseFootprint?, regionalCensusWrites, tokens, stable.1]
  simpa only [regionalStateFootprint?, stable.2, base, withdrawals] using footprintFound

end BpmnSemantics.SemanticProcess.InternalCommutation
