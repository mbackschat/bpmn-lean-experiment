import BpmnSemantics.SemanticProcess.ParallelMultiInstanceFlowNodeOccurrence
import BpmnSemantics.SemanticProcess.ParallelMultiInstancePreservation

/-! # Parallel Multi-Instance laws

Quantified representation and rewrite laws for fixed-index progress, commutation, ordered output, and
whole-region closure. They state no host scheduling order: the all-policy commutation law removes
accepted order from final slot state, while first-policy lifecycle evidence deliberately retains the
winner and terminated siblings.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Stable progress accounting is the slot partition, not stored counters. -/
theorem parallel_slot_progress_accounting (slots : List ParallelMultiInstanceSlot) :
    parallelActiveSlotCount slots + parallelCompletedSlotCount slots = slots.length := by
  induction slots with
  | nil => rfl
  | cons slot rest ih =>
      cases slot <;>
        simp [parallelActiveSlotCount, parallelCompletedSlotCount, ih, Nat.add_assoc,
          Nat.add_comm, Nat.add_left_comm]

/-- Atomic entry creates exactly one slot per immutable snapshot item. -/
theorem pending_parallel_slots_match_snapshot_length (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (highWater : Nat) (snapshot : List String) :
    (pendingParallelSlots processInstanceId taskId highWater snapshot).length = snapshot.length := by
  unfold pendingParallelSlots
  generalize indexEquation : 0 = index
  clear indexEquation
  induction snapshot generalizing index with
  | nil => rfl
  | cons _ rest ih =>
      simp [pendingParallelSlotsFrom, ih]

/-- Two different input indices mint different task identities above one pre-entry high-water mark. -/
theorem batch_task_identity_is_pairwise_fresh_by_index (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (highWater left right : Nat)
    (different : left ≠ right) :
    mintedParallelTaskId processInstanceId taskId highWater left ≠
      mintedParallelTaskId processInstanceId taskId highWater right := by
  intro equal
  have activations := congrArg (fun task : UserTaskInstanceId => task.activation) equal
  simp [mintedParallelTaskId] at activations
  omega

/-- Completing a slot retains its child identity. -/
theorem complete_parallel_slot_preserves_task_identity (target : UserTaskInstanceId)
    (result : String) (slot : ParallelMultiInstanceSlot) :
    (completeParallelSlot target result slot).taskId = slot.taskId := by
  cases slot with
  | pending taskId =>
      by_cases hit : taskId = target <;>
        simp [completeParallelSlot, ParallelMultiInstanceSlot.taskId, hit]
  | completed => rfl

/-- Pointwise completion changes neither slot count nor the fixed identity-at-index array. -/
theorem replace_pending_parallel_slot_preserves_index_frame
    (slots : List ParallelMultiInstanceSlot) (target : UserTaskInstanceId) (result : String) :
    (replacePendingParallelSlot slots target result).length = slots.length ∧
      parallelSlotTaskIds (replacePendingParallelSlot slots target result) =
        parallelSlotTaskIds slots := by
  constructor
  · simp [replacePendingParallelSlot]
  · simp only [replacePendingParallelSlot, parallelSlotTaskIds, List.map_map]
    apply List.map_congr_left
    intro slot _
    exact complete_parallel_slot_preserves_task_identity target result slot

theorem complete_parallel_slot_commutes {left right : UserTaskInstanceId}
    (different : left ≠ right) (leftResult rightResult : String)
    (slot : ParallelMultiInstanceSlot) :
    completeParallelSlot right rightResult (completeParallelSlot left leftResult slot) =
      completeParallelSlot left leftResult (completeParallelSlot right rightResult slot) := by
  cases slot with
  | completed => rfl
  | pending taskId =>
      by_cases leftHit : taskId = left
      · subst left
        simp [completeParallelSlot, different]
      · by_cases rightHit : taskId = right
        · subst right
          simp [completeParallelSlot, leftHit]
        · simp [completeParallelSlot, leftHit, rightHit]

/-- Under `all`, two distinct accepted task completions commute at the complete slot-state boundary. -/
theorem two_distinct_all_policy_slot_completions_commute
    (slots : List ParallelMultiInstanceSlot) {left right : UserTaskInstanceId}
    (different : left ≠ right) (leftResult rightResult : String) :
    replacePendingParallelSlot (replacePendingParallelSlot slots left leftResult)
        right rightResult =
      replacePendingParallelSlot (replacePendingParallelSlot slots right rightResult)
        left leftResult := by
  simp only [replacePendingParallelSlot, List.map_map]
  apply List.map_congr_left
  intro slot _
  exact complete_parallel_slot_commutes different leftResult rightResult slot

/-- Final aggregation writes the complete result list in the slot traversal order. -/
theorem final_aggregation_publishes_input_index_order (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) (slots : List ParallelMultiInstanceSlot)
    (results : List String) (_complete : completedParallelResults? slots = some results) :
    (finishedParallelMultiInstanceState arm before results).processBindings =
      mergeProcessVariableBindings before.processBindings
        [{ name := arm.data.output.dataObjectReferenceId, value := .stringList results }] := by
  rfl

/-- A false completion retains the one lifetime Timer and publishes no Process data. -/
theorem false_completion_preserves_timer_and_publishes_nothing
    (before : ParallelMultiInstanceRuntimeState) (controller : ParallelMultiInstanceController)
    (updatedSlots : List ParallelMultiInstanceSlot) :
    let after := progressedParallelMultiInstanceState before controller updatedSlots
    after.lifetimeTimer = before.lifetimeTimer ∧
      after.processBindings = before.processBindings := by
  exact ⟨rfl, rfl⟩

/-- Early completion removes every sibling, the Timer, and controller while publishing no output. -/
theorem early_completion_withdraws_region_and_publishes_nothing
    (arm : ParallelMultiInstanceArm) (before : ParallelMultiInstanceRuntimeState) :
    let after := earlyClosedParallelMultiInstanceState arm before
    after.controller = none ∧ after.liveChildren = [] ∧ after.lifetimeTimer = none ∧
      after.processBindings = before.processBindings := by
  exact ⟨rfl, rfl, rfl, rfl⟩

/-- Timer interruption removes the whole live region, uses only the boundary route, and publishes no
output. -/
theorem timer_interruption_withdraws_region_and_publishes_nothing
    (arm : ParallelMultiInstanceArm) (before : ParallelMultiInstanceRuntimeState) :
    let after := timerClosedParallelMultiInstanceState arm before
    after.controller = none ∧ after.liveChildren = [] ∧ after.lifetimeTimer = none ∧
      after.enabledOutput = some arm.boundaryTimer.output ∧
      after.processBindings = before.processBindings := by
  exact ⟨rfl, rfl, rfl, rfl, rfl⟩

/-- Every successfully entered open region carries pairwise-distinct task identities. -/
theorem open_region_task_identities_are_pairwise_distinct (arm : ParallelMultiInstanceArm)
    (state : ParallelMultiInstanceRuntimeState) (controller : ParallelMultiInstanceController)
    (bound : state.controller = some controller)
    (wellFormed : parallelMultiInstanceRuntimeWellFormed arm state = true) :
    (parallelSlotTaskIds controller.slots).Nodup := by
  simp only [parallelMultiInstanceRuntimeWellFormed, bound, Bool.and_eq_true,
    decide_eq_true_eq] at wellFormed
  exact wellFormed.1.1.1.1.1.2

end BpmnSemantics.SemanticProcess
