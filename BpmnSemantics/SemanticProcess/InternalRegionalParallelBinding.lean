import BpmnSemantics.SemanticProcess.InternalRegionalCallSequentialBinding

/-! Regional removal preserves each surviving parallel controller's complete pending-child and
lifetime-Timer binding. The operation-wide weighted reverse census is a separate obligation. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The controller lookup is identity-first: changing owner payload cannot change its census.
Process/owner agreement therefore needs its separate flow-node validity fact for Call cleanup. -/
theorem parallel_controller_identity_ignores_owner (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence) (owner : ScopeOccurrenceId) :
    parallelControllerNamesIdentity controller ({ record with owner } : ActivityOccurrence).processInstanceId
      ⟨record.activityElementId.value⟩ record.activation =
    parallelControllerNamesIdentity controller record.processInstanceId
      ⟨record.activityElementId.value⟩ record.activation := rfl

/-- Retaining a controller and Timer cannot hide a lost pending child: the forward validator
itself rejects the changed census, before any operation-wide reverse count is considered. -/
theorem parallel_controller_binding_rejects_missing_pending_child (program : Program)
    (state : RuntimeState) (controller : ParallelMultiInstanceController)
    (short : (state.waits.filter (fun wait => (pendingParallelTaskIds controller.slots).contains
      (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : OccurrenceId))).length ≠
      (pendingParallelTaskIds controller.slots).length) :
    parallelControllerProgramBindingValid program state controller = false := by
  apply Bool.eq_false_iff.mpr
  intro valid
  unfold parallelControllerProgramBindingValid at valid
  split at valid
  · contradiction
  · split at valid
    · split at valid
      · contradiction
      · simp only [Bool.and_eq_true] at valid
        exact short (of_decide_eq_true valid.1.1.2)
    · contradiction

/-- A completed middle slot stays outside the live-child census; losing either of the two
remaining waits still fails the actual forward binding. This witness is symbolic, not decided. -/
theorem parallel_three_slot_binding_rejects_one_remaining_wait (program : Program)
    (state : RuntimeState) (controller : ParallelMultiInstanceController)
    (first completed last : OccurrenceId) (result : String)
    (slots : controller.slots = [.pending first, .completed completed result, .pending last])
    (oneWait : (state.waits.filter (fun wait => (pendingParallelTaskIds controller.slots).contains
      (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : OccurrenceId))).length = 1) :
    parallelControllerProgramBindingValid program state controller = false := by
  apply parallel_controller_binding_rejects_missing_pending_child
  erw [oneWait]
  simp only [slots, pendingParallelTaskIds, List.length_cons, List.length_nil]
  omega

/-- As in the SMI cancellation law, a second withdrawn identity claimant removes the PMI
controller even if a payload-first search would select another, retained record. -/
theorem cancelled_activity_claimant_removes_parallel_controller (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (member : record ∈ state.activityOccurrences)
    (inside : recordInRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) record = true)
    (names : parallelControllerNamesIdentity controller record.processInstanceId
      ⟨record.activityElementId.value⟩ record.activation = true) :
    controller ∉ (cancelScopeSubtree state root disposition).parallelMultiInstanceControllers := by
  intro survives
  have kept := (List.mem_filter.mp survives).2
  simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
  have withdrawn : (withdrawnByRegion
      (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
        (calledInstanceClosure state root).contains owner.processInstanceId)
      state.activityOccurrences).any (fun activity =>
        parallelControllerNamesIdentity controller activity.processInstanceId
          ⟨activity.activityElementId.value⟩ activity.activation) = true :=
    List.any_eq_true.mpr ⟨record, List.mem_filter.mpr ⟨member, inside⟩, names⟩
  rw [kept.2] at withdrawn
  contradiction

private theorem parallel_body_task_census_length (state : RuntimeState)
    (record : ActivityOccurrence) (pending : List OccurrenceId)
    (body : activityBodyParallelTasks? record = some pending)
    (live : activityBodyLive state record = true) (task : OccurrenceId)
    (member : task ∈ pending) :
    (state.waits.filter (taskIdNamesWait task)).length = 1 := by
  cases shape : record.body <;> simp [activityBodyParallelTasks?, shape] at body
  next first rest =>
    subst pending
    simp only [activityBodyLive, shape] at live
    have census := List.all_eq_true.mp live task member
    have names (wait : UserTaskWait) :
        (decide (wait.processInstanceId = task.processInstanceId) &&
          decide (wait.task.id.value = task.elementId.value) &&
          decide (wait.activation = task.activation)) = taskIdNamesWait task wait := by
      apply Bool.eq_iff_iff.mpr
      simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq]
      simp only [eq_comm]
    simpa only [names, decide_eq_true_eq] using census

private theorem parallel_pending_census_after_filter (before after : RuntimeState)
    (record : ActivityOccurrence) (pending : List OccurrenceId) (keep : UserTaskWait → Bool)
    (body : activityBodyParallelTasks? record = some pending)
    (tasks : after.waits = before.waits.filter keep)
    (beforeLive : activityBodyLive before record = true)
    (afterLive : activityBodyLive after record = true) :
    after.waits.filter (fun wait => pending.contains
      (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : OccurrenceId)) =
    before.waits.filter (fun wait => pending.contains
      (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : OccurrenceId)) := by
  rw [tasks, List.filter_filter]
  apply List.filter_congr
  intro wait member
  let task : OccurrenceId := ⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩
  change (pending.contains task && keep wait) = pending.contains task
  cases selected : pending.contains task with
  | false => simp
  | true =>
    have taskMember : task ∈ pending := by simpa only [List.contains_eq_mem, decide_eq_true_eq] using selected
    have census : after.waits.filter (taskIdNamesWait task) =
        before.waits.filter (taskIdNamesWait task) := by
      apply (show after.waits.Sublist before.waits from tasks ▸ List.filter_sublist).filter
        (taskIdNamesWait task) |>.eq_of_length
      rw [parallel_body_task_census_length before record pending body beforeLive task taskMember,
        parallel_body_task_census_length after record pending body afterLive task taskMember]
    have retained : wait ∈ after.waits.filter (taskIdNamesWait task) := by
      rw [census]
      exact List.mem_filter.mpr ⟨member, by simp [taskIdNamesWait, task]⟩
    have kept := (List.mem_filter.mp (tasks ▸ (List.mem_filter.mp retained).1)).2
    simpa only [selected, Bool.true_and] using kept

/-- Whole pending-child censuses are retained, including partially completed slot lists; the
proof compares actual filtered lists rather than assuming their successor counts. -/
theorem parallel_binding_of_retained_work (program : Program) (before after : RuntimeState)
    (controller : ParallelMultiInstanceController) (keepTask : UserTaskWait → Bool)
    (facts : ParallelControllerProgramBindingFacts program before controller)
    (valid : parallelControllerProgramBindingValid program before controller = true)
    (records : after.activityOccurrences.filter (fun record =>
      parallelControllerNamesIdentity controller record.processInstanceId
        ⟨record.activityElementId.value⟩ record.activation) =
      before.activityOccurrences.filter (fun record =>
        parallelControllerNamesIdentity controller record.processInstanceId
          ⟨record.activityElementId.value⟩ record.activation))
    (tasks : after.waits = before.waits.filter keepTask)
    (timers : after.timerWaits.Sublist before.timerWaits)
    (beforeBodies : activityRecordsOwnLiveWork before = true)
    (afterBodies : activityRecordsOwnLiveWork after = true)
    (processBindings : after.variables.process.bindings = before.variables.process.bindings)
    (activations : ∀ id, activationCount after id = activationCount before id)
    (activityActivations : ∀ id, activityActivationCount after id = activityActivationCount before id)
    (timerActivations : ∀ id, timerActivationCount after id = timerActivationCount before id) :
    parallelControllerProgramBindingValid program after controller = true := by
  obtain ⟨entry, arm, record, timer, timerWait, childWaits, pendingTask, pendingWait,
    recordCensus, operationCensus, projects, _ownerScope, _family, body, _childCensus,
    _childLength, _childUnique, _childBindings, attached, timerCensus, _timerOwner,
    _timerElement, _timerOutput, _pendingMember, _pendingWaitMember, _pendingIdentity,
    _pendingOwner, _pendingTask⟩ := facts.witnesses
  have beforeMember : record ∈ before.activityOccurrences := by
    have selected : record ∈ before.activityOccurrences.filter (fun candidate =>
        parallelControllerNamesIdentity controller candidate.processInstanceId
          ⟨candidate.activityElementId.value⟩ candidate.activation) := by rw [recordCensus]; simp
    exact (List.mem_filter.mp selected).1
  have afterMember : record ∈ after.activityOccurrences := by
    have selected : record ∈ after.activityOccurrences.filter (fun candidate =>
        parallelControllerNamesIdentity controller candidate.processInstanceId
          ⟨candidate.activityElementId.value⟩ candidate.activation) := by rw [records, recordCensus]; simp
    exact (List.mem_filter.mp selected).1
  have beforeWork := List.all_eq_true.mp beforeBodies record beforeMember
  have afterWork := List.all_eq_true.mp afterBodies record afterMember
  simp only [Bool.and_eq_true] at beforeWork afterWork
  have childFrame := parallel_pending_census_after_filter before after record _ keepTask
    body tasks beforeWork.1.1.1 afterWork.1.1.1
  have timerLive := List.all_eq_true.mp afterWork.1.2 timer (by rw [attached]; simp)
  obtain ⟨wait, waitMember, named⟩ := List.any_eq_true.mp timerLive
  have positive : 0 < (after.timerWaits.filter (timerIdNamesWait timer)).length :=
    List.length_pos_of_mem (List.mem_filter.mpr ⟨waitMember, (Bool.and_eq_true_iff.mp named).1⟩)
  have timerFrame : after.timerWaits.filter (timerIdNamesWait timer) =
      before.timerWaits.filter (timerIdNamesWait timer) := by
    apply (timers.filter _).eq_of_length_le
    simp only [timerCensus, List.length_singleton]
    omega
  unfold parallelControllerProgramBindingValid parallelRecordForController? at valid ⊢
  simp only [records, recordCensus] at valid ⊢
  erw [operationCensus] at valid ⊢
  simp only [projects, attached] at valid ⊢
  erw [childFrame, timerFrame, processBindings]
  simp only [activations, activityActivations, timerActivations]
  exact valid

/-- Both cancellation dispositions preserve the forward bindings of every surviving PMI
controller. All aggregate and attachment facts concern the predecessor only. -/
theorem cancelScopeSubtree_preserves_parallel_controller_program_bindings (program : Program)
    (state : RuntimeState) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (bindings : parallelMultiInstanceProgramBindingsValid program state = true)
    (bodies : activityRecordsOwnLiveWork state = true)
    (timers : attachedTimersUnambiguous state = true)
    (messages : attachedMessagesUnambiguous state = true) :
    (cancelScopeSubtree state root disposition).parallelMultiInstanceControllers.all
      (parallelControllerProgramBindingValid program (cancelScopeSubtree state root disposition)) = true := by
  have retainedBodies := cancelScopeSubtree_preserves_activity_records state root disposition
    bodies timers messages
  have forward := bindings
  simp only [parallelMultiInstanceProgramBindingsValid, Bool.and_eq_true] at forward
  apply List.all_eq_true.mpr
  intro controller member
  have prior := (List.mem_filter.mp member).1
  exact parallel_binding_of_retained_work program state (cancelScopeSubtree state root disposition)
    controller _ (parallelMultiInstanceProgramBindingsValid_controller_facts program state controller
      bindings prior) (List.all_eq_true.mp forward.1.1.1 controller prior)
    (cancelScopeSubtree_parallel_controller_activity_census state root disposition controller member)
    rfl List.filter_sublist bodies retainedBodies rfl (fun _ => rfl) (fun _ => rfl) (fun _ => rfl)

theorem parallel_bound_record_owner_process (program : Program) (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (facts : ParallelControllerProgramBindingFacts program state controller)
    (member : record ∈ state.activityOccurrences)
    (named : parallelControllerNamesIdentity controller record.processInstanceId
      ⟨record.activityElementId.value⟩ record.activation = true)
    (owners : ∀ wait ∈ state.waits, wait.processInstanceId = wait.owner.processInstanceId) :
    record.owner.processInstanceId = controller.id.processInstanceId := by
  obtain ⟨entry, arm, selected, timer, timerWait, childWaits, pendingTask, pendingWait,
    recordCensus, _operationCensus, _projects, _ownerScope, family, _body, _childCensus,
    _childLength, _childUnique, _childBindings, _attached, _timerCensus, _timerOwner,
    _timerElement, _timerOutput, pendingMember, pendingWaitMember, pendingIdentity,
    pendingOwner, _pendingTask⟩ := facts.witnesses
  have same : record = selected := by
    have selectedMember : record ∈ state.activityOccurrences.filter (fun candidate =>
        parallelControllerNamesIdentity controller candidate.processInstanceId
          ⟨candidate.activityElementId.value⟩ candidate.activation) :=
      List.mem_filter.mpr ⟨member, named⟩
    simpa only [recordCensus, List.mem_singleton] using selectedMember
  subst selected
  have slotMember := (pendingParallelTaskIds_sublist_parallelSlotTaskIds controller.slots).subset
    pendingMember
  obtain ⟨slot, slotMember, slotIdentity⟩ := List.mem_map.mp slotMember
  simp only [parallelMultiInstanceRuntimeWellFormed, Bool.and_eq_true] at family
  have slotValid := List.all_eq_true.mp family.1.1.1.1.2 slot slotMember
  simp only [parallelSlotIdentityValid, Bool.and_eq_true, decide_eq_true_eq] at slotValid
  have pendingProcess : pendingTask.processInstanceId = controller.id.processInstanceId := by
    rw [← slotIdentity]
    exact slotValid.1.1
  have waitProcess := congrArg OccurrenceId.processInstanceId pendingIdentity
  exact (congrArg ScopeOccurrenceId.processInstanceId pendingOwner).symm.trans
    ((owners pendingWait pendingWaitMember).symm.trans (waitProcess.trans pendingProcess))

/-- A pending child's flow-node Process/owner agreement joins the PMI controller identity to its
Activity owner. This is needed because Call removal filters those two families by different fields. -/
theorem removeCalledProcessTree_parallel_controller_activity_census (program : Program)
    (state : RuntimeState) (call : CalledProcessOccurrence)
    (controller : ParallelMultiInstanceController)
    (facts : ParallelControllerProgramBindingFacts program state controller)
    (owners : ∀ wait ∈ state.waits, wait.processInstanceId = wait.owner.processInstanceId)
    (survives : controller ∈ (removeCalledProcessTree state call).parallelMultiInstanceControllers) :
    (removeCalledProcessTree state call).activityOccurrences.filter (fun record =>
      parallelControllerNamesIdentity controller record.processInstanceId
        ⟨record.activityElementId.value⟩ record.activation) =
      state.activityOccurrences.filter (fun record =>
        parallelControllerNamesIdentity controller record.processInstanceId
          ⟨record.activityElementId.value⟩ record.activation) := by
  have kept := (List.mem_filter.mp survives).2
  change (state.activityOccurrences.filter _).filter _ = _
  rw [List.filter_filter]
  apply List.filter_congr
  intro record member
  cases named : parallelControllerNamesIdentity controller record.processInstanceId
      ⟨record.activityElementId.value⟩ record.activation with
  | false => simp
  | true =>
    have owner := parallel_bound_record_owner_process program state controller record facts member named owners
    simpa only [owner, Bool.true_and] using kept

/-- Actual whole-Call cleanup preserves every surviving PMI controller's forward binding.
Reference closure and Process/owner identity are predecessor facts, never successor assumptions. -/
theorem removeCalledProcessTree_preserves_parallel_controller_program_bindings (program : Program)
    (state : RuntimeState) (call : CalledProcessOccurrence)
    (bindings : parallelMultiInstanceProgramBindingsValid program state = true)
    (bodies : activityRecordsOwnLiveWork state = true)
    (owners : ∀ wait ∈ state.waits, wait.processInstanceId = wait.owner.processInstanceId)
    (closed : regionalOwnershipClosed state (callReferenceRetention state call) = true) :
    (removeCalledProcessTree state call).parallelMultiInstanceControllers.all
      (parallelControllerProgramBindingValid program (removeCalledProcessTree state call)) = true := by
  have retainedBodies := regional_reference_retention_preserves_activity_records state
    (removeCalledProcessTree state call) (callReferenceRetention state call)
    (callReferenceRetention_matches_removal state call) closed bodies
  have forward := bindings
  simp only [parallelMultiInstanceProgramBindingsValid, Bool.and_eq_true] at forward
  apply List.all_eq_true.mpr
  intro controller member
  have prior := (List.mem_filter.mp member).1
  have facts := parallelMultiInstanceProgramBindingsValid_controller_facts program state controller
    bindings prior
  exact parallel_binding_of_retained_work program state (removeCalledProcessTree state call)
    controller _ facts (List.all_eq_true.mp forward.1.1.1 controller prior)
    (removeCalledProcessTree_parallel_controller_activity_census program state call controller facts
      owners member) rfl List.filter_sublist bodies retainedBodies rfl
    (fun _ => rfl) (fun _ => rfl) (fun _ => rfl)

end BpmnSemantics.SemanticProcess
