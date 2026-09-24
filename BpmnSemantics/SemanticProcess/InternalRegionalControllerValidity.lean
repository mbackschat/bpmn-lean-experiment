import BpmnSemantics.SemanticProcess.InternalRegionalActivityValidity
import BpmnSemantics.SemanticProcess.InternalRegionalCallRemoval

/-! # Regional controller lifetime preservation

Cancellation withdraws a controller by its Activity identity, before any record payload is
inspected. Consequently every matching record of a surviving controller remains in the exact
lookup census. These laws provide the controller side of regional program-binding preservation.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Any withdrawn identity claimant removes the SMI controller, even when another record with
the same identity survives. A payload-first lookup would miss that second claimant. -/
theorem cancelled_activity_claimant_removes_controller (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (controller : SequentialMultiInstanceController) (record : ActivityOccurrence)
    (member : record ∈ state.activityOccurrences)
    (inside : recordInRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) record (retainedCancellationRoot root disposition) = true)
    (names : controllerNamesActivityOccurrence controller record = true) :
    controller ∉ (cancelScopeSubtree state root disposition).sequentialMultiInstanceControllers := by
  intro survives
  have kept := (List.mem_filter.mp survives).2
  simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
  have withdrawn : (withdrawnByRegion
      (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
        (calledInstanceClosure state root).contains owner.processInstanceId)
      state.activityOccurrences (retainedCancellationRoot root disposition)).any (controllerNamesActivityOccurrence controller) = true :=
    List.any_eq_true.mpr ⟨record, List.mem_filter.mpr ⟨member, inside⟩, names⟩
  rw [kept.2] at withdrawn
  contradiction

private theorem retained_census_of_no_withdrawn_claimant (records : List ActivityOccurrence)
    (cancelled : ScopeOccurrenceId → Bool) (names : ActivityOccurrence → Bool) (retainedRoot : Option ScopeOccurrenceId)
    (absent : (withdrawnByRegion cancelled records retainedRoot).any names = false) :
    (retainedByRegion cancelled records retainedRoot).filter names = records.filter names := by
  simp only [retainedByRegion, List.filter_filter]
  apply List.filter_congr
  intro record member
  by_cases named : names record = true
  · have outside : recordInRegion cancelled record retainedRoot = false := by
      apply Bool.eq_false_iff.mpr
      intro inside
      have present : (withdrawnByRegion cancelled records retainedRoot).any names = true :=
        List.any_eq_true.mpr ⟨record, List.mem_filter.mpr ⟨member, inside⟩, named⟩
      rw [absent] at present
      contradiction
    simp [named, outside]
  · simp [Bool.eq_false_iff.mpr named]

/-- The complete identity-first SMI Activity lookup is unchanged for every surviving controller;
the claim preserves multiplicity rather than assuming uniqueness or selecting one witness. -/
theorem cancelScopeSubtree_controller_activity_census (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (controller : SequentialMultiInstanceController)
    (survives : controller ∈
      (cancelScopeSubtree state root disposition).sequentialMultiInstanceControllers) :
    (cancelScopeSubtree state root disposition).activityOccurrences.filter
        (controllerNamesActivityOccurrence controller) =
      state.activityOccurrences.filter (controllerNamesActivityOccurrence controller) := by
  have kept := (List.mem_filter.mp survives).2
  simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
  exact retained_census_of_no_withdrawn_claimant _ _ _ _ kept.2

/-- PMI cancellation uses the same all-claimant withdrawal rule with its published controller
identity. No successor controller/record binding is assumed. -/
theorem cancelScopeSubtree_parallel_controller_activity_census (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (controller : ParallelMultiInstanceController)
    (survives : controller ∈
      (cancelScopeSubtree state root disposition).parallelMultiInstanceControllers) :
    (cancelScopeSubtree state root disposition).activityOccurrences.filter
        (fun activity => parallelControllerNamesIdentity controller activity.processInstanceId
          ⟨activity.activityElementId.value⟩ activity.activation) =
      state.activityOccurrences.filter
        (fun activity => parallelControllerNamesIdentity controller activity.processInstanceId
          ⟨activity.activityElementId.value⟩ activity.activation) := by
  have kept := (List.mem_filter.mp survives).2
  simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
  exact retained_census_of_no_withdrawn_claimant _ _ _ _ kept.2

/-- The exact singleton Activity census of every retained SMI controller follows from the
predecessor census and the actual identity-based controller withdrawal. -/
theorem cancelScopeSubtree_preserves_controller_owners (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (valid : controllersOwnLiveActivity state = true) :
    controllersOwnLiveActivity (cancelScopeSubtree state root disposition) = true := by
  apply List.all_eq_true.mpr
  intro controller member
  rw [cancelScopeSubtree_controller_activity_census state root disposition controller member]
  exact List.all_eq_true.mp valid controller (List.mem_filter.mp member).1

/-- Cancellation neither advances a retained controller nor changes its snapshot. -/
theorem cancelScopeSubtree_preserves_controller_exhaustion (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (valid : controllersNotExhausted state = true) :
    controllersNotExhausted (cancelScopeSubtree state root disposition) = true :=
  all_filter _ _ _ valid

/-- Called-instance removal also leaves retained controller progress and snapshots intact. -/
theorem removeCalledProcessTree_preserves_controller_exhaustion (state : RuntimeState)
    (record : CalledProcessOccurrence) (valid : controllersNotExhausted state = true) :
    controllersNotExhausted (removeCalledProcessTree state record) = true :=
  all_filter _ _ _ valid

private theorem task_body_census_length (state : RuntimeState) (record : ActivityOccurrence)
    (task : OccurrenceId) (body : activityBodyTask? record = some task)
    (live : activityBodyLive state record = true) :
    (state.waits.filter (taskIdNamesWait task)).length = 1 := by
  cases shape : record.body <;> simp [activityBodyTask?, shape] at body
  next actual =>
    subst actual
    have names (wait : UserTaskWait) :
        (decide (wait.processInstanceId = task.processInstanceId) &&
          decide (wait.task.id.value = task.elementId.value) &&
          decide (wait.activation = task.activation)) = taskIdNamesWait task wait := by
      apply Bool.eq_iff_iff.mpr
      simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq]
      simp only [eq_comm]
    simpa only [activityBodyLive, shape, names, decide_eq_true_eq] using live

theorem smi_binding_of_retained_work (program : Program) (before after : RuntimeState)
    (controller : SequentialMultiInstanceController)
    (records : after.activityOccurrences.filter (controllerNamesActivityOccurrence controller) =
      before.activityOccurrences.filter (controllerNamesActivityOccurrence controller))
    (tasks : after.waits.Sublist before.waits)
    (timers : after.timerWaits.Sublist before.timerWaits)
    (beforeBodies : activityRecordsOwnLiveWork before = true)
    (afterBodies : activityRecordsOwnLiveWork after = true)
    (valid : sequentialMultiInstanceControllerProgramBindingValid program before controller = true) :
    sequentialMultiInstanceControllerProgramBindingValid program after controller = true := by
  unfold sequentialMultiInstanceControllerProgramBindingValid at valid ⊢
  rw [records]
  generalize selected : before.activityOccurrences.filter
    (controllerNamesActivityOccurrence controller) = selectedRecords at valid ⊢
  cases selectedRecords with
  | nil => simp at valid
  | cons record rest =>
    cases rest with
    | cons next tail => simp at valid
    | nil =>
      have beforeSelected : record ∈ before.activityOccurrences.filter
          (controllerNamesActivityOccurrence controller) := by rw [selected]; simp
      have afterSelected : record ∈ after.activityOccurrences.filter
          (controllerNamesActivityOccurrence controller) := by rw [records, selected]; simp
      have beforeMember := (List.mem_filter.mp beforeSelected).1
      have afterMember := (List.mem_filter.mp afterSelected).1
      have beforeWork := List.all_eq_true.mp beforeBodies record beforeMember
      have afterWork := List.all_eq_true.mp afterBodies record afterMember
      simp only [Bool.and_eq_true] at beforeWork afterWork
      simp only at valid ⊢
      split at *
      · rename_i id origin input task data output boundaryTimer limits operations
        cases body : activityBodyTask? record with
        | none => simp [body] at valid
        | some bodyTask =>
          have taskCensus : after.waits.filter (taskIdNamesWait bodyTask) =
              before.waits.filter (taskIdNamesWait bodyTask) := by
            apply (tasks.filter _).eq_of_length
            rw [task_body_census_length after record bodyTask body afterWork.1.1.1,
              task_body_census_length before record bodyTask body beforeWork.1.1.1]
          simp only [body, taskCensus] at valid ⊢
          generalize taskSelection : before.waits.filter (taskIdNamesWait bodyTask) = selectedTasks
            at valid ⊢
          cases selectedTasks with
          | nil => simp at valid
          | cons wait rest =>
            cases rest with
            | cons next tail => simp at valid
            | nil =>
              cases handlerSelection : record.timerHandlerOccurrences with
              | nil => simp [handlerSelection] at valid
              | cons timerId rest =>
                cases rest with
                | cons next tail => simp [handlerSelection] at valid
                | nil =>
                  simp only [handlerSelection] at valid ⊢
                  have timerLive := List.all_eq_true.mp afterWork.1.2 timerId
                    (handlerSelection.symm ▸ (by simp))
                  obtain ⟨afterWait, afterWaitMem, named⟩ := List.any_eq_true.mp timerLive
                  simp only [Bool.and_eq_true] at named
                  have positive : 0 < (after.timerWaits.filter (timerIdNamesWait timerId)).length :=
                    List.length_pos_of_mem (List.mem_filter.mpr
                      ⟨afterWaitMem, named.1⟩)
                  generalize timerSelection : before.timerWaits.filter (timerIdNamesWait timerId) =
                    selectedTimers at valid
                  cases selectedTimers with
                  | nil => simp at valid
                  | cons timerWait rest =>
                    cases rest with
                    | cons next tail => simp at valid
                    | nil =>
                      have timerCensus : after.timerWaits.filter (timerIdNamesWait timerId) =
                          before.timerWaits.filter (timerIdNamesWait timerId) := by
                        apply (timers.filter _).eq_of_length_le
                        simp only [timerSelection, List.length_singleton]
                        omega
                      simpa only [timerCensus, timerSelection] using valid
      · contradiction

/-- Actual cancellation preserves every retained SMI controller's operation, Activity, task,
and lifetime-Timer binding. Handler survival is derived from predecessor attachment uniqueness. -/
theorem cancelScopeSubtree_preserves_controller_program_bindings (program : Program)
    (state : RuntimeState) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (bindings : sequentialMultiInstanceControllerProgramBindingsValid program state = true)
    (bodies : activityRecordsOwnLiveWork state = true)
    (timers : attachedTimersUnambiguous state = true)
    (messages : attachedMessagesUnambiguous state = true) :
    sequentialMultiInstanceControllerProgramBindingsValid program
      (cancelScopeSubtree state root disposition) = true := by
  have retainedBodies := cancelScopeSubtree_preserves_activity_records state root disposition
    bodies timers messages
  apply List.all_eq_true.mpr
  intro controller member
  exact smi_binding_of_retained_work program state (cancelScopeSubtree state root disposition)
    controller (cancelScopeSubtree_controller_activity_census state root disposition controller member)
    List.filter_sublist List.filter_sublist bodies retainedBodies
    (List.all_eq_true.mp bindings controller (List.mem_filter.mp member).1)

end BpmnSemantics.SemanticProcess
