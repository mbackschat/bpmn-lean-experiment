/**
 * Executable transitions for one User Task occurrence that owns an interrupting boundary Timer.
 *
 * The pair is read from the Activity occurrence record that arming creates, which names the body and
 * the deadline attached to it. It used to be recovered by requiring the task and Timer activation
 * ordinals to be equal under one scope owner, which held only while each element was armed once per
 * arming of the other; nothing in the state said so, and a diverged pair yielded the wrong sibling
 * or none rather than an ambiguity. Repetition and Multi-Instance are what break that agreement, and
 * both remain outside this profile.
 *
 * Arming on Activity activation is a recorded project interpretation: BPMN 2.0.2 starts a catch
 * Event's wait when a token *reaches* it, and a Boundary Event is never reached. Only the pre-due
 * firing witness discriminates that instant, so it is evidence rather than bookkeeping.
 */
import {
  ActivityBodyKind,
  activityOccurrenceForAttachedTimer,
  activityOccurrenceForTaskBody,
  attachedTimerOccurrences,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitBoundedUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  addToken,
  ControlStateKind,
  sameOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
  SemanticTimerWait,
  SemanticUserTaskWait,
} from "./semantic-process-state.js";
import { armActivityWithBoundaryTimer } from "./semantic-process-activity-arming.js";
import { StimulusKind } from "./contract.js";
import type {
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  OccurrenceId,
} from "./contract.js";

type BoundedPair = Readonly<{
  definition: AwaitBoundedUserTaskOperation;
  record: ActivityOccurrence;
  task: SemanticUserTaskWait;
  timer: SemanticTimerWait;
}>;

/** Atomically replaces the Activity's incoming token with both the task occurrence and its deadline. */
export function armBoundedUserTask(
  operation: AwaitBoundedUserTaskOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  return armActivityWithBoundaryTimer(operation, state, owner);
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
  const record = activityOccurrenceForTaskBody(state.activityOccurrences, taskId);
  return record === undefined ? undefined : boundedPairForRecord(program, state, record);
}

function boundedPairForTimer(
  program: SemanticProcessProgram,
  state: RuntimeState,
  timerId: OccurrenceId,
): BoundedPair | undefined {
  const record = activityOccurrenceForAttachedTimer(state.activityOccurrences, timerId);
  return record === undefined ? undefined : boundedPairForRecord(program, state, record);
}

/**
 * Joins one Activity occurrence record to its committed definition, body, and deadline.
 *
 * Both waits must exist. `ABTIMER-ARM-01` makes a state holding one without the other invalid rather
 * than a resumption surface, so this refuses instead of repairing it. What changed is where the pair
 * comes from: it is read off the record, not recovered by requiring a task activation ordinal to
 * equal a Timer activation ordinal. Those two counters agree only while each element is armed once
 * per arming of the other, and nothing in the state said so.
 */
function boundedPairForRecord(
  program: SemanticProcessProgram,
  state: RuntimeState,
  record: ActivityOccurrence,
): BoundedPair | undefined {
  const definition = boundedTaskOperations(program).find(
    (operation) => operation.id === record.operationId,
  );
  if (definition === undefined || record.body.kind !== ActivityBodyKind.UserTask) {
    return undefined;
  }
  const body = record.body.task;
  const task = state.userTaskWaits.find(({ id }) => sameOccurrence(id, body));
  const [attached] = attachedTimerOccurrences(record);
  const timer = attached === undefined
    ? undefined
    : state.timerWaits.find(({ id }) => sameOccurrence(id, attached));
  return task === undefined || timer === undefined
    ? undefined
    : { definition, record, task, timer };
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
    activityOccurrences: state.activityOccurrences.filter(
      (candidate) => !sameActivityOccurrence(candidate.id, pair.record.id),
    ),
    logicalTimeMs,
  };
}
