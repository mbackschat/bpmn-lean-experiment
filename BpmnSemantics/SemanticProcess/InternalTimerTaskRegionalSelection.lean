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
    (timerTask_completion_withdrawal program state contract patch prepared)
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
