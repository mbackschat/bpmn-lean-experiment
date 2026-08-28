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

/-- Removing two independently completed child waits retains no completion order. -/
private theorem remove_parallel_child_wait_singletons_commute
    (waits : List UserTaskWait) (left right : UserTaskInstanceId) :
    removeParallelChildWaits (removeParallelChildWaits waits [left]) [right] =
      removeParallelChildWaits (removeParallelChildWaits waits [right]) [left] := by
  simp only [removeParallelChildWaits, List.filter_filter, List.contains_cons,
    List.contains_nil, Bool.or_false]
  apply List.filter_congr
  intro wait _
  simp only [Bool.and_comm]

/-- Rewriting one Activity body twice retains only the last fixed-index pending list. -/
private theorem replace_parallel_record_body_twice
    (records : List ActivityOccurrence) (record : ActivityOccurrence)
    (firstPending finalPending : List UserTaskInstanceId)
    (finalNonempty : finalPending ≠ []) :
    replaceParallelRecordBody
        (replaceParallelRecordBody records record firstPending) record finalPending =
      replaceParallelRecordBody records record finalPending := by
  cases firstPending with
  | nil => simp [replaceParallelRecordBody]
  | cons first rest =>
      cases finalPending with
      | nil => simp at finalNonempty
      | cons final finalRest =>
          simp only [replaceParallelRecordBody, List.map_map]
          apply List.map_congr_left
          intro candidate _
          by_cases same : sameActivityOccurrence candidate record = true
          · have sameAfter : sameActivityOccurrence
                { candidate with body := .parallelUserTasks first rest } record = true := by
              simpa [sameActivityOccurrence] using same
            simp only [Function.comp_apply]
            simp [same, sameAfter]
          · have different : sameActivityOccurrence candidate record = false := by
              cases found : sameActivityOccurrence candidate record <;> simp_all
            simp only [Function.comp_apply]
            simp [same]

/-- Closing after a progress rewrite removes the same Activity record as closing directly. -/
private theorem remove_parallel_record_after_body_rewrite
    (records : List ActivityOccurrence) (record : ActivityOccurrence)
    (pending : List UserTaskInstanceId) :
    removeParallelRecord (replaceParallelRecordBody records record pending) record =
      removeParallelRecord records record := by
  cases pending with
  | nil => rfl
  | cons first rest =>
      induction records with
      | nil => rfl
      | cons candidate records ih =>
          simp only [replaceParallelRecordBody, List.map_cons, removeParallelRecord,
            List.filter_cons]
          by_cases same : sameActivityOccurrence candidate record = true
          · have sameAfter : sameActivityOccurrence
                { candidate with body := .parallelUserTasks first rest } record = true := by
              simpa [sameActivityOccurrence] using same
            simp [same, sameAfter]
            simpa only [replaceParallelRecordBody, removeParallelRecord] using ih
          · simp [same]
            simpa only [replaceParallelRecordBody, removeParallelRecord] using ih

/-- Removing the controller just inserted as a progress replacement exposes the original frame. -/
private theorem remove_inserted_parallel_controller
    (controllers : List ParallelMultiInstanceController)
    (inserted : ParallelMultiInstanceController) :
    removeParallelController
        (insertParallelMultiInstanceController inserted controllers) inserted =
      removeParallelController controllers inserted := by
  induction controllers with
  | nil => simp [insertParallelMultiInstanceController, removeParallelController]
  | cons current rest ih =>
      unfold insertParallelMultiInstanceController
      by_cases before : parallelMultiInstanceControllerBefore inserted current
      · rw [if_pos before]
        simp [removeParallelController]
      · rw [if_neg before]
        unfold removeParallelController at ih ⊢
        simp only [List.filter_cons]
        rw [ih]

private theorem remove_parallel_controller_idempotent
    (controllers : List ParallelMultiInstanceController)
    (controller : ParallelMultiInstanceController) :
    removeParallelController (removeParallelController controllers controller) controller =
      removeParallelController controllers controller := by
  simp only [removeParallelController, List.filter_filter]
  apply List.filter_congr
  intro candidate _
  simp

private theorem remove_parallel_controller_rewritten_reference
    (controllers : List ParallelMultiInstanceController)
    (controller : ParallelMultiInstanceController)
    (slots : List ParallelMultiInstanceSlot) :
    removeParallelController controllers { controller with slots } =
      removeParallelController controllers controller := by
  rfl

/-- Completed aggregation is fixed by slot index, not by acceptance order. -/
private theorem completed_parallel_results_of_commuted_slots
    (slots : List ParallelMultiInstanceSlot) {left right : UserTaskInstanceId}
    (different : left ≠ right) (leftResult rightResult : String)
    (leftResults rightResults : List String)
    (leftCompleted : completedParallelResults?
      (replacePendingParallelSlot (replacePendingParallelSlot slots left leftResult)
        right rightResult) = some leftResults)
    (rightCompleted : completedParallelResults?
      (replacePendingParallelSlot (replacePendingParallelSlot slots right rightResult)
        left leftResult) = some rightResults) :
    leftResults = rightResults := by
  rw [two_distinct_all_policy_slot_completions_commute slots different leftResult rightResult]
    at leftCompleted
  rw [leftCompleted] at rightCompleted
  exact Option.some.inj rightCompleted

private def progressedSharedParallelCompletionState (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (taskId : UserTaskInstanceId) (result : String)
    (pending : List UserTaskInstanceId) : RuntimeState :=
  { state with
    waits := removeParallelChildWaits state.waits [taskId]
    activityOccurrences := replaceParallelRecordBody state.activityOccurrences record pending
    parallelMultiInstanceControllers := insertParallelMultiInstanceController
      { controller with slots := replacePendingParallelSlot controller.slots taskId result }
      (removeParallelController state.parallelMultiInstanceControllers controller) }

private theorem replace_parallel_record_body_rewritten_reference
    (records : List ActivityOccurrence) (record : ActivityOccurrence)
    (oldFirst newFirst : UserTaskInstanceId)
    (oldRest newRest : List UserTaskInstanceId) :
    replaceParallelRecordBody records
        { record with body := .parallelUserTasks oldFirst oldRest }
        (newFirst :: newRest) =
      replaceParallelRecordBody records record (newFirst :: newRest) := by
  rfl

private theorem remove_parallel_record_rewritten_reference
    (records : List ActivityOccurrence) (record : ActivityOccurrence)
    (first : UserTaskInstanceId) (rest : List UserTaskInstanceId) :
    removeParallelRecord records { record with body := .parallelUserTasks first rest } =
      removeParallelRecord records record := by
  rfl

/-- Two false-condition progress rewrites normalize to one exact shared `RuntimeState`. -/
private theorem progressed_shared_parallel_completions_commute
    (state : RuntimeState) (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence) {left right : UserTaskInstanceId}
    (different : left ≠ right) (leftResult rightResult : String)
    (leftFirst rightFirst finalFirst : UserTaskInstanceId)
    (leftRest rightRest finalRest : List UserTaskInstanceId) :
    progressedSharedParallelCompletionState
        (progressedSharedParallelCompletionState state controller record left leftResult
          (leftFirst :: leftRest))
        { controller with
          slots := replacePendingParallelSlot controller.slots left leftResult }
        { record with body := .parallelUserTasks leftFirst leftRest }
        right rightResult (finalFirst :: finalRest) =
      progressedSharedParallelCompletionState
        (progressedSharedParallelCompletionState state controller record right rightResult
          (rightFirst :: rightRest))
        { controller with
          slots := replacePendingParallelSlot controller.slots right rightResult }
        { record with body := .parallelUserTasks rightFirst rightRest }
        left leftResult (finalFirst :: finalRest) := by
  unfold progressedSharedParallelCompletionState
  simp only [RuntimeState.mk.injEq, true_and, and_true]
  constructor
  · exact remove_parallel_child_wait_singletons_commute state.waits left right
  constructor
  · rw [replace_parallel_record_body_rewritten_reference,
      replace_parallel_record_body_rewritten_reference,
      replace_parallel_record_body_twice, replace_parallel_record_body_twice]
    <;> simp
  · rw [remove_inserted_parallel_controller, remove_inserted_parallel_controller,
      two_distinct_all_policy_slot_completions_commute controller.slots different leftResult
        rightResult]
    simp only [remove_parallel_controller_rewritten_reference,
      remove_parallel_controller_idempotent]

/-- When the two tasks are the last pending children, progress then final closure also retains no
acceptance order in the exact shared `RuntimeState`. -/
private theorem closed_shared_parallel_completions_commute
    (state : RuntimeState) (arm : ParallelMultiInstanceArm)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    {left right : UserTaskInstanceId} (leftResult rightResult : String)
    (leftResults rightResults : List String)
    (leftPending : pendingParallelTaskIds
      (replacePendingParallelSlot controller.slots left leftResult) = [right])
    (rightPending : pendingParallelTaskIds
      (replacePendingParallelSlot controller.slots right rightResult) = [left])
    (resultsEqual : leftResults = rightResults) :
    closeSharedParallelRegion
        (progressedSharedParallelCompletionState state controller record left leftResult [right])
        { controller with
          slots := replacePendingParallelSlot controller.slots left leftResult }
        { record with body := .parallelUserTasks right [] }
        arm.normalOutput
        (publishSharedParallelResults
          (progressedSharedParallelCompletionState state controller record left leftResult [right])
          arm leftResults) =
      closeSharedParallelRegion
        (progressedSharedParallelCompletionState state controller record right rightResult [left])
        { controller with
          slots := replacePendingParallelSlot controller.slots right rightResult }
        { record with body := .parallelUserTasks left [] }
        arm.normalOutput
        (publishSharedParallelResults
          (progressedSharedParallelCompletionState state controller record right rightResult [left])
          arm rightResults) := by
  subst rightResults
  unfold closeSharedParallelRegion progressedSharedParallelCompletionState
  simp only [RuntimeState.mk.injEq, true_and, and_true]
  constructor
  · rw [leftPending, rightPending]
    exact remove_parallel_child_wait_singletons_commute state.waits left right
  constructor
  · simp only [remove_parallel_record_rewritten_reference]
    rw [remove_parallel_record_after_body_rewrite, remove_parallel_record_after_body_rewrite]
  constructor
  · rw [remove_inserted_parallel_controller, remove_inserted_parallel_controller]
    simp only [remove_parallel_controller_rewritten_reference,
      remove_parallel_controller_idempotent]
  · rfl

/-- Under a false completion condition, two distinct evaluator completions commute while both
commands leave the shared Parallel Multi-Instance region open. The hypotheses expose the evaluator's
same-controller and body-only record selection at the intermediate states; the conclusion is equality
of the exact complete `RuntimeState`, not merely its controller slots or public observation. -/
theorem two_distinct_all_policy_shared_progress_completions_commute
    (arm : ParallelMultiInstanceArm) (state : RuntimeState)
    (instanceId : SemanticId) (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence) {left right : UserTaskInstanceId}
    (different : left ≠ right) (leftSubmitted rightSubmitted : List VariableBinding)
    (leftResult rightResult : String)
    (leftFirst rightFirst finalFirst : UserTaskInstanceId)
    (leftRest rightRest finalRest : List UserTaskInstanceId)
    (running : state.control = .running instanceId)
    (leftInstance : left.processInstanceId = instanceId)
    (rightInstance : right.processInstanceId = instanceId)
    (selectedLeft : parallelControllerForTask? arm state left = some controller)
    (selectedRight : parallelControllerForTask? arm state right = some controller)
    (selectedRecord : parallelControllerRecord? state controller = some record)
    (regionValid : parallelRegionValid arm state controller record = true)
    (leftAccepted : acceptedParallelResult? arm leftSubmitted = some leftResult)
    (rightAccepted : acceptedParallelResult? arm rightSubmitted = some rightResult)
    (conditionFalse : evaluateSimpleBooleanExpression arm.completionCondition
      state.variables.process.bindings = some false)
    (leftIncomplete : completedParallelResults?
      (replacePendingParallelSlot controller.slots left leftResult) = none)
    (rightIncomplete : completedParallelResults?
      (replacePendingParallelSlot controller.slots right rightResult) = none)
    (leftPending : pendingParallelTaskIds
      (replacePendingParallelSlot controller.slots left leftResult) = leftFirst :: leftRest)
    (rightPending : pendingParallelTaskIds
      (replacePendingParallelSlot controller.slots right rightResult) = rightFirst :: rightRest)
    (leftSelectsRight : parallelControllerForTask? arm
      (progressedSharedParallelCompletionState state controller record left leftResult
        (leftFirst :: leftRest)) right =
      some { controller with
        slots := replacePendingParallelSlot controller.slots left leftResult })
    (rightSelectsLeft : parallelControllerForTask? arm
      (progressedSharedParallelCompletionState state controller record right rightResult
        (rightFirst :: rightRest)) left =
      some { controller with
        slots := replacePendingParallelSlot controller.slots right rightResult })
    (leftSelectsRecord : parallelControllerRecord?
      (progressedSharedParallelCompletionState state controller record left leftResult
        (leftFirst :: leftRest))
      { controller with
        slots := replacePendingParallelSlot controller.slots left leftResult } =
      some { record with body := .parallelUserTasks leftFirst leftRest })
    (rightSelectsRecord : parallelControllerRecord?
      (progressedSharedParallelCompletionState state controller record right rightResult
        (rightFirst :: rightRest))
      { controller with
        slots := replacePendingParallelSlot controller.slots right rightResult } =
      some { record with body := .parallelUserTasks rightFirst rightRest })
    (leftRegionRemainsValid : parallelRegionValid arm
      (progressedSharedParallelCompletionState state controller record left leftResult
        (leftFirst :: leftRest))
      { controller with
        slots := replacePendingParallelSlot controller.slots left leftResult }
      { record with body := .parallelUserTasks leftFirst leftRest } = true)
    (rightRegionRemainsValid : parallelRegionValid arm
      (progressedSharedParallelCompletionState state controller record right rightResult
        (rightFirst :: rightRest))
      { controller with
        slots := replacePendingParallelSlot controller.slots right rightResult }
      { record with body := .parallelUserTasks rightFirst rightRest } = true)
    (combinedIncomplete : completedParallelResults?
      (replacePendingParallelSlot (replacePendingParallelSlot controller.slots left leftResult)
        right rightResult) = none)
    (combinedPending : pendingParallelTaskIds
      (replacePendingParallelSlot (replacePendingParallelSlot controller.slots left leftResult)
        right rightResult) = finalFirst :: finalRest) :
    (completeSharedParallelMultiInstance? arm state left leftSubmitted).bind
        (fun after => completeSharedParallelMultiInstance? arm after right rightSubmitted) =
      (completeSharedParallelMultiInstance? arm state right rightSubmitted).bind
        (fun after => completeSharedParallelMultiInstance? arm after left leftSubmitted) := by
  let leftAfter := progressedSharedParallelCompletionState state controller record left leftResult
    (leftFirst :: leftRest)
  let rightAfter := progressedSharedParallelCompletionState state controller record right rightResult
    (rightFirst :: rightRest)
  have leftEvaluation : completeSharedParallelMultiInstance? arm state left leftSubmitted =
      some leftAfter := by
    unfold completeSharedParallelMultiInstance?
    simp [running, leftInstance, selectedLeft, selectedRecord, regionValid, leftAccepted,
      conditionFalse, leftIncomplete, leftPending, leftAfter,
      progressedSharedParallelCompletionState]
  have rightEvaluation : completeSharedParallelMultiInstance? arm state right rightSubmitted =
      some rightAfter := by
    unfold completeSharedParallelMultiInstance?
    simp [running, rightInstance, selectedRight, selectedRecord, regionValid, rightAccepted,
      conditionFalse, rightIncomplete, rightPending, rightAfter,
      progressedSharedParallelCompletionState]
  rw [leftEvaluation, rightEvaluation]
  simp only [Option.bind_some]
  have commutedSlots := two_distinct_all_policy_slot_completions_commute controller.slots
    different leftResult rightResult
  have reverseCombinedIncomplete : completedParallelResults?
      (replacePendingParallelSlot (replacePendingParallelSlot controller.slots right rightResult)
        left leftResult) = none := by
    rw [← commutedSlots]
    exact combinedIncomplete
  have reverseCombinedPending : pendingParallelTaskIds
      (replacePendingParallelSlot (replacePendingParallelSlot controller.slots right rightResult)
        left leftResult) = finalFirst :: finalRest := by
    rw [← commutedSlots]
    exact combinedPending
  have leftAfterRunning : leftAfter.control = .running instanceId := by
    simp [leftAfter, progressedSharedParallelCompletionState, running]
  have rightAfterRunning : rightAfter.control = .running instanceId := by
    simp [rightAfter, progressedSharedParallelCompletionState, running]
  have leftAfterCondition : evaluateSimpleBooleanExpression arm.completionCondition
      leftAfter.variables.process.bindings = some false := by
    simpa [leftAfter, progressedSharedParallelCompletionState] using conditionFalse
  have rightAfterCondition : evaluateSimpleBooleanExpression arm.completionCondition
      rightAfter.variables.process.bindings = some false := by
    simpa [rightAfter, progressedSharedParallelCompletionState] using conditionFalse
  have leftAfterSelectsRight : parallelControllerForTask? arm leftAfter right =
      some { controller with
        slots := replacePendingParallelSlot controller.slots left leftResult } := by
    simpa only [leftAfter] using leftSelectsRight
  have rightAfterSelectsLeft : parallelControllerForTask? arm rightAfter left =
      some { controller with
        slots := replacePendingParallelSlot controller.slots right rightResult } := by
    simpa only [rightAfter] using rightSelectsLeft
  have leftAfterSelectsRecord : parallelControllerRecord? leftAfter
      { controller with slots := replacePendingParallelSlot controller.slots left leftResult } =
      some { record with body := .parallelUserTasks leftFirst leftRest } := by
    simpa only [leftAfter] using leftSelectsRecord
  have rightAfterSelectsRecord : parallelControllerRecord? rightAfter
      { controller with slots := replacePendingParallelSlot controller.slots right rightResult } =
      some { record with body := .parallelUserTasks rightFirst rightRest } := by
    simpa only [rightAfter] using rightSelectsRecord
  have leftAfterRegionValid : parallelRegionValid arm leftAfter
      { controller with slots := replacePendingParallelSlot controller.slots left leftResult }
      { record with body := .parallelUserTasks leftFirst leftRest } = true := by
    simpa only [leftAfter] using leftRegionRemainsValid
  have rightAfterRegionValid : parallelRegionValid arm rightAfter
      { controller with slots := replacePendingParallelSlot controller.slots right rightResult }
      { record with body := .parallelUserTasks rightFirst rightRest } = true := by
    simpa only [rightAfter] using rightRegionRemainsValid
  have leftFinalEvaluation : completeSharedParallelMultiInstance? arm leftAfter right
      rightSubmitted = some
        (progressedSharedParallelCompletionState leftAfter
          { controller with
            slots := replacePendingParallelSlot controller.slots left leftResult }
          { record with body := .parallelUserTasks leftFirst leftRest }
          right rightResult (finalFirst :: finalRest)) := by
    unfold completeSharedParallelMultiInstance?
    simp [leftAfterRunning, rightInstance, leftAfterSelectsRight, leftAfterSelectsRecord,
      leftAfterRegionValid, rightAccepted, leftAfterCondition, combinedIncomplete,
      combinedPending, progressedSharedParallelCompletionState]
  have rightFinalEvaluation : completeSharedParallelMultiInstance? arm rightAfter left
      leftSubmitted = some
        (progressedSharedParallelCompletionState rightAfter
          { controller with
            slots := replacePendingParallelSlot controller.slots right rightResult }
          { record with body := .parallelUserTasks rightFirst rightRest }
          left leftResult (finalFirst :: finalRest)) := by
    unfold completeSharedParallelMultiInstance?
    simp [rightAfterRunning, leftInstance, rightAfterSelectsLeft, rightAfterSelectsRecord,
      rightAfterRegionValid, leftAccepted, rightAfterCondition, reverseCombinedIncomplete,
      reverseCombinedPending, progressedSharedParallelCompletionState]
  rw [leftFinalEvaluation, rightFinalEvaluation]
  congr 1
  exact progressed_shared_parallel_completions_commute state controller record different
    leftResult rightResult leftFirst rightFirst finalFirst leftRest rightRest finalRest

/-- Under a false completion condition, completing the last two distinct children in either order
closes to one exact shared `RuntimeState`. Results are published in fixed slot-index order, while
child waits, the Activity record, the Timer, and the controller are withdrawn identically. -/
theorem two_distinct_all_policy_shared_final_completions_commute
    (arm : ParallelMultiInstanceArm) (state : RuntimeState)
    (instanceId : SemanticId) (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence) {left right : UserTaskInstanceId}
    (different : left ≠ right) (leftSubmitted rightSubmitted : List VariableBinding)
    (leftResult rightResult : String) (leftResults rightResults : List String)
    (running : state.control = .running instanceId)
    (leftInstance : left.processInstanceId = instanceId)
    (rightInstance : right.processInstanceId = instanceId)
    (selectedLeft : parallelControllerForTask? arm state left = some controller)
    (selectedRight : parallelControllerForTask? arm state right = some controller)
    (selectedRecord : parallelControllerRecord? state controller = some record)
    (regionValid : parallelRegionValid arm state controller record = true)
    (leftAccepted : acceptedParallelResult? arm leftSubmitted = some leftResult)
    (rightAccepted : acceptedParallelResult? arm rightSubmitted = some rightResult)
    (conditionFalse : evaluateSimpleBooleanExpression arm.completionCondition
      state.variables.process.bindings = some false)
    (leftIncomplete : completedParallelResults?
      (replacePendingParallelSlot controller.slots left leftResult) = none)
    (rightIncomplete : completedParallelResults?
      (replacePendingParallelSlot controller.slots right rightResult) = none)
    (leftPending : pendingParallelTaskIds
      (replacePendingParallelSlot controller.slots left leftResult) = [right])
    (rightPending : pendingParallelTaskIds
      (replacePendingParallelSlot controller.slots right rightResult) = [left])
    (leftSelectsRight : parallelControllerForTask? arm
      (progressedSharedParallelCompletionState state controller record left leftResult [right])
      right = some { controller with
        slots := replacePendingParallelSlot controller.slots left leftResult })
    (rightSelectsLeft : parallelControllerForTask? arm
      (progressedSharedParallelCompletionState state controller record right rightResult [left])
      left = some { controller with
        slots := replacePendingParallelSlot controller.slots right rightResult })
    (leftSelectsRecord : parallelControllerRecord?
      (progressedSharedParallelCompletionState state controller record left leftResult [right])
      { controller with
        slots := replacePendingParallelSlot controller.slots left leftResult } =
      some { record with body := .parallelUserTasks right [] })
    (rightSelectsRecord : parallelControllerRecord?
      (progressedSharedParallelCompletionState state controller record right rightResult [left])
      { controller with
        slots := replacePendingParallelSlot controller.slots right rightResult } =
      some { record with body := .parallelUserTasks left [] })
    (leftRegionRemainsValid : parallelRegionValid arm
      (progressedSharedParallelCompletionState state controller record left leftResult [right])
      { controller with
        slots := replacePendingParallelSlot controller.slots left leftResult }
      { record with body := .parallelUserTasks right [] } = true)
    (rightRegionRemainsValid : parallelRegionValid arm
      (progressedSharedParallelCompletionState state controller record right rightResult [left])
      { controller with
        slots := replacePendingParallelSlot controller.slots right rightResult }
      { record with body := .parallelUserTasks left [] } = true)
    (leftCompleted : completedParallelResults?
      (replacePendingParallelSlot (replacePendingParallelSlot controller.slots left leftResult)
        right rightResult) = some leftResults)
    (rightCompleted : completedParallelResults?
      (replacePendingParallelSlot (replacePendingParallelSlot controller.slots right rightResult)
        left leftResult) = some rightResults)
    (leftWithinLimits : withinParallelMultiInstanceLimits arm leftResults = true)
    (rightWithinLimits : withinParallelMultiInstanceLimits arm rightResults = true) :
    (completeSharedParallelMultiInstance? arm state left leftSubmitted).bind
        (fun after => completeSharedParallelMultiInstance? arm after right rightSubmitted) =
      (completeSharedParallelMultiInstance? arm state right rightSubmitted).bind
        (fun after => completeSharedParallelMultiInstance? arm after left leftSubmitted) := by
  let leftAfter := progressedSharedParallelCompletionState state controller record left leftResult
    [right]
  let rightAfter := progressedSharedParallelCompletionState state controller record right rightResult
    [left]
  have leftEvaluation : completeSharedParallelMultiInstance? arm state left leftSubmitted =
      some leftAfter := by
    unfold completeSharedParallelMultiInstance?
    simp [running, leftInstance, selectedLeft, selectedRecord, regionValid, leftAccepted,
      conditionFalse, leftIncomplete, leftPending, leftAfter,
      progressedSharedParallelCompletionState]
  have rightEvaluation : completeSharedParallelMultiInstance? arm state right rightSubmitted =
      some rightAfter := by
    unfold completeSharedParallelMultiInstance?
    simp [running, rightInstance, selectedRight, selectedRecord, regionValid, rightAccepted,
      conditionFalse, rightIncomplete, rightPending, rightAfter,
      progressedSharedParallelCompletionState]
  rw [leftEvaluation, rightEvaluation]
  simp only [Option.bind_some]
  have leftAfterRunning : leftAfter.control = .running instanceId := by
    simp [leftAfter, progressedSharedParallelCompletionState, running]
  have rightAfterRunning : rightAfter.control = .running instanceId := by
    simp [rightAfter, progressedSharedParallelCompletionState, running]
  have leftAfterCondition : evaluateSimpleBooleanExpression arm.completionCondition
      leftAfter.variables.process.bindings = some false := by
    simpa [leftAfter, progressedSharedParallelCompletionState] using conditionFalse
  have rightAfterCondition : evaluateSimpleBooleanExpression arm.completionCondition
      rightAfter.variables.process.bindings = some false := by
    simpa [rightAfter, progressedSharedParallelCompletionState] using conditionFalse
  have leftAfterSelectsRight : parallelControllerForTask? arm leftAfter right =
      some { controller with
        slots := replacePendingParallelSlot controller.slots left leftResult } := by
    simpa only [leftAfter] using leftSelectsRight
  have rightAfterSelectsLeft : parallelControllerForTask? arm rightAfter left =
      some { controller with
        slots := replacePendingParallelSlot controller.slots right rightResult } := by
    simpa only [rightAfter] using rightSelectsLeft
  have leftAfterSelectsRecord : parallelControllerRecord? leftAfter
      { controller with slots := replacePendingParallelSlot controller.slots left leftResult } =
      some { record with body := .parallelUserTasks right [] } := by
    simpa only [leftAfter] using leftSelectsRecord
  have rightAfterSelectsRecord : parallelControllerRecord? rightAfter
      { controller with slots := replacePendingParallelSlot controller.slots right rightResult } =
      some { record with body := .parallelUserTasks left [] } := by
    simpa only [rightAfter] using rightSelectsRecord
  have leftAfterRegionValid : parallelRegionValid arm leftAfter
      { controller with slots := replacePendingParallelSlot controller.slots left leftResult }
      { record with body := .parallelUserTasks right [] } = true := by
    simpa only [leftAfter] using leftRegionRemainsValid
  have rightAfterRegionValid : parallelRegionValid arm rightAfter
      { controller with slots := replacePendingParallelSlot controller.slots right rightResult }
      { record with body := .parallelUserTasks left [] } = true := by
    simpa only [rightAfter] using rightRegionRemainsValid
  have leftFinalEvaluation : completeSharedParallelMultiInstance? arm leftAfter right
      rightSubmitted = some
        (closeSharedParallelRegion leftAfter
          { controller with
            slots := replacePendingParallelSlot controller.slots left leftResult }
          { record with body := .parallelUserTasks right [] } arm.normalOutput
          (publishSharedParallelResults leftAfter arm leftResults)) := by
    unfold completeSharedParallelMultiInstance?
    simp [leftAfterRunning, rightInstance, leftAfterSelectsRight, leftAfterSelectsRecord,
      leftAfterRegionValid, rightAccepted, leftAfterCondition, leftCompleted, leftWithinLimits]
  have rightFinalEvaluation : completeSharedParallelMultiInstance? arm rightAfter left
      leftSubmitted = some
        (closeSharedParallelRegion rightAfter
          { controller with
            slots := replacePendingParallelSlot controller.slots right rightResult }
          { record with body := .parallelUserTasks left [] } arm.normalOutput
          (publishSharedParallelResults rightAfter arm rightResults)) := by
    unfold completeSharedParallelMultiInstance?
    simp [rightAfterRunning, leftInstance, rightAfterSelectsLeft, rightAfterSelectsRecord,
      rightAfterRegionValid, leftAccepted, rightAfterCondition, rightCompleted,
      rightWithinLimits]
  rw [leftFinalEvaluation, rightFinalEvaluation]
  congr 1
  exact closed_shared_parallel_completions_commute state arm controller record leftResult
    rightResult leftResults rightResults leftPending rightPending
    (completed_parallel_results_of_commuted_slots controller.slots different leftResult
      rightResult leftResults rightResults leftCompleted rightCompleted)

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
