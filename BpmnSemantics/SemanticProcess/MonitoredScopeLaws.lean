import BpmnSemantics.SemanticProcess.MonitoredScope

/-! Quantified monitored-child lifetime laws establish exact subscription withdrawal and arbitrary
parent-handler preservation under the ESL-OWN, ESL-CLOSE and ESL-TIMER account. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- ESL-OWN reuses atomic entry and issues Activity and Timer identities from their own counters. -/
theorem monitored_scope_arm_triple (state : RuntimeState) (owner : ScopeOccurrenceId)
    (origin : BpmnElementOrigin) (child : ScopeOccurrenceId) (arm : BoundaryTimerArm) :
    let after := armScopeDeadline state owner origin child arm
    after.scopeOccurrences = state.scopeOccurrences ∧
    after.timerWaits.length = state.timerWaits.length + 1 ∧
    after.activityOccurrences.length = state.activityOccurrences.length + 1 ∧
    after.timerActivations = setTimerActivationCount state.timerActivations arm.elementId
      (timerActivationCount state arm.elementId + 1) ∧
    after.activityActivations = setActivationCount state.activityActivations ⟨origin.elementId.value⟩
      (activityActivationCount state ⟨origin.elementId.value⟩ + 1) ∧
    after.scopeActivations = state.scopeActivations := by
  exact ⟨rfl, armBoundedScope_adds_one_deadline state owner origin child arm,
    armBoundedScope_records_one_occurrence state owner origin child arm, rfl, rfl, rfl⟩

/-- Exact predecessor censuses make completion's erasure final, without successor validity. -/
theorem monitored_scope_completion_retires_activity (program : Program) (state : RuntimeState)
    (pair : MonitoredScopePair) (bound : MonitoredScopeBinding program state pair) :
    (completeMonitoredScopePair state pair).activityOccurrences.filter
      (sameActivityOccurrence pair.record) = [] := by
  change (state.activityOccurrences.erase pair.record).filter (sameActivityOccurrence pair.record) = []
  rw [← List.erase_filter, bound.2.1.2.2.2.2.2.1]
  simp

theorem monitored_scope_completion_retires_timer (program : Program) (state : RuntimeState)
    (pair : MonitoredScopePair) (timer : TimerWait) (bound : MonitoredScopeBinding program state pair)
    (live : pair.timer = some timer) :
    (completeMonitoredScopePair state pair).timerWaits.filter
      (timerIdNamesWait (boundaryTimerWaitIdentity timer)) = [] := by
  have timerBinding := bound.2.2
  simp only [MonitoredScopeTimerBinding, live] at timerBinding
  change (removeMonitoredScopeTimer state.timerWaits pair.timer).filter _ = []
  rw [live]
  simp only [removeMonitoredScopeTimer]
  rw [← List.erase_filter, timerBinding.2.2.1]
  simp

/-- Handler multiplicity survives normal child completion; no element-based cleanup is used. -/
theorem monitored_scope_completion_handler_frames (state : RuntimeState) (pair : MonitoredScopePair) :
    let after := completeMonitoredScopePair state pair
    after.waits = state.waits ∧ after.messageWaits = state.messageWaits ∧
    after.variables = state.variables ∧ after.logicalTimeMs = state.logicalTimeMs ∧
    after.activations = state.activations ∧ after.activityActivations = state.activityActivations ∧
    after.timerActivations = state.timerActivations ∧ after.messageActivations = state.messageActivations ∧
    after.scopeActivations = state.scopeActivations ∧ after.effectActivations = state.effectActivations ∧
    after.callActivations = state.callActivations ∧ after.eventRaceActivations = state.eventRaceActivations := by
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

theorem monitored_scope_completion_unrelated_records (state : RuntimeState) (pair : MonitoredScopePair) :
    (completeMonitoredScopePair state pair).activityOccurrences.filter
        (fun record => !sameActivityOccurrence pair.record record) =
      state.activityOccurrences.filter (fun record => !sameActivityOccurrence pair.record record) := by
  change (state.activityOccurrences.erase pair.record).filter _ = _
  rw [← List.erase_filter]
  apply List.erase_of_not_mem
  simp [List.mem_filter, sameActivityOccurrence]

theorem monitored_scope_completion_unrelated_timers (state : RuntimeState) (pair : MonitoredScopePair)
    (timer : TimerWait) (live : pair.timer = some timer) :
    (completeMonitoredScopePair state pair).timerWaits.filter
        (fun wait => !timerIdNamesWait (boundaryTimerWaitIdentity timer) wait) =
      state.timerWaits.filter (fun wait => !timerIdNamesWait (boundaryTimerWaitIdentity timer) wait) := by
  change (removeMonitoredScopeTimer state.timerWaits pair.timer).filter _ = _
  rw [live]
  simp only [removeMonitoredScopeTimer]
  rw [← List.erase_filter]
  apply List.erase_of_not_mem
  simp [List.mem_filter, timerIdNamesWait, boundaryTimerWaitIdentity]

/-- The firing relation preserves the child and every prior Task/Message handler occurrence. -/
theorem monitored_scope_firing_host_frames (program : Program) (identity : TimerOccurrenceId)
    (time : Nat) (before after : RuntimeState)
    (step : MonitoredScopeSpawnStep program identity time before after) :
    after.scopeOccurrences = before.scopeOccurrences ∧ after.waits = before.waits ∧
    after.messageWaits = before.messageWaits ∧ after.scopeActivations = before.scopeActivations ∧
    after.activityActivations = before.activityActivations := by
  cases step with
  | spawn pair timer _ _ _ _ fired =>
      have frame := noninterrupting_boundary_timer_host_frames before after pair.record timer pair.definition.timer fired
      exact ⟨frame.2.2.1, frame.1, frame.2.1, frame.2.2.2.2.2.2.2.1, frame.2.2.2.2.2.1⟩

/-- Recurrence cannot use the consumed one-shot representation. -/
theorem monitored_scope_recurring_requires_deadline (program : Program) (state : RuntimeState)
    (pair : MonitoredScopePair) (bound : MonitoredScopeBinding program state pair)
    (recurring : pair.definition.timer.recurrence = some .repeating) :
    ∃ timer, pair.timer = some timer ∧
      state.timerWaits.filter (timerIdNamesWait (boundaryTimerWaitIdentity timer)) = [timer] := by
  have timerBinding := bound.2.2
  cases live : pair.timer with
  | none => simp [MonitoredScopeTimerBinding, live, recurring] at timerBinding
  | some timer =>
      simp only [MonitoredScopeTimerBinding, live] at timerBinding
      exact ⟨timer, rfl, timerBinding.2.2.1⟩

/-- Empty attachment is accepted only with an immutable one-shot declaration and no orphan wait. -/
theorem monitored_scope_absent_deadline_is_one_shot (program : Program) (state : RuntimeState)
    (pair : MonitoredScopePair) (bound : MonitoredScopeBinding program state pair)
    (absent : pair.timer = none) :
    pair.definition.timer.recurrence = none ∧ pair.record.attachedHandlers = [] ∧
    (completeMonitoredScopePair state pair).timerWaits = state.timerWaits := by
  have timerBinding := bound.2.2
  simp only [MonitoredScopeTimerBinding, absent] at timerBinding
  exact ⟨timerBinding.1, timerBinding.2.1, by simp [completeMonitoredScopePair, absent, removeMonitoredScopeTimer]⟩

/-- Binding and quiescence suffice for completion; no evaluator equality or poststate premise is assumed. -/
theorem monitored_scope_completion_enabled (program : Program) (state : RuntimeState)
    (pair : MonitoredScopePair) (bound : MonitoredScopeBinding program state pair)
    (quiet : scopeQuiescent state pair.child.id = true) :
    completeMonitoredScope? program state pair.definition.childScopeId (some pair.output) =
      some (completeMonitoredScopePair state pair) := by
  obtain ⟨unique, _, parent, parentCensus, _, _, _, _, _, _, running⟩ := bound.2.1
  have parentMember : pair.parent ∈ state.scopeOccurrences :=
    (List.mem_filter.mp (show pair.parent ∈ state.scopeOccurrences.filter (fun value => decide (value.id = pair.parent.id)) by
      rw [parentCensus]; simp)).1
  have parentPresent : (state.scopeOccurrences.any fun value => value.id == pair.parent.id) = true :=
    List.any_eq_true.mpr ⟨pair.parent, parentMember, by simp⟩
  simp [completeMonitoredScope?, monitoredScopePairForChild_complete program state pair bound,
    completeScopeState?, unique, quiet, completeQuiescentScope?, parent, running,
    parentPresent, completeMonitoredScopePair]

/-- Missing the selected recurring wait invalidates binding even with arbitrary unrelated timers. -/
theorem monitored_scope_missing_recurring_refuses_binding (program : Program) (state : RuntimeState)
    (pair : MonitoredScopePair) (recurring : pair.definition.timer.recurrence = some .repeating)
    (missing : state.timerWaits.filter (monitoredScopeTimerNames pair) = []) :
    ¬ MonitoredScopeBinding program state pair := by
  intro bound
  have timerBinding := bound.2.2
  cases live : pair.timer with
  | none => simp [MonitoredScopeTimerBinding, live, recurring] at timerBinding
  | some timer => simp [MonitoredScopeTimerBinding, live, missing] at timerBinding

/-- Consumed one-shot completion needs only exact predecessor binding and child quiescence. -/
theorem monitored_scope_consumed_one_shot_completes (program : Program) (state : RuntimeState)
    (pair : MonitoredScopePair) (bound : MonitoredScopeBinding program state pair)
    (absent : pair.timer = none) (quiet : scopeQuiescent state pair.child.id = true) :
    completeMonitoredScope? program state pair.definition.childScopeId (some pair.output) =
      some (completeMonitoredScopePair state pair) ∧
    (completeMonitoredScopePair state pair).timerWaits = state.timerWaits := by
  exact ⟨monitored_scope_completion_enabled program state pair bound quiet,
    (monitored_scope_absent_deadline_is_one_shot program state pair bound absent).2.2⟩

theorem completeMonitoredScopePair_activity_identity_discipline (state : RuntimeState)
    (pair : MonitoredScopePair) :
    activityIdentityIssuingDiscipline state (completeMonitoredScopePair state pair) = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  intro record present
  exact List.mem_of_mem_erase present

theorem completeMonitoredScope_activity_identity_discipline (program : Program)
    (before after : RuntimeState) (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (success : completeMonitoredScope? program before scopeId parentOutput = some after) :
    activityIdentityIssuingDiscipline before after = true := by
  cases completeMonitoredScope_sound program before after scopeId parentOutput success
  exact completeMonitoredScopePair_activity_identity_discipline _ _

end BpmnSemantics.SemanticProcess
