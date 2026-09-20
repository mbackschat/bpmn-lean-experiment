import BpmnSemantics.SemanticProcess.InternalRegionalChildTimerFrames

/-! Complete wait-family preservation for child completion uses the existing validators.
The selected withdrawal and quiescence discharge Timer-host and live-owner frames. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

theorem completionWithdrawal_wait_program_validity (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (root : RuntimeScopeOccurrence)
    (withdrawal : InternalCompletionWithdrawal)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (unique : waitIdentitiesUnique before = true)
    (quiet : scopeQuiescent before root.id = true)
    (children : before.scopeOccurrences.filter (fun child => decide (child.id.definitionScopeId = scopeId)) = [root])
    (selected : selectInternalCompletionWithdrawal? program before scopeId = some withdrawal)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun child => decide (child.id ≠ root.id)))
    (tasks : after.waits = before.waits)
    (messages : after.messageWaits = before.messageWaits)
    (races : after.eventRaces = before.eventRaces)
    (effects : after.effectWaits = before.effectWaits)
    (incidents : after.effectIncidents = before.effectIncidents)
    (locals : after.variables.activities = before.variables.activities)
    (activities : after.activityOccurrences = before.activityOccurrences.filter (fun record =>
      match (generalizing := false) withdrawal with | .unbounded => true | .bounded .. => !decide (record.body = .childScope root.id)))
    (timers : after.timerWaits = match (generalizing := false) withdrawal with
      | .unbounded => before.timerWaits | .bounded _ deadline => before.timerWaits.erase deadline) :
    flowNodeOccurrenceWaitProgramValidity program after = true := by
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior ⊢
  refine ⟨⟨⟨regional_child_user_task_program_validity program before after root.id prior.1.1.1 quiet scopes tasks,
    ?_⟩, ?_⟩, regional_child_effect_program_validity program before after root.id prior.2 quiet scopes effects incidents locals⟩
  · rw [messages, List.all_eq_true]
    intro wait member
    have valid := List.all_eq_true.mp prior.1.1.2 wait member
    have different := (regional_quiescent_wait_owners_differ before root.id quiet).2.1 wait member
    change (occurrenceOwnerValid after wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true
    change (occurrenceOwnerValid before wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true at valid
    simpa only [regional_child_occurrence_owner_frame before after root.id wait.owner _ _ _ scopes different, races] using valid
  · rw [List.all_eq_true]
    intro timer retained
    have member : timer ∈ before.timerWaits := by
      rw [timers] at retained
      cases withdrawal with
      | unbounded => exact retained
      | bounded record deadline => exact List.mem_of_mem_erase retained
    have valid := List.all_eq_true.mp prior.1.2 timer member
    have different := (regional_quiescent_wait_owners_differ before root.id quiet).2.2.1 timer member
    change (occurrenceOwnerValid after timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true
    change (occurrenceOwnerValid before timer.processInstanceId timer.owner timer.elementId timer.activation && _) = true at valid
    simp only [Bool.and_eq_true] at valid ⊢
    refine ⟨(regional_child_occurrence_owner_frame before after root.id timer.owner _ _ _ scopes different).trans valid.1,
      Eq.trans ?_ valid.2⟩
    congr 3
    apply List.filter_congr
    intro candidate candidateMember
    cases candidate <;> try rfl
    case awaitEventRace id origin input message deadline =>
      change (if !operationOwnedBy program _ timer.owner then false else _ && _ && after.eventRaces.any _) = _
      rw [races]
    all_goals rw [completionWithdrawal_boundary_timer_operation_frame program before after scopeId root withdrawal timer _ candidateMember unique children selected scopes tasks activities timers retained]

/-- The actual prepared step preserves every wait-family validator without a successor
validity premise. Complete preparation supplies the selected removal and retained fields. -/
theorem preparedChildComplete_wait_program_validity (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (identities : waitIdentitiesUnique before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceWaitProgramValidity program after = true := by
  obtain ⟨after, withdrawal, applied, fired, withdrawn, children, quiet, scopes, tasks, messages, races, activities, timers⟩ :=
    preparedChildComplete_wait_fields program before id origin definition output prepared identities found
  have snapshots := (prepareInternalRegional_facts program before _ prepared found).1
  have result : completeBoundedScope? program before definition (some output) = some after := by
    simp only [fire?, snapshots] at fired
    change completeBoundedScope? program before definition (some output) = some after at fired
    exact fired
  obtain ⟨effects, incidents, _⟩ := regionalCompletion_effect_and_branch_fields program before after definition (some output) result
  have locals := congrArg ScopedVariables.activities
    (regionalLocalData_completion_variables program before after definition (some output) result)
  exact ⟨after, applied, completionWithdrawal_wait_program_validity program before after definition prepared.selection.root
    withdrawal prior identities quiet children withdrawn scopes tasks messages races effects incidents locals activities timers⟩

theorem regional_child_branch_and_race_validity (before after : RuntimeState) (removed : ScopeOccurrenceId)
    (priorBranches : before.selectedBranchSets.all (fun record => flowNodeOccurrenceOwnerLiveUnique before record.owner) = true)
    (priorRaces : before.eventRaces.all (fun race => flowNodeOccurrenceOwnerLiveUnique before race.owner) = true)
    (quiet : scopeQuiescent before removed = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun child => decide (child.id ≠ removed)))
    (branches : after.selectedBranchSets = before.selectedBranchSets)
    (races : after.eventRaces = before.eventRaces) :
    after.selectedBranchSets.all (fun record => flowNodeOccurrenceOwnerLiveUnique after record.owner) = true ∧
      after.eventRaces.all (fun race => flowNodeOccurrenceOwnerLiveUnique after race.owner) = true := by
  simp only [scopeQuiescent, Bool.and_eq_true, and_assoc] at quiet
  have branchQuiet := quiet.2.2.2.2.2.2.1
  have raceQuiet := quiet.2.2.2.2.2.2.2.1
  rw [branches, races]
  constructor
  · apply List.all_eq_true.mpr
    intro record member
    have different : record.owner ≠ removed := by
      intro same
      have present : (before.selectedBranchSets.any fun candidate => candidate.owner == removed) = true :=
        List.any_eq_true.mpr ⟨record, member, by simp [same]⟩
      simp only [present, Bool.not_true, Bool.false_eq_true] at branchQuiet
    rw [regional_other_owner_census before after removed record.owner scopes different]
    exact List.all_eq_true.mp priorBranches record member
  · apply List.all_eq_true.mpr
    intro race member
    have different : race.owner ≠ removed := by
      intro same
      have present : (before.eventRaces.any fun candidate => candidate.owner == removed) = true :=
        List.any_eq_true.mpr ⟨race, member, by simp [same]⟩
      simp only [present, Bool.not_true, Bool.false_eq_true] at raceQuiet
    rw [regional_other_owner_census before after removed race.owner scopes different]
    exact List.all_eq_true.mp priorRaces race member

theorem preparedChildComplete_program_validity (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (prior : flowNodeOccurrenceProgramValidity program before = true)
    (identities : waitIdentitiesUnique before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceProgramValidity program after = true := by
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at prior
  obtain ⟨after, applied, waits⟩ := preparedChildComplete_wait_program_validity program before id origin definition output
    prepared prior.1.1.2 identities found
  obtain ⟨actual, appliedAgain, quiet, control, calls, scopes⟩ :=
    preparedChildComplete_projection_lookup_fields program before id origin definition output prepared found
  have same : actual = after := Option.some.inj (appliedAgain.symm.trans applied)
  subst actual
  obtain ⟨fieldsAfter, withdrawal, fieldsApplied, fired, _, _, _, _, _, _, races, _⟩ :=
    preparedChildComplete_wait_fields program before id origin definition output prepared identities found
  have sameFields : fieldsAfter = after := Option.some.inj (fieldsApplied.symm.trans applied)
  subst fieldsAfter
  have snapshots := (prepareInternalRegional_facts program before _ prepared found).1
  have result : completeBoundedScope? program before definition (some output) = some after := by
    simp only [fire?, snapshots] at fired
    change completeBoundedScope? program before definition (some output) = some after at fired
    exact fired
  have branches := (regionalCompletion_effect_and_branch_fields program before after definition (some output) result).2.2
  have structural := regional_child_structural_program_validity program before after prepared.selection.root.id
    prior.1.1.1 quiet scopes control calls
  have retained := regional_child_branch_and_race_validity before after prepared.selection.root.id prior.1.2 prior.2
    quiet scopes branches races
  exact ⟨after, applied, by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true]
    exact ⟨⟨⟨structural, waits⟩, retained.1⟩, retained.2⟩⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
