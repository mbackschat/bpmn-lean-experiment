import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime
import BpmnSemantics.SemanticProcess.InternalArmingOrder

/-! Monotone Task activation issuance preserves the provenance of retained Transaction
handler subjects, including tombstones whose child scope has been disposed. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem counter_filter_set_other (values : List TaskActivation)
    (target : TaskDefinitionId) (count : Nat) (key : String) (different : target.value ≠ key) :
    (setActivationCount values target count).filter (fun counter => counter.taskId.value == key) =
      values.filter (fun counter => counter.taskId.value == key) := by
  unfold setActivationCount
  rw [insertTaskActivation_eq_canonicalInsertBy, filter_canonicalInsertBy_rejected]
  · simp only [List.filter_filter]
    congr 1
    funext counter
    by_cases same : counter.taskId = target
    · simp [same, different]
    · simp [same]
  · simp [different]

private theorem counter_filter_set_self (values : List TaskActivation)
    (target : TaskDefinitionId) (count : Nat) :
    (setActivationCount values target count).filter (fun counter => counter.taskId.value == target.value) =
      [{ taskId := target, count }] := by
  unfold setActivationCount
  rw [insertTaskActivation_eq_canonicalInsertBy]
  have empty : (values.filter (fun counter => decide (counter.taskId ≠ target))).filter
      (fun counter => counter.taskId.value == target.value) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro counter member
    have different := of_decide_eq_true (List.mem_filter.mp member).2
    have valuesDifferent : counter.taskId.value ≠ target.value := by
      intro same
      exact different (congrArg TaskDefinitionId.mk same)
    simp [valuesDifferent]
  have perm := filter_canonicalInsertBy_perm activationBefore
    (fun counter => counter.taskId.value == target.value) { taskId := target, count }
    (values.filter fun counter => decide (counter.taskId ≠ target)) (by simp)
  rw [empty] at perm
  exact List.perm_singleton.mp perm

private theorem task_count_of_singleton_filter (values : List TaskActivation) (key : String)
    (counter : TaskActivation)
    (selected : values.filter (fun candidate => candidate.taskId.value == key) = [counter]) :
    taskActivationCount values ⟨key⟩ = counter.count := by
  induction values with
  | nil => simp at selected
  | cons current rest ih =>
      by_cases same : current.taskId.value = key
      · have idSame : current.taskId = ⟨key⟩ := congrArg TaskDefinitionId.mk same
        simp only [List.filter_cons, same, beq_self_eq_true, ↓reduceIte, List.cons.injEq] at selected
        simp only [taskActivationCount, idSame, ↓reduceIte]
        rw [selected.1]
      · have idDifferent : current.taskId ≠ ⟨key⟩ := fun eq => same (congrArg TaskDefinitionId.value eq)
        simp only [List.filter_cons, show (current.taskId.value == key) = false by simp [same],
          Bool.false_eq_true, ↓reduceIte] at selected
        simpa [taskActivationCount, idDifferent] using ih selected

/-- Issuing the next Task counter preserves the singleton provenance of disposed subjects. -/
private theorem task_provenance_set_preserved (state : RuntimeState) (task : TaskDefinitionId)
    (issued : Nat) (monotone : activationCount state task ≤ issued) (key : String) (activation : Nat)
    (valid : (match state.activations.filter (fun counter => counter.taskId.value == key) with
      | [counter] => decide (activation ≤ counter.count) | _ => false) = true) :
    (match (setActivationCount state.activations task issued).filter
        (fun counter => counter.taskId.value == key) with
      | [counter] => decide (activation ≤ counter.count) | _ => false) = true := by
  split at valid
  · rename_i counter selected
    have bound : activation ≤ counter.count := of_decide_eq_true valid
    by_cases same : task.value = key
    · rw [← same, counter_filter_set_self]
      have prior := task_count_of_singleton_filter state.activations key counter selected
      have taskEq : task = ⟨key⟩ := congrArg TaskDefinitionId.mk same
      have counted : activationCount state task = counter.count := by
        simpa [activationCount, taskEq] using prior
      simp only [decide_eq_true_eq]
      omega
    · simpa only [counter_filter_set_other _ _ _ _ same, selected] using valid
  · contradiction

theorem transactionTriggerProvenanceValid_setActivationCount (state : RuntimeState)
    (task : TaskDefinitionId) (issued : Nat) (monotone : activationCount state task ≤ issued)
    (trigger : CompensationTriggerExecution)
    (valid : transactionTriggerProvenanceValid state trigger = true) :
    transactionTriggerProvenanceValid
      { state with activations := setActivationCount state.activations task issued } trigger = true := by
  simp only [transactionTriggerProvenanceValid, Bool.and_eq_true] at valid ⊢
  refine ⟨valid.1, ?_⟩
  apply List.all_eq_true.mpr
  intro handler member
  have prior := List.all_eq_true.mp valid.2 handler member
  cases subject : handler.identity.subject with
  | eventSubProcess parent => simp [subject] at prior
  | boundaryActivity activity =>
      simp only [subject, Bool.and_eq_true] at prior ⊢
      exact ⟨prior.1, task_provenance_set_preserved state task issued monotone
        activity.activityElementId.value activity.activation prior.2⟩

end BpmnSemantics.SemanticProcess
