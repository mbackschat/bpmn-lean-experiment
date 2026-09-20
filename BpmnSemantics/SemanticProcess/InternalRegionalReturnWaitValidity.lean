import BpmnSemantics.SemanticProcess.InternalRegionalReturnEffectValidity

/-! Return removes one parentless scope and its owned Activities. Surviving Timer and
Message waits retain their exact candidate censuses, including rejected candidates;
the parentless root cannot be a bounded-scope Timer host. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

theorem regional_return_scope_filter_frame (before after : RuntimeState)
    (root : RuntimeScopeOccurrence) (predicate : RuntimeScopeOccurrence → Bool)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id = root.id)) = [root])
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ root.id)))
    (excluded : predicate root = false) :
    after.scopeOccurrences.filter predicate = before.scopeOccurrences.filter predicate := by
  rw [scopes, List.filter_filter]
  apply List.filter_congr
  intro scope member
  by_cases same : scope.id = root.id
  · have selected : scope ∈ before.scopeOccurrences.filter (fun scope => decide (scope.id = root.id)) :=
      List.mem_filter.mpr ⟨member, by simp [same]⟩
    rw [census] at selected
    have identical := List.mem_singleton.mp selected
    subst scope
    simp [excluded]
  · simp [same]

theorem regional_return_activity_filter_frame (before after : RuntimeState)
    (removed : ScopeOccurrenceId) (predicate : ActivityOccurrence → Bool)
    (activities : after.activityOccurrences = before.activityOccurrences.filter (fun record => decide (record.owner ≠ removed)))
    (excluded : ∀ record ∈ before.activityOccurrences, record.owner = removed → predicate record = false) :
    after.activityOccurrences.filter predicate = before.activityOccurrences.filter predicate := by
  rw [activities, List.filter_filter]
  apply List.filter_congr
  intro record member
  by_cases same : record.owner = removed
  · simp [excluded record member same]
  · simp [same]

theorem regional_return_boundary_timer_operation_frame (program : Program) (before after : RuntimeState)
    (root : RuntimeScopeOccurrence) (timer : TimerWait)
    (candidate : SemanticOperation)
    (parentless : root.parent = none) (different : timer.owner ≠ root.id)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id = root.id)) = [root])
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ root.id)))
    (tasks : after.waits = before.waits)
    (activities : after.activityOccurrences = before.activityOccurrences.filter (fun record => decide (record.owner ≠ root.id))) :
    boundaryTimerOperationMatches program after timer candidate =
      boundaryTimerOperationMatches program before timer candidate := by
  cases candidate <;> try rfl
  case awaitBoundedUserTask id origin input task boundary =>
    change (if !operationOwnedBy program _ timer.owner then false else _ && _ && decide (_ = 1)) = _
    rw [tasks]
    rw [regional_return_activity_filter_frame before after root.id _ activities]
    · rfl
    · intro record _ owner
      simp [owner, Ne.symm different]
  case awaitMonitoredUserTask id origin input task boundary =>
    change (if !operationOwnedBy program _ timer.owner then false else _ && _ && decide (_ = 1)) = _
    rw [tasks]
    rw [regional_return_activity_filter_frame before after root.id _ activities]
    · rfl
    · intro record _ owner
      simp [owner, Ne.symm different]
  case awaitSequentialMultiInstanceUserTask id origin input task data output boundary limits =>
    change (if !operationOwnedBy program _ timer.owner then false else _ && _ && decide (_ = 1)) = _
    rw [regional_return_activity_filter_frame before after root.id _ activities]
    · rfl
    · intro record _ owner
      simp [owner, Ne.symm different]
  case awaitParallelMultiInstanceUserTask id origin input taskId taskName data output boundary condition limits =>
    change (if !operationOwnedBy program _ timer.owner then false else _ && _ && decide (_ = 1)) = _
    rw [regional_return_activity_filter_frame before after root.id _ activities]
    · rfl
    · intro record _ owner
      simp [owner, Ne.symm different]
  case enterBoundedScope id origin input entry definition boundary =>
    change (if !operationOwnedBy program _ timer.owner then false else _ && _ && decide (_ = 1)) = _
    rw [regional_return_activity_filter_frame before after root.id _ activities]
    · have counts (record : ActivityOccurrence) := regional_return_scope_filter_frame before after root
        (fun child => decide (child.id.definitionScopeId = definition && child.parent = some timer.owner) &&
          activityBodyScope? record == some child.id) census scopes (by simp [parentless])
      simp only [counts]
      rfl
    · intro record _ owner
      simp [owner, Ne.symm different]

theorem regional_return_boundary_timer_frame (program : Program) (before after : RuntimeState)
    (root : RuntimeScopeOccurrence) (timer : TimerWait)
    (parentless : root.parent = none) (different : timer.owner ≠ root.id)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id = root.id)) = [root])
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ root.id)))
    (tasks : after.waits = before.waits)
    (activities : after.activityOccurrences = before.activityOccurrences.filter (fun record => decide (record.owner ≠ root.id))) :
    flowNodeOccurrenceBoundaryTimerBound program after timer = flowNodeOccurrenceBoundaryTimerBound program before timer := by
  unfold flowNodeOccurrenceBoundaryTimerBound
  congr 3
  apply List.filter_congr
  intro candidate _
  exact regional_return_boundary_timer_operation_frame program before after root timer candidate parentless different census scopes tasks activities

theorem regional_return_wait_program_validity (program : Program) (before after : RuntimeState)
    (root : RuntimeScopeOccurrence)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (effectValid : flowNodeOccurrenceEffectProgramValidity program after = true)
    (parentless : root.parent = none) (quiet : scopeQuiescent before root.id = true)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id = root.id)) = [root])
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ root.id)))
    (tasks : after.waits = before.waits) (messages : after.messageWaits = before.messageWaits)
    (timers : after.timerWaits = before.timerWaits) (races : after.eventRaces = before.eventRaces)
    (activities : after.activityOccurrences = before.activityOccurrences.filter (fun record => decide (record.owner ≠ root.id))) :
    flowNodeOccurrenceWaitProgramValidity program after = true := by
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior ⊢
  refine ⟨⟨⟨regional_child_user_task_program_validity program before after root.id prior.1.1.1 quiet scopes tasks,
    ?_⟩, ?_⟩, effectValid⟩
  · rw [messages, List.all_eq_true]
    intro wait member
    have valid := List.all_eq_true.mp prior.1.1.2 wait member
    have different := (regional_quiescent_wait_owners_differ before root.id quiet).2.1 wait member
    change (occurrenceOwnerValid after wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true
    change (occurrenceOwnerValid before wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true at valid
    simpa only [regional_child_occurrence_owner_frame before after root.id wait.owner _ _ _ scopes different, races] using valid
  · rw [timers, List.all_eq_true]
    intro timer member
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
    all_goals rw [regional_return_boundary_timer_operation_frame program before after root timer _ parentless different census scopes tasks activities]

theorem preparedReturn_wait_program_validity (program : Program) (before : RuntimeState)
    (expected : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (process : ProcessId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program expected before = true)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceWaitProgramValidity program after = true := by
  have priorEffects : flowNodeOccurrenceEffectProgramValidity program before = true := by
    have parts := prior
    simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at parts
    exact parts.2
  obtain ⟨after, applied, effectValid⟩ := preparedReturn_effect_program_validity program before expected id origin
    process definition output prepared valid priorEffects found
  obtain ⟨actual, record, root, appliedAgain, _, _, _, parentless, quiet, _, scopes, tasks, messages, timers,
      _, _, activities, _, races, census⟩ :=
    preparedReturn_quiescent_fields program before expected id origin process definition output prepared valid found
  have same : actual = after := Option.some.inj (appliedAgain.symm.trans applied)
  have actualEffect : flowNodeOccurrenceEffectProgramValidity program actual = true := same ▸ effectValid
  have actualValid := regional_return_wait_program_validity program before actual root prior actualEffect
    parentless quiet census scopes tasks messages timers races activities
  exact ⟨after, applied, same ▸ actualValid⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
