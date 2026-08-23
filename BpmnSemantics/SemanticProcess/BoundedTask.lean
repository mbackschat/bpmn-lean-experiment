import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Interrupting Activity boundary Timer

This module owns the atomic arming relation for one User Task that carries an interrupting boundary Timer, both mutually exclusive victories, and the program predicates that route an arriving completion or deadline into this family. It owns no stimulus admission and no scenario projection.

The pair keeps no stored ownership record, unlike an Event-Based Gateway race. It is recovered by joining the committed operation to the two live waits, which is sound only because the profile admits exactly one such Activity with exactly one boundary Timer and because arming is atomic, so the two occurrences always share one activation ordinal. A repeated or Multi-Instance Activity would break that recovery and needs an explicit occurrence record.

An `ActivityOccurrence` record for this family exists in `RuntimeState` and the TypeScript core reads it, but this module does not: the joins below are entirely by activation ordinal, hypotheses of the declarative relations included. That is a recorded gap in the Lean lane rather than a design choice, and it is why the paragraph above still holds here while the same claim is false of the core.

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

/-- A committed bounded-task operation joins this exact task and deadline occurrence, naming both routes.

Stated over the program's committed operations rather than over the evaluator's lookup, so the
relation below constrains what a legal victory *is* instead of restating how one is computed. -/
def BoundedPairing (program : Program) (task : UserTaskWait) (timer : TimerWait)
    (taskOutput timerOutput : ControlPlaceId) : Prop :=
  ∃ operation ∈ boundedTaskOperations program,
    operation.2.1.id = task.task.id ∧
    operation.2.2.elementId = timer.elementId ∧
    operation.2.1.output = taskOutput ∧
    operation.2.2.output = timerOutput ∧
    timer.activation = task.activation ∧
    timer.owner = task.owner

/-- Declarative victory relation with exactly two constructors, one per arm.

Both arms withdraw both waits and produce a single token, which is what makes the victories mutually
exclusive without an ownership record. They differ only in the route taken and in logical time: the
Activity arm preserves it, while the deadline arm advances it to the exact deadline. Neither arm
permits an intermediate state in which one wait is gone and the other is live. -/
inductive BoundedTaskVictoryStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | activity (before : RuntimeState) (instanceId : SemanticId)
      (task : UserTaskWait) (timer : TimerWait)
      (taskOutput timerOutput : ControlPlaceId)
      (running : before.control = .running instanceId)
      (taskLive : task ∈ before.waits)
      (timerLive : timer ∈ before.timerWaits)
      (paired : BoundedPairing program task timer taskOutput timerOutput) :
      BoundedTaskVictoryStep program before
        { before with
          waits := before.waits.erase task
          timerWaits := before.timerWaits.erase timer
          tokens := addToken before.tokens taskOutput task.owner
          logicalTimeMs := before.logicalTimeMs }
  | deadline (before : RuntimeState) (instanceId : SemanticId)
      (task : UserTaskWait) (timer : TimerWait)
      (taskOutput timerOutput : ControlPlaceId)
      (running : before.control = .running instanceId)
      (taskLive : task ∈ before.waits)
      (timerLive : timer ∈ before.timerWaits)
      (paired : BoundedPairing program task timer taskOutput timerOutput) :
      BoundedTaskVictoryStep program before
        { before with
          waits := before.waits.erase task
          timerWaits := before.timerWaits.erase timer
          tokens := addToken before.tokens timerOutput task.owner
          logicalTimeMs := timer.deadlineMs }

private theorem boundedPairForTask_pairing (program : Program)
    (state : RuntimeState) (task : UserTaskWait) (pair : BoundedPair)
    (found : boundedPairForTask? program state task = some pair) :
    BoundedPairing program pair.task pair.timer pair.taskOutput pair.timerOutput ∧
      pair.task = task ∧ pair.timer ∈ state.timerWaits := by
  unfold boundedPairForTask? at found
  cases opFound : (boundedTaskOperations program).find? (fun candidate =>
      decide (candidate.2.1.id = task.task.id)) with
  | none => simp [opFound] at found
  | some op =>
      cases twFound : state.timerWaits.find? (fun candidate =>
          decide (candidate.elementId = op.2.2.elementId) &&
            decide (candidate.activation = task.activation) &&
            decide (candidate.owner = task.owner)) with
      | none => simp [opFound, twFound] at found
      | some tw =>
          simp [opFound, twFound] at found
          cases found
          have opProperty : op.2.1.id = task.task.id := by
            simpa using List.find?_some opFound
          have twProperty : tw.elementId = op.2.2.elementId ∧
              tw.activation = task.activation ∧ tw.owner = task.owner := by
            simpa [Bool.and_eq_true, decide_eq_true_eq, and_assoc]
              using List.find?_some twFound
          exact ⟨⟨op, List.mem_of_find?_eq_some opFound, opProperty,
            twProperty.1.symm, rfl, rfl, twProperty.2.1, twProperty.2.2⟩,
            rfl, List.mem_of_find?_eq_some twFound⟩

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

/-- The Activity arm cannot commit while no deadline wait is live, mirroring the deadline arm below.

Together the two make a half-armed pair unusable from either side, which is the negative counterpart
of atomic arming: neither member can be spent alone, so a partially armed state cannot be mistaken
for a resumption surface in either direction. -/
@[simp]
theorem completeBoundedUserTask_none_of_no_deadline_wait (program : Program)
    (state : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (noTimers : state.timerWaits = []) :
    completeBoundedUserTask? program state processInstanceId taskId activation =
      none := by
  unfold completeBoundedUserTask? boundedPairForTask?
  cases found : state.waits.find? fun wait =>
      decide (
        wait.processInstanceId = processInstanceId &&
          wait.task.id = taskId &&
          wait.activation = activation) with
  | none => simp
  | some _ => simp [noTimers]

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
  | none => simp
  | some _ => simp [noTasks]

/-- Mirror of the pairing helper for the deadline arm, which looks the pair up from the other side. -/
private theorem boundedPairForTimer_pairing (program : Program)
    (state : RuntimeState) (timer : TimerWait) (pair : BoundedPair)
    (found : boundedPairForTimer? program state timer = some pair) :
    BoundedPairing program pair.task pair.timer pair.taskOutput pair.timerOutput ∧
      pair.timer = timer ∧ pair.task ∈ state.waits := by
  unfold boundedPairForTimer? at found
  cases opFound : (boundedTaskOperations program).find? (fun candidate =>
      decide (candidate.2.2.elementId = timer.elementId)) with
  | none => simp [opFound] at found
  | some op =>
      cases taskFound : state.waits.find? (fun candidate =>
          decide (candidate.task.id = op.2.1.id) &&
            decide (candidate.activation = timer.activation) &&
            decide (candidate.owner = timer.owner)) with
      | none => simp [opFound, taskFound] at found
      | some tk =>
          simp [opFound, taskFound] at found
          cases found
          have opProperty : op.2.2.elementId = timer.elementId := by
            simpa using List.find?_some opFound
          have taskProperty : tk.task.id = op.2.1.id ∧
              tk.activation = timer.activation ∧ tk.owner = timer.owner := by
            simpa [Bool.and_eq_true, decide_eq_true_eq, and_assoc]
              using List.find?_some taskFound
          exact ⟨⟨op, List.mem_of_find?_eq_some opFound, taskProperty.1.symm,
            opProperty, rfl, rfl, taskProperty.2.1.symm, taskProperty.2.2.symm⟩,
            rfl, List.mem_of_find?_eq_some taskFound⟩

/-- Every Activity victory the evaluator produces is permitted by the declarative relation. -/
theorem completeBoundedUserTask_sound (program : Program)
    (before after : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (success : completeBoundedUserTask? program before processInstanceId taskId
      activation = some after) :
    BoundedTaskVictoryStep program before after := by
  unfold completeBoundedUserTask? at success
  cases taskFound : before.waits.find? (fun wait =>
      decide (wait.processInstanceId = processInstanceId) &&
        decide (wait.task.id = taskId) &&
        decide (wait.activation = activation)) with
  | none => simp [taskFound] at success
  | some task =>
      cases pairFound : boundedPairForTask? program before task with
      | none => simp [taskFound, pairFound] at success
      | some pair =>
          obtain ⟨pairing, taskEq, timerMem⟩ :=
            boundedPairForTask_pairing program before task pair pairFound
          have taskLive : pair.task ∈ before.waits := by
            rw [taskEq]; exact List.mem_of_find?_eq_some taskFound
          simp [taskFound, pairFound] at success
          unfold commitVictory at success
          cases running : before.control with
          | running instanceId =>
              simp only [running, Option.some.injEq] at success
              cases success
              rw [← running]
              exact .activity before instanceId pair.task pair.timer
                pair.taskOutput pair.timerOutput running taskLive timerMem pairing
          | completed => simp [running] at success
          | cancelled => simp [running] at success
          | notStarted => simp [running] at success

/-- Every deadline victory the evaluator produces is permitted by the declarative relation. -/
theorem interruptBoundedUserTask_sound (program : Program)
    (before after : RuntimeState) (timerId : TimerOccurrenceId)
    (logicalTimeMs : Nat)
    (success : interruptBoundedUserTask? program before timerId logicalTimeMs =
      some after) :
    BoundedTaskVictoryStep program before after := by
  unfold interruptBoundedUserTask? at success
  cases timerFound : before.timerWaits.find? (fun wait =>
      decide (wait.processInstanceId = timerId.processInstanceId) &&
        decide (wait.elementId.value = timerId.elementId.value) &&
        decide (wait.activation = timerId.activation)) with
  | none => simp [timerFound] at success
  | some timer =>
      cases pairFound : boundedPairForTimer? program before timer with
      | none => simp [timerFound, pairFound] at success
      | some pair =>
          obtain ⟨pairing, sameTimer, taskMem⟩ :=
            boundedPairForTimer_pairing program before timer pair pairFound
          have timerLive : pair.timer ∈ before.timerWaits := by
            rw [sameTimer]; exact List.mem_of_find?_eq_some timerFound
          simp [timerFound, pairFound] at success
          obtain ⟨_, success⟩ := success
          unfold commitVictory at success
          cases running : before.control with
          | running instanceId =>
              rw [running] at success
              cases success
              rw [← running, ← sameTimer]
              exact .deadline before instanceId pair.task pair.timer
                pair.taskOutput pair.timerOutput running taskMem timerLive
                pairing
          | completed => rw [running] at success; simp at success
          | cancelled => rw [running] at success; simp at success
          | notStarted => rw [running] at success; simp at success

/-- The deadline arm refuses every firing that is not exactly due, for any state and any timer.

This is the quantified form of the capsule's arming-instant discriminator. A concrete fixture cannot
carry it: arming at Activity activation is a recorded interpretation rather than a clause
consequence, so the claim that matters is that *no* pre-due or post-due firing commits, not that one
chosen instant is refused. -/
theorem interruptBoundedUserTask_none_of_not_due (program : Program)
    (state : RuntimeState) (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (timer : TimerWait)
    (found : state.timerWaits.find? (fun wait =>
      decide (wait.processInstanceId = timerId.processInstanceId) &&
        decide (wait.elementId.value = timerId.elementId.value) &&
        decide (wait.activation = timerId.activation)) = some timer)
    (notDue : logicalTimeMs ≠ timer.deadlineMs) :
    interruptBoundedUserTask? program state timerId logicalTimeMs = none := by
  unfold interruptBoundedUserTask?
  cases pairFound : boundedPairForTimer? program state timer with
  | none => simp [found, pairFound]
  | some _ => simp [found, pairFound, notDue]

/-- No victory produces a half-withdrawn pair: both arms remove exactly one live task and one live deadline.

This is the victory counterpart of atomic arming. The pair keeps no ownership record, so a state
holding one member without the other is unrecoverable rather than a resumption surface; this law is
what rules that state out for every victory rather than for one fixture. -/
theorem bounded_victory_withdraws_both_arms (program : Program)
    (before after : RuntimeState)
    (step : BoundedTaskVictoryStep program before after) :
    ∃ task timer, task ∈ before.waits ∧ timer ∈ before.timerWaits ∧
      after.waits = before.waits.erase task ∧
      after.timerWaits = before.timerWaits.erase timer := by
  cases step with
  | activity _ task timer _ _ _ taskLive timerLive _ =>
      exact ⟨task, timer, taskLive, timerLive, rfl, rfl⟩
  | deadline _ task timer _ _ _ taskLive timerLive _ =>
      exact ⟨task, timer, taskLive, timerLive, rfl, rfl⟩

/-- A victory removes its own deadline occurrence, so the same pair cannot win twice.

The `Nodup` hypothesis is load-bearing and names a fact the state type does not enforce: `RuntimeState`
carries no uniqueness invariant over `timerWaits`, so nothing in the type rules out two identical
occurrences. The stronger claim — that no later lookup *by key* can rediscover the withdrawn
deadline — needs uniqueness of the (instance, element, activation) key rather than of the whole
value, and is a claim this theorem does *not* make: its hypothesis and its conclusion are both
whole-value. The type still does not enforce that key uniqueness; `waitIdentitiesUnique` now names
it, and no theorem establishes it of a reachable state. The by-key form is proved separately by
`bounded_task_victory_withdrawals_are_final`, under that named conjunct as an explicit hypothesis. -/
theorem bounded_victory_removes_its_own_deadline (program : Program)
    (before after : RuntimeState)
    (step : BoundedTaskVictoryStep program before after)
    (nodup : before.timerWaits.Nodup) :
    ∃ timer, timer ∈ before.timerWaits ∧ timer ∉ after.timerWaits := by
  obtain ⟨task, timer, taskLive, timerLive, _, timerErased⟩ :=
    bounded_victory_withdraws_both_arms program before after step
  exact ⟨timer, timerLive, timerErased ▸ nodup.not_mem_erase⟩

/-- The Activity arm refuses an identity that names no live task, for any state.

Quantified rather than fixture-bound because the refusal must hold for every unmatched identity, not
for the three the conformance fixture happens to try. -/
theorem completeBoundedUserTask_none_of_no_match (program : Program)
    (state : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (missing : state.waits.find? (fun wait =>
      decide (wait.processInstanceId = processInstanceId) &&
        decide (wait.task.id = taskId) &&
        decide (wait.activation = activation)) = none) :
    completeBoundedUserTask? program state processInstanceId taskId activation =
      none := by
  unfold completeBoundedUserTask?
  simp [missing]

/-- Neither arm rewinds an activation counter, so a withdrawn occurrence can never be reissued. -/
theorem bounded_victory_preserves_activation_counters (program : Program)
    (before after : RuntimeState)
    (step : BoundedTaskVictoryStep program before after) :
    after.activations = before.activations ∧
      after.timerActivations = before.timerActivations := by
  cases step with
  | activity => exact ⟨rfl, rfl⟩
  | deadline => exact ⟨rfl, rfl⟩

/-- The deadline arm publishes exactly its own deadline as logical time, while the Activity arm leaves logical time untouched. This is what makes the two victories distinguishable without an ownership record. -/
theorem bounded_victory_logical_time (program : Program)
    (before after : RuntimeState)
    (step : BoundedTaskVictoryStep program before after) :
    after.logicalTimeMs = before.logicalTimeMs ∨
      ∃ timer ∈ before.timerWaits, after.logicalTimeMs = timer.deadlineMs := by
  cases step with
  | activity => exact .inl rfl
  | deadline _ _ timer _ _ _ _ timerLive _ => exact .inr ⟨timer, timerLive, rfl⟩

end BpmnSemantics.SemanticProcess
