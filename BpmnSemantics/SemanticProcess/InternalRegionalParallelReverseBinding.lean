import BpmnSemantics.SemanticProcess.InternalRegionalParallelCensus
import BpmnSemantics.SemanticProcess.InternalRegionalOrderFacts

/-! Actual regional cleanup preserves complete PMI bindings by retaining whole controller,
Activity, pending-child, and Timer groups. The predecessor flow-node ownership fact joins the
different Process-identity and owner filters used by cancellation and Call cleanup. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem scoped_parallel_counts_retained (program : Program) (state : RuntimeState)
    (keepController : ParallelMultiInstanceController → Bool)
    (keepRecord : ActivityOccurrence → Bool) (keepTask : UserTaskWait → Bool)
    (keepTimer : TimerWait → Bool)
    (entry : SemanticOperation) (arm : ParallelMultiInstanceArm) (scope : DefinitionScopeId)
    (entryMem : entry ∈ program.operations)
    (projects : ParallelMultiInstanceArm.ofOperation? entry = some arm)
    (owningScope : operationOwningScope? program entry.id = some scope)
    (bindings : parallelMultiInstanceProgramBindingsValid program state = true)
    (bodyClaims : activityBodyClaimsUnique state.activityOccurrences = true)
    (timerClaims : attachedTimersUnambiguous state = true)
    (retention : ∀ controller ∈ state.parallelMultiInstanceControllers,
      ∀ tuple : RegionalParallelBindingTuple program state controller entry arm,
      keepController controller = keepRecord tuple.record ∧
      (∀ wait ∈ state.waits, regionalParallelNamesTask controller wait = true →
        keepRecord tuple.record = keepTask wait) ∧
      keepRecord tuple.record = keepTimer tuple.timer) :
    let controllers := state.parallelMultiInstanceControllers.filter fun controller =>
      controller.id.activityElementId.value == arm.taskId.value
    let records := state.activityOccurrences.filter fun record =>
      record.activityElementId.value == arm.taskId.value && record.owner.definitionScopeId == scope &&
        (activityBodyParallelTasks? record).isSome
    let tasks := state.waits.filter fun wait =>
      wait.task.id == arm.taskId && wait.owner.definitionScopeId == scope
    let timers := state.timerWaits.filter fun wait =>
      wait.elementId == arm.boundaryTimer.elementId && wait.owner.definitionScopeId == scope
    (controllers.filter keepController).length = (records.filter keepRecord).length ∧
      (controllers.filter keepController).length = (timers.filter keepTimer).length ∧
      (tasks.filter keepTask).length = (controllers.filter keepController).foldl
        (fun count controller => count + (pendingParallelTaskIds controller.slots).length) 0 := by
  dsimp only
  let controllers := state.parallelMultiInstanceControllers.filter fun controller =>
    controller.id.activityElementId.value == arm.taskId.value
  let records := state.activityOccurrences.filter fun record =>
    record.activityElementId.value == arm.taskId.value && record.owner.definitionScopeId == scope &&
      (activityBodyParallelTasks? record).isSome
  let tasks := state.waits.filter fun wait =>
    wait.task.id == arm.taskId && wait.owner.definitionScopeId == scope
  let timers := state.timerWaits.filter fun wait =>
    wait.elementId == arm.boundaryTimer.elementId && wait.owner.definitionScopeId == scope
  have full := bindings
  simp only [parallelMultiInstanceProgramBindingsValid, Bool.and_eq_true] at full
  have unique : ∀ controller ∈ state.parallelMultiInstanceControllers,
      (state.parallelMultiInstanceControllers.filter fun other => controller.id == other.id).length = 1 :=
    fun controller member => of_decide_eq_true (List.all_eq_true.mp full.1.1.2 controller member)
  have counts : controllers.length = records.length ∧ controllers.length = timers.length ∧
      tasks.length = controllers.foldl
        (fun count controller => count + (pendingParallelTaskIds controller.slots).length) 0 := by
    have selected := List.all_eq_true.mp full.2 entry entryMem
    simpa only [projects, owningScope, Bool.and_eq_true, decide_eq_true_eq, and_assoc] using selected
  have tuples (controller : ParallelMultiInstanceController) (member : controller ∈ controllers) :
      Nonempty (RegionalParallelBindingTuple program state controller entry arm) :=
    regional_parallel_binding_tuple program state controller entry arm entryMem projects
      (by simpa only [beq_iff_eq] using (List.mem_filter.mp member).2)
      (parallelMultiInstanceProgramBindingsValid_controller_facts program state controller bindings
        (List.mem_filter.mp member).1)
  have censuses (controller : ParallelMultiInstanceController) (member : controller ∈ controllers)
      (tuple : RegionalParallelBindingTuple program state controller entry arm) :=
    regional_parallel_population_censuses program state controller entry arm tuple scope owningScope
      (by simpa only [beq_iff_eq] using (List.mem_filter.mp member).2)
  have recordCounts : (controllers.filter keepController).length =
      (records.filter keepRecord).length := by
    apply regional_correspondence_filter_length controllers records
      regionalParallelNamesRecord keepController keepRecord
    · intro controller member
      obtain ⟨tuple⟩ := tuples controller member
      rw [(censuses controller member tuple).1]
      rfl
    · intro record _
      apply regional_parallel_column_bound state controllers List.filter_sublist _ unique
      intro left _ right _ first second
      exact regional_parallel_same_record left right record first second
    · exact counts.1
    · intro controller member record recordMem related
      obtain ⟨tuple⟩ := tuples controller member
      have selected : record = tuple.record := by
        have present := List.mem_filter.mpr ⟨recordMem, related⟩
        simpa only [records, (censuses controller member tuple).1, List.mem_singleton] using present
      subst record
      exact (retention controller (List.mem_filter.mp member).1 tuple).1
  have timerCounts : (controllers.filter keepController).length =
      (timers.filter keepTimer).length := by
    apply regional_correspondence_filter_length controllers timers
      (regionalParallelNamesTimer state) keepController keepTimer
    · intro controller member
      obtain ⟨tuple⟩ := tuples controller member
      rw [(censuses controller member tuple).2.2]
      rfl
    · intro timer member
      exact regional_parallel_timer_column state controllers List.filter_sublist unique timerClaims
        timer (List.mem_filter.mp member).1
    · exact counts.2.1
    · intro controller member timer timerMem related
      obtain ⟨tuple⟩ := tuples controller member
      have selected : timer = tuple.timer := by
        have present := List.mem_filter.mpr ⟨timerMem, related⟩
        simpa only [timers, (censuses controller member tuple).2.2, List.mem_singleton] using present
      subst timer
      have kept := retention controller (List.mem_filter.mp member).1 tuple
      exact kept.1.trans kept.2.2
  refine ⟨recordCounts, timerCounts, ?_⟩
  rw [regional_weighted_fold_eq_sum, Nat.zero_add]
  symm
  apply regional_weighted_correspondence_filter_length controllers tasks
    (fun controller => (pendingParallelTaskIds controller.slots).length)
    regionalParallelNamesTask keepController keepTask
  · intro controller member
    obtain ⟨tuple⟩ := tuples controller member
    exact (censuses controller member tuple).2.1
  · intro task _
    exact regional_parallel_task_column program state controllers List.filter_sublist entry arm
      tuples unique bodyClaims task
  · simpa only [regional_weighted_fold_eq_sum, Nat.zero_add] using counts.2.2.symm
  · intro controller member task taskMem related
    obtain ⟨tuple⟩ := tuples controller member
    have kept := retention controller (List.mem_filter.mp member).1 tuple
    exact kept.1.trans (kept.2.1 task (List.mem_filter.mp taskMem).1 related)

/-- Complete PMI reverse binding follows from predecessor correspondences and tuple retention.
The forward conjunct is supplied by the separately proved actual-removal law. -/
theorem parallel_program_binding_after_filters (program : Program) (state after : RuntimeState)
    (keepController : ParallelMultiInstanceController → Bool)
    (keepRecord : ActivityOccurrence → Bool) (keepTask : UserTaskWait → Bool)
    (keepTimer : TimerWait → Bool)
    (controllerField : after.parallelMultiInstanceControllers =
      state.parallelMultiInstanceControllers.filter keepController)
    (recordField : after.activityOccurrences = state.activityOccurrences.filter keepRecord)
    (taskField : after.waits = state.waits.filter keepTask)
    (timerField : after.timerWaits = state.timerWaits.filter keepTimer)
    (bindings : parallelMultiInstanceProgramBindingsValid program state = true)
    (bodyClaims : activityBodyClaimsUnique state.activityOccurrences = true)
    (timerClaims : attachedTimersUnambiguous state = true)
    (forward : after.parallelMultiInstanceControllers.all
      (parallelControllerProgramBindingValid program after) = true)
    (retention : ∀ controller ∈ state.parallelMultiInstanceControllers, ∀ entry arm,
      ∀ tuple : RegionalParallelBindingTuple program state controller entry arm,
      keepController controller = keepRecord tuple.record ∧
      (∀ wait ∈ state.waits, regionalParallelNamesTask controller wait = true →
        keepRecord tuple.record = keepTask wait) ∧
      keepRecord tuple.record = keepTimer tuple.timer) :
    parallelMultiInstanceProgramBindingsValid program after = true := by
  have prior := bindings
  simp only [parallelMultiInstanceProgramBindingsValid, Bool.and_eq_true] at prior ⊢
  refine ⟨⟨⟨forward, ?_⟩, ?_⟩, ?_⟩
  · apply List.all_eq_true.mpr
    intro controller member
    have retained := List.mem_filter.mp (controllerField ▸ member)
    have once := List.all_eq_true.mp prior.1.1.2 controller retained.1
    apply decide_eq_true (p := _)
    have bound := (List.filter_sublist (p := keepController)
      (l := state.parallelMultiInstanceControllers)).filter
        (fun other => controller.id == other.id) |>.length_le
    have positive : 0 < (after.parallelMultiInstanceControllers.filter
        fun other => controller.id == other.id).length :=
      List.length_pos_of_mem (List.mem_filter.mpr ⟨member, by simp⟩)
    change (after.parallelMultiInstanceControllers.filter
      fun other => controller.id == other.id).length = 1
    have beforeOne : (state.parallelMultiInstanceControllers.filter
        fun other => controller.id == other.id).length = 1 := of_decide_eq_true once
    rw [← controllerField] at bound
    omega
  · rw [controllerField]
    exact parallelMultiInstanceControllersOrdered_filter _ _ prior.1.2
  · apply List.all_eq_true.mpr
    intro entry member
    cases projects : ParallelMultiInstanceArm.ofOperation? entry with
    | none => rfl
    | some arm =>
      have complete := List.all_eq_true.mp prior.2 entry member
      cases owner : operationOwningScope? program entry.id with
      | none => simp [projects, owner] at complete
      | some scope =>
        have counts := scoped_parallel_counts_retained program state keepController keepRecord
          keepTask keepTimer entry arm scope member projects owner bindings bodyClaims timerClaims
          (fun controller present tuple => retention controller present entry arm tuple)
        simp only [Bool.and_eq_true, decide_eq_true_eq, and_assoc]
        rw [controllerField, recordField, taskField, timerField]
        simp only [regional_parallel_filter_commute _ keepController,
          regional_parallel_filter_commute _ keepRecord,
          regional_parallel_filter_commute _ keepTask,
          regional_parallel_filter_commute _ keepTimer]
        exact counts

private theorem parallel_tuple_owner_process (program : Program) (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (entry : SemanticOperation)
    (arm : ParallelMultiInstanceArm)
    (tuple : RegionalParallelBindingTuple program state controller entry arm)
    (facts : ParallelControllerProgramBindingFacts program state controller)
    (owners : ∀ wait ∈ state.waits, wait.processInstanceId = wait.owner.processInstanceId) :
    tuple.record.owner.processInstanceId = controller.id.processInstanceId := by
  obtain ⟨member, named⟩ := regional_parallel_census_member tuple.recordCensus
  exact parallel_bound_record_owner_process program state controller tuple.record facts member named owners

private theorem cancellation_parallel_tuple_retention (program : Program) (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (entry : SemanticOperation)
    (arm : ParallelMultiInstanceArm)
    (tuple : RegionalParallelBindingTuple program state controller entry arm)
    (facts : ParallelControllerProgramBindingFacts program state controller)
    (root : ScopeOccurrenceId)
    (owners : ∀ wait ∈ state.waits, wait.processInstanceId = wait.owner.processInstanceId)
    (unambiguous : attachedTimersUnambiguous state = true) :
    let called := calledInstanceClosure state root
    let cancelled := fun owner : ScopeOccurrenceId =>
      occurrenceInSubtree state.scopeOccurrences root owner || called.contains owner.processInstanceId
    let withdrawn := withdrawnByRegion cancelled state.activityOccurrences
    (!called.contains controller.id.processInstanceId &&
      !withdrawn.any (regionalParallelNamesRecord controller)) =
      (!recordInRegion cancelled tuple.record) ∧
    (∀ wait ∈ state.waits, regionalParallelNamesTask controller wait = true →
      (!recordInRegion cancelled tuple.record) = (!cancelled wait.owner)) ∧
    (!recordInRegion cancelled tuple.record) =
      (!cancelled tuple.timer.owner && !anyTimerIdNamesWait (attachedTimersOf withdrawn) tuple.timer) := by
  dsimp only
  let cancelled := fun owner : ScopeOccurrenceId =>
    occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId
  obtain ⟨recordMem, _recordNames⟩ := regional_parallel_census_member tuple.recordCensus
  obtain ⟨timerMem, timerNames⟩ := regional_parallel_census_member tuple.timerCensus
  have process := parallel_tuple_owner_process program state controller entry arm tuple facts owners
  have recordMask : recordInRegion cancelled tuple.record = cancelled tuple.record.owner := by
    have body := tuple.body
    cases shape : tuple.record.body <;> simp [activityBodyParallelTasks?, shape] at body
    simp [recordInRegion, shape]
  have withdrawnMatch : (withdrawnByRegion cancelled state.activityOccurrences).any
      (regionalParallelNamesRecord controller) = cancelled tuple.record.owner := by
    rw [withdrawnByRegion, List.any_filter]
    have commute : (fun record => recordInRegion cancelled record &&
        regionalParallelNamesRecord controller record) =
        (fun record => regionalParallelNamesRecord controller record &&
          recordInRegion cancelled record) := by funext record; exact Bool.and_comm _ _
    rw [commute, ← List.any_filter, tuple.recordCensus]
    simpa using recordMask
  change _ = (!recordInRegion cancelled tuple.record) ∧
    (∀ wait ∈ state.waits, regionalParallelNamesTask controller wait = true →
      (!recordInRegion cancelled tuple.record) = (!cancelled wait.owner)) ∧ _
  rw [withdrawnMatch, recordMask]
  refine ⟨?_, ?_, ?_⟩
  · rw [← process]
    simp only [cancelled]
    cases occurrenceInSubtree state.scopeOccurrences root tuple.record.owner <;>
      cases (calledInstanceClosure state root).contains tuple.record.owner.processInstanceId <;> rfl
  · intro wait member named
    rw [(tuple.children wait member named).1]
  · change (!cancelled tuple.record.owner) =
      (!cancelled tuple.timer.owner && !anyTimerIdNamesWait
        (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences)) tuple.timer)
    rw [tuple.timerOwner]
    cases outside : cancelled tuple.record.owner with
    | true => simp
    | false =>
      have noClaim : anyTimerIdNamesWait
          (attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences)) tuple.timer = false := by
        apply Bool.eq_false_iff.mpr
        intro claim
        obtain ⟨timerId, attached, named⟩ := List.any_eq_true.mp claim
        obtain ⟨other, otherMem, otherAttached⟩ := List.mem_flatMap.mp attached
        obtain ⟨prior, removed⟩ := List.mem_filter.mp otherMem
        have ownNames : anyTimerIdNamesWait tuple.record.timerHandlerOccurrences tuple.timer = true := by
          simp [anyTimerIdNamesWait, tuple.timerHandlers, timerNames]
        have otherNames : anyTimerIdNamesWait other.timerHandlerOccurrences tuple.timer = true :=
          List.any_eq_true.mpr ⟨timerId, otherAttached, named⟩
        have first := activityOccurrenceForTimerWait_unique state tuple.timer tuple.record
          unambiguous timerMem recordMem ownNames
        have second := activityOccurrenceForTimerWait_unique state tuple.timer other
          unambiguous timerMem prior otherNames
        have same := Option.some.inj (first.symm.trans second)
        rw [← same, recordMask, outside] at removed
        contradiction
      simp [noClaim]

/-- Both cancellation dispositions preserve the full PMI validator, including weighted reverse
censuses. Flow-node Process/owner agreement rules out removing a controller by Process identity
while retaining its Activity by owner; it is an existing predecessor fact, not a successor check. -/
theorem cancelScopeSubtree_preserves_parallel_program_bindings (program : Program)
    (state : RuntimeState) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (bindings : parallelMultiInstanceProgramBindingsValid program state = true)
    (bodies : activityRecordsOwnLiveWork state = true)
    (bodyClaims : activityBodyClaimsUnique state.activityOccurrences = true)
    (timers : attachedTimersUnambiguous state = true)
    (messages : attachedMessagesUnambiguous state = true)
    (owners : ∀ wait ∈ state.waits, wait.processInstanceId = wait.owner.processInstanceId) :
    parallelMultiInstanceProgramBindingsValid program (cancelScopeSubtree state root disposition) = true := by
  apply parallel_program_binding_after_filters program state (cancelScopeSubtree state root disposition)
    _ _ _ _ rfl rfl rfl rfl bindings bodyClaims timers
    (cancelScopeSubtree_preserves_parallel_controller_program_bindings program state root disposition
      bindings bodies timers messages)
  intro controller member entry arm tuple
  exact cancellation_parallel_tuple_retention program state controller entry arm tuple
    (parallelMultiInstanceProgramBindingsValid_controller_facts program state controller bindings member)
    root owners timers

/-- Whole-Call cleanup removes complete PMI groups. The weighted census retains only pending
slots, so a surviving partially completed controller keeps its exact remaining child population. -/
theorem removeCalledProcessTree_preserves_parallel_program_bindings (program : Program)
    (state : RuntimeState) (call : CalledProcessOccurrence)
    (bindings : parallelMultiInstanceProgramBindingsValid program state = true)
    (bodies : activityRecordsOwnLiveWork state = true)
    (bodyClaims : activityBodyClaimsUnique state.activityOccurrences = true)
    (timers : attachedTimersUnambiguous state = true)
    (owners : ∀ wait ∈ state.waits, wait.processInstanceId = wait.owner.processInstanceId)
    (closed : regionalOwnershipClosed state (callReferenceRetention state call) = true) :
    parallelMultiInstanceProgramBindingsValid program (removeCalledProcessTree state call) = true := by
  apply parallel_program_binding_after_filters program state (removeCalledProcessTree state call)
    _ _ _ _ rfl rfl rfl rfl bindings bodyClaims timers
    (removeCalledProcessTree_preserves_parallel_controller_program_bindings program state call
      bindings bodies owners closed)
  intro controller member entry arm tuple
  have process := parallel_tuple_owner_process program state controller entry arm tuple
    (parallelMultiInstanceProgramBindingsValid_controller_facts program state controller bindings member)
    owners
  refine ⟨?_, ?_, ?_⟩
  · simp only [process]
  · intro wait waitMember named
    simp only [(tuple.children wait waitMember named).1]
  · simp only [tuple.timerOwner]

end BpmnSemantics.SemanticProcess
