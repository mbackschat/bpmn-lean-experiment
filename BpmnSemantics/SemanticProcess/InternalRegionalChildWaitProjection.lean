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
    (definition : DefinitionScopeId) (withdrawal : InternalCompletionWithdrawal)
    (programValid : programWellFormed program = true)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (unique : waitIdentitiesUnique before = true)
    (selected : selectInternalCompletionWithdrawal? program before definition = some withdrawal)
    (timers : after.timerWaits = match (generalizing := false) withdrawal with
      | .unbounded => before.timerWaits | .bounded _ deadline => before.timerWaits.erase deadline)
    (visibility : ∀ timer ∈ after.timerWaits, flowNodeOccurrenceBoundaryTimerBound program after timer =
      flowNodeOccurrenceBoundaryTimerBound program before timer) :
    after.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program after timer) =
      before.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program before timer) := by
  have frame : after.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program after timer) =
      after.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program before timer) := by
    apply List.filter_congr
    intro timer member
    rw [visibility timer member]
  rw [frame, timers]
  cases withdrawal with
  | unbounded => rfl
  | bounded record deadline =>
      have hidden := completionWithdrawal_deadline_binding program before definition record deadline
        programValid prior selected
      simp only [waitIdentitiesUnique, Bool.and_eq_true, and_assoc] at unique
      have nodup := occurrence_uniqueness_implies_nodup timerWaitKeyMatches
        (by intro wait; simp [timerWaitKeyMatches]) before.timerWaits unique.2.2.1
      dsimp only
      rw [nodup.erase_eq_filter, List.filter_filter]
      apply List.filter_congr
      intro timer member
      by_cases same : timer = deadline
      · subst timer
        simp [hidden]
      · simp [same]

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
  have result : completeBoundedScope? program before definition (some output) = some after := by
    simp only [fire?, snapshots] at fired
    change completeBoundedScope? program before definition (some output) = some after at fired
    exact fired
  obtain ⟨effects, incidents, _⟩ := regionalCompletion_effect_and_branch_fields program before after definition (some output) result
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
