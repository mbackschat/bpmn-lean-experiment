/**
 * Executable transitions for one User Task occurrence that owns a non-interrupting boundary Timer.
 *
 * The family's whole content is that firing preserves its host. Clause 10.5.6 states it directly:
 * the associated Activity continues to be active, and a token is generated for the Sequence Flow
 * from the boundary Event in parallel to that continuing execution. The interrupting sibling's
 * corresponding transition removes the task occurrence, which is why the two are separate operation
 * kinds rather than one kind carrying a flag.
 *
 * The join is deliberately one-sided, and that is the load-bearing difference from the sibling. A
 * monitored task whose deadline has already fired is the normal state here, so the record's attached
 * list may legitimately be empty while its body is live. That state is also why record existence is a
 * property of the program rather than of the state: a state-level rule would delete the record at the
 * moment it is the only thing still identifying the host.
 *
 * Arming on Activity activation is a recorded project interpretation shared with the sibling family:
 * BPMN 2.0.2 starts a catch Event's wait when a token *reaches* it, and a Boundary Event is never
 * reached. Only the pre-due firing witness discriminates that instant.
 */
import {
  ActivityBodyKind,
  activityOccurrenceForAttachedTimer,
  activityOccurrenceForTaskBody,
  compareActivityOccurrences,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitMonitoredUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  addToken,
  compareTimerWaits,
  compareUserTaskWaits,
  ControlStateKind,
  removeToken,
  sameOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
  SemanticTimerWait,
  SemanticUserTaskWait,
} from "./semantic-process-state.js";
import { StimulusKind } from "./contract.js";
import type {
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  OccurrenceId,
} from "./contract.js";

/**
 * A live monitored task joined to its committed definition, with its deadline when one is still
 * live. `NBTIMER-COMPLETE-01` makes the absent deadline an ordinary post-firing state rather than a
 * defect, so the field is nullable here where the interrupting family requires both waits.
 */
type MonitoredTask = Readonly<{
  definition: AwaitMonitoredUserTaskOperation;
  record: ActivityOccurrence;
  task: SemanticUserTaskWait;
  timer: SemanticTimerWait | undefined;
}>;

/**
 * `NBTIMER-ARM-01`. Atomically replaces the Activity's incoming token with both the task occurrence
 * and its deadline. Neither exists without the other at arming.
 */
export function armMonitoredUserTask(
  operation: AwaitMonitoredUserTaskOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const taskActivation = nextActivation(
    state.taskActivations,
    operation.task.elementId,
  );
  const timerActivation = nextActivation(
    state.timerActivations,
    operation.boundaryTimer.elementId,
  );
  const deadlineMs = state.logicalTimeMs + operation.boundaryTimer.durationMs;
  if (!Number.isSafeInteger(deadlineMs)) {
    throw new RangeError("Timer deadline exceeds the safe integer boundary");
  }
  const activityActivation = nextActivation(
    state.activityActivations,
    operation.task.elementId,
  );
  const taskId = {
    processInstanceId: owner.processInstanceId,
    elementId: operation.task.elementId,
    activation: taskActivation,
  } as const;
  const timerId = {
    processInstanceId: owner.processInstanceId,
    elementId: operation.boundaryTimer.elementId,
    activation: timerActivation,
  } as const;
  return {
    ...state,
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    activityOccurrences: [
      ...state.activityOccurrences,
      {
        id: {
          processInstanceId: owner.processInstanceId,
          activityElementId: operation.task.elementId,
          activation: activityActivation,
        },
        owner,
        operationId: operation.id,
        body: { kind: ActivityBodyKind.UserTask, task: taskId } as const,
        attachedTimers: [timerId],
      },
    ].sort(compareActivityOccurrences),
    activityActivations: setActivationCount(
      state.activityActivations,
      operation.task.elementId,
      activityActivation,
    ),
    userTaskWaits: [
      ...state.userTaskWaits,
      { id: taskId, owner, name: operation.task.name, output: operation.task.output },
    ].sort(compareUserTaskWaits),
    timerWaits: [
      ...state.timerWaits,
      { id: timerId, owner, deadlineMs, output: operation.boundaryTimer.output },
    ].sort(compareTimerWaits),
    taskActivations: setActivationCount(
      state.taskActivations,
      operation.task.elementId,
      taskActivation,
    ),
    timerActivations: setActivationCount(
      state.timerActivations,
      operation.boundaryTimer.elementId,
      timerActivation,
    ),
  };
}

/**
 * `NBTIMER-COMPLETE-01`. Commits the monitored task, withdrawing its deadline when one is still
 * live and accepting the completion unchanged when the deadline has already fired.
 *
 * The profile admits no completion patch, so a non-empty submission is rejected rather than ignored:
 * variable submission is a separately reviewed proposition and admitting it here would add a data
 * claim to a timing capsule.
 */
export function completeMonitoredUserTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: CompleteUserTaskInstanceStimulus,
): RuntimeState | null {
  if (
    stimulus.kind !== StimulusKind.CompleteUserTaskInstance ||
    stimulus.submittedValues.length !== 0 ||
    state.control.kind !== ControlStateKind.Running
  ) {
    return null;
  }
  const monitored = monitoredTaskFor(program, state, stimulus.taskId);
  if (monitored === undefined) {
    return null;
  }
  return {
    ...state,
    controlTokens: addToken(
      state.controlTokens,
      monitored.definition.task.output,
      monitored.task.owner,
    ),
    userTaskWaits: state.userTaskWaits.filter(
      (candidate) => candidate !== monitored.task,
    ),
    timerWaits: state.timerWaits.filter(
      (candidate) => candidate !== monitored.timer,
    ),
    activityOccurrences: state.activityOccurrences.filter(
      (candidate) => !sameActivityOccurrence(candidate.id, monitored.record.id),
    ),
  };
}

/**
 * `NBTIMER-SPAWN-01`. Consumes the deadline at its exact instant and produces the boundary token
 * beside the continuing Activity.
 *
 * Everything else is preserved exactly: the task occurrence, its activation ordinal, every other
 * wait, every variable binding, and every activation counter. The consumed occurrence does not
 * re-arm, so under this profile's single `timeDuration` the deadline fires at most once per
 * activation.
 */
export function spawnFromMonitoredUserTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: FireTimerStimulus,
): RuntimeState | null {
  if (
    stimulus.kind !== StimulusKind.FireTimer ||
    state.control.kind !== ControlStateKind.Running
  ) {
    return null;
  }
  const monitored = monitoredTaskForTimer(program, state, stimulus.timerId);
  if (
    monitored?.timer === undefined ||
    stimulus.logicalTimeMs !== monitored.timer.deadlineMs
  ) {
    return null;
  }
  return {
    ...state,
    controlTokens: addToken(
      state.controlTokens,
      monitored.definition.boundaryTimer.output,
      monitored.timer.owner,
    ),
    timerWaits: state.timerWaits.filter(
      (candidate) => candidate !== monitored.timer,
    ),
    // The record survives with an empty attached list, because its body does. This is the state that
    // makes record existence a program-level property: a state-level rule would delete the record
    // here, exactly when it is the only thing still identifying the host.
    activityOccurrences: state.activityOccurrences.map((candidate) =>
      sameActivityOccurrence(candidate.id, monitored.record.id)
        ? { ...candidate, attachedTimers: [] }
        : candidate
    ),
    logicalTimeMs: monitored.timer.deadlineMs,
  };
}

/** True when the occurrence names the monitored Activity of a committed monitored-task operation. */
export function isMonitoredTaskDefinition(
  program: SemanticProcessProgram,
  taskId: OccurrenceId,
): boolean {
  return monitoredTaskOperations(program).some(
    (operation) => operation.task.elementId === taskId.elementId,
  );
}

/**
 * True when the occurrence names the boundary Timer of a committed monitored-task operation.
 *
 * The Temporal deadline scheduler reads this to claim the durable timer, so a family whose kind no
 * scheduler claims falls through to a generic path that is unsound for a boundary deadline.
 */
export function isMonitoredBoundaryTimerDefinition(
  program: SemanticProcessProgram,
  timerId: OccurrenceId,
): boolean {
  return monitoredTaskOperations(program).some(
    (operation) => operation.boundaryTimer.elementId === timerId.elementId,
  );
}

function monitoredTaskOperations(
  program: SemanticProcessProgram,
): ReadonlyArray<AwaitMonitoredUserTaskOperation> {
  return program.operations.filter(
    (operation): operation is AwaitMonitoredUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitMonitoredUserTask,
  );
}

/**
 * Joins one live task wait to its committed definition and to its deadline when that is still live.
 *
 * This is the one-sided join. A missing deadline is not repaired and not refused: it is the state
 * left by a committed spawn.
 */
function monitoredTaskFor(
  program: SemanticProcessProgram,
  state: RuntimeState,
  taskId: OccurrenceId,
): MonitoredTask | undefined {
  const record = activityOccurrenceForTaskBody(state.activityOccurrences, taskId);
  return record === undefined ? undefined : monitoredTaskForRecord(program, state, record);
}

/**
 * Joins one live deadline to its committed definition and to the task it monitors.
 *
 * The task is required here, unlike in the completion direction: a live deadline whose Activity is
 * gone would have been withdrawn by that Activity's completion, so its absence is a wrong-identity
 * refusal rather than a reachable state.
 */
function monitoredTaskForTimer(
  program: SemanticProcessProgram,
  state: RuntimeState,
  timerId: OccurrenceId,
): MonitoredTask | undefined {
  const record = activityOccurrenceForAttachedTimer(state.activityOccurrences, timerId);
  const monitored = record === undefined
    ? undefined
    : monitoredTaskForRecord(program, state, record);
  return monitored?.timer === undefined ? undefined : monitored;
}

/**
 * Joins one record to its definition, its live body, and its deadline when one is still live.
 *
 * The one-sided shape is this family's whole difference from its interrupting sibling and it survives
 * the migration: a monitored task whose deadline has already fired is an ordinary state, so `timer` is
 * optional. What changed is that the deadline is looked up through the record's attached list rather
 * than by matching its element under the task's scope with an equal activation ordinal — a comparison
 * across two counter families that no state asserted and that repetition breaks.
 */
function monitoredTaskForRecord(
  program: SemanticProcessProgram,
  state: RuntimeState,
  record: ActivityOccurrence,
): MonitoredTask | undefined {
  const definition = monitoredTaskOperations(program).find(
    (operation) => operation.id === record.operationId,
  );
  if (definition === undefined || record.body.kind !== ActivityBodyKind.UserTask) {
    return undefined;
  }
  const body = record.body.task;
  const task = state.userTaskWaits.find(({ id }) => sameOccurrence(id, body));
  if (task === undefined) {
    return undefined;
  }
  const [attached] = record.attachedTimers;
  return {
    definition,
    record,
    task,
    timer: attached === undefined
      ? undefined
      : state.timerWaits.find(({ id }) => sameOccurrence(id, attached)),
  };
}

function nextActivation(
  counts: ReadonlyArray<{ readonly elementId: string; readonly count: number }>,
  elementId: string,
): number {
  return (counts.find((entry) => entry.elementId === elementId)?.count ?? 0) + 1;
}
