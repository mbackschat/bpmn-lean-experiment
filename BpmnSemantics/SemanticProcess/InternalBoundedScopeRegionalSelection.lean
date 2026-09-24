import BpmnSemantics.SemanticProcess.InternalBoundedScopeProjection
import BpmnSemantics.SemanticProcess.InternalBoundedScopeRegionalFrame
import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationSelection

/-! The child graph and joint deadline preserve independent regional selection. Child-position
validity is derived from complete bounded preparation before using the shared scope-query laws.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem boundedScope_region_after_independent
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program bounded.runtimeInstanceId state = true)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint bounded.footprint = true) :
    deriveInternalOccurrenceRegion? (bounded.selection.apply state) regional.selection.root.id = some regional.region := by
  have childValid := prepareInternalBoundedScope_preserves_child_runtime program state contract bounded _ valid found
  obtain ⟨selected, hosting, owner, _, _, _, selection, running, _, _, ownerExact, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  have separated := boundedScope_other_child_independent regional.footprint selected hosting owner independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  have runningControl : state.control = .running hosting := by
    cases control : state.control <;> simp_all [runningInstance?]
  have position : runtimePositionValid program hosting (entry.apply state) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at childValid
    exact childValid.1
  have derived := scopeCreation_region_frame program state operation contract.entryOperation regional entry
    hosting owner position regionalFound entryFound runningControl ownerExact separated
  let after := (makeInternalBoundedScopeSelection state contract entry).apply state
  have members (seed : List ScopeOccurrenceId) (fuel : Nat) :
      occurrenceRegionMembersWithin after seed fuel = occurrenceRegionMembersWithin (entry.apply state) seed fuel := by
    induction fuel generalizing seed with
    | zero => rfl
    | succ fuel ih =>
        have expanded : expandOccurrenceRegionMembers after seed = expandOccurrenceRegionMembers (entry.apply state) seed := rfl
        simp only [occurrenceRegionMembersWithin, expanded, ih]
  change deriveInternalOccurrenceRegion? after _ = _
  have graph : scopeOwnershipGraphExact after = scopeOwnershipGraphExact (entry.apply state) := rfl
  have scopes : after.scopeOccurrences = (entry.apply state).scopeOccurrences := rfl
  simpa only [deriveInternalOccurrenceRegion?, graph, scopes, members] using derived

theorem boundedScope_existing_timer_census
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (attached : OccurrenceId) (deadline : TimerWait)
    (census : state.timerWaits.filter (timerIdNamesWait attached) = [deadline]) :
    (bounded.selection.apply state).timerWaits.filter (timerIdNamesWait attached) = [deadline] := by
  have fresh := prepared_bounded_scope_timer_keys_fresh program state contract bounded found
  have previous : deadline ∈ state.timerWaits.filter (timerIdNamesWait attached) := by rw [census]; simp
  obtain ⟨member, named⟩ := List.mem_filter.mp previous
  have rejected : timerIdNamesWait attached bounded.selection.timer = false := by
    apply Bool.eq_false_iff.mpr
    intro matched
    simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq] at matched named
    have element : bounded.selection.timer.elementId = deadline.elementId :=
      congrArg NodeId.mk (matched.1.2.symm.trans named.1.2)
    have collision : timerWaitKeyMatches bounded.selection.timer deadline = true := by
      simp [timerWaitKeyMatches, matched.1.1.symm.trans named.1.1, element, matched.2.symm.trans named.2]
    rw [(fresh deadline member).1] at collision
    contradiction
  simpa only [InternalBoundedScopeSelection.apply, insertTimerWait,
    filter_canonicalInsertBy_rejected _ _ _ _ rejected] using census

theorem boundedScope_completion_supplement_frame
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (definition : DefinitionScopeId) (choice : InternalCompletionWithdrawal)
    (chosen : selectInternalCompletionWithdrawal? program (bounded.selection.creation.apply state) definition = some choice) :
    selectInternalCompletionWithdrawal? program (bounded.selection.apply state) definition = some choice := by
  have oldBodies := prepared_bounded_scope_old_records_reject_child program state contract bounded found
  have timerFrame := boundedScope_existing_timer_census program state contract bounded found
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  let bounded := makeInternalBoundedScopeSelection state contract entry
  let after := bounded.apply state
  cases choice with
  | monitored record timer =>
      exact (boundedWithdrawal_not_monitored program _ definition record timer chosen).elim
  | unbounded =>
      exact (completionWithdrawal_unbounded program after definition
        (completionWithdrawal_unbounded_facts program _ definition chosen)).1
  | bounded record deadline =>
      obtain ⟨declaration, child, parent, attached, declarations, children, parentEq,
        actual, recordOwner, handlers, element, census, deadlineOwner⟩ :=
        completionWithdrawal_bounded_facts program _ definition record deadline chosen
      have original : activityOccurrenceForScope? state.activityOccurrences child.id = some record := by
        simpa only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection,
          InternalScopeCreationSelection.apply, fields.2.2] using actual
      have body := activityOccurrenceForScope_sound original
      have different : entry.created.id ≠ child.id := by
        intro same
        exact oldBodies record body.1 (by simpa only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection, same] using body.2)
      have recordFrame : activityOccurrenceForScope? after.activityOccurrences child.id = some record := by
        unfold activityOccurrenceForScope?
        change (match (insertActivityOccurrence bounded.record state.activityOccurrences).filter _ with
          | [record] => some record | _ => none) = _
        rw [insertActivityOccurrence_eq_canonicalInsertBy,
          filter_canonicalInsertBy_rejected _ _ _ _ (by
            simp [bounded, makeInternalBoundedScopeSelection, activityBodyScope?, different])]
        exact original
      apply completionWithdrawal_bounded_of_facts program after definition declaration child parent record attached deadline
        declarations children parentEq recordFrame recordOwner handlers element
      · exact timerFrame attached deadline (by
          simpa only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection,
            InternalScopeCreationSelection.apply, fields.2.2] using census)
      · exact deadlineOwner

private theorem boundedScope_monitored_supplement_binding
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (pair : MonitoredScopePair)
    (bound : MonitoredScopeBinding program (bounded.selection.creation.apply state) pair) :
    MonitoredScopeBinding program (bounded.selection.apply state) pair := by
  have oldBodies := prepared_bounded_scope_old_records_reject_child program state contract bounded found
  have timerFrame := boundedScope_existing_timer_census program state contract bounded found
  obtain ⟨selected, hosting, _, _, _, _, selection, running, _, _, _, _, _, joint, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  let selected := makeInternalBoundedScopeSelection state contract entry
  let before := entry.apply state
  let after := selected.apply state
  change MonitoredScopeBinding program before pair at bound
  change MonitoredScopeBinding program after pair
  have activities : before.activityOccurrences = state.activityOccurrences := by
    simp only [before, InternalScopeCreationSelection.apply, child]
  have oldRecords : state.activityOccurrences.filter (sameActivityOccurrence pair.record) = [pair.record] := by
    rw [← activities]; exact bound.2.1.2.2.2.2.2.1
  have member : pair.record ∈ state.activityOccurrences :=
    (List.mem_filter.mp (show pair.record ∈ state.activityOccurrences.filter (sameActivityOccurrence pair.record) by
      rw [oldRecords]; simp)).1
  have different : entry.created.id ≠ pair.child.id := by
    intro same
    apply oldBodies pair.record member
    simp only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection, same,
      activityBodyScope?, bound.2.1.2.2.2.2.2.2.1]
  have originalChild : pair.child ∈ state.scopeOccurrences := by
    have member := (List.mem_filter.mp (show pair.child ∈ before.scopeOccurrences.filter
      (fun occurrence => decide (occurrence.id.definitionScopeId = pair.definition.childScopeId)) by
        rw [bound.2.1.1]; simp)).1
    simp only [before, InternalScopeCreationSelection.apply, child] at member
    rcases (mem_insertScopeOccurrence _ _ _).mp member with same | old
    · exact (different (congrArg RuntimeScopeOccurrence.id same).symm).elim
    · exact old
  have runningControl : state.control = .running hosting := by
    cases control : state.control <;> simp_all [runningInstance?]
  have absentChild := (scopeCreation_selection_child_facts state contract.entryOperation entry hosting
    runningControl entryFound child).2.2.2
  have definition : entry.created.id.definitionScopeId = contract.definition := by
    unfold selectInternalScopeCreation? at entryFound
    obtain ⟨_, _, entryFound⟩ := Option.bind_eq_some_iff.mp entryFound
    obtain ⟨_, _, entryFound⟩ := Option.bind_eq_some_iff.mp entryFound
    split at entryFound
    · contradiction
    · cases entryFound; rfl
  have differentDefinition : contract.definition ≠ pair.definition.childScopeId := by
    intro same
    have rejected := List.any_eq_false.mp absentChild pair.child originalChild
    simp [definition, same, bound.2.1.2.1] at rejected
  simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at joint
  have rejected : sameActivityOccurrence pair.record selected.record = false := by
    apply Bool.eq_false_iff.mpr
    intro same
    have absent : state.activityOccurrences.any (regionalActivityAssociationsConflict · selected.record) = false := by
      simpa using joint.2
    exact List.any_eq_false.mp absent pair.record member
      (by simp [regionalActivityAssociationsConflict, same])
  have records : after.activityOccurrences.filter (sameActivityOccurrence pair.record) = [pair.record] := by
    change (insertActivityOccurrence _ state.activityOccurrences).filter _ = _
    rw [insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ rejected]
    exact oldRecords
  have body : after.activityOccurrences.filter (fun record => decide (record.body = .childScope pair.child.id)) =
      before.activityOccurrences.filter (fun record => decide (record.body = .childScope pair.child.id)) := by
    rw [activities]
    change (insertActivityOccurrence _ state.activityOccurrences).filter _ = _
    rw [insertActivityOccurrence_eq_canonicalInsertBy]
    apply filter_canonicalInsertBy_rejected
    simp [selected, makeInternalBoundedScopeSelection, different]
  have declaration : pair.definition ∈ monitoredScopeDefinitions program :=
    (List.mem_filter.mp (show pair.definition ∈ (monitoredScopeDefinitions program).filter
      (fun definition => decide (definition.childScopeId = pair.definition.childScopeId)) by
        rw [bound.1.1]; simp)).1
  have declared : .enterMonitoredScope pair.definition.id pair.definition.origin pair.definition.input
      pair.definition.childEntry pair.definition.childScopeId pair.definition.timer ∈ program.operations := by
    generalize definitionEq : pair.definition = definition at declaration ⊢
    obtain ⟨operation, present, chosen⟩ := List.mem_filterMap.mp declaration
    cases operation <;> simp at chosen
    cases chosen
    exact present
  have declarers : timerWaitDeclarers program contract.timer.elementId = [contract.operation] := by
    simpa only [uniqueFamilyDeclarer?, decide_eq_true_eq] using joint.1.1.2
  have differentTimer : contract.timer.elementId ≠ pair.definition.timer.elementId := by
    intro same
    have collision : .enterMonitoredScope pair.definition.id pair.definition.origin pair.definition.input
        pair.definition.childEntry pair.definition.childScopeId pair.definition.timer ∈
          timerWaitDeclarers program contract.timer.elementId := by
      simp [timerWaitDeclarers, declared, same]
    rw [declarers] at collision
    cases disposition : contract.disposition <;>
      simp [InternalBoundedScopeContract.operation, disposition] at collision
    exact differentDefinition collision.2.2.2.2.1.symm
  have timers : after.timerWaits.filter (monitoredScopeTimerNames pair) =
      before.timerWaits.filter (monitoredScopeTimerNames pair) := by
    simp only [before, InternalScopeCreationSelection.apply, child]
    change (insertTimerWait _ state.timerWaits).filter _ = state.timerWaits.filter _
    unfold insertTimerWait
    apply filter_canonicalInsertBy_rejected
    simp [selected, makeInternalBoundedScopeSelection, monitoredScopeTimerNames, differentTimer]
  have oldRecordsBefore : before.activityOccurrences.filter (sameActivityOccurrence pair.record) = [pair.record] :=
    bound.2.1.2.2.2.2.2.1
  have control : after.control = before.control := rfl
  have scopes : after.scopeOccurrences = before.scopeOccurrences := rfl
  refine ⟨bound.1, ?_, ?_⟩
  · simpa only [MonitoredScopeOwnership, control, scopes, body, records, oldRecordsBefore] using bound.2.1
  · have timerBinding := bound.2.2
    cases deadline : pair.timer with
    | none => simpa only [MonitoredScopeTimerBinding, deadline, timers] using timerBinding
    | some timer =>
      simp only [MonitoredScopeTimerBinding, deadline] at timerBinding ⊢
      refine ⟨timerBinding.1, timers.trans timerBinding.2.1, ?_⟩
      have identity := timerFrame (boundaryTimerWaitIdentity timer) timer (by
        simpa only [before, InternalScopeCreationSelection.apply, child] using timerBinding.2.2.1)
      change after.timerWaits.filter (timerIdNamesWait (boundaryTimerWaitIdentity timer)) = [timer] at identity
      simpa only [NonInterruptingBoundaryTimerBinding, identity, records,
        timerBinding.2.2.1, oldRecordsBefore] using timerBinding.2.2

theorem boundedScope_subscribed_completion_supplement_frame
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId) (choice : InternalCompletionWithdrawal)
    (chosen : selectSubscribedCompletionWithdrawal? program (bounded.selection.creation.apply state)
      definition output = some choice) :
    selectSubscribedCompletionWithdrawal? program (bounded.selection.apply state) definition output = some choice := by
  unfold selectSubscribedCompletionWithdrawal? at chosen ⊢
  split at chosen
  · next monitored =>
    rw [if_pos monitored]
    obtain ⟨pair, _, chosen⟩ := Option.bind_eq_some_iff.mp chosen
    split at chosen
    · next addressed =>
      cases chosen
      have bound := boundedScope_monitored_supplement_binding program state contract bounded found pair.val pair.property
      have rebuilt := monitoredScopePairForChild_complete program (bounded.selection.apply state) pair.val bound
      rw [addressed.1] at rebuilt
      simp only [rebuilt, Option.bind_eq_bind, Option.bind_some]
      rw [if_pos addressed]
    · contradiction
  · next unmonitored =>
    rw [if_neg unmonitored]
    exact boundedScope_completion_supplement_frame program state contract bounded found definition choice chosen

theorem selectInternalRegional_after_independent_bounded_scope
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (bounded : PreparedInternalBoundedScope) (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program bounded.runtimeInstanceId state = true)
    (found : prepareInternalBoundedScope? program state contract = some bounded)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint bounded.footprint = true) :
    selectInternalRegional? program (bounded.selection.apply state) operation = some regional.selection := by
  have childValid := prepareInternalBoundedScope_preserves_child_runtime program state contract bounded _ valid found
  have supplement := boundedScope_subscribed_completion_supplement_frame program state contract bounded found
  obtain ⟨selected, hosting, owner, _, _, _, selection, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract bounded found
  have separated := boundedScope_other_child_independent regional.footprint selected hosting owner independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have fields := boundedScope_entry_selection_input state contract entry entryFound
  have runningControl : state.control = .running hosting := by
    cases control : state.control <;> simp_all [runningInstance?]
  have position : runtimePositionValid program hosting state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  have childPosition : runtimePositionValid program hosting (entry.apply state) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at childValid
    exact childValid.1
  have childSelected := scopeCreation_regional_selection program state operation contract.entryOperation regional entry
    hosting owner programValid position childPosition regionalFound entryFound runningControl separated
  have facts := prepareInternalRegional_facts program state operation regional regionalFound
  have outside := scopeCreation_regional_outside state regional.selection regional.region regional.footprint entry
    hosting owner facts.2.2.2.2.2.1 separated
  have rootInside : regional.region.contains regional.selection.root.id = true :=
    List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec state _ _ facts.2.2.2.2.1).2.1
  have ownerDifferent : entry.owner ≠ regional.selection.root.id := by
    intro same
    simp [same, rootInside] at outside
  let after := (makeInternalBoundedScopeSelection state contract entry).apply state
  change selectInternalRegional? program after operation = some regional.selection
  apply regionalSelection_read_frame program (entry.apply state) after operation regional.selection childSelected
    rfl rfl rfl rfl
  · simp only [scopeQuiescent, after, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, fields.2.2]
    have rejected : (entry.owner == regional.selection.root.id) = false := by simpa using ownerDifferent
    simp only [insertTimerWait, List.any_eq_not_all_not, all_canonicalInsertBy, rejected,
      Bool.not_false, Bool.true_and]
  · exact supplement
  · cases operation <;> first | exact ⟨rfl, rfl⟩ | rfl | trivial

end BpmnSemantics.SemanticProcess.InternalCommutation
