import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Interrupting Activity boundary Timer

This module owns the atomic arming relation for one User Task that carries an interrupting boundary Timer, both mutually exclusive victories, and the program predicates that route an arriving completion or deadline into this family. It owns no stimulus admission and no scenario projection.

The pair keeps no stored ownership record, unlike an Event-Based Gateway race. It is recovered by joining the committed operation to the two live waits, which is sound only because the profile admits exactly one such Activity with exactly one boundary Timer and because arming is atomic, so the two occurrences always share one activation ordinal. A repeated or Multi-Instance Activity would break that recovery and needs an explicit occurrence record.

Arming on Activity activation is a recorded project interpretation. BPMN 2.0.2 Clause 13.5.2 starts a catch Event's wait when a token *reaches* it, and a Boundary Event is never reached, so only the pre-due firing witness discriminates that instant.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def boundedRunningInstance? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId => some instanceId
  | _ => none

def armBoundedUserTaskState? (state : RuntimeState) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundaryTimer : BoundaryTimerArm) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let instanceId ← boundedRunningInstance? state
  pure (activateBoundedUserTask state instanceId owner input task boundaryTimer)

/-- Atomic declarative arming relation with explicit ownership, freshness, and the exact resulting state. -/
inductive BoundedTaskArmingStep : RuntimeState → ControlPlaceId →
    BoundedTaskArm → BoundaryTimerArm → RuntimeState → Prop where
  | arm (before : RuntimeState) (input : ControlPlaceId)
      (task : BoundedTaskArm) (boundaryTimer : BoundaryTimerArm)
      (owner : ScopeOccurrenceId) (instanceId : SemanticId)
      (owned : onlyTokenOwner? before input = some owner)
      (running : boundedRunningInstance? before = some instanceId) :
      BoundedTaskArmingStep before input task boundaryTimer
        (activateBoundedUserTask before instanceId owner input task boundaryTimer)

theorem armBoundedUserTaskState_sound (before after : RuntimeState)
    (input : ControlPlaceId) (task : BoundedTaskArm)
    (boundaryTimer : BoundaryTimerArm)
    (success : armBoundedUserTaskState? before input task boundaryTimer =
      some after) :
    BoundedTaskArmingStep before input task boundaryTimer after := by
  unfold armBoundedUserTaskState? at success
  cases owned : onlyTokenOwner? before input with
  | none => simp [owned] at success
  | some owner =>
      cases running : boundedRunningInstance? before with
      | none => simp [owned, running] at success
      | some instanceId =>
          simp [owned, running] at success
          cases success
          exact .arm before input task boundaryTimer owner instanceId owned running

/-- Every committed bounded-task operation of this program. -/
def boundedTaskOperations (program : Program) :
    List (ControlPlaceId × BoundedTaskArm × BoundaryTimerArm) :=
  program.operations.filterMap fun
    | .awaitBoundedUserTask _ _ input task boundaryTimer =>
        some (input, task, boundaryTimer)
    | _ => none

/-- True when the occurrence names the bounded Activity of a committed bounded-task operation. -/
def isBoundedTaskDefinition (program : Program) (taskId : TaskDefinitionId) :
    Bool :=
  (boundedTaskOperations program).any fun operation =>
    decide (operation.2.1.id = taskId)

/-- True when the occurrence names the boundary Timer of a committed bounded-task operation. -/
def isBoundaryTimerDefinition (program : Program) (elementId : NodeId) : Bool :=
  (boundedTaskOperations program).any fun operation =>
    decide (operation.2.2.elementId = elementId)

private structure BoundedPair where
  task : UserTaskWait
  timer : TimerWait
  taskOutput : ControlPlaceId
  timerOutput : ControlPlaceId

/-- Joins one live task wait to its committed definition and deadline. Both waits must exist: a state holding one without the other is invalid rather than a resumption surface, so this refuses instead of repairing it. -/
private def boundedPairForTask? (program : Program) (state : RuntimeState)
    (task : UserTaskWait) : Option BoundedPair := do
  let operation ← (boundedTaskOperations program).find? fun candidate =>
    decide (candidate.2.1.id = task.task.id)
  let timer ← state.timerWaits.find? fun candidate =>
    decide (
      candidate.elementId = operation.2.2.elementId &&
        candidate.activation = task.activation &&
        candidate.owner = task.owner)
  pure
    { task
      timer
      taskOutput := operation.2.1.output
      timerOutput := operation.2.2.output }

private def boundedPairForTimer? (program : Program) (state : RuntimeState)
    (timer : TimerWait) : Option BoundedPair := do
  let operation ← (boundedTaskOperations program).find? fun candidate =>
    decide (candidate.2.2.elementId = timer.elementId)
  let task ← state.waits.find? fun candidate =>
    decide (
      candidate.task.id = operation.2.1.id &&
        candidate.activation = timer.activation &&
        candidate.owner = timer.owner)
  pure
    { task
      timer
      taskOutput := operation.2.1.output
      timerOutput := operation.2.2.output }

/-- Withdraws both waits and produces the winning route as one transition. Activation counters stay monotonic because removing a wait never rewinds its element's count. -/
private def commitVictory (state : RuntimeState) (pair : BoundedPair)
    (output : ControlPlaceId) (logicalTimeMs : Nat) : Option RuntimeState :=
  match state.control with
  | .running _ =>
      some
        { state with
          waits := state.waits.erase pair.task
          timerWaits := state.timerWaits.erase pair.timer
          tokens := addToken state.tokens output pair.task.owner
          logicalTimeMs }
  | _ => none

/-- Commits the Activity arm, withdrawing the deadline. The profile admits no completion patch, so the caller must reject a non-empty submission rather than ignore it: variable submission is a separately reviewed proposition and admitting it here would add a data claim to a timing capsule. -/
def completeBoundedUserTask? (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) : Option RuntimeState := do
  let task ← state.waits.find? fun wait =>
    decide (
      wait.processInstanceId = processInstanceId &&
        wait.task.id = taskId &&
        wait.activation = activation)
  let pair ← boundedPairForTask? program state task
  commitVictory state pair pair.taskOutput state.logicalTimeMs

/-- Commits the deadline arm at its exact deadline, abandoning the Activity. Clause 13.5.3's order — consume the Timer, cancel the Activity and its live state, then produce the boundary token — is one atomic transition with no observable intermediate state. -/
def interruptBoundedUserTask? (program : Program) (state : RuntimeState)
    (timerId : TimerOccurrenceId) (logicalTimeMs : Nat) :
    Option RuntimeState := do
  let timer ← state.timerWaits.find? fun wait =>
    decide (
      wait.processInstanceId = timerId.processInstanceId &&
        wait.elementId.value = timerId.elementId.value &&
        wait.activation = timerId.activation)
  let pair ← boundedPairForTimer? program state timer
  if logicalTimeMs = timer.deadlineMs then
    commitVictory state pair pair.timerOutput timer.deadlineMs
  else none

/-- The deadline arm cannot commit while no Activity wait is live. A state holding the deadline without its Activity is invalid rather than a resumption surface, so the arm refuses instead of producing the boundary token on its own. -/
@[simp]
theorem interruptBoundedUserTask_none_of_no_task_wait (program : Program)
    (state : RuntimeState) (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (noTasks : state.waits = []) :
    interruptBoundedUserTask? program state timerId logicalTimeMs = none := by
  unfold interruptBoundedUserTask? boundedPairForTimer?
  cases found : state.timerWaits.find? fun wait =>
      decide (
        wait.processInstanceId = timerId.processInstanceId &&
          wait.elementId.value = timerId.elementId.value &&
          wait.activation = timerId.activation) with
  | none => simp [found]
  | some timer => simp [found, noTasks]

end BpmnSemantics.SemanticProcess
