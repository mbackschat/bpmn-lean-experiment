import BpmnSemantics.SemanticProcess

/-! # BpmnSemantics.ActivityBoundaryTimerConformance — interrupting boundary Timer locks

These checks own the direct Lean account for the admitted interrupting Activity boundary Timer capsule: atomic arming of the Activity together with its deadline, the two mutually exclusive victories, and the refusals that keep the deadline exact and the timing profile free of any data claim.

The armed observation is where the recorded interpretation is visible. BPMN 2.0.2 Clause 13.5.2 starts a catch Event's wait when a token *reaches* it, and a Boundary Event is never reached, so publishing an open deadline at logical time zero is a project choice rather than a clause consequence.
-/

namespace BpmnSemantics.ActivityBoundaryTimerConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"bpmn-2.0.2-activity-boundary-timer-draft"⟩
        sourceId := ⟨"activity-boundary-timer"⟩
        sourceSha256 :=
          "564a36ffc3815bbadc78d739892ae1e74c7137ff44beaa76eb20fad47401f30e" }
    processId := ⟨"Process_ActivityBoundaryTimer"⟩
    definitionScopes :=
      [rootDefinitionScope ⟨"Process_ActivityBoundaryTimer"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_ActivityBoundaryTimer"⟩
      [ ⟨"BoundaryEnd"⟩, ⟨"BoundaryTask"⟩, ⟨"BoundedTask"⟩, ⟨"Deadline"⟩
      , ⟨"NormalEnd"⟩, ⟨"NormalTask"⟩, ⟨"Start"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes
      ⟨"Process_ActivityBoundaryTimer"⟩
      [ ⟨"Flow_Boundary"⟩, ⟨"Flow_Boundary_End"⟩, ⟨"Flow_Normal"⟩
      , ⟨"Flow_Normal_End"⟩, ⟨"Flow_Start"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"BoundaryEnd"⟩
      , .userTask ⟨"BoundaryTask"⟩ (some "Deadline reached")
      , .userTask ⟨"BoundedTask"⟩ (some "Bounded work")
      , .timerBoundaryEvent ⟨"Deadline"⟩ ⟨"BoundedTask"⟩ "PT1S"
          ⟨"Flow_Boundary"⟩
      , .noneEndEvent ⟨"NormalEnd"⟩
      , .userTask ⟨"NormalTask"⟩ (some "Completed in time")
      , .noneStartEvent ⟨"Start"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Boundary"⟩
          sourceId := ⟨"Deadline"⟩
          targetId := ⟨"BoundaryTask"⟩ }
      , { id := ⟨"Flow_Boundary_End"⟩
          sourceId := ⟨"BoundaryTask"⟩
          targetId := ⟨"BoundaryEnd"⟩ }
      , { id := ⟨"Flow_Normal"⟩
          sourceId := ⟨"BoundedTask"⟩
          targetId := ⟨"NormalTask"⟩ }
      , { id := ⟨"Flow_Normal_End"⟩
          sourceId := ⟨"NormalTask"⟩
          targetId := ⟨"NormalEnd"⟩ }
      , { id := ⟨"Flow_Start"⟩
          sourceId := ⟨"Start"⟩
          targetId := ⟨"BoundedTask"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

theorem checked_process_is_well_formed :
    checkedWellFormed checkedProcess = true := by decide

theorem lowered_program_is_well_formed :
    programWellFormed program = true := by decide

theorem checked_process_lowering_is_exact :
    lowerCheckedProcess checkedProcess = program := by decide

/-- The deadline never becomes an independent `awaitTimer`; it exists only as the Activity operation's own arm. -/
theorem boundary_timer_is_not_lowered_as_a_standalone_timer :
    (program.operations.filter fun
      | .awaitTimer .. => true
      | _ => false) = [] := by decide

theorem exactly_one_activity_owns_a_boundary_deadline :
    (boundedTaskOperations program).length = 1 := by decide

/-- Redirects only the deadline's attachment, keeping every other byte of the admitted source. -/
private def misattachedDeadline : CheckedProcess :=
  { checkedProcess with
    nodes := checkedProcess.nodes.map fun
      | .timerBoundaryEvent id _ durationLiteral outputFlowId =>
          .timerBoundaryEvent id ⟨"NormalEnd"⟩ durationLiteral outputFlowId
      | node => node }

/-- A deadline whose attachment does not resolve to a User Task is refused at admission rather than dropped. It lowers to no operation of its own, so without this rule the program would simply have no deadline and nothing downstream would object. -/
theorem misattached_deadline_is_refused_at_admission :
    checkedWellFormed misattachedDeadline = false := by decide

def instanceId : SemanticId := ⟨"Instance_1"⟩

def taskId : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨"BoundedTask"⟩
    activation := 1 }

def deadlineId : TimerOccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨"Deadline"⟩
    activation := 1 }

def startCommandId : SemanticId := ⟨"start-process"⟩

def armedState : RuntimeState :=
  (applyStimulus scenarioClosureLimit program initialState
    (.startProcess startCommandId ⟨"Process_ActivityBoundaryTimer"⟩
      instanceId [])).state

/-- Arming is atomic: one incoming token becomes exactly one Activity occurrence and one deadline, and both take activation ordinal one from their own element counter. That shared ordinal is what later recovers the pair without a stored ownership record. -/
theorem activity_and_deadline_arm_atomically :
    (armedState.waits.map fun wait => (wait.task.id.value, wait.activation)) =
        [("BoundedTask", 1)] ∧
      (armedState.timerWaits.map fun wait =>
        (wait.elementId.value, wait.activation, wait.deadlineMs)) =
        [("Deadline", 1, 1000)] ∧
      armedState.tokens = [] := by decide

private def observations : List ObservationKind :=
  [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .openTimers
  , .openEffects
  , .variables
  , .enabledInteractions
  , .logicalTime ]

def taskWinsScenario : Scenario :=
  { kind := .scenario
    id := ⟨"activity-boundary-timer-task-wins"⟩
    profile := ⟨"bpmn-2.0.2-activity-boundary-timer-draft"⟩
    bpmn :=
      { id := ⟨"activity-boundary-timer"⟩
        relativePath := "scenarios/activity-boundary-timer/process.bpmn"
        sha256 :=
          "564a36ffc3815bbadc78d739892ae1e74c7137ff44beaa76eb20fad47401f30e" }
    stimuli :=
      [ .startProcess startCommandId ⟨"Process_ActivityBoundaryTimer"⟩
          instanceId []
      , .completeUserTaskInstance ⟨"complete-bounded-task"⟩ taskId [] ]
    observations
    provenance :=
      { normativeRefs :=
          [ "BPMN 2.0.2 §10.4.3"
          , "BPMN 2.0.2 §13.5.2"
          , "BPMN 2.0.2 §13.5.3" ]
        cibRevision := ""
        cibRefs := [] } }

def deadlineWinsScenario : Scenario :=
  { taskWinsScenario with
    id := ⟨"activity-boundary-timer-deadline-wins"⟩
    stimuli :=
      [ .startProcess startCommandId ⟨"Process_ActivityBoundaryTimer"⟩
          instanceId []
      , .fireTimer ⟨"fire-deadline"⟩ deadlineId 1000 ] }

private def openTask (elementId name : String) : OpenUserTask :=
  { id :=
      { processInstanceId := instanceId
        elementId := ⟨elementId⟩
        activation := 1 }
    name := some name
    state := .active }

private def waitingOn (elementId name : String) (logicalTimeMs : Nat) :
    StateObservation :=
  { instanceId
    status := .running
    activeWaits :=
      [{ elementId := ⟨elementId⟩, kind := .userTask, multiplicity := 1 }]
    openUserTasks := [openTask elementId name]
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := []
    enabledInteractions :=
      [.completeUserTaskInstance (openTask elementId name).id]
    logicalTimeMs }

/-- Publishes both arms at logical time zero. The deadline is semantic state here, not a host scheduling decision. -/
def armedObservation : StateObservation :=
  { instanceId
    status := .running
    activeWaits :=
      [ { elementId := ⟨"BoundedTask"⟩, kind := .userTask, multiplicity := 1 }
      , { elementId := ⟨"Deadline"⟩, kind := .timer, multiplicity := 1 } ]
    openUserTasks := [openTask "BoundedTask" "Bounded work"]
    openMessageSubscriptions := []
    openTimers := [{ id := deadlineId, deadlineMs := 1000 }]
    openEffects := []
    variables := []
    enabledInteractions :=
      [.completeUserTaskInstance (openTask "BoundedTask" "Bounded work").id]
    logicalTimeMs := 0 }

theorem activity_victory_routes_to_its_own_output_and_withdraws_the_deadline :
    runScenario program taskWinsScenario =
      { outcome := .semantic .committed
        trace :=
          [ .deployment .committed
          , .command startCommandId .committed
          , .state armedObservation
          , .command ⟨"complete-bounded-task"⟩ .committed
          , .state (waitingOn "NormalTask" "Completed in time" 0) ] } := by
  decide

theorem deadline_victory_routes_to_the_boundary_output_and_abandons_the_activity :
    runScenario program deadlineWinsScenario =
      { outcome := .semantic .committed
        trace :=
          [ .deployment .committed
          , .command startCommandId .committed
          , .state armedObservation
          , .command ⟨"fire-deadline"⟩ .committed
          , .state (waitingOn "BoundaryTask" "Deadline reached" 1000) ] } := by
  decide

/-- The victories differ at the approved public observation boundary rather than in a hidden microstep: they expose different open tasks and different logical time. -/
theorem victories_are_publicly_distinguishable :
    (runScenario program taskWinsScenario).trace ≠
      (runScenario program deadlineWinsScenario).trace := by decide

/-- Firing before the deadline is refused with exact state preservation, so exact deadline equality is semantically material rather than a host-scheduler convenience. -/
theorem pre_due_deadline_firing_is_rejected :
    applyStimulus scenarioClosureLimit program armedState
        (.fireTimer ⟨"fire-deadline-early"⟩ deadlineId 999) =
      { outcome := .rejected
        state := armedState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by decide

/-- After the Activity wins, its deadline no longer exists, so the losing arm cannot fire late. -/
theorem deadline_firing_after_the_activity_victory_is_rejected :
    (applyStimulus scenarioClosureLimit program
      (applyStimulus scenarioClosureLimit program armedState
        (.completeUserTaskInstance ⟨"complete-bounded-task"⟩ taskId [])).state
      (.fireTimer ⟨"fire-deadline-late"⟩ deadlineId 1000)).outcome =
      .rejected := by decide

/-- The timing profile admits no completion patch, so a submitted variable is refused rather than ignored: silently dropping it would add a data claim to a timing capsule. -/
theorem submitted_values_are_rejected_rather_than_ignored :
    (applyStimulus scenarioClosureLimit program armedState
      (.completeUserTaskInstance ⟨"complete-with-data"⟩ taskId
        [{ name := "decision", value := .string "approved" }])).outcome =
      .rejected := by decide

end BpmnSemantics.ActivityBoundaryTimerConformance
