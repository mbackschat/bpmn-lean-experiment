import BpmnSemantics.SemanticProcess.InternalCommutationRuntimePreservation

/-! # Multi-Instance frames for unrelated Activity-data arming

The admitted declarer census separates the new ordinary Activity from existing Multi-Instance
controllers. Their record filters and independent high-water counters therefore remain exact.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open InternalCommutation

theorem sequentialController_rejects_unrelated_activity
    (program : Program) (state : RuntimeState) (inserted : ActivityOccurrence)
    (controller : SequentialMultiInstanceController)
    (disjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
          task.id.value ≠ inserted.activityElementId.value
      | _ => True)
    (bound : sequentialMultiInstanceControllerProgramBindingValid program state controller = true) :
    controllerNamesActivityOccurrence controller inserted = false := by
  unfold sequentialMultiInstanceControllerProgramBindingValid at bound
  split at bound
  · rename_i record recordsEq
    split at bound
    · rename_i id origin input task data output timer limits operationsEq
      let operation := SemanticOperation.awaitSequentialMultiInstanceUserTask id origin input
        task data output timer limits
      have member : operation ∈ [.awaitSequentialMultiInstanceUserTask id origin input task
          data output timer limits] := by simp [operation]
      rw [← operationsEq] at member
      obtain ⟨rawMember, taskMatch⟩ := List.mem_filter.mp member
      have different := disjoint operation rawMember
      simp only [operation, decide_eq_true_eq] at taskMatch different
      apply Bool.eq_false_iff.mpr
      intro matched
      simp only [controllerNamesActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at matched
      exact different (taskMatch.trans (congrArg (fun id => id.value) matched.1.2))
    · simp at bound
  · simp at bound

theorem sequentialBindings_insertActivityOccurrence_frame
    (program : Program) (state : RuntimeState) (inserted : ActivityOccurrence)
    (disjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
          task.id.value ≠ inserted.activityElementId.value
      | _ => True)
    (valid : sequentialMultiInstanceProgramBindingsValid program state = true) :
    sequentialMultiInstanceProgramBindingsValid program
      { state with activityOccurrences := insertActivityOccurrence inserted state.activityOccurrences } =
      true := by
  simp only [sequentialMultiInstanceProgramBindingsValid,
    sequentialMultiInstanceControllerProgramBindingsValid, Bool.and_eq_true,
    List.all_eq_true] at valid ⊢
  refine ⟨?_, ?_⟩
  · intro controller member
    have prior := valid.1 controller member
    have rejected := sequentialController_rejects_unrelated_activity program state inserted
      controller disjoint prior
    unfold sequentialMultiInstanceControllerProgramBindingValid
    rw [insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ rejected]
    exact prior
  · intro operation member
    have prior := valid.2 operation member
    cases operation <;> try exact prior
    rename_i id origin input task data output timer limits
    have different := disjoint (.awaitSequentialMultiInstanceUserTask id origin input task data
      output timer limits) member
    simp only [sequentialMultiInstanceOperationBindingComplete] at prior ⊢
    have filtered : (insertActivityOccurrence inserted state.activityOccurrences).filter
        (fun record => decide (record.activityElementId.value = task.id.value)) =
        state.activityOccurrences.filter
          (fun record => decide (record.activityElementId.value = task.id.value)) := by
      rw [insertActivityOccurrence_eq_canonicalInsertBy]
      apply filter_canonicalInsertBy_rejected
      simp [Ne.symm different]
    rw [filtered]
    exact prior

theorem controllersOwnLiveActivity_insert_unrelated_activity
    (program : Program) (state : RuntimeState) (inserted : ActivityOccurrence)
    (disjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
          task.id.value ≠ inserted.activityElementId.value
      | _ => True)
    (bindings : sequentialMultiInstanceProgramBindingsValid program state = true)
    (valid : controllersOwnLiveActivity state = true) :
    controllersOwnLiveActivity
      { state with activityOccurrences := insertActivityOccurrence inserted state.activityOccurrences } =
      true := by
  simp only [controllersOwnLiveActivity, List.all_eq_true] at valid ⊢
  simp only [sequentialMultiInstanceProgramBindingsValid,
    sequentialMultiInstanceControllerProgramBindingsValid, Bool.and_eq_true,
    List.all_eq_true] at bindings
  intro controller member
  have rejected := sequentialController_rejects_unrelated_activity program state inserted controller
    disjoint (bindings.1 controller member)
  rw [insertActivityOccurrence_eq_canonicalInsertBy,
    filter_canonicalInsertBy_rejected _ _ _ _ rejected]
  exact valid controller member

theorem parallelBindings_insertActivityOccurrence_frame
    (program : Program) (state : RuntimeState) (inserted : ActivityOccurrence)
    (disjoint : ∀ operation ∈ program.operations, ∀ arm,
      ParallelMultiInstanceArm.ofOperation? operation = some arm →
        arm.taskId.value ≠ inserted.activityElementId.value)
    (valid : parallelMultiInstanceProgramBindingsValid program state = true) :
    parallelMultiInstanceProgramBindingsValid program
      { state with
        activityOccurrences := insertActivityOccurrence inserted state.activityOccurrences
        activityActivations := setActivationCount state.activityActivations
          ⟨inserted.activityElementId.value⟩ inserted.activation } = true := by
  have beforeValid := valid
  simp only [parallelMultiInstanceProgramBindingsValid, Bool.and_eq_true,
    List.all_eq_true] at valid ⊢
  refine ⟨⟨⟨?_, valid.1.1.2⟩, valid.1.2⟩, ?_⟩
  · intro controller member
    have prior := valid.1.1.1 controller member
    obtain ⟨entry, arm, record, _, _, _, _, _, recordsEq, operationsEq, projects, _⟩ :=
      (parallelMultiInstanceProgramBindingsValid_controller_facts program state controller
        beforeValid member).witnesses
    have entryFiltered : entry ∈ [entry] := by simp
    rw [← operationsEq] at entryFiltered
    obtain ⟨entryMember, taskMatch⟩ := List.mem_filter.mp entryFiltered
    simp only [projects, beq_iff_eq] at taskMatch
    have different := disjoint entry entryMember arm projects
    have controllerDifferent : controller.id.activityElementId.value ≠
        inserted.activityElementId.value := fun same => different (taskMatch.trans same)
    have rejected : parallelControllerNamesIdentity controller inserted.processInstanceId
        ⟨inserted.activityElementId.value⟩ inserted.activation = false := by
      apply Bool.eq_false_iff.mpr
      intro matched
      simp only [parallelControllerNamesIdentity, Bool.and_eq_true, beq_iff_eq] at matched
      exact controllerDifferent (congrArg SemanticId.value matched.1.2)
    have recordFrame : (insertActivityOccurrence inserted state.activityOccurrences).filter
        (fun candidate => parallelControllerNamesIdentity controller candidate.processInstanceId
          ⟨candidate.activityElementId.value⟩ candidate.activation) =
        state.activityOccurrences.filter (fun candidate =>
          parallelControllerNamesIdentity controller candidate.processInstanceId
            ⟨candidate.activityElementId.value⟩ candidate.activation) := by
      rw [insertActivityOccurrence_eq_canonicalInsertBy]
      exact filter_canonicalInsertBy_rejected _ _ _ _ rejected
    have counterFrame : taskActivationCount
        (setActivationCount state.activityActivations ⟨inserted.activityElementId.value⟩
          inserted.activation) arm.taskId = taskActivationCount state.activityActivations arm.taskId := by
      exact activationCount_setActivationCount_other
        { state with activations := state.activityActivations }
        ⟨inserted.activityElementId.value⟩ arm.taskId inserted.activation
        (fun same => different (congrArg TaskDefinitionId.value same))
    simp only [parallelControllerProgramBindingValid, parallelRecordForController?, recordFrame,
      recordsEq] at prior ⊢
    rw (config := { transparency := .default }) [operationsEq] at prior ⊢
    simp only [projects, activityActivationCount, counterFrame] at prior ⊢
    exact prior
  · intro operation member
    have prior := valid.2 operation member
    cases projects : ParallelMultiInstanceArm.ofOperation? operation with
    | none => simp
    | some arm =>
        have different := disjoint operation member arm projects
        simp only [projects] at prior ⊢
        cases selected : operationOwningScope? program operation.id with
        | none => simp [selected] at prior
        | some scopeId =>
            have recordFrame : (insertActivityOccurrence inserted state.activityOccurrences).filter
                (fun record => record.activityElementId.value == arm.taskId.value &&
                  record.owner.definitionScopeId == scopeId &&
                  (activityBodyParallelTasks? record).isSome) =
                state.activityOccurrences.filter
                  (fun record => record.activityElementId.value == arm.taskId.value &&
                    record.owner.definitionScopeId == scopeId &&
                    (activityBodyParallelTasks? record).isSome) := by
              rw [insertActivityOccurrence_eq_canonicalInsertBy]
              apply filter_canonicalInsertBy_rejected
              simp [Ne.symm different]
            simp only [selected, recordFrame] at prior ⊢
            exact prior

end BpmnSemantics.SemanticProcess
