import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalFrame
import BpmnSemantics.SemanticProcess.InternalRegionalArmingSelectionFrame

/-! The joined Timer-task insertion preserves regional selection outside its live owner.
Fresh Timer identities preserve the exact deadline census used by bounded scope completion.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem timerTask_regional_scope_outside (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (timer : InternalTimerTaskPatch)
    (found : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint (timerTaskStateFootprint timer) = true) :
    region.contains timer.arm.owner = false := by
  have conflict := regional_independent_read_write _ _ independent
    (.occurrenceRegion region) (.ordinary (.scopeOccurrence timer.arm.owner))
    (regionalStateFootprint_region_write state selected region footprint found)
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
  simpa [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using conflict

theorem timerTask_quiescent_frame (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (owner : ScopeOccurrenceId)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (outside : patch.arm.owner ≠ owner) :
    scopeQuiescent (applyInternalTimerTaskPatch state patch) owner = scopeQuiescent state owner := by
  obtain ⟨_, selectedOwner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let patch := makeInternalTimerTaskPatch program state contract selectedOwner instanceId processId origin
  have task := arming_quiescent_frame state patch.arm owner rfl outside
  have rejected : (patch.timer.owner == owner) = false := by simpa [patch, makeInternalTimerTaskPatch] using outside
  change scopeQuiescent (applyInternalTimerTaskPatch state patch) owner = _
  simp only [scopeQuiescent, applyInternalTimerTaskPatch] at task ⊢
  simp only [insertTimerWait, List.any_eq_not_all_not, all_canonicalInsertBy, rejected,
    Bool.not_false, Bool.true_and] at task ⊢
  exact task

theorem timerTask_scope_activity_lookup (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (scope : ScopeOccurrenceId) :
    activityOccurrenceForScope? (applyInternalTimerTaskPatch state patch).activityOccurrences scope =
      activityOccurrenceForScope? state.activityOccurrences scope := by
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  unfold activityOccurrenceForScope?
  change (match (insertActivityOccurrence _ state.activityOccurrences).filter _ with
    | [record] => some record | _ => none) = _
  rw [insertActivityOccurrence_eq_canonicalInsertBy,
    filter_canonicalInsertBy_rejected _ _ _ _ (by rfl)]
  rfl

theorem timerTask_existing_timer_census (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (attached : OccurrenceId) (deadline : TimerWait)
    (census : state.timerWaits.filter (timerIdNamesWait attached) = [deadline]) :
    (applyInternalTimerTaskPatch state patch).timerWaits.filter (timerIdNamesWait attached) = [deadline] := by
  have fresh := prepared_timer_task_timer_keys_fresh program state contract patch prepared
  have previous : deadline ∈ state.timerWaits.filter (timerIdNamesWait attached) := by rw [census]; simp
  obtain ⟨member, named⟩ := List.mem_filter.mp previous
  have rejected : timerIdNamesWait attached patch.timer = false := by
    apply Bool.eq_false_iff.mpr
    intro matched
    simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq] at matched named
    have element : patch.timer.elementId = deadline.elementId :=
      congrArg NodeId.mk (matched.1.2.symm.trans named.1.2)
    have collision : timerWaitKeyMatches patch.timer deadline = true := by
      simp [timerWaitKeyMatches, matched.1.1.symm.trans named.1.1, element,
        matched.2.symm.trans named.2]
    rw [(fresh deadline member).1] at collision
    contradiction
  simpa only [applyInternalTimerTaskPatch, insertTimerWait,
    filter_canonicalInsertBy_rejected _ _ _ _ rejected] using census

theorem timerTask_completion_withdrawal (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (definition : DefinitionScopeId) (choice : InternalCompletionWithdrawal)
    (selected : selectInternalCompletionWithdrawal? program state definition = some choice) :
    selectInternalCompletionWithdrawal? program (applyInternalTimerTaskPatch state patch)
      definition = some choice := by
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let patch := makeInternalTimerTaskPatch program state contract owner instanceId processId origin
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
      apply completionWithdrawal_bounded_of_facts program (applyInternalTimerTaskPatch state patch)
        definition declaration child parent record attached deadline declarations children parentEq
      · simpa only [timerTask_scope_activity_lookup program state contract patch prepared] using actual
      · exact recordOwner
      · exact handlers
      · exact element
      · exact timerTask_existing_timer_census program state contract patch prepared attached deadline census
      · exact deadlineOwner

private theorem timerTask_monitored_binding (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (pair : MonitoredScopePair) (bound : MonitoredScopeBinding program state pair) :
    MonitoredScopeBinding program (applyInternalTimerTaskPatch state patch) pair := by
  obtain ⟨_, owner, instanceId, inputOrigin, processId, _, _, _, _, _, _, _, unique, _, _, absent, patchEq⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  have oldRecords := bound.2.1.2.2.2.2.2.1
  have member : pair.record ∈ state.activityOccurrences :=
    (List.mem_filter.mp (show pair.record ∈ state.activityOccurrences.filter (sameActivityOccurrence pair.record) by
      rw [oldRecords]; simp)).1
  have rejected : sameActivityOccurrence pair.record patch.record = false := by
    apply Bool.eq_false_iff.mpr
    intro same
    exact List.any_eq_false.mp absent pair.record member
      (by simp [regionalActivityAssociationsConflict, same])
  have records : (applyInternalTimerTaskPatch state patch).activityOccurrences.filter
      (sameActivityOccurrence pair.record) = [pair.record] := by
    change (insertActivityOccurrence _ state.activityOccurrences).filter _ = _
    rw [insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ rejected]
    exact oldRecords
  have body : (applyInternalTimerTaskPatch state patch).activityOccurrences.filter
      (fun record => decide (record.body = .childScope pair.child.id)) =
        state.activityOccurrences.filter (fun record => decide (record.body = .childScope pair.child.id)) := by
    rw [patchEq]
    change (insertActivityOccurrence _ state.activityOccurrences).filter _ = _
    rw [insertActivityOccurrence_eq_canonicalInsertBy]
    apply filter_canonicalInsertBy_rejected
    rfl
  have declaration : pair.definition ∈ monitoredScopeDefinitions program :=
    (List.mem_filter.mp (show pair.definition ∈ (monitoredScopeDefinitions program).filter
      (fun definition => decide (definition.childScopeId = pair.definition.childScopeId)) by
        rw [bound.1.1]; simp)).1
  have declared : .enterMonitoredScope pair.definition.id pair.definition.origin pair.definition.input
      pair.definition.childEntry pair.definition.childScopeId pair.definition.timer ∈ program.operations := by
    generalize definitionEq : pair.definition = definition at declaration ⊢
    obtain ⟨operation, present, selected⟩ := List.mem_filterMap.mp declaration
    cases operation <;> simp at selected
    cases selected
    exact present
  have declarers : timerWaitDeclarers program contract.timer.elementId = [contract.operation] := by
    simpa [uniqueFamilyDeclarer?] using unique
  have different : contract.timer.elementId ≠ pair.definition.timer.elementId := by
    intro same
    have collision : .enterMonitoredScope pair.definition.id pair.definition.origin pair.definition.input
        pair.definition.childEntry pair.definition.childScopeId pair.definition.timer ∈
          timerWaitDeclarers program contract.timer.elementId := by
      simp [timerWaitDeclarers, declared, same]
    rw [declarers] at collision
    cases kind : contract.kind <;> simp [InternalTimerTaskContract.operation, kind] at collision
  have timers : (applyInternalTimerTaskPatch state patch).timerWaits.filter (monitoredScopeTimerNames pair) =
      state.timerWaits.filter (monitoredScopeTimerNames pair) := by
    change (insertTimerWait _ state.timerWaits).filter _ = _
    unfold insertTimerWait
    apply filter_canonicalInsertBy_rejected
    simp [patchEq, makeInternalTimerTaskPatch, monitoredScopeTimerNames, different]
  have control : (applyInternalTimerTaskPatch state patch).control = state.control := by
    rw [patchEq]; rfl
  have scopes : (applyInternalTimerTaskPatch state patch).scopeOccurrences = state.scopeOccurrences := by
    rw [patchEq]; rfl
  refine ⟨bound.1, ?_, ?_⟩
  · simpa only [MonitoredScopeOwnership, control, scopes, body, records, oldRecords] using bound.2.1
  · have timerBinding := bound.2.2
    cases deadline : pair.timer with
    | none => simpa only [MonitoredScopeTimerBinding, deadline, timers] using timerBinding
    | some timer =>
      simp only [MonitoredScopeTimerBinding, deadline] at timerBinding ⊢
      refine ⟨timerBinding.1, timers.trans timerBinding.2.1, ?_⟩
      have identity := timerTask_existing_timer_census program state contract patch prepared
        (boundaryTimerWaitIdentity timer) timer timerBinding.2.2.1
      simpa only [NonInterruptingBoundaryTimerBinding, identity, records,
        timerBinding.2.2.1, oldRecords] using timerBinding.2.2

theorem timerTask_subscribed_completion_withdrawal (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId) (choice : InternalCompletionWithdrawal)
    (selected : selectSubscribedCompletionWithdrawal? program state definition output = some choice) :
    selectSubscribedCompletionWithdrawal? program (applyInternalTimerTaskPatch state patch)
      definition output = some choice := by
  unfold selectSubscribedCompletionWithdrawal? at selected ⊢
  split at selected
  · next monitored =>
    rw [if_pos monitored]
    obtain ⟨pair, _, selected⟩ := Option.bind_eq_some_iff.mp selected
    split at selected
    · next addressed =>
      cases selected
      have bound := timerTask_monitored_binding program state contract patch prepared pair.val pair.property
      have rebuilt := monitoredScopePairForChild_complete program (applyInternalTimerTaskPatch state patch) pair.val bound
      rw [addressed.1] at rebuilt
      simp only [rebuilt, Option.bind_eq_bind, Option.bind_some]
      rw [if_pos addressed]
    · contradiction
  · next unmonitored =>
    rw [if_neg unmonitored]
    exact timerTask_completion_withdrawal program state contract patch prepared definition choice selected

theorem timerTask_regional_input_distinct (footprint : InternalRegionalStateFootprint)
    (patch : InternalTimerTaskPatch) (input : ControlPlaceId)
    (read : .ordinary (.tokenOwners input) ∈ footprint.reads)
    (independent : regionalStateFootprintsIndependent footprint (timerTaskStateFootprint patch) = true) :
    patch.arm.input ≠ input := by
  intro same
  have conflict := regional_independent_write_read _ _ independent
    (.ordinary (.tokenOwners patch.arm.input)) (.ordinary (.tokenOwners input))
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem]) read
  simp [regionalStateAtomsConflict, same] at conflict

theorem regionalSelection_after_independent_timer_task (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (footprint : InternalRegionalStateFootprint)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (found : selectInternalRegional? program state operation = some selected)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (footprintFound : regionalStateFootprint? state selected region = some footprint)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (independent : regionalStateFootprintsIndependent footprint (timerTaskStateFootprint patch) = true) :
    selectInternalRegional? program (applyInternalTimerTaskPatch state patch) operation = some selected := by
  have outside := timerTask_regional_scope_outside state selected region footprint patch footprintFound independent
  have rootInside : region.contains selected.root.id = true :=
    List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec state _ _ derived).2.1
  have distinct : patch.arm.owner ≠ selected.root.id := by
    intro same
    rw [same, rootInside] at outside
    contradiction
  have fields := scopeArming_scope_read_projections state (.ordinary patch.arm.operation patch.arm)
  have control : (applyInternalTimerTaskPatch state patch).control = state.control := fields.1
  have scopes : (applyInternalTimerTaskPatch state patch).scopeOccurrences = state.scopeOccurrences := fields.2.2.1
  have calls : (applyInternalTimerTaskPatch state patch).calledProcessOccurrences = state.calledProcessOccurrences := fields.2.2.2.1
  have tokens : (applyInternalTimerTaskPatch state patch).tokens =
      removeToken state.tokens patch.arm.input patch.arm.owner := fields.2.2.2.2.2.2
  have pending : (applyInternalTimerTaskPatch state patch).initiationPending = state.initiationPending := by
    cases write : patch.arm.write <;> simp only [applyInternalTimerTaskPatch, applyInternalArmingPatch, write]
  apply regionalSelection_read_frame program state (applyInternalTimerTaskPatch state patch)
    operation selected found control scopes calls pending
    (timerTask_quiescent_frame program state contract patch selected.root.id prepared distinct)
    (timerTask_subscribed_completion_withdrawal program state contract patch prepared)
  have operationEq := regionalSelection_operation program state operation selected found
  have inputRead := regionalStateFootprint_selector_read state selected region footprint footprintFound
  rw [operationEq] at inputRead
  have census (input : ControlPlaceId) (read : .ordinary (.tokenOwners input) ∈ footprint.reads) :
      tokenOwners (applyInternalTimerTaskPatch state patch) input = tokenOwners state input := by
    unfold tokenOwners
    rw [tokens, filterTokens_removeToken_other _ _ _ _
      (timerTask_regional_input_distinct footprint patch input read independent)]
  cases operation with
  | throwError id origin input error handler =>
      refine ⟨onlyTokenOwner_read_frame state _ input (census input inputRead), ?_⟩
      rw [tokens]
      apply filter_removeToken_of_rejected
      simp [timerTask_regional_input_distinct footprint patch input inputRead independent]
  | terminateScope id origin input definition =>
      change selectedTerminateOwner? program (applyInternalTimerTaskPatch state patch) id origin input definition =
        selectedTerminateOwner? program state id origin input definition
      unfold selectedTerminateOwner?
      rw [control, scopes, census input inputRead]
  | _ => trivial

end BpmnSemantics.SemanticProcess.InternalCommutation
