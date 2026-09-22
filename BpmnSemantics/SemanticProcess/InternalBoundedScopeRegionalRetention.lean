import BpmnSemantics.SemanticProcess.InternalBoundedScopeRegionalSelection
import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationClassifiers
import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationOwnership

/-! Independent bounded entry leaves the regional classifiers unchanged even for historical IDs.
Both the parent-owned Activity and its child body must stay outside the removal region.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem boundedScope_regional_outside
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint bounded.footprint = true) :
    regional.region.contains bounded.selection.creation.owner = false ∧
      regional.region.contains bounded.selection.creation.created.id = false ∧
      bounded.selection.creation.created.parent.any regional.region.contains = false := by
  obtain ⟨selected, hosting, owner, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  have outside := scopeCreation_regional_outside state regional.selection regional.region regional.footprint
    selected.creation hosting owner (prepareInternalRegional_facts program state operation regional regionalFound).2.2.2.2.2.1
    (boundedScope_other_child_independent _ selected hosting owner independent)
  exact ⟨outside.1, outside.2.1, outside.2.2.1⟩

theorem boundedScope_regional_classifiers
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program bounded.runtimeInstanceId state = true)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint bounded.footprint = true) :
    (∀ owner, occurrenceInSubtree (bounded.selection.apply state).scopeOccurrences regional.selection.root.id owner =
      occurrenceInSubtree state.scopeOccurrences regional.selection.root.id owner) ∧
      calledInstanceClosure (bounded.selection.apply state) regional.selection.root.id =
        calledInstanceClosure state regional.selection.root.id ∧
      (bounded.selection.apply state).calledProcessOccurrences = state.calledProcessOccurrences := by
  have childValid := prepareInternalBoundedScope_preserves_child_runtime program state contract bounded _ valid found
  have outside := boundedScope_regional_outside program state contract bounded operation regional found regionalFound independent
  obtain ⟨selected, hosting, owner, _, _, _, selection, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have runningControl : state.control = .running hosting := by
    cases control : state.control <;> simp_all [runningInstance?]
  have position : runtimePositionValid program hosting state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  have childPosition : runtimePositionValid program hosting (entry.apply state) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at childValid
    exact childValid.1
  have childRunning := (scopeCreation_apply_control state entry).trans runningControl
  have subtree := scopeCreation_subtree_frame state entry regional.selection.root.id regional.region
    (prepareInternalRegional_facts program state operation regional regionalFound).2.2.2.2.1
    (runtimePositionValid_scope_ids_nodup program hosting hosting state position runningControl)
    (runtimePositionValid_scope_parents_live program hosting hosting state position runningControl)
    (runtimePositionValid_scope_ids_nodup program hosting hosting (entry.apply state) childPosition childRunning)
    (runtimePositionValid_scope_parents_live program hosting hosting (entry.apply state) childPosition childRunning) outside.2.2
  let after := (makeInternalBoundedScopeSelection state contract entry).apply state
  have subtreeAfter (id : ScopeOccurrenceId) : occurrenceInSubtree after.scopeOccurrences regional.selection.root.id id =
      occurrenceInSubtree state.scopeOccurrences regional.selection.root.id id := subtree id
  have calls : after.calledProcessOccurrences = state.calledProcessOccurrences := by
    simp only [after, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child]
  refine ⟨subtreeAfter, ?_, calls⟩
  change calledInstanceClosure after regional.selection.root.id = _
  simp only [calledInstanceClosure, calls, subtreeAfter]

theorem boundedScope_regional_live_owner_masks
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program bounded.runtimeInstanceId state = true)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint bounded.footprint = true)
    (owner : ScopeOccurrenceId) (live : owner ∈ (bounded.selection.apply state).scopeOccurrences.map (·.id))
    (outside : regional.region.contains owner = false) :
    (occurrenceInSubtree state.scopeOccurrences regional.selection.root.id owner ||
      (calledInstanceClosure state regional.selection.root.id).contains owner.processInstanceId) = false ∧
      (regional.selection.root.parent = none →
        (processInstanceClosureWithin state.calledProcessOccurrences [regional.selection.root.id.processInstanceId]
          (state.calledProcessOccurrences.length + 1)).contains owner.processInstanceId = false) := by
  have afterValid := prepared_bounded_scope_preserves_runtime program state contract bounded _ found valid
  have derived := boundedScope_region_after_independent program state contract bounded operation regional valid found regionalFound independent
  have classifiers := boundedScope_regional_classifiers program state contract bounded operation regional valid found regionalFound independent
  have selected := (ownershipClosedSelection_facts program state operation regional.selection
    (prepareInternalRegional_facts program state operation regional regionalFound).2.2.2.1).1
  have oldRoot := regionalSelection_root_member program state operation regional.selection selected
  obtain ⟨selection, hosting, _, _, _, _, boundedSelection, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selection boundedSelection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  let after := (makeInternalBoundedScopeSelection state contract entry).apply state
  change (∀ id, occurrenceInSubtree after.scopeOccurrences regional.selection.root.id id =
    occurrenceInSubtree state.scopeOccurrences regional.selection.root.id id) ∧
    calledInstanceClosure after regional.selection.root.id = calledInstanceClosure state regional.selection.root.id ∧
    after.calledProcessOccurrences = state.calledProcessOccurrences at classifiers
  have control : after.control = .running hosting := by
    cases stateControl : state.control <;> simp_all [runningInstance?, after, InternalBoundedScopeSelection.apply,
      makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply]
  have position : runtimePositionValid program hosting after = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterValid
    exact afterValid.1
  have rootMember : regional.selection.root ∈ after.scopeOccurrences := by
    simp only [after, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child]
    exact (mem_insertScopeOccurrence _ _ _).mpr (.inr oldRoot)
  constructor
  · have mask := (regional_cancellation_mask program after hosting hosting position control regional.selection.root.id
      regional.region derived owner live).symm.trans outside
    simpa only [classifiers.1, classifiers.2.1] using mask
  · intro parentless
    have mask := (regional_called_tree_mask program after hosting hosting position control regional.selection.root
      regional.region derived rootMember parentless owner live).trans outside
    simpa only [classifiers.2.2] using mask

theorem boundedScope_owner_child_live
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some bounded) :
    bounded.selection.creation.owner ∈ (bounded.selection.apply state).scopeOccurrences.map (·.id) ∧
      bounded.selection.creation.created.id ∈ (bounded.selection.apply state).scopeOccurrences.map (·.id) := by
  obtain ⟨selected, hosting, owner, _, _, _, selection, _, _, _, census, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have member : owner ∈ state.scopeOccurrences.filter (fun candidate => decide (candidate.id = entry.owner)) := by
    rw [show state.scopeOccurrences.filter (fun candidate => decide (candidate.id = entry.owner)) = [owner] from census]
    simp
  obtain ⟨member, same⟩ := List.mem_filter.mp member
  simp only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection,
    InternalBoundedScopeSelection.apply, InternalScopeCreationSelection.apply, child]
  exact ⟨List.mem_map.mpr ⟨owner, (mem_insertScopeOccurrence _ _ _).mpr (.inr member), of_decide_eq_true same⟩,
    List.mem_map.mpr ⟨entry.created, (mem_insertScopeOccurrence _ _ _).mpr (.inl rfl), rfl⟩⟩

theorem boundedScope_regional_retention_frame
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program bounded.runtimeInstanceId state = true)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint bounded.footprint = true) :
    regionalSelectionReferenceRetention (bounded.selection.apply state) regional.selection =
        regionalSelectionReferenceRetention state regional.selection ∧
      regionalSelectionLocalDataRetention (bounded.selection.apply state) regional.selection =
        regionalSelectionLocalDataRetention state regional.selection := by
  have classifiers := boundedScope_regional_classifiers program state contract bounded operation regional valid found regionalFound independent
  have outside := boundedScope_regional_outside program state contract bounded operation regional found regionalFound independent
  have live := boundedScope_owner_child_live program state contract bounded found
  have ownerMask := (boundedScope_regional_live_owner_masks program state contract bounded operation regional
    valid found regionalFound independent _ live.1 outside.1).1
  have childMask := (boundedScope_regional_live_owner_masks program state contract bounded operation regional
    valid found regionalFound independent _ live.2 outside.2.1).1
  obtain ⟨selected, hosting, owner, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  let after := (makeInternalBoundedScopeSelection state contract entry).apply state
  change (∀ id, occurrenceInSubtree after.scopeOccurrences regional.selection.root.id id =
    occurrenceInSubtree state.scopeOccurrences regional.selection.root.id id) ∧
    calledInstanceClosure after regional.selection.root.id = calledInstanceClosure state regional.selection.root.id ∧
    after.calledProcessOccurrences = state.calledProcessOccurrences at classifiers
  let cancelled := fun id => occurrenceInSubtree state.scopeOccurrences regional.selection.root.id id ||
    (calledInstanceClosure state regional.selection.root.id).contains id.processInstanceId
  change cancelled entry.owner = false at ownerMask
  change cancelled entry.created.id = false at childMask
  have populations : withdrawnByRegion cancelled after.activityOccurrences =
      withdrawnByRegion cancelled state.activityOccurrences := by
    change withdrawnByRegion cancelled (insertActivityOccurrence
      (makeInternalBoundedScopeSelection state contract entry).record state.activityOccurrences) = _
    rw [withdrawnByRegion, insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ (by simp [makeInternalBoundedScopeSelection, recordInRegion, ownerMask, childMask])]
    rfl
  change regionalSelectionReferenceRetention after regional.selection = _ ∧
    regionalSelectionLocalDataRetention after regional.selection = _
  cases kind : regional.selection.kind <;>
    simp only [regionalSelectionReferenceRetention, regionalSelectionLocalDataRetention, kind,
      callReferenceRetention, cancellationReferenceRetention, classifiers.1, classifiers.2.1,
      classifiers.2.2]
  all_goals simp only [show (fun id => occurrenceInSubtree state.scopeOccurrences regional.selection.root.id id ||
    (calledInstanceClosure state regional.selection.root.id).contains id.processInstanceId) = cancelled from rfl,
    populations, and_self]
  all_goals simp only [after, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
    InternalScopeCreationSelection.apply, (boundedScope_entry_selection_input state contract entry entryFound).2.2,
    and_self]

theorem boundedScope_regional_nonroot
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint bounded.footprint = true)
    (withdrawal : InternalCompletionWithdrawal) (kind : regional.selection.kind = .completing withdrawal) :
    regional.selection.root.parent ≠ none := by
  obtain ⟨selected, hosting, owner, _, _, _, _, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  have control : state.control = .running hosting := by
    cases control : state.control <;> simp_all [runningInstance?]
  have noWrite : .ordinary (.runtimeControl hosting) ∉ regional.footprint.writes := by
    intro written
    have read : .ordinary (.runtimeControl hosting) ∈ (boundedScopeStateFootprint selected hosting owner).reads := by
      simp [boundedScopeStateFootprint, canonicalRegionalStateAtoms_mem, liftRegionalStateFootprint,
        internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy, liftRegionalStateAtom]
    have conflict := regional_independent_read_write _ _ independent _ _ written read
    simp [regionalStateAtomsConflict] at conflict
  exact regional_completion_nonroot_of_control_read state hosting regional.selection regional.region regional.footprint
    control (prepareInternalRegional_facts program state operation regional regionalFound).2.2.2.2.2.1 noWrite withdrawal kind

theorem boundedScope_regional_scope_retained
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program bounded.runtimeInstanceId state = true)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint bounded.footprint = true)
    (scope : RuntimeScopeOccurrence)
    (live : scope.id ∈ (bounded.selection.apply state).scopeOccurrences.map (·.id))
    (outside : regional.region.contains scope.id = false) :
    (regionalSelectionReferenceRetention state regional.selection).scope scope = true := by
  have masks := boundedScope_regional_live_owner_masks program state contract bounded operation regional
    valid found regionalFound independent scope.id live outside
  have facts := prepareInternalRegional_facts program state operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program state operation regional.selection facts.2.2.2.1).1
  have distinct : scope.id ≠ regional.selection.root.id := by
    intro same
    have inside : regional.region.contains regional.selection.root.id = true :=
      List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec _ _ _ facts.2.2.2.2.1).2.1
    simp [same, inside] at outside
  cases kind : regional.selection.kind with
  | returning record =>
      obtain ⟨rootId, parentless⟩ := regionalSelection_return_root program state operation regional.selection record selected kind
      have kept := masks.2 parentless
      simp only [rootId] at kept
      simp only [regionalSelectionReferenceRetention, kind, callReferenceRetention, kept, Bool.not_false]
  | completing withdrawal =>
      have nonroot := boundedScope_regional_nonroot program state contract bounded operation regional found regionalFound independent withdrawal kind
      cases parentEq : regional.selection.root.parent with
      | none => exact False.elim (nonroot parentEq)
      | some parent => cases withdrawal <;>
          simp [regionalSelectionReferenceRetention, kind, boundedCompletionReferenceRetention,
            ordinaryCompletionReferenceRetention, parentEq, distinct]
  | interrupting parent | terminating =>
      simp only [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention, masks.1, Bool.not_false, Bool.or_true]

theorem boundedScope_regional_insertions_retained
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program bounded.runtimeInstanceId state = true)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint bounded.footprint = true) :
    (regionalSelectionReferenceRetention state regional.selection).scope bounded.selection.creation.created = true ∧
      (regionalSelectionReferenceRetention state regional.selection).timer bounded.selection.timer = true ∧
      (regionalSelectionReferenceRetention state regional.selection).activity bounded.selection.record = true := by
  have outside := boundedScope_regional_outside program state contract bounded operation regional found regionalFound independent
  have live := boundedScope_owner_child_live program state contract bounded found
  have scopeKept := boundedScope_regional_scope_retained program state contract bounded operation regional
    valid found regionalFound independent _ live.2 outside.2.1
  have ownerMasks := boundedScope_regional_live_owner_masks program state contract bounded operation regional
    valid found regionalFound independent _ live.1 outside.1
  have childMasks := boundedScope_regional_live_owner_masks program state contract bounded operation regional
    valid found regionalFound independent _ live.2 outside.2.1
  have facts := prepareInternalRegional_facts program state operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program state operation regional.selection facts.2.2.2.1).1
  have fresh := prepared_bounded_scope_timer_keys_fresh program state contract bounded found
  have records : activityRecordsOwnLiveWork state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.2.2.2.2.2.2.2.2.2.1
  have unclaimed := activityRecords_do_not_claim_fresh_timer state bounded.selection.timer
    (fun old member => (fresh old member).1) records
  have unattached : anyTimerIdNamesWait (attachedTimersOf
      (withdrawnByRegion (fun owner => occurrenceInSubtree state.scopeOccurrences regional.selection.root.id owner ||
        (calledInstanceClosure state regional.selection.root.id).contains owner.processInstanceId) state.activityOccurrences))
      bounded.selection.timer = false := by
    apply List.any_eq_false.mpr
    intro id member
    obtain ⟨record, member, attached⟩ := List.mem_flatMap.mp member
    exact List.any_eq_false.mp (unclaimed record (List.mem_filter.mp member).1) id attached
  have distinct : bounded.selection.creation.created.id ≠ regional.selection.root.id := by
    intro same
    have inside : regional.region.contains regional.selection.root.id = true :=
      List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec _ _ _ facts.2.2.2.2.1).2.1
    simp [same, inside] at outside
  refine ⟨scopeKept, ?_⟩
  obtain ⟨selection, hosting, owner, _, _, _, boundedSelection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selection boundedSelection
  dsimp only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection] at ownerMasks childMasks fresh unattached distinct ⊢
  cases kind : regional.selection.kind with
  | returning record =>
      obtain ⟨rootId, parentless⟩ := regionalSelection_return_root program state operation regional.selection record selected kind
      have kept := ownerMasks.2 parentless
      simp only [rootId] at kept
      simp only [regionalSelectionReferenceRetention, kind, callReferenceRetention, kept, Bool.not_false, and_self]
  | completing withdrawal =>
      cases withdrawal with
      | unbounded => simp [regionalSelectionReferenceRetention, kind, ordinaryCompletionReferenceRetention]
      | bounded record deadline =>
          have member := regionalSelection_bounded_deadline program state operation regional.selection record deadline selected kind
          have different : (makeInternalBoundedScopeSelection state contract entry).timer ≠ deadline := by
            intro same
            have conflict := (fresh deadline member).1
            change timerWaitKeyMatches (makeInternalBoundedScopeSelection state contract entry).timer deadline = false at conflict
            simp [same, timerWaitKeyMatches] at conflict
          simpa [regionalSelectionReferenceRetention, kind, boundedCompletionReferenceRetention,
            ordinaryCompletionReferenceRetention, distinct, makeInternalBoundedScopeSelection] using different
  | interrupting parent | terminating =>
      simp only [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention, recordInRegion,
        ownerMasks.1, childMasks.1, unattached, Bool.or_false, Bool.not_false, Bool.true_and, and_self]

end BpmnSemantics.SemanticProcess.InternalCommutation
