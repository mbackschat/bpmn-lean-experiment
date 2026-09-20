import BpmnSemantics.SemanticProcess.InternalRegionalRemovalValidity
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceWaitProgramValidity

/-! AOO-CANCEL-01 makes every Activity claiming a surviving Timer survive with it.
These exact census frames include malformed populations and both root dispositions;
they use the actual removal filters, not an assumed successor invariant. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

theorem cancelScopeSubtree_timer_host_retained (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (timer : TimerWait) (record : ActivityOccurrence)
    (survives : timer ∈ (cancelScopeSubtree state root disposition).timerWaits)
    (member : record ∈ state.activityOccurrences)
    (attached : recordAttaches record
      { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } = true) :
    record ∈ (cancelScopeSubtree state root disposition).activityOccurrences := by
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  have outside : recordInRegion cancelled record = false := by
    apply Bool.eq_false_iff.mpr
    intro withdrawn
    have listed := withdrawn_records_carry_their_attached_timers cancelled state.activityOccurrences record
      { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation }
      (List.mem_filter.mpr ⟨member, withdrawn⟩) (by simpa [recordAttaches] using attached)
    have names : anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences)) timer = true :=
      List.any_eq_true.mpr ⟨_, listed, by simp [timerIdNamesWait]⟩
    have absent := cancelScopeSubtree_withdraws_listed_timers state root disposition timer survives
    rw [show anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences)) timer = false from absent] at names
    contradiction
  exact List.mem_filter.mpr ⟨member, by simpa only [Bool.not_eq_true'] using outside⟩

theorem cancelScopeSubtree_timer_host_census (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (timer : TimerWait)
    (beforeMatches afterMatches : ActivityOccurrence → Bool)
    (survives : timer ∈ (cancelScopeSubtree state root disposition).timerWaits)
    (frame : ∀ record ∈ state.activityOccurrences, recordAttaches record
      { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } = true →
      afterMatches record = beforeMatches record) :
    ((cancelScopeSubtree state root disposition).activityOccurrences.filter fun record =>
      record.owner = timer.owner && recordAttaches record
        { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } &&
          afterMatches record) =
    (state.activityOccurrences.filter fun record => record.owner = timer.owner && recordAttaches record
      { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } &&
        beforeMatches record) := by
  change (state.activityOccurrences.filter _).filter _ = _
  rw [List.filter_filter]
  apply List.filter_congr
  intro record member
  by_cases attached : recordAttaches record
      { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } = true
  · have retained := cancelScopeSubtree_timer_host_retained state root disposition timer record survives member attached
    have kept := (List.mem_filter.mp retained).2
    simp only [frame record member attached, kept, Bool.and_true]
  · simp only [Bool.eq_false_iff.mpr attached, Bool.and_false, Bool.false_and]

theorem cancelScopeSubtree_timer_task_hosts (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (timer : TimerWait) (task : BoundedTaskArm)
    (record : ActivityOccurrence)
    (survives : timer ∈ (cancelScopeSubtree state root disposition).timerWaits) :
    ((cancelScopeSubtree state root disposition).waits.filter fun host =>
      decide (host.owner = timer.owner && host.task.id = task.id) && recordBodyNamesWait host record) =
    (state.waits.filter fun host =>
      decide (host.owner = timer.owner && host.task.id = task.id) && recordBodyNamesWait host record) := by
  have outside := (List.mem_filter.mp survives).2
  simp only [Bool.and_eq_true, Bool.not_eq_true'] at outside
  change (state.waits.filter _).filter _ = _
  rw [List.filter_filter]
  apply List.filter_congr
  intro host member
  by_cases same : host.owner = timer.owner
  · simp only [same, outside.1, Bool.not_false, Bool.and_true]
  · simp [same]

theorem cancelScopeSubtree_retained_scope_body_census (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (record : ActivityOccurrence)
    (predicate : RuntimeScopeOccurrence → Bool)
    (retained : record ∈ (cancelScopeSubtree state root disposition).activityOccurrences) :
    ((cancelScopeSubtree state root disposition).scopeOccurrences.filter fun scope =>
      predicate scope && activityBodyScope? record == some scope.id) =
    (state.scopeOccurrences.filter fun scope => predicate scope && activityBodyScope? record == some scope.id) := by
  change (state.scopeOccurrences.filter _).filter _ = _
  rw [List.filter_filter]
  apply List.filter_congr
  intro scope member
  by_cases bodyMatches : (activityBodyScope? record == some scope.id) = true
  · have body : record.body = .childScope scope.id := by
      cases shape : record.body <;> simp_all [activityBodyScope?, beq_iff_eq]
    have outside := retained_child_scope_body_survives _ state.activityOccurrences record scope.id retained body
    cases disposition with
    | retain =>
        change (predicate scope && (activityBodyScope? record == some scope.id) &&
          (decide (scope.id = root) || !(occurrenceInSubtree state.scopeOccurrences root scope.id ||
            (calledInstanceClosure state root).contains scope.id.processInstanceId))) = _
        simp only [outside, Bool.not_false, Bool.or_true, Bool.and_true]
    | remove =>
        change (predicate scope && (activityBodyScope? record == some scope.id) &&
          !(occurrenceInSubtree state.scopeOccurrences root scope.id ||
            (calledInstanceClosure state root).contains scope.id.processInstanceId)) = _
        simp only [outside, Bool.not_false, Bool.and_true]
  · cases disposition <;> simp [Bool.eq_false_iff.mpr bodyMatches]

theorem cancelScopeSubtree_boundary_timer_operation_frame (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) (timer : TimerWait)
    (candidate : SemanticOperation)
    (survives : timer ∈ (cancelScopeSubtree state root disposition).timerWaits) :
    boundaryTimerOperationMatches program (cancelScopeSubtree state root disposition) timer candidate =
      boundaryTimerOperationMatches program state timer candidate := by
  cases candidate <;> try rfl
  case awaitBoundedUserTask id origin input task boundary =>
    have hosts := cancelScopeSubtree_timer_host_census state root disposition timer
      (fun record => decide ((state.waits.filter fun host =>
        decide (host.owner = timer.owner && host.task.id = task.id) && recordBodyNamesWait host record).length = 1))
      (fun record => decide (((cancelScopeSubtree state root disposition).waits.filter fun host =>
        decide (host.owner = timer.owner && host.task.id = task.id) && recordBodyNamesWait host record).length = 1)) survives
      (by intro record _ _; rw [cancelScopeSubtree_timer_task_hosts state root disposition timer task record survives])
    exact congrArg (fun records : List ActivityOccurrence =>
      if !operationOwnedBy program (.awaitBoundedUserTask id origin input task boundary) timer.owner then false
      else boundary.elementId = timer.elementId && boundary.output = timer.output && records.length = 1) hosts
  case awaitMonitoredUserTask id origin input task boundary =>
    have hosts := cancelScopeSubtree_timer_host_census state root disposition timer
      (fun record => decide ((state.waits.filter fun host =>
        decide (host.owner = timer.owner && host.task.id = task.id) && recordBodyNamesWait host record).length = 1))
      (fun record => decide (((cancelScopeSubtree state root disposition).waits.filter fun host =>
        decide (host.owner = timer.owner && host.task.id = task.id) && recordBodyNamesWait host record).length = 1)) survives
      (by intro record _ _; rw [cancelScopeSubtree_timer_task_hosts state root disposition timer task record survives])
    exact congrArg (fun records : List ActivityOccurrence =>
      if !operationOwnedBy program (.awaitMonitoredUserTask id origin input task boundary) timer.owner then false
      else boundary.elementId = timer.elementId && boundary.output = timer.output && records.length = 1) hosts
  case awaitSequentialMultiInstanceUserTask id origin input task data output boundary limits =>
    have hosts := cancelScopeSubtree_timer_host_census state root disposition timer
      (fun record => match activityBodyTask? record with
        | some body => body.elementId.value = task.id.value | none => false) _ survives (by intros; rfl)
    exact congrArg (fun records : List ActivityOccurrence =>
      if !operationOwnedBy program (.awaitSequentialMultiInstanceUserTask id origin input task data output boundary limits) timer.owner then false
      else boundary.elementId = timer.elementId && boundary.output = timer.output && records.length = 1) hosts
  case awaitParallelMultiInstanceUserTask id origin input taskId taskName data output boundary condition limits =>
    have hosts := cancelScopeSubtree_timer_host_census state root disposition timer
      (fun record => match activityBodyParallelTasks? record with
        | some children => children.all fun child => child.elementId.value = taskId.value | none => false) _ survives (by intros; rfl)
    exact congrArg (fun records : List ActivityOccurrence =>
      if !operationOwnedBy program (.awaitParallelMultiInstanceUserTask id origin input taskId taskName data output boundary condition limits) timer.owner then false
      else boundary.elementId = timer.elementId && boundary.output = timer.output && records.length = 1) hosts
  case enterBoundedScope id origin input entry definition boundary =>
    have hosts := cancelScopeSubtree_timer_host_census state root disposition timer
      (fun record => decide ((state.scopeOccurrences.filter fun child =>
        decide (child.id.definitionScopeId = definition && child.parent = some timer.owner) &&
          activityBodyScope? record == some child.id).length = 1))
      (fun record => decide (((cancelScopeSubtree state root disposition).scopeOccurrences.filter fun child =>
        decide (child.id.definitionScopeId = definition && child.parent = some timer.owner) &&
          activityBodyScope? record == some child.id).length = 1)) survives
      (by
        intro record recordMember attached
        rw [cancelScopeSubtree_retained_scope_body_census state root disposition record _
          (cancelScopeSubtree_timer_host_retained state root disposition timer record survives recordMember attached)])
    exact congrArg (fun records : List ActivityOccurrence =>
      if !operationOwnedBy program (.enterBoundedScope id origin input entry definition boundary) timer.owner then false
      else boundary.elementId = timer.elementId && boundary.output = timer.output && records.length = 1) hosts

theorem cancelScopeSubtree_boundary_timer_frame (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) (timer : TimerWait)
    (survives : timer ∈ (cancelScopeSubtree state root disposition).timerWaits) :
    flowNodeOccurrenceBoundaryTimerBound program (cancelScopeSubtree state root disposition) timer =
      flowNodeOccurrenceBoundaryTimerBound program state timer := by
  unfold flowNodeOccurrenceBoundaryTimerBound
  congr 3
  apply List.filter_congr
  intro candidate _
  exact cancelScopeSubtree_boundary_timer_operation_frame program state root disposition timer candidate survives

end BpmnSemantics.SemanticProcess.InternalCommutation
