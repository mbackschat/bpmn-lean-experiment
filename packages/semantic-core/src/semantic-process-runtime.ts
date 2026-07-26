import {
  CommandOutcome,
  StimulusKind,
} from "./contract.js";
import type {
  Stimulus,
  UserTaskInstanceId,
} from "./contract.js";
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";

export enum ControlStateKind {
  NotStarted = "notStarted",
  Running = "running",
  Completed = "completed",
}

type NotStartedControl = Readonly<{
  kind: ControlStateKind.NotStarted;
}>;

type InstancedControl = Readonly<{
  kind: ControlStateKind.Running | ControlStateKind.Completed;
  instanceId: string;
}>;

export type ControlState = NotStartedControl | InstancedControl;

export type ControlPlaceTokens = Readonly<{
  placeId: string;
  multiplicity: number;
}>;

export type SemanticUserTaskWait = Readonly<{
  id: UserTaskInstanceId;
  name: string | null;
  output: string;
}>;

type TaskActivationCounter = Readonly<{
  elementId: string;
  count: number;
}>;

export type RuntimeState = Readonly<{
  control: ControlState;
  initiationPending: boolean;
  controlTokens: ReadonlyArray<ControlPlaceTokens>;
  userTaskWaits: ReadonlyArray<SemanticUserTaskWait>;
  taskActivations: ReadonlyArray<TaskActivationCounter>;
  endOccurrences: number;
  logicalTimeMs: number;
}>;

export const initialState: RuntimeState = {
  control: { kind: ControlStateKind.NotStarted },
  initiationPending: false,
  controlTokens: [],
  userTaskWaits: [],
  taskActivations: [],
  endOccurrences: 0,
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

export const semanticProcessClosureLimit = 8;

export function validateClosureLimit(closureLimit: number): void {
  if (!Number.isSafeInteger(closureLimit) || closureLimit < 0) {
    throw new RangeError("closureLimit must be a non-negative safe integer");
  }
}

function admit(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
): CommandAdmission {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      if (
        state.control.kind === ControlStateKind.NotStarted &&
        stimulus.processId === program.processId
      ) {
        return {
          outcome: CommandOutcome.Committed,
          state: {
            ...state,
            control: {
              kind: ControlStateKind.Running,
              instanceId: stimulus.instanceId,
            },
            initiationPending: true,
          },
        };
      }
      return { outcome: CommandOutcome.Rejected, state };
    case StimulusKind.CompleteUserTaskInstance: {
      const wait = state.userTaskWaits.find((candidate) =>
        sameTaskInstance(candidate.id, stimulus.taskId)
      );
      if (
        state.control.kind !== ControlStateKind.Running ||
        wait === undefined
      ) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      return {
        outcome: CommandOutcome.Committed,
        state: {
          ...state,
          controlTokens: addToken(state.controlTokens, wait.output),
          userTaskWaits: state.userTaskWaits.filter(
            (candidate) => candidate !== wait,
          ),
        },
      };
    }
    default:
      return assertNever(stimulus);
  }
}

function internalStep(
  program: SemanticProcessProgram,
  state: RuntimeState,
): RuntimeState | null {
  const enabled = program.operations
    .map((operation) => ({
      operation,
      successor: applyInternalOperation(operation, state),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        operation: SemanticOperation;
        successor: RuntimeState;
      } => candidate.successor !== null,
    )
    .sort(({ operation: left }, { operation: right }) =>
      compareStrings(left.id, right.id)
    );
  return enabled[0]?.successor ?? null;
}

export function applyInternalOperation(
  operation: SemanticOperation,
  state: RuntimeState,
): RuntimeState | null {
  switch (operation.kind) {
    case SemanticOperationKind.Initiate:
      return state.initiationPending
        ? {
            ...state,
            initiationPending: false,
            controlTokens: addToken(
              state.controlTokens,
              operation.output,
            ),
          }
        : null;
    case SemanticOperationKind.AwaitUserTask:
      return tokenMultiplicity(state.controlTokens, operation.input) > 0
        ? createUserTaskWait(operation, state)
        : null;
    case SemanticOperationKind.Duplicate:
      return tokenMultiplicity(state.controlTokens, operation.input) > 0
        ? duplicate(operation, state)
        : null;
    case SemanticOperationKind.Synchronize:
      return operation.inputs.every(
        (input) => tokenMultiplicity(state.controlTokens, input) > 0,
      )
        ? synchronize(operation, state)
        : null;
    case SemanticOperationKind.Terminate:
      return tokenMultiplicity(state.controlTokens, operation.input) > 0
        ? terminate(operation, state)
        : null;
    default:
      return assertNever(operation);
  }
}

function createUserTaskWait(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitUserTask }
  >,
  state: RuntimeState,
): RuntimeState {
  if (state.control.kind !== ControlStateKind.Running) {
    return state;
  }
  const activation =
    (state.taskActivations.find(
      ({ elementId }) => elementId === operation.task.elementId,
    )?.count ?? 0) + 1;
  return {
    ...state,
    controlTokens: removeToken(state.controlTokens, operation.input),
    userTaskWaits: [
      ...state.userTaskWaits,
      {
        id: {
          processInstanceId: state.control.instanceId,
          elementId: operation.task.elementId,
          activation,
        },
        name: operation.task.name,
        output: operation.output,
      },
    ].sort(compareWaits),
    taskActivations: setActivationCount(
      state.taskActivations,
      operation.task.elementId,
      activation,
    ),
  };
}

function terminate(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.Terminate }
  >,
  state: RuntimeState,
): RuntimeState {
  const controlTokens = removeToken(state.controlTokens, operation.input);
  const endOccurrences = state.endOccurrences + 1;
  const completed =
    controlTokens.length === 0 &&
    state.userTaskWaits.length === 0 &&
    !state.initiationPending;
  return {
    ...state,
    control:
      completed && state.control.kind === ControlStateKind.Running
        ? {
            kind: ControlStateKind.Completed,
            instanceId: state.control.instanceId,
          }
        : state.control,
    controlTokens,
    endOccurrences,
  };
}

function duplicate(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.Duplicate }
  >,
  state: RuntimeState,
): RuntimeState {
  return {
    ...state,
    controlTokens: operation.outputs.reduce(
      addToken,
      removeToken(state.controlTokens, operation.input),
    ),
  };
}

function synchronize(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.Synchronize }
  >,
  state: RuntimeState,
): RuntimeState {
  const remaining = operation.inputs.reduce(
    removeToken,
    state.controlTokens,
  );
  return {
    ...state,
    controlTokens: addToken(remaining, operation.output),
  };
}

function closeInternal(
  program: SemanticProcessProgram,
  state: RuntimeState,
  limit: number,
): ClosureResult {
  let current = state;
  for (let stepCount = 0; stepCount < limit; stepCount += 1) {
    const next = internalStep(program, current);
    if (next === null) {
      return { state: current, hitBound: false };
    }
    current = next;
  }
  return {
    state: current,
    hitBound: internalStep(program, current) !== null,
  };
}

// tag::apply-stimulus[]
export function applyStimulus(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
  closureLimit: number = semanticProcessClosureLimit,
): CommandResult {
  validateClosureLimit(closureLimit);

  const admission = admit(program, state, stimulus);
  switch (admission.outcome) {
    case CommandOutcome.Committed: {
      const closure = closeInternal(
        program,
        admission.state,
        closureLimit,
      );
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

function addToken(
  tokens: ReadonlyArray<ControlPlaceTokens>,
  placeId: string,
): ReadonlyArray<ControlPlaceTokens> {
  const current = tokenMultiplicity(tokens, placeId);
  return [
    ...tokens.filter((token) => token.placeId !== placeId),
    { placeId, multiplicity: current + 1 },
  ].sort(compareTokenPlaces);
}

function removeToken(
  tokens: ReadonlyArray<ControlPlaceTokens>,
  placeId: string,
): ReadonlyArray<ControlPlaceTokens> {
  const current = tokenMultiplicity(tokens, placeId);
  if (current <= 1) {
    return tokens.filter((token) => token.placeId !== placeId);
  }
  return tokens.map((token) =>
    token.placeId === placeId
      ? { ...token, multiplicity: token.multiplicity - 1 }
      : token
  );
}

function tokenMultiplicity(
  tokens: ReadonlyArray<ControlPlaceTokens>,
  placeId: string,
): number {
  return tokens.find((token) => token.placeId === placeId)?.multiplicity ?? 0;
}

function setActivationCount(
  counters: ReadonlyArray<TaskActivationCounter>,
  elementId: string,
  count: number,
): ReadonlyArray<TaskActivationCounter> {
  return [
    ...counters.filter((counter) => counter.elementId !== elementId),
    { elementId, count },
  ].sort((left, right) =>
    left.elementId < right.elementId
      ? -1
      : left.elementId > right.elementId
        ? 1
        : 0
  );
}

function sameTaskInstance(
  left: UserTaskInstanceId,
  right: UserTaskInstanceId,
): boolean {
  return (
    left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation
  );
}

function compareTokenPlaces(
  left: ControlPlaceTokens,
  right: ControlPlaceTokens,
): number {
  return left.placeId < right.placeId
    ? -1
    : left.placeId > right.placeId
      ? 1
      : 0;
}

function compareWaits(
  left: SemanticUserTaskWait,
  right: SemanticUserTaskWait,
): number {
  if (left.id.processInstanceId !== right.id.processInstanceId) {
    return compareStrings(
      left.id.processInstanceId,
      right.id.processInstanceId,
    );
  }
  if (left.id.elementId !== right.id.elementId) {
    return compareStrings(left.id.elementId, right.id.elementId);
  }
  return left.id.activation - right.id.activation;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}
