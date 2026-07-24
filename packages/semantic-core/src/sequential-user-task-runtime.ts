import {
  CommandOutcome,
  StimulusKind,
} from "./contract.js";
import type {
  Stimulus,
} from "./contract.js";
import type {
  SequentialUserTaskExecutableIr,
} from "./executable-ir.js";

export enum ControlStateKind {
  NotStarted = "notStarted",
  EnteringStart = "enteringStart",
  EnteringUserTask = "enteringUserTask",
  WaitingUserTask = "waitingUserTask",
  LeavingUserTask = "leavingUserTask",
  EnteringEnd = "enteringEnd",
  Completed = "completed",
}

type NotStartedControl = Readonly<{
  kind: ControlStateKind.NotStarted;
}>;

type OrdinaryInstancedControl = Readonly<{
  kind:
    | ControlStateKind.EnteringStart
    | ControlStateKind.EnteringUserTask
    | ControlStateKind.EnteringEnd
    | ControlStateKind.Completed;
  instanceId: string;
}>;

type UserTaskControl = Readonly<{
  kind:
    | ControlStateKind.WaitingUserTask
    | ControlStateKind.LeavingUserTask;
  instanceId: string;
  activation: number;
}>;

export type ControlState =
  | NotStartedControl
  | OrdinaryInstancedControl
  | UserTaskControl;

export type RuntimeState = Readonly<{
  control: ControlState;
  logicalTimeMs: number;
}>;

export const initialState: RuntimeState = {
  control: { kind: ControlStateKind.NotStarted },
  logicalTimeMs: 0,
};

type SemanticCommandOutcome =
  | CommandOutcome.Committed
  | CommandOutcome.Rejected;

export type CommandResult = Readonly<{
  outcome: SemanticCommandOutcome;
  state: RuntimeState;
  internalStepBoundExceeded: boolean;
}>;

type CommandAdmission = Readonly<{
  outcome: SemanticCommandOutcome;
  state: RuntimeState;
}>;

type ClosureResult = Readonly<{
  state: RuntimeState;
  hitBound: boolean;
}>;

export const sequentialUserTaskClosureLimit = 4;

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}

function withControl(state: RuntimeState, control: ControlState): RuntimeState {
  return {
    control,
    logicalTimeMs: state.logicalTimeMs,
  };
}

function internalStep(state: RuntimeState): RuntimeState | null {
  switch (state.control.kind) {
    case ControlStateKind.EnteringStart:
      return withControl(state, {
        kind: ControlStateKind.EnteringUserTask,
        instanceId: state.control.instanceId,
      });
    case ControlStateKind.EnteringUserTask:
      return withControl(state, {
        kind: ControlStateKind.WaitingUserTask,
        instanceId: state.control.instanceId,
        activation: 1,
      });
    case ControlStateKind.LeavingUserTask:
      return withControl(state, {
        kind: ControlStateKind.EnteringEnd,
        instanceId: state.control.instanceId,
      });
    case ControlStateKind.EnteringEnd:
      return withControl(state, {
        kind: ControlStateKind.Completed,
        instanceId: state.control.instanceId,
      });
    case ControlStateKind.NotStarted:
    case ControlStateKind.WaitingUserTask:
    case ControlStateKind.Completed:
      return null;
    default:
      return assertNever(state.control);
  }
}

function closeInternal(state: RuntimeState, limit: number): ClosureResult {
  let current = state;
  for (let stepCount = 0; stepCount < limit; stepCount += 1) {
    const next = internalStep(current);
    if (next === null) {
      return { state: current, hitBound: false };
    }
    current = next;
  }
  return {
    state: current,
    hitBound: internalStep(current) !== null,
  };
}

export function validateClosureLimit(closureLimit: number): void {
  if (!Number.isSafeInteger(closureLimit) || closureLimit < 0) {
    throw new RangeError("closureLimit must be a non-negative safe integer");
  }
}

function admit(
  model: SequentialUserTaskExecutableIr,
  state: RuntimeState,
  stimulus: Stimulus,
): CommandAdmission {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      if (
        state.control.kind === ControlStateKind.NotStarted &&
        stimulus.processId === model.processId
      ) {
        return {
          outcome: CommandOutcome.Committed,
          state: withControl(state, {
            kind: ControlStateKind.EnteringStart,
            instanceId: stimulus.instanceId,
          }),
        };
      }
      return { outcome: CommandOutcome.Rejected, state };
    case StimulusKind.CompleteUserTaskInstance:
      if (
        state.control.kind === ControlStateKind.WaitingUserTask &&
        stimulus.taskId.processInstanceId === state.control.instanceId &&
        stimulus.taskId.elementId === model.userTask.id &&
        stimulus.taskId.activation === state.control.activation
      ) {
        return {
          outcome: CommandOutcome.Committed,
          state: withControl(state, {
            kind: ControlStateKind.LeavingUserTask,
            instanceId: state.control.instanceId,
            activation: state.control.activation,
          }),
        };
      }
      return { outcome: CommandOutcome.Rejected, state };
    default:
      return assertNever(stimulus);
  }
}

// tag::apply-stimulus[]
export function applyStimulus(
  model: SequentialUserTaskExecutableIr,
  state: RuntimeState,
  stimulus: Stimulus,
  closureLimit: number = sequentialUserTaskClosureLimit,
): CommandResult {
  validateClosureLimit(closureLimit);

  const admission = admit(model, state, stimulus);
  switch (admission.outcome) {
    case CommandOutcome.Committed: {
      const closure = closeInternal(admission.state, closureLimit);
      return {
        outcome: CommandOutcome.Committed,
        state: closure.state,
        internalStepBoundExceeded: closure.hitBound,
      };
    }
    case CommandOutcome.Rejected:
      return {
        outcome: CommandOutcome.Rejected,
        state: admission.state,
        internalStepBoundExceeded: false,
      };
    default:
      return assertNever(admission.outcome);
  }
}
// end::apply-stimulus[]
