import BpmnSemantics.SemanticProcess.WaitActivation
import BpmnSemantics.SemanticProcess.ActivityOccurrence

/-! # Non-interrupting boundary Timer

This module owns the atomic arming relation for one User Task carrying a non-interrupting boundary Timer, the spawn that preserves its host, the completion that withdraws a live deadline or accepts its absence, and the program predicates that route an arriving completion or firing into this family. It owns no stimulus admission and no scenario projection.

The family's whole content is that firing preserves its host. BPMN 2.0.2 Clause 10.5.6 states it directly: the associated Activity continues to be active, and a token is generated for the Sequence Flow from the boundary Event in parallel to that continuing execution. The interrupting sibling's corresponding transition removes the task occurrence, which is why the two are separate operations rather than one carrying a flag.

The join is one-sided, and that is the load-bearing difference from the sibling. A monitored task whose deadline has already fired is the normal state here, so the task wait plus the committed operation identify the family and the deadline is looked up as an optional live wait. That one-sidedness is unchanged by what follows.

What changed is the join itself. The deadline is now reached through the [Activity occurrence record](ActivityOccurrence.lean) rather than by requiring an equal activation ordinal under one scope owner, and the two declarative relations take `RecordJoins` in place of the two ordinal hypotheses they used to carry. The retired premise was a property of this profile's uniqueness admission rather than a fact the state carried.

Arming on Activity activation is the recorded project interpretation shared with the sibling family, so only the pre-due firing witness discriminates that instant.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def monitoredRunningInstance? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId => some instanceId
  | _ => none

def armMonitoredUserTaskState? (state : RuntimeState) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundaryTimer : BoundaryTimerArm) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let instanceId ← monitoredRunningInstance? state
  pure (activateBoundedUserTask state instanceId owner input task boundaryTimer)

/-- Atomic declarative arming relation with explicit ownership, freshness, and the exact resulting state.

Arming is byte-identical to the interrupting family's: what differs is only what may happen next. -/
inductive MonitoredTaskArmingStep : RuntimeState → ControlPlaceId →
    BoundedTaskArm → BoundaryTimerArm → RuntimeState → Prop where
  | arm (before : RuntimeState) (input : ControlPlaceId)
      (task : BoundedTaskArm) (boundaryTimer : BoundaryTimerArm)
      (owner : ScopeOccurrenceId) (instanceId : SemanticId)
      (owned : onlyTokenOwner? before input = some owner)
      (running : monitoredRunningInstance? before = some instanceId) :
      MonitoredTaskArmingStep before input task boundaryTimer
        (activateBoundedUserTask before instanceId owner input task boundaryTimer)

theorem armMonitoredUserTaskState_sound (before after : RuntimeState)
    (input : ControlPlaceId) (task : BoundedTaskArm)
    (boundaryTimer : BoundaryTimerArm)
    (success : armMonitoredUserTaskState? before input task boundaryTimer =
      some after) :
    MonitoredTaskArmingStep before input task boundaryTimer after := by
  unfold armMonitoredUserTaskState? at success
  cases owned : onlyTokenOwner? before input with
  | none => simp [owned] at success
  | some owner =>
      cases running : monitoredRunningInstance? before with
      | none => simp [owned, running] at success
      | some instanceId =>
          simp [owned, running] at success
          cases success
          exact .arm before input task boundaryTimer owner instanceId owned running

/-- Every committed monitored-task operation of this program. -/
def monitoredTaskOperations (program : Program) :
    List (ControlPlaceId × BoundedTaskArm × BoundaryTimerArm) :=
  program.operations.filterMap fun
    | .awaitMonitoredUserTask _ _ input task boundaryTimer =>
        some (input, task, boundaryTimer)
    | _ => none

/-- True when the occurrence names the monitored Activity of a committed monitored-task operation. -/
def isMonitoredTaskDefinition (program : Program) (taskId : TaskDefinitionId) :
    Bool :=
  (monitoredTaskOperations program).any fun operation =>
    decide (operation.2.1.id = taskId)

/-- True when the occurrence names the boundary Timer of a committed monitored-task operation. -/
def isMonitoredBoundaryTimerDefinition (program : Program) (elementId : NodeId) :
    Bool :=
  (monitoredTaskOperations program).any fun operation =>
    decide (operation.2.2.elementId = elementId)

/-- A committed monitored-task operation joins this exact task occurrence to its routes, and to its deadline when one is still live.

Stated over the program's committed operations rather than over the evaluator's lookup, so the
relations below constrain what a legal transition *is* instead of restating how one is computed. The
deadline is not required, because `NBTIMER-COMPLETE-01` makes its absence the normal post-spawn
state. -/
def MonitoredPairing (program : Program) (task : UserTaskWait)
    (timerElementId : NodeId) (taskOutput timerOutput : ControlPlaceId) : Prop :=
  ∃ operation ∈ monitoredTaskOperations program,
    operation.2.1.id = task.task.id ∧
    operation.2.2.elementId = timerElementId ∧
    operation.2.1.output = taskOutput ∧
    operation.2.2.output = timerOutput

/-- `NBTIMER-SPAWN-01` as a relation: the deadline is consumed, the boundary token appears, and the host is untouched.

`waits` is unconstrained on purpose rather than by omission — it is the proposition. The interrupting
sibling's corresponding relation erases the task wait, so an implementation satisfying that one
cannot satisfy this. -/
inductive MonitoredSpawnStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | spawn (before : RuntimeState) (instanceId : SemanticId)
      (task : UserTaskWait) (timer : TimerWait)
      (taskOutput timerOutput : ControlPlaceId)
      (running : before.control = .running instanceId)
      (taskLive : task ∈ before.waits)
      (timerLive : timer ∈ before.timerWaits)
      (joined : RecordJoins before.activityOccurrences task timer)
      (paired :
        MonitoredPairing program task timer.elementId taskOutput timerOutput) :
      MonitoredSpawnStep program before
        { before with
          timerWaits := before.timerWaits.erase timer
          tokens := addToken before.tokens timerOutput timer.owner
          logicalTimeMs := timer.deadlineMs }

/-- `NBTIMER-COMPLETE-01` as a relation, with one constructor per deadline state.

Both constructors erase the task and produce the normal token; they differ only in whether a live
deadline is withdrawn. Two constructors rather than an `Option` field because the two are genuinely
different transitions on the deadline collection, and collapsing them would hide which one an
evaluator took. -/
inductive MonitoredCompletionStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | withdrawing (before : RuntimeState) (instanceId : SemanticId)
      (task : UserTaskWait) (timer : TimerWait)
      (taskOutput timerOutput : ControlPlaceId)
      (running : before.control = .running instanceId)
      (taskLive : task ∈ before.waits)
      (timerLive : timer ∈ before.timerWaits)
      (joined : RecordJoins before.activityOccurrences task timer)
      (paired :
        MonitoredPairing program task timer.elementId taskOutput timerOutput) :
      MonitoredCompletionStep program before
        { before with
          waits := before.waits.erase task
          timerWaits := before.timerWaits.erase timer
          tokens := addToken before.tokens taskOutput task.owner }
  | afterSpawn (before : RuntimeState) (instanceId : SemanticId)
      (task : UserTaskWait) (timerElementId : NodeId)
      (taskOutput timerOutput : ControlPlaceId)
      (running : before.control = .running instanceId)
      (taskLive : task ∈ before.waits)
      (paired :
        MonitoredPairing program task timerElementId taskOutput timerOutput) :
      MonitoredCompletionStep program before
        { before with
          waits := before.waits.erase task
          tokens := addToken before.tokens taskOutput task.owner }

private structure MonitoredTask where
  task : UserTaskWait
  timer : Option TimerWait
  taskOutput : ControlPlaceId
  timerOutput : ControlPlaceId
  timerElementId : NodeId

/-- The one-sided join: the deadline is looked up but never required. -/
private def monitoredTaskForTask? (program : Program) (state : RuntimeState)
    (task : UserTaskWait) : Option MonitoredTask := do
  let operation ← (monitoredTaskOperations program).find? fun candidate =>
    decide (candidate.2.1.id = task.task.id)
  pure
    { task
      timer := do
        let record ← activityOccurrenceForTaskWait? state.activityOccurrences task
        let deadline ← record.timerHandlerOccurrences.find? fun candidate =>
          decide (candidate.elementId.value = operation.2.2.elementId.value)
        state.timerWaits.find? fun candidate =>
          timerIdNamesWait deadline candidate &&
            decide (candidate.elementId = operation.2.2.elementId)
      taskOutput := operation.2.1.output
      timerOutput := operation.2.2.output
      timerElementId := operation.2.2.elementId }

/-- The spawn direction requires the host, unlike the completion direction: a live deadline whose Activity is gone would have been withdrawn by that Activity's completion, so its absence is a wrong-identity refusal rather than a reachable state. -/
private def monitoredTaskForTimer? (program : Program) (state : RuntimeState)
    (timer : TimerWait) : Option MonitoredTask := do
  let operation ← (monitoredTaskOperations program).find? fun candidate =>
    decide (candidate.2.2.elementId = timer.elementId)
  let record ← activityOccurrenceForTimerWait? state.activityOccurrences timer
  let body ← activityBodyTask? record
  let task ← state.waits.find? fun candidate =>
    taskIdNamesWait body candidate && decide (candidate.task.id = operation.2.1.id)
  pure
    { task
      timer := some timer
      taskOutput := operation.2.1.output
      timerOutput := operation.2.2.output
      timerElementId := operation.2.2.elementId }

/-- Commits the monitored task, withdrawing a live deadline and accepting its absence. The profile admits no completion patch, so the caller must reject a non-empty submission rather than ignore it. -/
def completeMonitoredUserTask? (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) : Option RuntimeState := do
  let task ← state.waits.find? fun wait =>
    decide (
      wait.processInstanceId = processInstanceId &&
        wait.task.id = taskId &&
        wait.activation = activation)
  let monitored ← monitoredTaskForTask? program state task
  match state.control with
  | .running _ =>
      some
        { state with
          waits := state.waits.erase monitored.task
          timerWaits :=
            match monitored.timer with
            | some timer => state.timerWaits.erase timer
            | none => state.timerWaits
          tokens :=
            addToken state.tokens monitored.taskOutput monitored.task.owner }
  | _ => none

/-- Consumes the deadline at its exact instant and produces the boundary token beside the continuing Activity. Nothing else changes: the task occurrence, its activation ordinal, every other wait, and every activation counter are preserved exactly. -/
def spawnFromMonitoredUserTask? (program : Program) (state : RuntimeState)
    (timerId : TimerOccurrenceId) (logicalTimeMs : Nat) :
    Option RuntimeState := do
  let timer ← state.timerWaits.find? fun wait =>
    decide (
      wait.processInstanceId = timerId.processInstanceId &&
        wait.elementId.value = timerId.elementId.value &&
        wait.activation = timerId.activation)
  let monitored ← monitoredTaskForTimer? program state timer
  if logicalTimeMs = timer.deadlineMs then
    match state.control with
    | .running _ =>
        some
          { state with
            timerWaits := state.timerWaits.erase timer
            tokens := addToken state.tokens monitored.timerOutput timer.owner
            logicalTimeMs := timer.deadlineMs }
    | _ => none
  else none

private theorem monitoredTaskForTimer_pairing (program : Program)
    (state : RuntimeState) (timer : TimerWait) (monitored : MonitoredTask)
    (found : monitoredTaskForTimer? program state timer = some monitored) :
    MonitoredPairing program monitored.task timer.elementId monitored.taskOutput
        monitored.timerOutput ∧
      monitored.task ∈ state.waits ∧
      RecordJoins state.activityOccurrences monitored.task timer := by
  unfold monitoredTaskForTimer? at found
  cases opFound : (monitoredTaskOperations program).find? (fun candidate =>
      decide (candidate.2.2.elementId = timer.elementId)) with
  | none => simp [opFound] at found
  | some op =>
      cases recFound : activityOccurrenceForTimerWait? state.activityOccurrences timer with
      | none => simp [opFound, recFound] at found
      | some record =>
          cases bodyFound : activityBodyTask? record with
          | none => simp [opFound, recFound, bodyFound] at found
          | some body =>
              cases taskFound : state.waits.find? (fun candidate =>
                  taskIdNamesWait body candidate &&
                    decide (candidate.task.id = op.2.1.id)) with
              | none => simp [opFound, recFound, bodyFound, taskFound] at found
              | some tk =>
                  simp [opFound, recFound, bodyFound, taskFound] at found
                  cases found
                  obtain ⟨recordMem, deadline, deadlineMem, deadlineNames⟩ :=
                    activityOccurrenceForTimerWait_sound recFound
                  have opProperty : op.2.2.elementId = timer.elementId := by
                    simpa using List.find?_some opFound
                  have taskProperty : taskIdNamesWait body tk = true ∧
                      tk.task.id = op.2.1.id := by
                    simpa [Bool.and_eq_true, decide_eq_true_eq] using List.find?_some taskFound
                  exact ⟨⟨op, List.mem_of_find?_eq_some opFound, taskProperty.2.symm,
                      opProperty, rfl, rfl⟩,
                    List.mem_of_find?_eq_some taskFound,
                    record, recordMem, ⟨body, bodyFound, taskProperty.1⟩,
                    deadline, deadlineMem, deadlineNames⟩

private theorem monitoredTaskForTask_pairing (program : Program)
    (state : RuntimeState) (task : UserTaskWait) (monitored : MonitoredTask)
    (found : monitoredTaskForTask? program state task = some monitored) :
    MonitoredPairing program task monitored.timerElementId monitored.taskOutput
        monitored.timerOutput ∧
      monitored.task = task ∧
      ∀ timer, monitored.timer = some timer →
        timer ∈ state.timerWaits ∧ timer.elementId = monitored.timerElementId ∧
          RecordJoins state.activityOccurrences task timer := by
  unfold monitoredTaskForTask? at found
  cases opFound : (monitoredTaskOperations program).find? (fun candidate =>
      decide (candidate.2.1.id = task.task.id)) with
  | none => simp [opFound] at found
  | some op =>
      simp [opFound] at found
      cases found
      have opProperty : op.2.1.id = task.task.id := by
        simpa using List.find?_some opFound
      refine ⟨⟨op, List.mem_of_find?_eq_some opFound, opProperty, rfl, rfl, rfl⟩,
        rfl, ?_⟩
      intro timer timerFound
      -- The one-sided lookup is a three-step `Option` chain, so its witness is unpacked step by step
      -- rather than by one `find?_some`: the record answers which occurrence, the program which element.
      cases recFound : activityOccurrenceForTaskWait? state.activityOccurrences task with
      | none => simp [recFound] at timerFound
      | some record =>
          cases dlFound : record.timerHandlerOccurrences.find? (fun candidate =>
              decide (candidate.elementId.value = op.2.2.elementId.value)) with
          | none => simp [recFound, dlFound] at timerFound
          | some deadline =>
              simp only [recFound, dlFound, Option.bind_some] at timerFound
              obtain ⟨recordMem, body, bodyEq, bodyNames⟩ :=
                activityOccurrenceForTaskWait_sound recFound
              have property : timerIdNamesWait deadline timer = true ∧
                  timer.elementId = op.2.2.elementId := by
                simpa [Bool.and_eq_true, decide_eq_true_eq] using List.find?_some timerFound
              exact ⟨List.mem_of_find?_eq_some timerFound, property.2,
                record, recordMem, ⟨body, bodyEq, bodyNames⟩,
                deadline, List.mem_of_find?_eq_some dlFound, property.1⟩

/-- Every spawn the evaluator produces is permitted by the declarative relation. -/
theorem spawnFromMonitoredUserTask_sound (program : Program)
    (before after : RuntimeState) (timerId : TimerOccurrenceId)
    (logicalTimeMs : Nat)
    (success : spawnFromMonitoredUserTask? program before timerId logicalTimeMs =
      some after) :
    MonitoredSpawnStep program before after := by
  unfold spawnFromMonitoredUserTask? at success
  cases timerFound : before.timerWaits.find? (fun wait =>
      decide (wait.processInstanceId = timerId.processInstanceId) &&
        decide (wait.elementId.value = timerId.elementId.value) &&
        decide (wait.activation = timerId.activation)) with
  | none => simp [timerFound] at success
  | some timer =>
      cases pairFound : monitoredTaskForTimer? program before timer with
      | none => simp [timerFound, pairFound] at success
      | some monitored =>
          obtain ⟨pairing, taskMem, joined⟩ :=
            monitoredTaskForTimer_pairing program before timer monitored pairFound
          have timerLive : timer ∈ before.timerWaits :=
            List.mem_of_find?_eq_some timerFound
          simp [timerFound, pairFound] at success
          obtain ⟨_, success⟩ := success
          cases running : before.control with
          | running instanceId =>
              rw [running] at success
              cases success
              rw [← running]
              exact .spawn before instanceId monitored.task timer
                monitored.taskOutput monitored.timerOutput running taskMem
                timerLive joined pairing
          | completed => rw [running] at success; simp at success
          | cancelled => rw [running] at success; simp at success
          | notStarted => rw [running] at success; simp at success

/-- Every completion the evaluator produces is permitted by the declarative relation, in whichever deadline state it found. -/
theorem completeMonitoredUserTask_sound (program : Program)
    (before after : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (success : completeMonitoredUserTask? program before processInstanceId taskId
      activation = some after) :
    MonitoredCompletionStep program before after := by
  unfold completeMonitoredUserTask? at success
  cases taskFound : before.waits.find? (fun wait =>
      decide (wait.processInstanceId = processInstanceId) &&
        decide (wait.task.id = taskId) &&
        decide (wait.activation = activation)) with
  | none => simp [taskFound] at success
  | some task =>
      cases pairFound : monitoredTaskForTask? program before task with
      | none => simp [taskFound, pairFound] at success
      | some monitored =>
          obtain ⟨pairing, taskEq, timerProperty⟩ :=
            monitoredTaskForTask_pairing program before task monitored pairFound
          subst taskEq
          have taskLive : monitored.task ∈ before.waits :=
            List.mem_of_find?_eq_some taskFound
          simp [taskFound, pairFound] at success
          cases running : before.control with
          | running instanceId =>
              cases timerFound : monitored.timer with
              | none =>
                  rw [running, timerFound] at success
                  cases success
                  rw [← running]
                  exact .afterSpawn before instanceId monitored.task
                    monitored.timerElementId monitored.taskOutput
                    monitored.timerOutput running taskLive pairing
              | some timer =>
                  obtain ⟨timerLive, elementEq, joined⟩ :=
                    timerProperty timer timerFound
                  rw [running, timerFound] at success
                  cases success
                  rw [← running]
                  exact .withdrawing before instanceId monitored.task timer
                    monitored.taskOutput monitored.timerOutput running taskLive
                    timerLive joined (elementEq ▸ pairing)
          | completed => rw [running] at success; simp at success
          | cancelled => rw [running] at success; simp at success
          | notStarted => rw [running] at success; simp at success

/-- **The law that separates this family from its sibling.** Every spawn leaves the host's task collection exactly as it was, so no monitored firing can end the Activity it monitors.

The interrupting family's corresponding law is the opposite: its victory erases one live task. An
implementation satisfying both would have to erase and not erase the same collection. -/
theorem monitored_spawn_preserves_host (program : Program)
    (before after : RuntimeState)
    (step : MonitoredSpawnStep program before after) :
    after.waits = before.waits ∧ after.activations = before.activations ∧
      after.timerActivations = before.timerActivations := by
  cases step with
  | spawn _ _ _ _ _ _ _ _ _ _ => exact ⟨rfl, rfl, rfl⟩

/-- A spawn adds exactly one token, owned by the deadline's own scope, and advances logical time to that deadline; a completion adds exactly one token, owned by the task's scope, and leaves logical time alone.

Which place each token lands on is not pinned here. The output is existentially quantified, so these two say *one* token was produced and by which transition, while the boundary and normal places are bound to `operation.boundaryTimer.output` and `operation.task.output` by the relation's own constructors and carried to the evaluator by the soundness bridges above. Reading either as a routing law would overstate it. -/
theorem monitored_spawn_adds_one_owned_token (program : Program)
    (before after : RuntimeState)
    (step : MonitoredSpawnStep program before after) :
    ∃ timer ∈ before.timerWaits, ∃ timerOutput,
      after.tokens = addToken before.tokens timerOutput timer.owner ∧
        after.logicalTimeMs = timer.deadlineMs := by
  cases step with
  | spawn _ _ timer _ timerOutput _ _ timerLive _ _ =>
      exact ⟨timer, timerLive, timerOutput, rfl, rfl⟩

theorem monitored_completion_adds_one_owned_token (program : Program)
    (before after : RuntimeState)
    (step : MonitoredCompletionStep program before after) :
    ∃ task ∈ before.waits, ∃ taskOutput,
      after.waits = before.waits.erase task ∧
        after.tokens = addToken before.tokens taskOutput task.owner ∧
        after.logicalTimeMs = before.logicalTimeMs := by
  cases step with
  | withdrawing _ task _ taskOutput _ _ taskLive _ _ _ =>
      exact ⟨task, taskLive, taskOutput, rfl, rfl, rfl⟩
  | afterSpawn _ task _ taskOutput _ _ taskLive _ =>
      exact ⟨task, taskLive, taskOutput, rfl, rfl, rfl⟩

/-- A completion that changed the deadline collection removed exactly one live deadline, so no later firing of that occurrence can commit.

Keyed on the observable change rather than stated as a disjunction over both constructors. A
disjunction whose branches include `after.timerWaits = before.timerWaits` is satisfiable by that
branch alone, so it would hold for an evaluator that never withdrew anything; the `changed`
hypothesis is what forces the withdrawing case and makes the conclusion carry the removal.

The `Nodup` hypothesis is load-bearing and names a fact the state type does not enforce:
`RuntimeState` carries no uniqueness invariant over `timerWaits`, so nothing in the type rules out
two identical occurrences. It is recorded here instead of being assumed silently. -/
theorem monitored_completion_that_changed_deadlines_removed_one
    (program : Program) (before after : RuntimeState)
    (step : MonitoredCompletionStep program before after)
    (nodup : before.timerWaits.Nodup)
    (changed : after.timerWaits ≠ before.timerWaits) :
    ∃ timer ∈ before.timerWaits,
      after.timerWaits = before.timerWaits.erase timer ∧
        timer ∉ after.timerWaits := by
  cases step with
  | withdrawing _ _ timer _ _ _ _ timerLive _ _ =>
      exact ⟨timer, timerLive, rfl, nodup.not_mem_erase⟩
  | afterSpawn _ _ _ _ _ _ _ _ => exact absurd rfl changed

/-- The other arm, stated positively so neither is carried by the other: a completion whose deadline was already consumed leaves the deadline collection untouched. -/
theorem monitored_completion_after_a_spawn_keeps_every_deadline
    (program : Program) (before after : RuntimeState)
    (step : MonitoredCompletionStep program before after)
    (noLiveDeadline : before.timerWaits = []) :
    after.timerWaits = before.timerWaits := by
  cases step with
  | withdrawing _ _ _ _ _ _ _ timerLive _ _ =>
      exact absurd (noLiveDeadline ▸ timerLive) (List.not_mem_nil)
  | afterSpawn _ _ _ _ _ _ _ _ => rfl

/-- The spawn refuses every firing that is not exactly due, for any state and any timer.

This is the quantified form of the capsule's arming-instant discriminator. A concrete fixture cannot
carry it: arming at Activity activation is a recorded interpretation rather than a clause
consequence, so the claim that matters is that *no* pre-due or post-due firing commits. -/
theorem spawnFromMonitoredUserTask_none_of_not_due (program : Program)
    (state : RuntimeState) (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (timer : TimerWait)
    (found : state.timerWaits.find? (fun wait =>
      decide (wait.processInstanceId = timerId.processInstanceId) &&
        decide (wait.elementId.value = timerId.elementId.value) &&
        decide (wait.activation = timerId.activation)) = some timer)
    (notDue : logicalTimeMs ≠ timer.deadlineMs) :
    spawnFromMonitoredUserTask? program state timerId logicalTimeMs = none := by
  unfold spawnFromMonitoredUserTask?
  cases pairFound : monitoredTaskForTimer? program state timer with
  | none => simp [found, pairFound]
  | some _ => simp [found, pairFound, notDue]

/-- The spawn refuses a deadline whose monitored Activity is not live, so a consumed pair cannot spawn twice and a firing after completion cannot commit. -/
@[simp]
theorem spawnFromMonitoredUserTask_none_of_no_task_wait (program : Program)
    (state : RuntimeState) (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (noTasks : state.waits = []) :
    spawnFromMonitoredUserTask? program state timerId logicalTimeMs = none := by
  unfold spawnFromMonitoredUserTask? monitoredTaskForTimer?
  cases found : state.timerWaits.find? fun wait =>
      decide (
        wait.processInstanceId = timerId.processInstanceId &&
          wait.elementId.value = timerId.elementId.value &&
          wait.activation = timerId.activation) with
  | none => simp
  | some _ => simp [noTasks]

/-- The completion refuses an identity that names no live task, for any state. -/
theorem completeMonitoredUserTask_none_of_no_match (program : Program)
    (state : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (missing : state.waits.find? (fun wait =>
      decide (wait.processInstanceId = processInstanceId) &&
        decide (wait.task.id = taskId) &&
        decide (wait.activation = activation)) = none) :
    completeMonitoredUserTask? program state processInstanceId taskId activation =
      none := by
  unfold completeMonitoredUserTask?
  simp [missing]

/-- **The nearest checked non-law**, stated positively so it carries hypotheses rather than a witness.

The interrupting sibling proves `completeBoundedUserTask_none_of_no_deadline_wait`: with no live
deadline its Activity arm cannot commit, because a half-armed pair is invalid there. Here the same
premise yields the opposite conclusion, which is what `NBTIMER-COMPLETE-01` means by a one-sided
join — a monitored task whose deadline has been consumed is the normal post-spawn state, not a
defect. An implementation could not satisfy both this and the sibling's law for one operation kind. -/
theorem completeMonitoredUserTask_some_of_no_deadline_wait (program : Program)
    (state : RuntimeState) (instanceId processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (task : UserTaskWait)
    (operation : ControlPlaceId × BoundedTaskArm × BoundaryTimerArm)
    (running : state.control = .running instanceId)
    (noTimers : state.timerWaits = [])
    (taskFound : state.waits.find? (fun wait =>
      decide (wait.processInstanceId = processInstanceId) &&
        decide (wait.task.id = taskId) &&
        decide (wait.activation = activation)) = some task)
    (operationFound : (monitoredTaskOperations program).find? (fun candidate =>
      decide (candidate.2.1.id = task.task.id)) = some operation) :
    completeMonitoredUserTask? program state processInstanceId taskId activation ≠
      none := by
  unfold completeMonitoredUserTask? monitoredTaskForTask?
  simp [taskFound, operationFound, noTimers, running]

end BpmnSemantics.SemanticProcess
