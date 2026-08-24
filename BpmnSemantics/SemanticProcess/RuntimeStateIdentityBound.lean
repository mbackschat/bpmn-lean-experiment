import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Runtime-state identity bound

This module owns the implemented, consumer-required part of `RSI-BOUND-01`. It is separate from the
aggregate predicate because one numeric relation spans otherwise independent runtime collections.
-/

namespace BpmnSemantics.SemanticProcess

private theorem taskActivationCount_insert_missing_self (activation : TaskActivation) :
    ∀ values : List TaskActivation,
      (∀ value ∈ values, value.taskId ≠ activation.taskId) →
      taskActivationCount (insertTaskActivation activation values) activation.taskId =
        activation.count := by
  intro values absent
  induction values with
  | nil => simp [insertTaskActivation, taskActivationCount]
  | cons current rest ih =>
      have currentNe := absent current (by simp)
      have restAbsent : ∀ value ∈ rest, value.taskId ≠ activation.taskId := by
        exact fun value mem => absent value (by simp [mem])
      by_cases before : activation.taskId.value < current.taskId.value
      · simp [insertTaskActivation, before, taskActivationCount]
      · simp [insertTaskActivation, before, taskActivationCount, currentNe, ih restAbsent]

private theorem taskActivationCount_filter_other (values : List TaskActivation)
    (target query : TaskDefinitionId) (other : query ≠ target) :
    taskActivationCount (values.filter fun value => decide (value.taskId ≠ target)) query =
      taskActivationCount values query := by
  simp only [decide_not]
  induction values with
  | nil => rfl
  | cons current rest ih =>
      by_cases isTarget : current.taskId = target
      · simp [taskActivationCount, isTarget, Ne.symm other, ih]
      · by_cases isQuery : current.taskId = query
        · simp only [List.filter_cons]
          rw [show (!decide (current.taskId = target)) = true by simp [isTarget]]
          simp [taskActivationCount, isQuery]
        · simp [taskActivationCount, isTarget, isQuery, ih]

private theorem taskActivationCount_insert_missing_other (activation : TaskActivation)
    (query : TaskDefinitionId) (other : query ≠ activation.taskId) :
    ∀ values : List TaskActivation,
      (∀ value ∈ values, value.taskId ≠ activation.taskId) →
      taskActivationCount (insertTaskActivation activation values) query =
        taskActivationCount values query := by
  intro values absent
  have activationNeQuery : activation.taskId ≠ query := Ne.symm other
  induction values with
  | nil => simp [insertTaskActivation, taskActivationCount, activationNeQuery]
  | cons current rest ih =>
      have currentNe := absent current (by simp)
      have restAbsent : ∀ value ∈ rest, value.taskId ≠ activation.taskId := by
        exact fun value mem => absent value (by simp [mem])
      by_cases before : activation.taskId.value < current.taskId.value
      · simp [insertTaskActivation, before, taskActivationCount, activationNeQuery]
      · by_cases isQuery : current.taskId = query
        · have notBeforeQuery : ¬activation.taskId.value < query.value := by
            simpa [isQuery] using before
          simp [insertTaskActivation, taskActivationCount, isQuery, notBeforeQuery]
        · simp [insertTaskActivation, before, taskActivationCount, isQuery, ih restAbsent]

theorem activationCount_setActivationCount_self (state : RuntimeState)
    (taskId : TaskDefinitionId) (count : Nat) :
    activationCount { state with
      activations := setActivationCount state.activations taskId count } taskId = count := by
  change taskActivationCount (setActivationCount state.activations taskId count) taskId = count
  apply taskActivationCount_insert_missing_self
  intro value mem
  exact of_decide_eq_true (List.mem_filter.mp mem).2

theorem activationCount_setActivationCount_other (state : RuntimeState)
    (target query : TaskDefinitionId) (count : Nat) (other : query ≠ target) :
    activationCount { state with
      activations := setActivationCount state.activations target count } query =
      activationCount state query := by
  change taskActivationCount (setActivationCount state.activations target count) query =
    taskActivationCount state.activations query
  unfold setActivationCount
  rw [taskActivationCount_insert_missing_other _ _ other]
  · exact taskActivationCount_filter_other _ _ _ other
  · intro value mem
    exact of_decide_eq_true (List.mem_filter.mp mem).2

/-- No live occurrence in the three consumer-required counter families is numbered above its
element's recorded count. An absent counter reads as zero through the shared accessors.

The approved account also identifies Message, Effect, event-race, Call, and ordinary Scope families.
The pre-existing aggregate fixture target already exhausted the required 3 GiB Lean bound before this
rule was added, so those consumer-free branches remain explicit open work rather than being claimed by
this predicate. -/
def runtimeStateIdentityBound (state : RuntimeState) : Bool :=
  (state.waits.all fun wait =>
    decide (wait.activation ≤ activationCount state wait.task.id)) &&
  (state.timerWaits.all fun wait =>
    decide (wait.activation ≤ timerActivationCount state wait.elementId)) &&
  (state.activityOccurrences.all fun record =>
    decide (record.activation ≤ activityActivationCount state
      { value := record.activityElementId.value }))

end BpmnSemantics.SemanticProcess
