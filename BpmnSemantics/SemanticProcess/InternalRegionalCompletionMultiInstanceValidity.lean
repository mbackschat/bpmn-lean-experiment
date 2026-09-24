import BpmnSemantics.SemanticProcess.InternalRegionalSelectedRetention
import BpmnSemantics.SemanticProcess.InternalRegionalSequentialBinding
import BpmnSemantics.SemanticProcess.InternalRegionalParallelReverseBinding

/-! Completion removes a child-scope Activity, never a Multi-Instance task body.
REG-OWN-CLOSE-01 keeps the lifetime Timers of surviving task bodies. The existing
tuple correspondence laws then preserve both directions of each Multi-Instance binding. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem completion_keeps_task_body (before : RuntimeState) (selected : InternalRegionalSelection)
    (withdrawal : InternalCompletionWithdrawal) (kind : selected.kind = .completing withdrawal)
    (record : ActivityOccurrence) (body : activityBodyTask? record ≠ none ∨ activityBodyParallelTasks? record ≠ none) :
    (regionalSelectionReferenceRetention before selected).activity record = true := by
  cases withdrawal with
  | unbounded => simp [regionalSelectionReferenceRetention, kind, ordinaryCompletionReferenceRetention]
  | bounded activity deadline =>
      cases shape : record.body <;>
        simp_all [activityBodyTask?, activityBodyParallelTasks?, regionalSelectionReferenceRetention,
          boundedCompletionReferenceRetention]
  | monitored activity deadline =>
      cases shape : record.body <;>
        simp_all [activityBodyTask?, activityBodyParallelTasks?, regionalSelectionReferenceRetention,
          monitoredCompletionReferenceRetention]

private theorem filter_singleton_retained {α : Type} (values : List α) (keep names : α → Bool)
    (record : α) (census : values.filter names = [record]) (retained : keep record = true) :
    (values.filter keep).filter names = values.filter names := by
  apply allMatchingRetained_preserves_census
  apply List.all_eq_true.mpr
  intro value member
  cases named : names value with
  | false => simp
  | true =>
      have present := List.mem_filter.mpr ⟨member, named⟩
      rw [census] at present
      simp [List.mem_singleton.mp present, retained]

theorem completion_smi_activity_census (program : Program) (before after : RuntimeState)
    (selected : InternalRegionalSelection) (withdrawal : InternalCompletionWithdrawal)
    (kind : selected.kind = .completing withdrawal)
    (records : after.activityOccurrences = before.activityOccurrences.filter
      (regionalSelectionReferenceRetention before selected).activity)
    (controller : SequentialMultiInstanceController)
    (valid : sequentialMultiInstanceControllerProgramBindingValid program before controller = true) :
    after.activityOccurrences.filter (controllerNamesActivityOccurrence controller) =
      before.activityOccurrences.filter (controllerNamesActivityOccurrence controller) := by
  unfold sequentialMultiInstanceControllerProgramBindingValid at valid
  split at valid
  · rename_i record census
    have body : activityBodyTask? record ≠ none := by
      intro absent
      split at valid
      · simp [absent] at valid
      · contradiction
    rw [records]
    exact filter_singleton_retained _ _ _ record census
      (completion_keeps_task_body before selected withdrawal kind record (Or.inl body))
  · contradiction

private theorem completion_keeps_body_timer (before : RuntimeState) (selected : InternalRegionalSelection)
    (record : ActivityOccurrence) (timerId : OccurrenceId) (timer : TimerWait)
    (closed : regionalOwnershipClosed before (regionalSelectionReferenceRetention before selected) = true)
    (member : record ∈ before.activityOccurrences)
    (kept : (regionalSelectionReferenceRetention before selected).activity record = true)
    (attached : timerId ∈ record.timerHandlerOccurrences)
    (census : before.timerWaits.filter (timerIdNamesWait timerId) = [timer]) :
    (regionalSelectionReferenceRetention before selected).timer timer = true := by
  have refs := List.all_eq_true.mp (Bool.and_eq_true_iff.mp closed).1 record member
  simp only [kept, Bool.not_true, Bool.false_or] at refs
  obtain ⟨handler, handlerMember, projected⟩ := List.mem_filterMap.mp attached
  have handlerClosed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp refs).2 handler handlerMember
  cases handler with
  | message occurrence => contradiction
  | timer occurrence =>
      simp only [Option.some.injEq] at projected
      subst occurrence
      have present : timer ∈ before.timerWaits.filter (timerIdNamesWait timerId) := by rw [census]; simp
      have retention := List.all_eq_true.mp handlerClosed timer (List.mem_filter.mp present).1
      simpa only [(List.mem_filter.mp present).2, Bool.not_true, Bool.false_or] using retention

theorem completion_preserves_sequential_bindings (program : Program) (before after : RuntimeState)
    (selected : InternalRegionalSelection) (withdrawal : InternalCompletionWithdrawal)
    (kind : selected.kind = .completing withdrawal)
    (fields : regionalReferenceFieldsMatch before after (regionalSelectionReferenceRetention before selected))
    (tasks : after.waits = before.waits)
    (controllers : after.sequentialMultiInstanceControllers = before.sequentialMultiInstanceControllers)
    (closed : regionalOwnershipClosed before (regionalSelectionReferenceRetention before selected) = true)
    (bodies : activityRecordsOwnLiveWork before = true)
    (bindings : sequentialMultiInstanceProgramBindingsValid program before = true)
    (unique : controllerIdentitiesUnique before = true)
    (bodyClaims : activityBodyClaimsUnique before.activityOccurrences = true)
    (timerClaims : attachedTimersUnambiguous before = true) :
    sequentialMultiInstanceProgramBindingsValid program after = true := by
  have afterBodies := regional_reference_retention_preserves_activity_records before after _ fields closed bodies
  have timerSublist : after.timerWaits.Sublist before.timerWaits := fields.2.2.2.2.1 ▸ List.filter_sublist
  have taskSublist : after.waits.Sublist before.waits := tasks ▸ List.Sublist.refl _
  have parts := Bool.and_eq_true_iff.mp bindings
  apply Bool.and_eq_true_iff.mpr
  refine ⟨?_, ?_⟩
  · rw [sequentialMultiInstanceControllerProgramBindingsValid, controllers]
    apply List.all_eq_true.mpr
    intro controller member
    have prior := List.all_eq_true.mp parts.1 controller member
    exact smi_binding_of_retained_work program before after controller
      (completion_smi_activity_census program before after selected withdrawal kind fields.2.1 controller prior)
      taskSublist timerSublist bodies afterBodies prior
  · apply List.all_eq_true.mpr
    intro operation member
    apply sequential_operation_binding_after_filters program before after (fun _ => true)
      (regionalSelectionReferenceRetention before selected).activity (fun _ => true)
      (regionalSelectionReferenceRetention before selected).timer
      (controllers.trans (List.filter_eq_self.mpr (by intros; rfl)).symm) fields.2.1
      (tasks.trans (List.filter_eq_self.mpr (by intros; rfl)).symm) fields.2.2.2.2.1 _
      operation member parts.1 (List.all_eq_true.mp parts.2 operation member) unique bodyClaims timerClaims
    intro controller id task boundary tuple
    have recordKept := completion_keeps_task_body before selected withdrawal kind tuple.record
      (Or.inl (by simp [activityBodyTask?, tuple.bodyShape]))
    have present : tuple.record ∈ before.activityOccurrences.filter (controllerNamesActivityOccurrence controller) := by
      rw [tuple.recordCensus]; simp
    have timerKept := completion_keeps_body_timer before selected tuple.record tuple.timerId tuple.timer closed
      (List.mem_filter.mp present).1 recordKept (by simp [tuple.timerHandlers]) tuple.timerCensus
    exact ⟨recordKept.symm, recordKept, recordKept.trans timerKept.symm⟩

theorem completion_preserves_parallel_bindings (program : Program) (before after : RuntimeState)
    (selected : InternalRegionalSelection) (withdrawal : InternalCompletionWithdrawal)
    (kind : selected.kind = .completing withdrawal)
    (fields : regionalReferenceFieldsMatch before after (regionalSelectionReferenceRetention before selected))
    (tasks : after.waits = before.waits)
    (controllers : after.parallelMultiInstanceControllers = before.parallelMultiInstanceControllers)
    (variables : after.variables = before.variables)
    (activations : ∀ id, activationCount after id = activationCount before id)
    (activityActivations : ∀ id, activityActivationCount after id = activityActivationCount before id)
    (timerActivations : ∀ id, timerActivationCount after id = timerActivationCount before id)
    (closed : regionalOwnershipClosed before (regionalSelectionReferenceRetention before selected) = true)
    (bodies : activityRecordsOwnLiveWork before = true)
    (bindings : parallelMultiInstanceProgramBindingsValid program before = true)
    (bodyClaims : activityBodyClaimsUnique before.activityOccurrences = true)
    (timerClaims : attachedTimersUnambiguous before = true) :
    parallelMultiInstanceProgramBindingsValid program after = true := by
  have afterBodies := regional_reference_retention_preserves_activity_records before after _ fields closed bodies
  apply parallel_program_binding_after_filters program before after (fun _ => true)
    (regionalSelectionReferenceRetention before selected).activity (fun _ => true)
    (regionalSelectionReferenceRetention before selected).timer
    (controllers.trans (List.filter_eq_self.mpr (by intros; rfl)).symm) fields.2.1
    (tasks.trans (List.filter_eq_self.mpr (by intros; rfl)).symm) fields.2.2.2.2.1
    bindings bodyClaims timerClaims
  · rw [controllers]
    apply List.all_eq_true.mpr
    intro controller member
    have facts := parallelMultiInstanceProgramBindingsValid_controller_facts program before controller bindings member
    obtain ⟨_, _, record, _, _, _, _, _, census, _, _, _, _, body, _⟩ := facts.witnesses
    have kept := completion_keeps_task_body before selected withdrawal kind record (Or.inr (by simp [body]))
    have recordFrame : after.activityOccurrences.filter (fun candidate =>
        parallelControllerNamesIdentity controller candidate.processInstanceId
          ⟨candidate.activityElementId.value⟩ candidate.activation) =
        before.activityOccurrences.filter (fun candidate =>
          parallelControllerNamesIdentity controller candidate.processInstanceId
            ⟨candidate.activityElementId.value⟩ candidate.activation) := by
      rw [fields.2.1]
      exact filter_singleton_retained _ _ _ record census kept
    have prior := List.all_eq_true.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp
      (Bool.and_eq_true_iff.mp bindings).1).1).1 controller member
    exact parallel_binding_of_retained_work program before after controller (fun _ => true)
      facts prior recordFrame (tasks.trans (List.filter_eq_self.mpr (by intros; rfl)).symm)
      (fields.2.2.2.2.1 ▸ List.filter_sublist)
      bodies afterBodies (by rw [variables]) activations activityActivations timerActivations
  · intro controller member entry arm tuple
    have kept := completion_keeps_task_body before selected withdrawal kind tuple.record (Or.inr (by simp [tuple.body]))
    have present : tuple.record ∈ before.activityOccurrences.filter (regionalParallelNamesRecord controller) := by
      rw [tuple.recordCensus]; simp
    have timerKept := completion_keeps_body_timer before selected tuple.record tuple.timerId tuple.timer closed
      (List.mem_filter.mp present).1 kept (by simp [tuple.timerHandlers]) tuple.timerCensus
    exact ⟨kept.symm, fun _ _ _ => kept, kept.trans timerKept.symm⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
