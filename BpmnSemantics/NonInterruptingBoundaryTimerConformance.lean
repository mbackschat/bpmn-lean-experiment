import BpmnSemantics.SemanticProcess

/-! # BpmnSemantics.NonInterruptingBoundaryTimerConformance — non-interrupting boundary Timer locks

These checks own the direct Lean account for the admitted non-interrupting boundary Timer capsule: atomic arming of the Activity together with its deadline, the spawn that preserves its host, the completion that withdraws a live deadline or accepts a consumed one, and the quiescent completion that requires both branches.

The armed observation is where the recorded interpretation is visible, exactly as for the interrupting sibling: BPMN 2.0.2 Clause 13.5.2 starts a catch Event's wait when a token *reaches* it, and a Boundary Event is never reached, so publishing an open deadline at logical time zero is a project choice rather than a clause consequence.

The admitted `cancelActivity` set is the exact inverse of the sibling profile's, so the two profiles cannot admit each other's source. That inversion is checked here at the checked-graph boundary, before lowering, because the disposition is a checked-source value rather than a consequence of the operation it produces.
-/

namespace BpmnSemantics.NonInterruptingBoundaryTimerConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"bpmn-2.0.2-non-interrupting-boundary-timer-draft"⟩
        sourceId := ⟨"non-interrupting-boundary-timer"⟩
        sourceSha256 :=
          "d4d0f1c1b0e0a4f6ba2c8d7e5f3a1b9c7e6d5c4b3a2918070605040302010009" }
    processId := ⟨"Process_NonInterruptingBoundaryTimer"⟩
    definitionScopes :=
      [rootDefinitionScope ⟨"Process_NonInterruptingBoundaryTimer"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_NonInterruptingBoundaryTimer"⟩
      [ ⟨"HandlerEnd"⟩, ⟨"HandlerTask"⟩, ⟨"MonitoredTask"⟩, ⟨"NormalEnd"⟩
      , ⟨"NormalTask"⟩, ⟨"Reminder"⟩, ⟨"Start"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes
      ⟨"Process_NonInterruptingBoundaryTimer"⟩
      [ ⟨"Flow_Boundary"⟩, ⟨"Flow_Boundary_End"⟩, ⟨"Flow_Normal"⟩
      , ⟨"Flow_Normal_End"⟩, ⟨"Flow_Start"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"HandlerEnd"⟩
      , .userTask ⟨"HandlerTask"⟩ (some "Reminder handled")
      , .userTask ⟨"MonitoredTask"⟩ (some "Monitored work")
      , .noneEndEvent ⟨"NormalEnd"⟩
      , .userTask ⟨"NormalTask"⟩ (some "Monitored work finished")
      , .timerBoundaryEvent ⟨"Reminder"⟩ ⟨"MonitoredTask"⟩ .nonInterrupting
          "PT1S" ⟨"Flow_Boundary"⟩
      , .noneStartEvent ⟨"Start"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Boundary"⟩
          sourceId := ⟨"Reminder"⟩
          targetId := ⟨"HandlerTask"⟩ }
      , { id := ⟨"Flow_Boundary_End"⟩
          sourceId := ⟨"HandlerTask"⟩
          targetId := ⟨"HandlerEnd"⟩ }
      , { id := ⟨"Flow_Normal"⟩
          sourceId := ⟨"MonitoredTask"⟩
          targetId := ⟨"NormalTask"⟩ }
      , { id := ⟨"Flow_Normal_End"⟩
          sourceId := ⟨"NormalTask"⟩
          targetId := ⟨"NormalEnd"⟩ }
      , { id := ⟨"Flow_Start"⟩
          sourceId := ⟨"Start"⟩
          targetId := ⟨"MonitoredTask"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

theorem checked_process_is_well_formed :
    checkedWellFormed checkedProcess = true := by decide +kernel

theorem lowered_program_is_well_formed :
    programWellFormed program = true := by decide +kernel


/-- The deadline never becomes an independent `awaitTimer`; it exists only as the Activity operation's own arm. -/
theorem boundary_timer_is_not_lowered_as_a_standalone_timer :
    (program.operations.filter fun
      | .awaitTimer .. => true
      | _ => false) = [] := by decide +kernel

theorem exactly_one_activity_owns_a_monitored_deadline :
    (monitoredTaskOperations program).length = 1 := by decide +kernel

/-- The disposition, not the node kind, is what selects the family: this source lowers to no interrupting operation at all. -/
theorem no_interrupting_operation_is_lowered :
    (boundedTaskOperations program).length = 0 := by decide +kernel

/-- The same graph with the disposition flipped, keeping every other byte of the admitted source. -/
private def interruptingDisposition : CheckedProcess :=
  { checkedProcess with
    nodes := checkedProcess.nodes.map fun
      | .timerBoundaryEvent id attachedToRef _ durationLiteral outputFlowId =>
          .timerBoundaryEvent id attachedToRef .interrupting durationLiteral
            outputFlowId
      | node => node }

/-- **The admission inversion.** The interrupting disposition is refused under this profile, so a source cannot acquire the wrong interruption semantics by matching a shape the two profiles share. Both profiles pin the same node kinds, so this is the only place the separation can be observed in checked source. -/
theorem interrupting_disposition_is_refused_under_this_profile :
    checkedWellFormed interruptingDisposition = false := by decide +kernel

/-- Redirects only the deadline's attachment, keeping every other byte of the admitted source. -/
private def misattachedDeadline : CheckedProcess :=
  { checkedProcess with
    nodes := checkedProcess.nodes.map fun
      | .timerBoundaryEvent id _ interruption durationLiteral outputFlowId =>
          .timerBoundaryEvent id ⟨"NormalEnd"⟩ interruption durationLiteral
            outputFlowId
      | node => node }

/-- A deadline whose attachment does not resolve to a User Task is refused at admission rather than dropped. It lowers to no operation of its own, so without this rule the program would simply have no deadline and nothing downstream would object. -/
theorem misattached_deadline_is_refused_at_admission :
    checkedWellFormed misattachedDeadline = false := by decide +kernel

def instanceId : SemanticId := ⟨"Instance_1"⟩

def taskId : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨"MonitoredTask"⟩
    activation := 1 }

def reminderId : TimerOccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨"Reminder"⟩
    activation := 1 }

def startCommandId : SemanticId := ⟨"start-process"⟩

def armedState : RuntimeState :=
  (applyStimulus scenarioClosureLimit program initialState
    (.startProcess startCommandId ⟨"Process_NonInterruptingBoundaryTimer"⟩
      instanceId [])).state

/-- Arming is atomic: one incoming token becomes exactly one Activity occurrence and one deadline, and both take activation ordinal one from their own element counter. That shared ordinal is what later recovers the family without a stored ownership record. -/
theorem activity_and_deadline_arm_atomically :
    (armedState.waits.map fun wait => (wait.task.id.value, wait.activation)) =
        [("MonitoredTask", 1)] ∧
      (armedState.timerWaits.map fun wait =>
        (wait.elementId.value, wait.activation, wait.deadlineMs)) =
        [("Reminder", 1, 1000)] ∧
      armedState.tokens = [] := by decide +kernel

def afterSpawn : RuntimeState :=
  (applyStimulus scenarioClosureLimit program armedState
    (.fireTimer ⟨"fire-reminder"⟩ reminderId 1000)).state

def afterEarlyCompletion : RuntimeState :=
  (applyStimulus scenarioClosureLimit program armedState
    (.completeUserTaskInstance ⟨"complete-monitored-task"⟩ taskId [])).state

/-- **The proposition this capsule exists for.** Firing leaves the monitored occurrence exactly as it was — same element, same activation ordinal — and adds the handler occurrence beside it. The interrupting sibling's corresponding transition removes the host instead, so this state is unreachable there. -/
theorem firing_spawns_the_handler_and_preserves_its_host :
    (afterSpawn.waits.map fun wait => (wait.task.id.value, wait.activation)) =
        [("HandlerTask", 1), ("MonitoredTask", 1)] ∧
      afterSpawn.timerWaits = [] ∧
      afterSpawn.logicalTimeMs = 1000 := by decide +kernel

/-- Completing before the deadline withdraws it, so only the normal branch is live and logical time never advances. -/
theorem completion_before_the_deadline_withdraws_it :
    (afterEarlyCompletion.waits.map fun wait =>
        (wait.task.id.value, wait.activation)) = [("NormalTask", 1)] ∧
      afterEarlyCompletion.timerWaits = [] ∧
      afterEarlyCompletion.logicalTimeMs = 0 := by decide +kernel

/-- **The one-sided join.** After the deadline has fired, the host is still completable: the completion commits and opens the normal branch beside the live handler. A family requiring both waits would refuse here and strand the Activity. -/
theorem the_host_stays_completable_after_its_deadline_fired :
    (applyStimulus scenarioClosureLimit program afterSpawn
        (.completeUserTaskInstance ⟨"complete-monitored-task"⟩ taskId [])).outcome =
      .committed ∧
      ((applyStimulus scenarioClosureLimit program afterSpawn
        (.completeUserTaskInstance ⟨"complete-monitored-task"⟩ taskId
          [])).state.waits.map fun wait => wait.task.id.value) =
        ["HandlerTask", "NormalTask"] := by decide +kernel

/-- The consumed deadline cannot fire again, with the spawned state preserved exactly. -/
theorem the_consumed_deadline_cannot_fire_twice :
    applyStimulus scenarioClosureLimit program afterSpawn
        (.fireTimer ⟨"fire-reminder-again"⟩ reminderId 1000) =
      { outcome := .rejected
        state := afterSpawn
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by decide +kernel

/-- A withdrawn deadline can never fire, with the completed state preserved exactly. -/
theorem a_withdrawn_deadline_cannot_fire :
    applyStimulus scenarioClosureLimit program afterEarlyCompletion
        (.fireTimer ⟨"fire-reminder-late"⟩ reminderId 1000) =
      { outcome := .rejected
        state := afterEarlyCompletion
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by decide +kernel

/-- Firing before the deadline is refused with exact state preservation, so exact deadline equality is semantically material rather than a host-scheduler convenience. -/
theorem pre_due_firing_is_rejected :
    applyStimulus scenarioClosureLimit program armedState
        (.fireTimer ⟨"fire-reminder-early"⟩ reminderId 999) =
      { outcome := .rejected
        state := armedState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by decide +kernel

/-- A refused pre-due firing leaves the deadline armed rather than consuming it, so the exact firing at `1000` still spawns afterwards and reaches the same state. Stating this as equality between the two firings would prove nothing: it would hold under a mutation that made both reject, so the committed outcome and the exact resulting state are pinned here instead. -/
theorem exact_firing_still_spawns_after_a_refused_pre_due_firing :
    applyStimulus scenarioClosureLimit program
        (applyStimulus scenarioClosureLimit program armedState
          (.fireTimer ⟨"fire-reminder-early"⟩ reminderId 999)).state
        (.fireTimer ⟨"fire-reminder"⟩ reminderId 1000) =
      { outcome := .committed
        state := afterSpawn
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by decide +kernel

/-- The timing profile admits no completion patch, so a submitted variable is refused rather than ignored: silently dropping it would add a data claim to a timing capsule. -/
theorem submitted_values_are_rejected_rather_than_ignored :
    (applyStimulus scenarioClosureLimit program armedState
      (.completeUserTaskInstance ⟨"complete-with-data"⟩ taskId
        [{ name := "note", value := .string "late" }])).outcome =
      .rejected := by decide +kernel

/-- State after firing and then completing the host, so both branches are live at their follow-on tasks. -/
def bothBranchesLive : RuntimeState :=
  (applyStimulus scenarioClosureLimit program afterSpawn
    (.completeUserTaskInstance ⟨"complete-monitored-task"⟩ taskId [])).state

private def completionOf (elementId : String) (commandId : String) :
    Stimulus :=
  .completeUserTaskInstance ⟨commandId⟩
    { processInstanceId := instanceId
      elementId := ⟨elementId⟩
      activation := 1 } []

/-- **`NBTIMER-QUIESCE-01`'s checked non-law.** Neither branch reaching its own None End Event completes the Process while the other is live: the run stays `running` with exactly the sibling task open. Checked in both orders, because an implementation completing at the first End Event is publicly wrong in whichever order it meets first. -/
theorem the_first_end_event_does_not_complete_the_process :
    ((applyStimulus scenarioClosureLimit program bothBranchesLive
        (completionOf "HandlerTask" "complete-handler")).state.waits.map fun wait =>
        wait.task.id.value) = ["NormalTask"] ∧
      ((applyStimulus scenarioClosureLimit program bothBranchesLive
        (completionOf "NormalTask" "complete-normal")).state.waits.map fun wait =>
        wait.task.id.value) = ["HandlerTask"] := by decide +kernel

/-- The Process completes only after both branches, in either order. -/
theorem the_process_completes_after_both_branches :
    (applyStimulus scenarioClosureLimit program
        (applyStimulus scenarioClosureLimit program bothBranchesLive
          (completionOf "HandlerTask" "complete-handler")).state
        (completionOf "NormalTask" "complete-normal")).state.control =
        .completed instanceId ∧
      (applyStimulus scenarioClosureLimit program
        (applyStimulus scenarioClosureLimit program bothBranchesLive
          (completionOf "NormalTask" "complete-normal")).state
        (completionOf "HandlerTask" "complete-handler")).state.control =
        .completed instanceId := by decide +kernel

end BpmnSemantics.NonInterruptingBoundaryTimerConformance
