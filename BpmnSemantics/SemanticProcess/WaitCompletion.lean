import BpmnSemantics.SemanticProcess.BoundedScope
import BpmnSemantics.SemanticProcess.MonitoredScope
import BpmnSemantics.SemanticProcess.BoundedTask
import BpmnSemantics.SemanticProcess.Message
import BpmnSemantics.SemanticProcess.EffectCompletion

/-! # External wait completion

This module owns how a waiting runtime state advances when its external event arrives: matching a User Task or Timer wait on its full occurrence identity, and routing a matched Timer into the composite wait that owns it instead of completing it directly. It owns no stimulus admission, closure, or public command outcome; an absent result means semantic rejection, while recurring Timer capacity refusal requires whole-command rollback.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def completeUserTask (state : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) : Option RuntimeState :=
  match state.waits.find? fun wait =>
      decide (
        wait.processInstanceId = processInstanceId &&
          wait.task.id = taskId &&
          wait.activation = activation) with
  | none => none
  | some wait =>
      some
        { state with
          waits := state.waits.erase wait
          tokens := addToken state.tokens wait.output wait.owner }

def timerDefinitionMatches (program : Program) (wait : TimerWait) : Bool :=
  program.operations.any fun
    | .awaitTimer _ _ _ _ timer =>
        decide (timer.elementId = wait.elementId)
    | _ => false

structure SelectedMonitoredTask where
  operationId : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  arm : BoundedTaskArm
  boundary : BoundaryTimerArm
  record : ActivityOccurrence
  task : UserTaskWait
  timer : Option TimerWait

/-- ESL-TIMER-01 permits an absent attachment only after a one-shot firing. All selection
censuses use the complete recorded identity before checking definition or owner fields. -/
def SelectedMonitoredTaskBinding (program : Program) (state : RuntimeState)
    (pair : SelectedMonitoredTask) : Prop :=
  program.operations.filter (fun operation => decide (operation.id = pair.operationId)) =
    [.awaitMonitoredUserTask pair.operationId pair.origin pair.input pair.arm pair.boundary] ∧
  operationOwningScope? program pair.operationId = some pair.record.owner.definitionScopeId ∧
  pair.origin.elementId = pair.record.activityElementId ∧
  pair.record.activityElementId.value = pair.arm.id.value ∧
  pair.task.task = { id := pair.arm.id, name := pair.arm.name } ∧
  pair.task.metadata = none ∧ pair.task.output = pair.arm.output ∧
  pair.task.owner = pair.record.owner ∧
  pair.task.processInstanceId = pair.record.processInstanceId ∧
  pair.record.owner.processInstanceId = pair.record.processInstanceId ∧
  state.control = .running pair.record.processInstanceId ∧
  pair.record.body = .userTask
    { processInstanceId := pair.task.processInstanceId, elementId := ⟨pair.task.task.id.value⟩,
      activation := pair.task.activation } ∧
  state.waits.filter (taskIdNamesWait
    { processInstanceId := pair.task.processInstanceId, elementId := ⟨pair.task.task.id.value⟩,
      activation := pair.task.activation }) = [pair.task] ∧
  state.activityOccurrences.filter (recordBodyNamesWait pair.task) = [pair.record] ∧
  state.activityOccurrences.filter (sameActivityOccurrence pair.record) = [pair.record] ∧
  match pair.timer with
  | none => pair.boundary.recurrence = none ∧ pair.record.attachedHandlers = [] ∧
      state.timerWaits.filter (fun timer => decide
        (timer.owner = pair.record.owner ∧ timer.elementId = pair.boundary.elementId)) = []
  | some timer => pair.record.attachedHandlers = [.timer (boundaryTimerWaitIdentity timer)] ∧
      NonInterruptingBoundaryTimerBinding state pair.record timer pair.boundary

instance (program : Program) (state : RuntimeState) (pair : SelectedMonitoredTask) :
    Decidable (SelectedMonitoredTaskBinding program state pair) := by
  unfold SelectedMonitoredTaskBinding
  cases pair.timer with
  | none => infer_instance
  | some timer =>
      simp only
      unfold NonInterruptingBoundaryTimerBinding
      cases pair.record.body <;> infer_instance

private def selectedMonitoredOnly? (values : List α) : Option α :=
  match values with | [value] => some value | _ => none

private def selectedMonitoredTaskCandidate? (program : Program) (state : RuntimeState)
    (record : ActivityOccurrence) : Option SelectedMonitoredTask := do
  let .userTask body := record.body | none
  let task ← selectedMonitoredOnly? (state.waits.filter (taskIdNamesWait body))
  let operation ← selectedMonitoredOnly? (program.operations.filter fun
    | .awaitMonitoredUserTask _ _ _ arm _ => decide (arm.id = task.task.id)
    | _ => false)
  let .awaitMonitoredUserTask operationId origin input arm boundary := operation | none
  let timer ← match record.attachedHandlers with
    | [] => some none
    | [.timer identity] => (selectedMonitoredOnly? (state.timerWaits.filter (timerIdNamesWait identity))).map some
    | _ => none
  pure { operationId, origin, input, arm, boundary, record, task, timer }

def selectedMonitoredTaskForRecord? (program : Program) (state : RuntimeState)
    (record : ActivityOccurrence) :
    Option { pair : SelectedMonitoredTask // SelectedMonitoredTaskBinding program state pair } := do
  let pair ← selectedMonitoredTaskCandidate? program state record
  if bound : SelectedMonitoredTaskBinding program state pair then some ⟨pair, bound⟩ else none

/-- The command path closes the exact Task/Activity/deadline triple. The original one-shot
relation remains a prerequisite; recurrence additionally requires the replacement to remain live. -/
def completeSelectedMonitoredUserTask? (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat) : Option RuntimeState := do
  let identity : OccurrenceId := { processInstanceId, elementId := ⟨taskId.value⟩, activation }
  let record ← selectedMonitoredOnly? (state.activityOccurrences.filter fun record =>
    decide (record.body = .userTask identity))
  let pair ← selectedMonitoredTaskForRecord? program state record
  if pair.val.task.processInstanceId = processInstanceId ∧ pair.val.task.task.id = taskId ∧
      pair.val.task.activation = activation then
    some { state with
    waits := state.waits.erase pair.val.task
    timerWaits := match pair.val.timer with | none => state.timerWaits | some timer => state.timerWaits.erase timer
    activityOccurrences := state.activityOccurrences.erase pair.val.record
    tokens := addToken state.tokens pair.val.arm.output pair.val.record.owner }
  else none

def spawnFromSelectedMonitoredUserTask? (program : Program) (state : RuntimeState)
    (identity : TimerOccurrenceId) (time : Nat) : Except RecurringBoundaryTimerRefusal (Option RuntimeState) :=
  match selectedMonitoredOnly? (state.activityOccurrences.filter fun record =>
      record.timerHandlerOccurrences.contains identity) with
  | none => .ok none
  | some record => match selectedMonitoredTaskForRecord? program state record with
    | none => .ok none
    | some pair => match pair.val.timer with
      | none => .ok none
      | some timer =>
          if boundaryTimerWaitIdentity timer = identity ∧ time = timer.deadlineMs then
            match fireNonInterruptingBoundaryTimer state pair.val.record timer pair.val.boundary with
            | .error refusal => .error refusal
            | .ok after => .ok (some after)
          else .ok none

/-- Exact predecessor binding determines the host and deadline withdrawn by completion. -/
inductive SelectedMonitoredTaskCompletionStep (program : Program) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) : RuntimeState → RuntimeState → Prop where
  | complete (before : RuntimeState) (pair : SelectedMonitoredTask)
      (bound : SelectedMonitoredTaskBinding program before pair)
      (addressed : pair.task.processInstanceId = instanceId ∧ pair.task.task.id = taskId ∧
        pair.task.activation = activation) :
      SelectedMonitoredTaskCompletionStep program instanceId taskId activation before
        { before with
          waits := before.waits.erase pair.task
          timerWaits := match pair.timer with | none => before.timerWaits | some timer => before.timerWaits.erase timer
          activityOccurrences := before.activityOccurrences.erase pair.record
          tokens := addToken before.tokens pair.arm.output pair.record.owner }

inductive SelectedMonitoredTaskSpawnStep (program : Program) (identity : TimerOccurrenceId)
    (time : Nat) : RuntimeState → RuntimeState → Prop where
  | spawn (before after : RuntimeState) (pair : SelectedMonitoredTask) (timer : TimerWait)
      (bound : SelectedMonitoredTaskBinding program before pair)
      (live : pair.timer = some timer)
      (addressed : boundaryTimerWaitIdentity timer = identity) (due : time = timer.deadlineMs)
      (fired : NonInterruptingBoundaryTimerStep before pair.record timer pair.boundary after) :
      SelectedMonitoredTaskSpawnStep program identity time before after

theorem completeSelectedMonitoredUserTask_sound (program : Program) (before after : RuntimeState)
    (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (success : completeSelectedMonitoredUserTask? program before instanceId taskId activation = some after) :
    SelectedMonitoredTaskCompletionStep program instanceId taskId activation before after := by
  unfold completeSelectedMonitoredUserTask? at success
  obtain ⟨record, _, success⟩ := Option.bind_eq_some_iff.mp success
  obtain ⟨pair, _, success⟩ := Option.bind_eq_some_iff.mp success
  split at success
  · next addressed =>
      cases success
      exact .complete before pair.val pair.property addressed
  · contradiction

theorem spawnFromSelectedMonitoredUserTask_sound (program : Program) (before after : RuntimeState)
    (identity : TimerOccurrenceId) (time : Nat)
    (success : spawnFromSelectedMonitoredUserTask? program before identity time = .ok (some after)) :
    SelectedMonitoredTaskSpawnStep program identity time before after := by
  unfold spawnFromSelectedMonitoredUserTask? at success
  split at success
  · simp at success
  · next record _ =>
      cases selected : selectedMonitoredTaskForRecord? program before record with
      | none => simp [selected] at success
      | some pair =>
          cases live : pair.val.timer with
          | none => simp [selected, live] at success
          | some timer =>
              simp only [selected, live] at success
              split at success
              · next due =>
                  cases fired : fireNonInterruptingBoundaryTimer before pair.val.record timer pair.val.boundary with
                  | error refusal => simp [fired] at success
                  | ok result =>
                      simp only [fired, Except.ok.injEq, Option.some.injEq] at success
                      subst result
                      have binding := pair.property
                      simp only [SelectedMonitoredTaskBinding, live] at binding
                      rcases binding with ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, timerBinding⟩
                      exact .spawn before after pair.val timer pair.property live due.1 due.2
                        (fireNonInterruptingBoundaryTimer_sound before after pair.val.record timer pair.val.boundary timerBinding fired)
              · simp at success

def fireTimer (program : Program) (state : RuntimeState)
    (timerId : TimerOccurrenceId)
    (logicalTimeMs : Nat) : Except RecurringBoundaryTimerRefusal (Option RuntimeState) :=
  match state.timerWaits.find? fun wait =>
      decide (
        wait.processInstanceId = timerId.processInstanceId &&
          wait.elementId.value = timerId.elementId.value &&
          wait.activation = timerId.activation) with
  | none => .ok none
  | some wait =>
      if state.eventRaces.any (eventRaceHasTimer · wait) then
        .ok (eventRaceTimerWinner? program state timerId logicalTimeMs)
      else if isBoundaryTimerDefinition program wait.elementId then
        .ok (interruptBoundedUserTask? program state timerId logicalTimeMs)
      else if isMonitoredBoundaryTimerDefinition program wait.elementId then
        spawnFromSelectedMonitoredUserTask? program state timerId logicalTimeMs
      else if isMonitoredScopeDeadlineDefinition program wait.elementId then
        spawnFromMonitoredScope? program state timerId logicalTimeMs
      else if isBoundedScopeDeadlineDefinition program wait.elementId then
        .ok (interruptBoundedScope? program state timerId logicalTimeMs)
      else if logicalTimeMs = wait.deadlineMs &&
          timerDefinitionMatches program wait then
          .ok (some
            { state with
              timerWaits := state.timerWaits.erase wait
              tokens := addToken state.tokens wait.output wait.owner
              logicalTimeMs := wait.deadlineMs })
        else
          .ok none

theorem selected_monitored_completion_activity_identity_discipline (program : Program)
    (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (step : SelectedMonitoredTaskCompletionStep program instanceId taskId activation before after) :
    activityIdentityIssuingDiscipline before after = true := by
  cases step
  apply activityIdentityIssuingDiscipline_of_subset
  intro record present
  exact List.mem_of_mem_erase present

end BpmnSemantics.SemanticProcess
