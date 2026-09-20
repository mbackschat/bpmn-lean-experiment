import BpmnSemantics.SemanticProcess.InternalRegionalSequentialBinding
import BpmnSemantics.SemanticProcess.InternalRegionalReferencePreservation

/-! Complete SMI bindings survive whole-called-instance removal because controller identity,
Activity identity, and the owned task/Timer pair agree on the deciding Process instance.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem call_tuple_retention (program : Program) (state : RuntimeState)
    (controller : SequentialMultiInstanceController) (id : OperationId)
    (task : SequentialMultiInstanceTaskDefinition) (boundary : BoundaryTimerArm)
    (tuple : SequentialBindingTuple program state controller id task boundary)
    (removed : List SemanticId) :
    (!removed.contains controller.processInstanceId) =
      (!removed.contains tuple.record.owner.processInstanceId) ∧
    (!removed.contains tuple.record.owner.processInstanceId) =
      (!removed.contains tuple.task.owner.processInstanceId) ∧
    (!removed.contains tuple.record.owner.processInstanceId) =
      (!removed.contains tuple.timer.owner.processInstanceId) := by
  have selected : tuple.record ∈ state.activityOccurrences.filter
      (controllerNamesActivityOccurrence controller) := by rw [tuple.recordCensus]; simp
  have named := (List.mem_filter.mp selected).2
  simp only [controllerNamesActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at named
  have process := named.1.1.trans tuple.ownerProcess.symm
  rw [process, tuple.taskOwner, tuple.timerOwner]
  exact ⟨rfl, rfl, rfl⟩

private theorem bound_record_owner_process (program : Program) (state : RuntimeState)
    (controller : SequentialMultiInstanceController) (record : ActivityOccurrence)
    (member : record ∈ state.activityOccurrences)
    (named : controllerNamesActivityOccurrence controller record = true)
    (valid : sequentialMultiInstanceControllerProgramBindingValid program state controller = true) :
    record.owner.processInstanceId = record.processInstanceId := by
  unfold sequentialMultiInstanceControllerProgramBindingValid at valid
  generalize selected : state.activityOccurrences.filter
    (controllerNamesActivityOccurrence controller) = records at valid
  cases records with
  | nil => simp at valid
  | cons first rest =>
    cases rest with
    | cons next tail => simp at valid
    | nil =>
      have same : record = first := by
        have present := List.mem_filter.mpr ⟨member, named⟩
        simpa only [selected, List.mem_singleton] using present
      subst first
      simp only at valid
      split at valid
      · simp only [Bool.and_eq_true, beq_iff_eq] at valid
        exact valid.1.2
      · contradiction

/-- The original forward binding supplies the owner/identity equality needed by Call cleanup;
the actual controller filter therefore retains its entire Activity lookup census. -/
theorem removeCalledProcessTree_controller_activity_census (program : Program)
    (state : RuntimeState) (call : CalledProcessOccurrence)
    (controller : SequentialMultiInstanceController)
    (survives : controller ∈ (removeCalledProcessTree state call).sequentialMultiInstanceControllers)
    (valid : sequentialMultiInstanceControllerProgramBindingValid program state controller = true) :
    (removeCalledProcessTree state call).activityOccurrences.filter
      (controllerNamesActivityOccurrence controller) =
      state.activityOccurrences.filter (controllerNamesActivityOccurrence controller) := by
  have kept := (List.mem_filter.mp survives).2
  change (state.activityOccurrences.filter _).filter _ = _
  simp only [List.filter_filter]
  apply List.filter_congr
  intro record member
  cases named : controllerNamesActivityOccurrence controller record with
  | false => simp
  | true =>
    have owner := bound_record_owner_process program state controller record member named valid
    have identity := named
    simp only [controllerNamesActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at identity
    rw [owner, ← identity.1.1]
    exact kept

/-- REG-OWN-CLOSE-01 supplies retained Activity work, while the predecessor SMI binding supplies
the controller's exact identity census. The result concerns the actual Call-removal filters. -/
theorem removeCalledProcessTree_preserves_controller_program_bindings (program : Program)
    (state : RuntimeState) (call : CalledProcessOccurrence)
    (bindings : sequentialMultiInstanceControllerProgramBindingsValid program state = true)
    (bodies : activityRecordsOwnLiveWork state = true)
    (closed : regionalOwnershipClosed state (callReferenceRetention state call) = true) :
    sequentialMultiInstanceControllerProgramBindingsValid program
      (removeCalledProcessTree state call) = true := by
  have retainedBodies := regional_reference_retention_preserves_activity_records state
    (removeCalledProcessTree state call) (callReferenceRetention state call)
    (callReferenceRetention_matches_removal state call) closed bodies
  apply List.all_eq_true.mpr
  intro controller member
  have prior := List.all_eq_true.mp bindings controller (List.mem_filter.mp member).1
  exact smi_binding_of_retained_work program state (removeCalledProcessTree state call)
    controller (removeCalledProcessTree_controller_activity_census program state call controller member prior)
    List.filter_sublist List.filter_sublist bodies retainedBodies prior

/-- Call cleanup retains complete SMI tuples by their Process instance. Finite correspondence,
not an assumed successor count equality, preserves the reverse operation-owned populations. -/
theorem removeCalledProcessTree_preserves_sequential_operation_binding (program : Program)
    (state : RuntimeState) (call : CalledProcessOccurrence)
    (operation : SemanticOperation) (operationMem : operation ∈ program.operations)
    (bindings : sequentialMultiInstanceControllerProgramBindingsValid program state = true)
    (complete : sequentialMultiInstanceOperationBindingComplete program state operation = true)
    (unique : controllerIdentitiesUnique state = true)
    (bodyClaims : activityBodyClaimsUnique state.activityOccurrences = true)
    (timerClaims : attachedTimersUnambiguous state = true) :
    sequentialMultiInstanceOperationBindingComplete program
      (removeCalledProcessTree state call) operation = true := by
  apply sequential_operation_binding_after_filters program state
    (removeCalledProcessTree state call) _ _ _ _ rfl rfl rfl rfl
    (fun controller id task boundary tuple =>
      call_tuple_retention program state controller id task boundary tuple _)
    operation operationMem bindings complete unique bodyClaims timerClaims

/-- Both executable halves of SMI binding survive actual whole-Call cleanup. All validity and
closure premises describe the predecessor; no successor selection or validity is assumed. -/
theorem removeCalledProcessTree_preserves_sequential_program_bindings (program : Program)
    (state : RuntimeState) (call : CalledProcessOccurrence)
    (bindings : sequentialMultiInstanceProgramBindingsValid program state = true)
    (bodies : activityRecordsOwnLiveWork state = true)
    (timers : attachedTimersUnambiguous state = true)
    (unique : controllerIdentitiesUnique state = true)
    (bodyClaims : activityBodyClaimsUnique state.activityOccurrences = true)
    (closed : regionalOwnershipClosed state (callReferenceRetention state call) = true) :
    sequentialMultiInstanceProgramBindingsValid program
      (removeCalledProcessTree state call) = true := by
  simp only [sequentialMultiInstanceProgramBindingsValid, Bool.and_eq_true] at bindings ⊢
  refine ⟨removeCalledProcessTree_preserves_controller_program_bindings program state call
    bindings.1 bodies closed, ?_⟩
  apply List.all_eq_true.mpr
  intro operation member
  exact removeCalledProcessTree_preserves_sequential_operation_binding program state call
    operation member bindings.1 (List.all_eq_true.mp bindings.2 operation member) unique bodyClaims timers

end BpmnSemantics.SemanticProcess
