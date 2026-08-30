/** Shared arming mechanism for one User Task Activity and its attached Timer. */
import {
  ActivityBodyKind,
  ActivityHandlerKind,
  compareActivityOccurrences,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import type {
  AwaitBoundedUserTaskOperation,
  AwaitMonitoredUserTaskOperation,
} from "./semantic-process-contract.js";
import {
  compareTimerWaits,
  compareUserTaskWaits,
  ControlStateKind,
  nextActivation,
  removeToken,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
  SemanticTimerWait,
  SemanticUserTaskWait,
} from "./semantic-process-state.js";

export type ActivityArmingOperation =
  | AwaitBoundedUserTaskOperation
  | AwaitMonitoredUserTaskOperation;

export type SelectedActivityArming = Readonly<{
  record: ActivityOccurrence;
  taskWait: SemanticUserTaskWait;
  timerWait: SemanticTimerWait;
}>;

/** Selects the complete record, body wait, and attached Timer without applying them. */
export function selectActivityArming(
  operation: ActivityArmingOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): SelectedActivityArming | null {
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
  const activityActivation = nextActivation(
    state.activityActivations,
    operation.task.elementId,
  );
  const deadlineMs = state.logicalTimeMs + operation.boundaryTimer.durationMs;
  if (!Number.isSafeInteger(deadlineMs)) {
    throw new RangeError("Timer deadline exceeds the safe integer boundary");
  }
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
    record: {
      id: {
        processInstanceId: owner.processInstanceId,
        activityElementId: operation.task.elementId,
        activation: activityActivation,
      },
      owner,
      operationId: operation.id,
      body: { kind: ActivityBodyKind.UserTask, task: taskId },
      attachedHandlers: [{ kind: ActivityHandlerKind.Timer, occurrence: timerId }],
    },
    taskWait: {
      id: taskId,
      owner,
      name: operation.task.name,
      output: operation.task.output,
    },
    timerWait: {
      id: timerId,
      owner,
      deadlineMs,
      output: operation.boundaryTimer.output,
    },
  };
}

/** Atomically replaces the incoming token with one Activity and its two waits. */
export function armActivityWithBoundaryTimer(
  operation: ActivityArmingOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  const selected = selectActivityArming(operation, state, owner);
  if (selected === null) {
    return null;
  }
  return {
    ...state,
    activityOccurrences: [...state.activityOccurrences, selected.record]
      .sort(compareActivityOccurrences),
    activityActivations: setActivationCount(
      state.activityActivations,
      operation.task.elementId,
      selected.record.id.activation,
    ),
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    userTaskWaits: [...state.userTaskWaits, selected.taskWait]
      .sort(compareUserTaskWaits),
    timerWaits: [...state.timerWaits, selected.timerWait]
      .sort(compareTimerWaits),
    taskActivations: setActivationCount(
      state.taskActivations,
      operation.task.elementId,
      selected.taskWait.id.activation,
    ),
    timerActivations: setActivationCount(
      state.timerActivations,
      operation.boundaryTimer.elementId,
      selected.timerWait.id.activation,
    ),
  };
}
