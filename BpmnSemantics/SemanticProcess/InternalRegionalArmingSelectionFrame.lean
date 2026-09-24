import BpmnSemantics.SemanticProcess.InternalRegionalArmingFrames
import BpmnSemantics.SemanticProcess.InternalRegionalSelectionFrame

/-! Regional selection observes quiescence and exact predecessor withdrawal records.
An independent arming patch creates work outside the selected region. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedArming_write_owner (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (found : arm.Prepared program state) :
    arm.scopeFramePatch.write.owner = arm.scopeFramePatch.owner := by
  cases arm with
  | ordinary operation patch =>
      exact (prepared_arm_selection_unique program state operation patch found).2.2
  | data contract patch =>
      obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
        prepareInternalDataArmingContract_facts program state contract patch found
      subst patch
      rfl

theorem arming_quiescent_frame (state : RuntimeState) (patch : InternalArmingPatch)
    (owner : ScopeOccurrenceId) (assigned : patch.write.owner = patch.owner)
    (outside : patch.owner ≠ owner) :
    scopeQuiescent (applyInternalArmingPatch state patch) owner = scopeQuiescent state owner := by
  have rejected : (patch.owner == owner) = false := by simpa using outside
  have filtered := filter_removeToken_of_rejected state.tokens patch.input patch.owner
    (fun token => token.owner == owner) rejected
  have tokens := scopeCreation_any_population_frame _ _ _ filtered
  cases write : patch.write <;>
    simp only [write, InternalArmingWrite.owner] at assigned
  all_goals simp only [scopeQuiescent, applyInternalArmingPatch, write, tokens]
  all_goals simp [List.not_any_eq_all_not, all_insertUserTaskWait, insertMessageWait, insertTimerWait,
    insertEffectWait, all_canonicalInsertBy, assigned, rejected]

theorem preparedArming_quiescent_frame (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (owner : ScopeOccurrenceId)
    (found : arm.Prepared program state) (outside : arm.scopeFramePatch.owner ≠ owner) :
    scopeQuiescent (arm.apply state) owner = scopeQuiescent state owner := by
  have frame := arming_quiescent_frame state arm.scopeFramePatch owner
    (preparedArming_write_owner program state arm found) outside
  cases arm <;> exact frame

theorem preparedArming_scope_activity_lookup (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (found : arm.Prepared program state) (scope : ScopeOccurrenceId) :
    activityOccurrenceForScope? (arm.apply state).activityOccurrences scope =
      activityOccurrenceForScope? state.activityOccurrences scope := by
  cases arm with
  | ordinary operation patch =>
    cases write : patch.write <;> simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write]
  | data contract patch =>
    obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
      prepareInternalDataArmingContract_facts program state contract patch found
    subst patch
    unfold activityOccurrenceForScope?
    change (match (insertActivityOccurrence _ state.activityOccurrences).filter _ with
      | [record] => some record | _ => none) = _
    rw [insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ (by rfl)]
    rfl

theorem preparedArming_existing_timer_census (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (found : arm.Prepared program state)
    (attached : OccurrenceId) (deadline : TimerWait)
    (census : state.timerWaits.filter (timerIdNamesWait attached) = [deadline]) :
    (arm.apply state).timerWaits.filter (timerIdNamesWait attached) = [deadline] := by
  cases arm with
  | data contract patch =>
    obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
      prepareInternalDataArmingContract_facts program state contract patch found
    subst patch
    exact census
  | ordinary operation patch =>
    have fresh := prepared_arm_key_fresh program state operation patch found
    cases write : patch.write with
    | timer inserted =>
      rw [write] at fresh
      have previous : deadline ∈ state.timerWaits.filter (timerIdNamesWait attached) := by rw [census]; simp
      obtain ⟨member, named⟩ := List.mem_filter.mp previous
      have rejected : timerIdNamesWait attached inserted = false := by
        apply Bool.eq_false_iff.mpr
        intro matched
        simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq] at matched named
        have element : inserted.elementId = deadline.elementId :=
          congrArg NodeId.mk (matched.1.2.symm.trans named.1.2)
        have collision : timerWaitKeyMatches inserted deadline = true := by
          simp [timerWaitKeyMatches, matched.1.1.symm.trans named.1.1, element,
            matched.2.symm.trans named.2]
        rw [(fresh deadline member).1] at collision
        contradiction
      simpa only [PreparedInternalArming.apply, applyInternalArmingPatch, write,
        insertTimerWait, filter_canonicalInsertBy_rejected _ _ _ _ rejected] using census
    | _ => simpa only [PreparedInternalArming.apply, applyInternalArmingPatch, write] using census

theorem preparedArming_completion_withdrawal (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (found : arm.Prepared program state)
    (definition : DefinitionScopeId) (choice : InternalCompletionWithdrawal)
    (selected : selectInternalCompletionWithdrawal? program state definition = some choice) :
    selectInternalCompletionWithdrawal? program (arm.apply state) definition = some choice := by
  cases choice with
  | monitored record timer =>
    exact (boundedWithdrawal_not_monitored program state definition record timer selected).elim
  | unbounded =>
    exact (completionWithdrawal_unbounded program (arm.apply state) definition
      (completionWithdrawal_unbounded_facts program state definition selected)).1
  | bounded record deadline =>
    obtain ⟨declaration, child, parent, attached, declarations, children, parentEq,
      actual, recordOwner, handlers, element, census, deadlineOwner⟩ :=
      completionWithdrawal_bounded_facts program state definition record deadline selected
    apply completionWithdrawal_bounded_of_facts program (arm.apply state) definition
      declaration child parent record attached deadline declarations
    · simpa only [(scopeArming_scope_read_projections state arm).2.2.1] using children
    · exact parentEq
    · simpa only [preparedArming_scope_activity_lookup program state arm found] using actual
    · exact recordOwner
    · exact handlers
    · exact element
    · exact preparedArming_existing_timer_census program state arm found attached deadline census
    · exact deadlineOwner

private theorem preparedArming_activity_identity_census (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (found : arm.Prepared program state) (record : ActivityOccurrence)
    (census : state.activityOccurrences.filter (sameActivityOccurrence record) = [record]) :
    (arm.apply state).activityOccurrences.filter (sameActivityOccurrence record) = [record] := by
  cases arm with
  | ordinary operation patch =>
    cases write : patch.write <;>
      simpa only [PreparedInternalArming.apply, applyInternalArmingPatch, write] using census
  | data contract patch =>
    obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, absent, patchEq⟩ :=
      prepareInternalDataArmingContract_facts program state contract patch found
    have member : record ∈ state.activityOccurrences :=
      (List.mem_filter.mp (show record ∈ state.activityOccurrences.filter (sameActivityOccurrence record) by
        rw [census]; simp)).1
    have rejected : sameActivityOccurrence record patch.record = false := by
      apply Bool.eq_false_iff.mpr
      intro same
      exact List.any_eq_false.mp absent record member (by simp [same])
    subst patch
    change (insertActivityOccurrence _ state.activityOccurrences).filter _ = _
    rw [insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ rejected]
    exact census

private theorem preparedArming_scope_body_census (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (found : arm.Prepared program state) (scope : ScopeOccurrenceId) :
    (arm.apply state).activityOccurrences.filter (fun record => decide (record.body = .childScope scope)) =
      state.activityOccurrences.filter (fun record => decide (record.body = .childScope scope)) := by
  cases arm with
  | ordinary operation patch =>
    cases write : patch.write <;> simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write]
  | data contract patch =>
    obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalDataArmingContract_facts program state contract patch found
    change (insertActivityOccurrence _ state.activityOccurrences).filter _ = _
    rw [insertActivityOccurrence_eq_canonicalInsertBy]
    apply filter_canonicalInsertBy_rejected
    rfl

private theorem monitored_definition_member (program : Program) (definition : MonitoredScopeDefinition)
    (member : definition ∈ monitoredScopeDefinitions program) :
    .enterMonitoredScope definition.id definition.origin definition.input definition.childEntry
      definition.childScopeId definition.timer ∈ program.operations := by
  obtain ⟨operation, present, selected⟩ := List.mem_filterMap.mp member
  cases operation <;> simp at selected
  cases selected
  exact present

private theorem preparedArming_monitored_timer_census (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (found : arm.Prepared program state) (pair : MonitoredScopePair)
    (bound : MonitoredScopeBinding program state pair) :
    (arm.apply state).timerWaits.filter (monitoredScopeTimerNames pair) =
      state.timerWaits.filter (monitoredScopeTimerNames pair) := by
  cases arm with
  | data contract patch =>
    obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalDataArmingContract_facts program state contract patch found
    rfl
  | ordinary operation patch =>
    change prepareInternalArm? program state operation = some patch at found
    cases write : patch.write with
    | timer inserted =>
      have declaration : pair.definition ∈ monitoredScopeDefinitions program :=
        (List.mem_filter.mp (show pair.definition ∈ (monitoredScopeDefinitions program).filter
          (fun definition => decide (definition.childScopeId = pair.definition.childScopeId)) by
            rw [bound.1.1]; simp)).1
      have member := monitored_definition_member program pair.definition declaration
      have facts := prepared_arm_selection_unique program state operation patch found
      have operationEq := prepared_operation_eq program state operation patch found
      rw [write] at facts
      have unique : timerWaitDeclarers program inserted.elementId = [operation] := by
        simpa [uniqueFamilyDeclarer?, InternalArmingWrite.kind, InternalArmingWrite.elementId,
          operationEq] using facts.2.1
      have different : inserted.elementId ≠ pair.definition.timer.elementId := by
        intro same
        have declared : .enterMonitoredScope pair.definition.id pair.definition.origin pair.definition.input
            pair.definition.childEntry pair.definition.childScopeId pair.definition.timer ∈
              timerWaitDeclarers program inserted.elementId := by
          simp [timerWaitDeclarers, member, same]
        rw [unique] at declared
        have equal := (List.mem_singleton.mp declared).symm
        rw [equal] at found
        simp [prepareInternalArm?, internalArmInput?] at found
      change (applyInternalArmingPatch state patch).timerWaits.filter _ = _
      simp only [applyInternalArmingPatch, write, insertTimerWait]
      apply filter_canonicalInsertBy_rejected
      simp [monitoredScopeTimerNames, different]
    | _ => simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write]

private theorem preparedArming_monitored_binding (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (found : arm.Prepared program state) (pair : MonitoredScopePair)
    (bound : MonitoredScopeBinding program state pair) :
    MonitoredScopeBinding program (arm.apply state) pair := by
  have fields := scopeArming_scope_read_projections state arm
  have records := preparedArming_activity_identity_census program state arm found pair.record bound.2.1.2.2.2.2.2.1
  have body := preparedArming_scope_body_census program state arm found pair.child.id
  have timers := preparedArming_monitored_timer_census program state arm found pair bound
  refine ⟨bound.1, ?_, ?_⟩
  · simpa only [MonitoredScopeOwnership, fields.1, fields.2.2.1, body, records,
      bound.2.1.2.2.2.2.2.1] using bound.2.1
  · have timerBinding := bound.2.2
    cases deadline : pair.timer with
    | none => simpa only [MonitoredScopeTimerBinding, deadline, timers] using timerBinding
    | some timer =>
      simp only [MonitoredScopeTimerBinding, deadline] at timerBinding ⊢
      refine ⟨timerBinding.1, timers.trans timerBinding.2.1, ?_⟩
      have identity := preparedArming_existing_timer_census program state arm found
        (boundaryTimerWaitIdentity timer) timer timerBinding.2.2.1
      simpa only [NonInterruptingBoundaryTimerBinding, identity, records,
        timerBinding.2.2.1, bound.2.1.2.2.2.2.2.1] using timerBinding.2.2

theorem preparedArming_subscribed_completion_withdrawal (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (found : arm.Prepared program state)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId) (choice : InternalCompletionWithdrawal)
    (selected : selectSubscribedCompletionWithdrawal? program state definition output = some choice) :
    selectSubscribedCompletionWithdrawal? program (arm.apply state) definition output = some choice := by
  unfold selectSubscribedCompletionWithdrawal? at selected ⊢
  split at selected
  · next monitored =>
    rw [if_pos monitored]
    obtain ⟨pair, _, selected⟩ := Option.bind_eq_some_iff.mp selected
    split at selected
    · next addressed =>
      cases selected
      have bound := preparedArming_monitored_binding program state arm found pair.val pair.property
      have rebuilt := monitoredScopePairForChild_complete program (arm.apply state) pair.val bound
      rw [addressed.1] at rebuilt
      simp only [rebuilt, Option.bind_eq_bind, Option.bind_some]
      rw [if_pos addressed]
    · contradiction
  · next unmonitored =>
    rw [if_neg unmonitored]
    exact preparedArming_completion_withdrawal program state arm found definition choice selected

theorem regional_arming_input_distinct (footprint : InternalRegionalStateFootprint)
    (arm : PreparedInternalArming) (input : ControlPlaceId)
    (read : .ordinary (.tokenOwners input) ∈ footprint.reads)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    arm.scopeFramePatch.input ≠ input := by
  intro same
  have written : liftRegionalStateAtom arm.scopeFramePatch.owner (.tokenOwners arm.scopeFramePatch.input) ∈
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint).writes :=
    List.mem_map.mpr ⟨_, scopeArming_input_write arm, rfl⟩
  have conflict := regional_independent_write_read _ _ independent _ _ written read
  simp [liftRegionalStateAtom, regionalStateAtomsConflict, same] at conflict

theorem regionalSelection_after_independent_arming (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (footprint : InternalRegionalStateFootprint)
    (arm : PreparedInternalArming)
    (found : selectInternalRegional? program state operation = some selected)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (footprintFound : regionalStateFootprint? state selected region = some footprint)
    (armFound : arm.Prepared program state)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    selectInternalRegional? program (arm.apply state) operation = some selected := by
  have fields := scopeArming_scope_read_projections state arm
  have outside := arming_regional_scope_outside state selected region footprint arm footprintFound independent
  have rootInside : region.contains selected.root.id = true :=
    List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec state _ _ derived).2.1
  have distinct : arm.scopeFramePatch.owner ≠ selected.root.id := by
    intro same
    rw [same, rootInside] at outside
    contradiction
  have pending : (arm.apply state).initiationPending = state.initiationPending := by
    cases arm with
    | ordinary operation patch =>
      cases write : patch.write <;> simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write]
    | data contract patch =>
      cases write : patch.arm.write <;>
        simp only [PreparedInternalArming.apply, applyInternalDataArmingPatch, applyInternalArmingPatch, write]
  apply regionalSelection_read_frame program state (arm.apply state) operation selected found
    fields.1 fields.2.2.1 fields.2.2.2.1 pending
    (preparedArming_quiescent_frame program state arm selected.root.id armFound distinct)
    (preparedArming_subscribed_completion_withdrawal program state arm armFound)
  have operationEq := regionalSelection_operation program state operation selected found
  have inputRead := regionalStateFootprint_selector_read state selected region footprint footprintFound
  rw [operationEq] at inputRead
  have census (input : ControlPlaceId) (read : .ordinary (.tokenOwners input) ∈ footprint.reads) :
      tokenOwners (arm.apply state) input = tokenOwners state input := by
    unfold tokenOwners
    rw [fields.2.2.2.2.2.2, filterTokens_removeToken_other _ _ _ _
      (regional_arming_input_distinct footprint arm input read independent)]
  cases operation with
  | throwError id origin input error handler =>
    refine ⟨onlyTokenOwner_read_frame state (arm.apply state) input (census input inputRead), ?_⟩
    rw [fields.2.2.2.2.2.2]
    apply filter_removeToken_of_rejected
    simp [regional_arming_input_distinct footprint arm input inputRead independent]
  | terminateScope id origin input definition =>
    change selectedTerminateOwner? program (arm.apply state) id origin input definition =
      selectedTerminateOwner? program state id origin input definition
    unfold selectedTerminateOwner?
    rw [fields.1, fields.2.2.1, census input inputRead]
  | _ => trivial

end BpmnSemantics.SemanticProcess.InternalCommutation
