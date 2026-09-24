import BpmnSemantics.SemanticProcess.InternalMessageTaskRegionalFrame
import BpmnSemantics.SemanticProcess.InternalRegionalArmingSelectionFrame

/-! The joined Message-host insertion preserves regional selection outside its live owner.
Message insertion preserves the existing Timer census and exact child-Activity lookup.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem messageTask_regional_scope_outside (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (timer : InternalMessageTaskPatch)
    (found : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint (messageTaskStateFootprint timer) = true) :
    region.contains timer.arm.owner = false := by
  have conflict := regional_independent_read_write _ _ independent
    (.occurrenceRegion region) (.ordinary (.scopeOccurrence timer.arm.owner))
    (regionalStateFootprint_region_write state selected region footprint found)
    (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
  simpa [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using conflict

theorem messageTask_quiescent_frame (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (owner : ScopeOccurrenceId)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (outside : patch.arm.owner ≠ owner) :
    scopeQuiescent (applyInternalMessageTaskPatch state patch) owner = scopeQuiescent state owner := by
  obtain ⟨_, selectedOwner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let patch := makeInternalMessageTaskPatch program state contract selectedOwner instanceId processId origin
  have task := arming_quiescent_frame state patch.arm owner rfl outside
  have rejected : (patch.message.owner == owner) = false := by simpa [patch, makeInternalMessageTaskPatch] using outside
  change scopeQuiescent (applyInternalMessageTaskPatch state patch) owner = _
  simp only [scopeQuiescent, applyInternalMessageTaskPatch] at task ⊢
  simp only [insertMessageWait, List.any_eq_not_all_not, all_canonicalInsertBy, rejected,
    Bool.not_false, Bool.true_and] at task ⊢
  exact task

theorem messageTask_scope_activity_lookup (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (scope : ScopeOccurrenceId) :
    activityOccurrenceForScope? (applyInternalMessageTaskPatch state patch).activityOccurrences scope =
      activityOccurrenceForScope? state.activityOccurrences scope := by
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  unfold activityOccurrenceForScope?
  change (match (insertActivityOccurrence _ state.activityOccurrences).filter _ with
    | [record] => some record | _ => none) = _
  rw [insertActivityOccurrence_eq_canonicalInsertBy,
    filter_canonicalInsertBy_rejected _ _ _ _ (by rfl)]
  rfl

theorem messageTask_existing_timer_census (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (attached : OccurrenceId) (deadline : TimerWait)
    (census : state.timerWaits.filter (timerIdNamesWait attached) = [deadline]) :
    (applyInternalMessageTaskPatch state patch).timerWaits.filter (timerIdNamesWait attached) = [deadline] := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  exact census

theorem messageTask_completion_withdrawal (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (definition : DefinitionScopeId) (choice : InternalCompletionWithdrawal)
    (selected : selectInternalCompletionWithdrawal? program state definition = some choice) :
    selectInternalCompletionWithdrawal? program (applyInternalMessageTaskPatch state patch)
      definition = some choice := by
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let patch := makeInternalMessageTaskPatch program state contract owner instanceId processId origin
  cases choice with
  | monitored record timer =>
      exact (boundedWithdrawal_not_monitored program state definition record timer selected).elim
  | unbounded =>
      exact (completionWithdrawal_unbounded program _ definition
        (completionWithdrawal_unbounded_facts program state definition selected)).1
  | bounded record deadline =>
      obtain ⟨declaration, child, parent, attached, declarations, children, parentEq,
        actual, recordOwner, handlers, element, census, deadlineOwner⟩ :=
        completionWithdrawal_bounded_facts program state definition record deadline selected
      apply completionWithdrawal_bounded_of_facts program (applyInternalMessageTaskPatch state patch)
        definition declaration child parent record attached deadline declarations children parentEq
      · simpa only [messageTask_scope_activity_lookup program state contract patch prepared] using actual
      · exact recordOwner
      · exact handlers
      · exact element
      · exact messageTask_existing_timer_census program state contract patch prepared attached deadline census
      · exact deadlineOwner

private theorem messageTask_monitored_binding (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (pair : MonitoredScopePair) (bound : MonitoredScopeBinding program state pair) :
    MonitoredScopeBinding program (applyInternalMessageTaskPatch state patch) pair := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, _, _, _, absent, _, patchEq⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  have oldRecords := bound.2.1.2.2.2.2.2.1
  have member : pair.record ∈ state.activityOccurrences :=
    (List.mem_filter.mp (show pair.record ∈ state.activityOccurrences.filter (sameActivityOccurrence pair.record) by
      rw [oldRecords]; simp)).1
  have rejected : sameActivityOccurrence pair.record patch.record = false := by
    apply Bool.eq_false_iff.mpr
    intro same
    exact List.any_eq_false.mp absent pair.record member
      (by simp [regionalActivityAssociationsConflict, same])
  have records : (applyInternalMessageTaskPatch state patch).activityOccurrences.filter
      (sameActivityOccurrence pair.record) = [pair.record] := by
    change (insertActivityOccurrence _ state.activityOccurrences).filter _ = _
    rw [insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ rejected]
    exact oldRecords
  have body : (applyInternalMessageTaskPatch state patch).activityOccurrences.filter
      (fun record => decide (record.body = .childScope pair.child.id)) =
        state.activityOccurrences.filter (fun record => decide (record.body = .childScope pair.child.id)) := by
    rw [patchEq]
    change (insertActivityOccurrence _ state.activityOccurrences).filter _ = _
    rw [insertActivityOccurrence_eq_canonicalInsertBy]
    apply filter_canonicalInsertBy_rejected
    rfl
  have timers : (applyInternalMessageTaskPatch state patch).timerWaits.filter (monitoredScopeTimerNames pair) =
      state.timerWaits.filter (monitoredScopeTimerNames pair) := by
    rw [patchEq]; rfl
  have control : (applyInternalMessageTaskPatch state patch).control = state.control := by
    rw [patchEq]; rfl
  have scopes : (applyInternalMessageTaskPatch state patch).scopeOccurrences = state.scopeOccurrences := by
    rw [patchEq]; rfl
  refine ⟨bound.1, ?_, ?_⟩
  · simpa only [MonitoredScopeOwnership, control, scopes, body, records, oldRecords] using bound.2.1
  · have timerBinding := bound.2.2
    cases deadline : pair.timer with
    | none => simpa only [MonitoredScopeTimerBinding, deadline, timers] using timerBinding
    | some timer =>
      simp only [MonitoredScopeTimerBinding, deadline] at timerBinding ⊢
      refine ⟨timerBinding.1, timers.trans timerBinding.2.1, ?_⟩
      have identity := messageTask_existing_timer_census program state contract patch prepared
        (boundaryTimerWaitIdentity timer) timer timerBinding.2.2.1
      simpa only [NonInterruptingBoundaryTimerBinding, identity, records,
        timerBinding.2.2.1, oldRecords] using timerBinding.2.2

theorem messageTask_subscribed_completion_withdrawal (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId) (choice : InternalCompletionWithdrawal)
    (selected : selectSubscribedCompletionWithdrawal? program state definition output = some choice) :
    selectSubscribedCompletionWithdrawal? program (applyInternalMessageTaskPatch state patch)
      definition output = some choice := by
  unfold selectSubscribedCompletionWithdrawal? at selected ⊢
  split at selected
  · next monitored =>
    rw [if_pos monitored]
    obtain ⟨pair, _, selected⟩ := Option.bind_eq_some_iff.mp selected
    split at selected
    · next addressed =>
      cases selected
      have bound := messageTask_monitored_binding program state contract patch prepared pair.val pair.property
      have rebuilt := monitoredScopePairForChild_complete program (applyInternalMessageTaskPatch state patch) pair.val bound
      rw [addressed.1] at rebuilt
      simp only [rebuilt, Option.bind_eq_bind, Option.bind_some]
      rw [if_pos addressed]
    · contradiction
  · next unmonitored =>
    rw [if_neg unmonitored]
    exact messageTask_completion_withdrawal program state contract patch prepared definition choice selected

theorem messageTask_regional_input_distinct (footprint : InternalRegionalStateFootprint)
    (patch : InternalMessageTaskPatch) (input : ControlPlaceId)
    (read : .ordinary (.tokenOwners input) ∈ footprint.reads)
    (independent : regionalStateFootprintsIndependent footprint (messageTaskStateFootprint patch) = true) :
    patch.arm.input ≠ input := by
  intro same
  have conflict := regional_independent_write_read _ _ independent
    (.ordinary (.tokenOwners patch.arm.input)) (.ordinary (.tokenOwners input))
    (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem]) read
  simp [regionalStateAtomsConflict, same] at conflict

theorem regionalSelection_after_independent_message_task (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (footprint : InternalRegionalStateFootprint)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (found : selectInternalRegional? program state operation = some selected)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (footprintFound : regionalStateFootprint? state selected region = some footprint)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (independent : regionalStateFootprintsIndependent footprint (messageTaskStateFootprint patch) = true) :
    selectInternalRegional? program (applyInternalMessageTaskPatch state patch) operation = some selected := by
  have outside := messageTask_regional_scope_outside state selected region footprint patch footprintFound independent
  have rootInside : region.contains selected.root.id = true :=
    List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec state _ _ derived).2.1
  have distinct : patch.arm.owner ≠ selected.root.id := by
    intro same
    rw [same, rootInside] at outside
    contradiction
  have fields := scopeArming_scope_read_projections state (.ordinary patch.arm.operation patch.arm)
  have control : (applyInternalMessageTaskPatch state patch).control = state.control := fields.1
  have scopes : (applyInternalMessageTaskPatch state patch).scopeOccurrences = state.scopeOccurrences := fields.2.2.1
  have calls : (applyInternalMessageTaskPatch state patch).calledProcessOccurrences = state.calledProcessOccurrences := fields.2.2.2.1
  have tokens : (applyInternalMessageTaskPatch state patch).tokens =
      removeToken state.tokens patch.arm.input patch.arm.owner := fields.2.2.2.2.2.2
  have pending : (applyInternalMessageTaskPatch state patch).initiationPending = state.initiationPending := by
    cases write : patch.arm.write <;> simp only [applyInternalMessageTaskPatch, applyInternalArmingPatch, write]
  apply regionalSelection_read_frame program state (applyInternalMessageTaskPatch state patch)
    operation selected found control scopes calls pending
    (messageTask_quiescent_frame program state contract patch selected.root.id prepared distinct)
    (messageTask_subscribed_completion_withdrawal program state contract patch prepared)
  have operationEq := regionalSelection_operation program state operation selected found
  have inputRead := regionalStateFootprint_selector_read state selected region footprint footprintFound
  rw [operationEq] at inputRead
  have census (input : ControlPlaceId) (read : .ordinary (.tokenOwners input) ∈ footprint.reads) :
      tokenOwners (applyInternalMessageTaskPatch state patch) input = tokenOwners state input := by
    unfold tokenOwners
    rw [tokens, filterTokens_removeToken_other _ _ _ _
      (messageTask_regional_input_distinct footprint patch input read independent)]
  cases operation with
  | throwError id origin input error handler =>
      refine ⟨onlyTokenOwner_read_frame state _ input (census input inputRead), ?_⟩
      rw [tokens]
      apply filter_removeToken_of_rejected
      simp [messageTask_regional_input_distinct footprint patch input inputRead independent]
  | terminateScope id origin input definition =>
      change selectedTerminateOwner? program (applyInternalMessageTaskPatch state patch) id origin input definition =
        selectedTerminateOwner? program state id origin input definition
      unfold selectedTerminateOwner?
      rw [control, scopes, census input inputRead]
  | _ => trivial

end BpmnSemantics.SemanticProcess.InternalCommutation
