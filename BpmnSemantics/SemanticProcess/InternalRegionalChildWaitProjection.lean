import BpmnSemantics.SemanticProcess.InternalRegionalChildProjectionValidity

/-! Child completion preserves the exact ordered wait projection. Its withdrawn Timer
was already private, and every retained wait keeps its complete owner/Process lookup. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regional_child_wait_mapM (program : Program) (before after : RuntimeState)
    (removed : ScopeOccurrenceId) (values : List α)
    (owner : α → ScopeOccurrenceId) (element : α → NodeId) (activation : α → Nat)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun child => decide (child.id ≠ removed)))
    (control : after.control = before.control)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (different : ∀ value ∈ values, owner value ≠ removed) :
    values.mapM (fun value => waitStart? program after (owner value) (element value) (activation value)) =
      values.mapM (fun value => waitStart? program before (owner value) (element value) (activation value)) := by
  induction values with
  | nil => rfl
  | cons head tail ih =>
      simp only [List.mapM_cons]
      rw [regional_child_wait_start_frame program before after removed (owner head) (element head) (activation head)
        scopes control calls (different head List.mem_cons_self)]
      rw [ih (fun value member => different value (List.mem_cons_of_mem head member))]

theorem completionWithdrawal_public_timers_frame (program : Program) (before after : RuntimeState)
    (definition : DefinitionScopeId) {output : Option ControlPlaceId} (withdrawal : InternalCompletionWithdrawal)
    (programValid : programWellFormed program = true)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (unique : waitIdentitiesUnique before = true)
    (selected : selectSubscribedCompletionWithdrawal? program before definition output = some withdrawal)
    (timers : after.timerWaits = match (generalizing := false) withdrawal with
      | .unbounded => before.timerWaits | .bounded _ deadline => before.timerWaits.erase deadline
      | .monitored _ deadline => removeMonitoredScopeTimer before.timerWaits deadline)
    (visibility : ∀ timer ∈ after.timerWaits, flowNodeOccurrenceBoundaryTimerBound program after timer =
      flowNodeOccurrenceBoundaryTimerBound program before timer) :
    after.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program after timer) =
      before.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program before timer) := by
  have frame : after.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program after timer) =
      after.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program before timer) := by
    apply List.filter_congr
    intro timer member
    rw [visibility timer member]
  have eraseFrame (deadline : TimerWait) (hidden : flowNodeOccurrenceBoundaryTimerBound program before deadline = true) :
      (before.timerWaits.erase deadline).filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program before timer) =
        before.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program before timer) := by
    have identities := unique
    simp only [waitIdentitiesUnique, Bool.and_eq_true, and_assoc] at identities
    have nodup := occurrence_uniqueness_implies_nodup timerWaitKeyMatches
      (by intro wait; simp [timerWaitKeyMatches]) before.timerWaits identities.2.2.1
    rw [nodup.erase_eq_filter, List.filter_filter]
    apply List.filter_congr
    intro timer member
    by_cases same : timer = deadline
    · subst timer
      simp [hidden]
    · simp [same]
  rw [frame, timers]
  cases withdrawal with
  | unbounded => rfl
  | bounded record deadline =>
      exact eraseFrame deadline (completionWithdrawal_deadline_binding program before definition record deadline
        programValid prior (subscribedWithdrawal_bounded_selection program before definition output _ _ selected))
  | monitored record deadline =>
      cases deadline with
      | none => rfl
      | some timer =>
          obtain ⟨pair, _, _, _, _, _, timerEq⟩ :=
            subscribedWithdrawal_monitored_facts program before definition output record (some timer) selected
          have binding := pair.property.2.2
          simp only [MonitoredScopeTimerBinding, timerEq] at binding
          have timerMember := List.mem_filter.mp (show timer ∈ before.timerWaits.filter (monitoredScopeTimerNames pair.val) by
            rw [binding.2.1]; simp)
          have element : timer.elementId = pair.val.definition.timer.elementId :=
            (of_decide_eq_true timerMember.2).1
          have declaration : pair.val.definition ∈ monitoredScopeDefinitions program :=
            (List.mem_filter.mp (show pair.val.definition ∈ (monitoredScopeDefinitions program).filter
              (fun candidate => decide (candidate.childScopeId = pair.val.definition.childScopeId)) by
                rw [pair.property.1.1]; simp)).1
          have entryMember : .enterMonitoredScope pair.val.definition.id pair.val.definition.origin pair.val.definition.input
              pair.val.definition.childEntry pair.val.definition.childScopeId pair.val.definition.timer ∈ program.operations := by
            generalize definitionEq : pair.val.definition = declared at declaration ⊢
            obtain ⟨operation, member, matching⟩ := List.mem_filterMap.mp declaration
            cases operation <;> simp at matching
            cases matching
            exact member
          have hidden := (valid_scope_boundary_timer_binding program before timer _
            pair.val.definition.id pair.val.definition.origin pair.val.definition.input pair.val.definition.childEntry
            pair.val.definition.childScopeId pair.val.definition.timer programValid prior timerMember.1 entryMember
            (.inr rfl) element).1
          exact eraseFrame timer hidden

theorem preparedChildComplete_wait_projection (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (programValid : programWellFormed program = true)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (identities : waitIdentitiesUnique before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      projectWaits? program after = projectWaits? program before := by
  obtain ⟨after, withdrawal, applied, fired, withdrawn, children, quiet, scopes, tasks, messages, _, _, timers⟩ :=
    preparedChildComplete_wait_fields program before id origin definition output prepared identities found
  obtain ⟨actual, appliedAgain, _, control, calls, _⟩ :=
    preparedChildComplete_projection_lookup_fields program before id origin definition output prepared found
  have same : actual = after := Option.some.inj (appliedAgain.symm.trans applied)
  subst actual
  obtain ⟨visibilityAfter, visibilityApplied, visibility⟩ :=
    preparedChildComplete_boundary_timer_frame program before id origin definition output prepared identities found
  have sameVisibility : visibilityAfter = after := Option.some.inj (visibilityApplied.symm.trans applied)
  subst visibilityAfter
  have publicTimers := completionWithdrawal_public_timers_frame program before after definition withdrawal
    programValid prior identities withdrawn timers visibility
  have snapshots := (prepareInternalRegional_facts program before _ prepared found).1
  have result : completeSelectedScope? program before definition (some output) = some after := by
    simp only [fire?, snapshots] at fired
    change completeSelectedScope? program before definition (some output) = some after at fired
    exact fired
  obtain ⟨effects, incidents, _⟩ := regionalSelectedCompletion_effect_and_branch_fields program before after definition (some output) result
  have owners := regional_quiescent_wait_owners_differ before prepared.selection.root.id quiet
  have taskProjection := regional_child_wait_mapM program before after prepared.selection.root.id before.waits
    (·.owner) (fun wait => ⟨wait.task.id.value⟩) (·.activation) scopes control calls owners.1
  have messageProjection := regional_child_wait_mapM program before after prepared.selection.root.id before.messageWaits
    (·.owner) (·.elementId) (·.activation) scopes control calls owners.2.1
  have timerProjection := regional_child_wait_mapM program before after prepared.selection.root.id
    (before.timerWaits.filter fun timer => !flowNodeOccurrenceBoundaryTimerBound program before timer)
    (·.owner) (·.elementId) (·.activation) scopes control calls
    (fun timer member => owners.2.2.1 timer (List.mem_filter.mp member).1)
  have effectProjection := regional_child_wait_mapM program before after prepared.selection.root.id before.effectWaits
    (·.owner) (·.elementId) (·.activation) scopes control calls owners.2.2.2.1
  have incidentProjection := regional_child_wait_mapM program before after prepared.selection.root.id before.effectIncidents
    (·.wait.owner) (·.wait.elementId) (·.wait.activation) scopes control calls owners.2.2.2.2.1
  refine ⟨after, applied, ?_⟩
  simp only [projectWaits?, tasks, messages, publicTimers, effects, incidents,
    taskProjection, messageProjection, timerProjection, effectProjection, incidentProjection]

end BpmnSemantics.SemanticProcess.InternalCommutation
