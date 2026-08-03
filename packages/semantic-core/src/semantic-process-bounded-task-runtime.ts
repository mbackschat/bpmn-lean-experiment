/**
 * Executable transitions for one User Task occurrence that owns an interrupting boundary Timer.
 *
 * Unlike the Event-Based Gateway race, this family keeps no hidden ownership record. The pair is
 * recovered by joining the committed operation to the two live waits, which is sound only because the
 * profile admits exactly one such Activity with exactly one boundary Timer, and because arming and
 * removal are atomic so the two occurrences always share one activation ordinal. A repeated or
 * Multi-Instance Activity would break that recovery and requires an explicit occurrence record.
 *
 * Arming on Activity activation is a recorded project interpretation: BPMN 2.0.2 starts a catch
 * Event's wait when a token *reaches* it, and a Boundary Event is never reached. Only the pre-due
 * firing witness discriminates that instant, so it is evidence rather than bookkeeping.
 */
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  AwaitBoundedUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  addToken,
  compareTimerWaits,
  compareUserTaskWaits,
  ControlStateKind,
  removeToken,
  sameOccurrence,
  sameScopeOccurrence,
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

type BoundedPair = Readonly<{
  definition: AwaitBoundedUserTaskOperation;
  task: SemanticUserTaskWait;
  timer: SemanticTimerWait;
}>;

/** Atomically replaces the Activity's incoming token with both the task occurrence and its deadline. */
export function armBoundedUserTask(
  operation: AwaitBoundedUserTaskOperation,
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
  return {
    ...state,
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    userTaskWaits: [
      ...state.userTaskWaits,
      {
        id: {
          processInstanceId: owner.processInstanceId,
          elementId: operation.task.elementId,
          activation: taskActivation,
        },
        owner,
        name: operation.task.name,
        output: operation.task.output,
      },
    ].sort(compareUserTaskWaits),
    timerWaits: [
      ...state.timerWaits,
      {
        id: {
          processInstanceId: owner.processInstanceId,
          elementId: operation.boundaryTimer.elementId,
          activation: timerActivation,
        },
        owner,
        deadlineMs,
        output: operation.boundaryTimer.output,
      },
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
 * Commits the Activity arm, withdrawing the deadline.
 *
 * The profile admits no completion patch, so a non-empty submission is rejected rather than ignored:
 * variable submission is a separately reviewed proposition and admitting it here would add a data
 * claim to a timing capsule.
 */
export function completeBoundedUserTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: CompleteUserTaskInstanceStimulus,
): RuntimeState | null {
  if (
    stimulus.kind !== StimulusKind.CompleteUserTaskInstance ||
    stimulus.submittedValues.length !== 0
  ) {
    return null;
  }
  const pair = boundedPairForTask(program, state, stimulus.taskId);
  return pair === undefined
    ? null
    : commitVictory(state, pair, pair.definition.task.output, state.logicalTimeMs);
}

/**
 * Commits the deadline arm at its exact deadline, abandoning the Activity.
 *
 * Clause 13.5.3's order — consume the Timer, cancel the Activity and its live state, then produce the
 * boundary token — is one atomic transition with no observable intermediate state. Activation counters
 * stay monotonic because removing a wait never rewinds its element's count.
 */
export function interruptBoundedUserTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: FireTimerStimulus,
): RuntimeState | null {
  if (stimulus.kind !== StimulusKind.FireTimer) {
    return null;
  }
  const pair = boundedPairForTimer(program, state, stimulus.timerId);
  if (pair === undefined || stimulus.logicalTimeMs !== pair.timer.deadlineMs) {
    return null;
  }
  return commitVictory(
    state,
    pair,
    pair.definition.boundaryTimer.output,
    pair.timer.deadlineMs,
  );
}

/** True when the occurrence names the bounded Activity of a committed bounded-task operation. */
export function isBoundedTaskDefinition(
  program: SemanticProcessProgram,
  taskId: OccurrenceId,
): boolean {
  return boundedTaskOperations(program).some(
    (operation) => operation.task.elementId === taskId.elementId,
  );
}

/** True when the occurrence names the boundary Timer of a committed bounded-task operation. */
export function isBoundaryTimerDefinition(
  program: SemanticProcessProgram,
  timerId: OccurrenceId,
): boolean {
  return boundedTaskOperations(program).some(
    (operation) => operation.boundaryTimer.elementId === timerId.elementId,
  );
}

function boundedTaskOperations(
  program: SemanticProcessProgram,
): ReadonlyArray<AwaitBoundedUserTaskOperation> {
  return program.operations.filter(
    (operation): operation is AwaitBoundedUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitBoundedUserTask,
  );
}

function boundedPairForTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  taskId: OccurrenceId,
): BoundedPair | undefined {
  const task = state.userTaskWaits.find((candidate) =>
    sameOccurrence(candidate.id, taskId)
  );
  return task === undefined ? undefined : boundedPair(program, state, task);
}

function boundedPairForTimer(
  program: SemanticProcessProgram,
  state: RuntimeState,
  timerId: OccurrenceId,
): BoundedPair | undefined {
  const timer = state.timerWaits.find((candidate) =>
    sameOccurrence(candidate.id, timerId)
  );
  if (timer === undefined) {
    return undefined;
  }
  const definition = boundedTaskOperations(program).find(
    (operation) => operation.boundaryTimer.elementId === timer.id.elementId,
  );
  const task = definition === undefined
    ? undefined
    : state.userTaskWaits.find((candidate) =>
      candidate.id.elementId === definition.task.elementId &&
      candidate.id.activation === timer.id.activation &&
      sameScopeOccurrence(candidate.owner, timer.owner)
    );
  return definition === undefined || task === undefined
    ? undefined
    : { definition, task, timer };
}

/**
 * Joins one live task wait to its committed definition and deadline.
 *
 * Both waits must exist. `ABTIMER-ARM-01` makes a state holding one without the other invalid rather
 * than a resumption surface, so this refuses instead of repairing it.
 */
function boundedPair(
  program: SemanticProcessProgram,
  state: RuntimeState,
  task: SemanticUserTaskWait,
): BoundedPair | undefined {
  const definition = boundedTaskOperations(program).find(
    (operation) => operation.task.elementId === task.id.elementId,
  );
  const timer = definition === undefined
    ? undefined
    : state.timerWaits.find((candidate) =>
      candidate.id.elementId === definition.boundaryTimer.elementId &&
      candidate.id.activation === task.id.activation &&
      sameScopeOccurrence(candidate.owner, task.owner)
    );
  return definition === undefined || timer === undefined
    ? undefined
    : { definition, task, timer };
}

function commitVictory(
  state: RuntimeState,
  pair: BoundedPair,
  output: string,
  logicalTimeMs: number,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  return {
    ...state,
    controlTokens: addToken(state.controlTokens, output, pair.task.owner),
    userTaskWaits: state.userTaskWaits.filter(
      (candidate) => candidate !== pair.task,
    ),
    timerWaits: state.timerWaits.filter((candidate) => candidate !== pair.timer),
    logicalTimeMs,
  };
}

function nextActivation(
  counts: ReadonlyArray<{ readonly elementId: string; readonly count: number }>,
  elementId: string,
): number {
  return (counts.find((entry) => entry.elementId === elementId)?.count ?? 0) + 1;
}
