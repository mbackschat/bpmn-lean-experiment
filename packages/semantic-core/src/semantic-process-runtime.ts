import {
  CommandOutcome,
  EffectExecutionResultKind,
  StimulusKind,
} from "./contract.js";
import type {
  Stimulus,
} from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  addActivityVariableScope,
  completeActivityVariableScope,
  evaluateInputMappings,
  mergeProcessVariableBindings,
} from "./semantic-process-data.js";
import {
  evaluateSimpleBooleanExpression,
} from "./simple-boolean-expression.js";
import {
  createMessageWait,
  deliverMessage,
} from "./semantic-process-message.js";
import {
  addToken,
  compareEffectWaits,
  compareTimerWaits,
  compareUserTaskWaits,
  ControlStateKind,
  removeToken,
  sameOccurrence,
  setActivationCount,
  tokenMultiplicity,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
} from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";

export {
  ControlStateKind,
  initialState,
} from "./semantic-process-state.js";
export type {
  ControlPlaceTokens,
  ControlState,
  ActivityVariableScope,
  ProcessVariableScope,
  RuntimeState,
  ScopedVariables,
  SemanticEffectWait,
  SemanticMessageWait,
  SemanticTimerWait,
  SemanticUserTaskWait,
} from "./semantic-process-state.js";

type SemanticCommandOutcome =
  | CommandOutcome.Committed
  | CommandOutcome.Rejected;

export type CommandResult = DeepReadonly<{
  outcome: SemanticCommandOutcome;
  state: RuntimeState;
  internalStepBoundExceeded: boolean;
}>;

type CommandAdmission = DeepReadonly<{
  outcome: SemanticCommandOutcome;
  state: RuntimeState;
}>;

type ClosureResult = DeepReadonly<{
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
        sameOccurrence(candidate.id, stimulus.taskId)
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
          variables: {
            ...state.variables,
            process: {
              bindings: mergeProcessVariableBindings(
                state.variables.process.bindings,
                stimulus.submittedValues,
              ),
            },
          },
        },
      };
    }
    case StimulusKind.DeliverMessage: {
      const next = deliverMessage(program, state, stimulus);
      return next === null
        ? { outcome: CommandOutcome.Rejected, state }
        : { outcome: CommandOutcome.Committed, state: next };
    }
    case StimulusKind.FireTimer: {
      const wait = state.timerWaits.find((candidate) =>
        sameOccurrence(candidate.id, stimulus.timerId)
      );
      if (
        state.control.kind !== ControlStateKind.Running ||
        wait === undefined ||
        stimulus.logicalTimeMs !== wait.deadlineMs
      ) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      return {
        outcome: CommandOutcome.Committed,
        state: {
          ...state,
          controlTokens: addToken(state.controlTokens, wait.output),
          timerWaits: state.timerWaits.filter(
            (candidate) => candidate !== wait,
          ),
          logicalTimeMs: wait.deadlineMs,
        },
      };
    }
    case StimulusKind.CompleteEffect: {
      const wait = state.effectWaits.find((candidate) =>
        sameOccurrence(candidate.id, stimulus.effectId)
      );
      if (
        state.control.kind !== ControlStateKind.Running ||
        wait === undefined
      ) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      const route =
        stimulus.result.kind === EffectExecutionResultKind.BpmnError
          ? wait.bpmnErrorRoute
          : null;
      if (
        stimulus.result.kind === EffectExecutionResultKind.BpmnError &&
        (route === null || route.code !== stimulus.result.code)
      ) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      const variables = completeActivityVariableScope(
        state.variables,
        wait.id,
        wait.outputMappings,
        stimulus.result.localPatch,
        stimulus.result.kind === EffectExecutionResultKind.BpmnError,
      );
      if (variables === null) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      return {
        outcome: CommandOutcome.Committed,
        state: {
          ...state,
          controlTokens: addToken(
            state.controlTokens,
            route?.output ?? wait.output,
          ),
          effectWaits: state.effectWaits.filter(
            (candidate) => candidate !== wait,
          ),
          variables,
        },
      };
    }
    default:
      return assertNever(stimulus);
  }
}

// Every internal operation the program permits in this state. Membership and
// count are order-independent; the canonical-ID sort exists only for the
// selector below.
function enabledInternalOperations(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<Readonly<{
  operation: SemanticOperation;
  successor: RuntimeState;
}>> {
  return program.operations
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
      compareCanonicalStrings(left.id, right.id)
    );
}

export function enabledInternalOperationCount(
  program: SemanticProcessProgram,
  state: RuntimeState,
): number {
  return enabledInternalOperations(program, state).length;
}

/**
 * Classifies a state already known to be internally stable.
 *
 * A running state is resumable only when one semantic wait exposes a possible
 * future ingress. Hidden tokens alone are not evidence of progress.
 */
export function isStableStateResumable(state: RuntimeState): boolean {
  switch (state.control.kind) {
    case ControlStateKind.NotStarted:
      return false;
    case ControlStateKind.Running:
      return state.userTaskWaits.length > 0 ||
        state.messageWaits.length > 0 ||
        state.timerWaits.length > 0 ||
        state.effectWaits.length > 0;
    case ControlStateKind.Completed:
      return true;
    default:
      return assertNever(state.control);
  }
}

// Semantic policy, not semantic truth. This selector advances the lowest
// canonical operation ID, while Lean's `closeSupported` advances the head of the
// program-ordered enabled list. In the one admitted multiple-enabled state (the
// disjoint two-User-Task pair) the two choices coincide only because
// `isWellFormedSemanticProcessProgram` requires `isSortedById(operations)` under
// this same `compareCanonicalStrings` order, making the sorted head and the
// program-order head the same operation. This selector also has no ambiguity
// signal, while Lean rejects every other multiple-enabled state as an unresolved
// semantic choice; admission currently keeps those states unreachable here.
function internalStep(
  program: SemanticProcessProgram,
  state: RuntimeState,
): RuntimeState | null {
  const enabled = enabledInternalOperations(program, state);
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
    case SemanticOperationKind.AwaitMessage:
      return tokenMultiplicity(state.controlTokens, operation.input) > 0
        ? createMessageWait(operation, state)
        : null;
    case SemanticOperationKind.AwaitTimer:
      return tokenMultiplicity(state.controlTokens, operation.input) > 0
        ? createTimerWait(operation, state)
        : null;
    case SemanticOperationKind.AwaitEffect:
      return tokenMultiplicity(state.controlTokens, operation.input) > 0
        ? createEffectWait(operation, state)
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
    case SemanticOperationKind.Choose:
      return tokenMultiplicity(state.controlTokens, operation.input) > 0
        ? choose(operation, state)
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
    ].sort(compareUserTaskWaits),
    taskActivations: setActivationCount(
      state.taskActivations,
      operation.task.elementId,
      activation,
    ),
  };
}

function createTimerWait(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitTimer }
  >,
  state: RuntimeState,
): RuntimeState {
  if (state.control.kind !== ControlStateKind.Running) {
    return state;
  }
  const activation =
    (state.timerActivations.find(
      ({ elementId }) => elementId === operation.timer.elementId,
    )?.count ?? 0) + 1;
  const deadlineMs = state.logicalTimeMs + operation.timer.durationMs;
  if (!Number.isSafeInteger(deadlineMs)) {
    throw new RangeError("Timer deadline exceeds the safe integer boundary");
  }
  return {
    ...state,
    controlTokens: removeToken(state.controlTokens, operation.input),
    timerWaits: [
      ...state.timerWaits,
      {
        id: {
          processInstanceId: state.control.instanceId,
          elementId: operation.timer.elementId,
          activation,
        },
        deadlineMs,
        output: operation.output,
      },
    ].sort(compareTimerWaits),
    timerActivations: setActivationCount(
      state.timerActivations,
      operation.timer.elementId,
      activation,
    ),
  };
}

function createEffectWait(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitEffect }
  >,
  state: RuntimeState,
): RuntimeState {
  if (state.control.kind !== ControlStateKind.Running) {
    return state;
  }
  const activation =
    (state.effectActivations.find(
      ({ elementId }) => elementId === operation.effect.elementId,
    )?.count ?? 0) + 1;
  const id = {
    processInstanceId: state.control.instanceId,
    elementId: operation.effect.elementId,
    activation,
  };
  const arguments_ = evaluateInputMappings(operation.effect.inputMappings);
  return {
    ...state,
    controlTokens: removeToken(state.controlTokens, operation.input),
    effectWaits: [
      ...state.effectWaits,
      {
        id,
        descriptor: operation.effect.descriptor,
        arguments: arguments_,
        outputMappings: operation.effect.outputMappings,
        bpmnErrorRoute: operation.bpmnErrorRoute,
        output: operation.output,
      },
    ].sort(compareEffectWaits),
    variables: addActivityVariableScope(state.variables, id, arguments_),
    effectActivations: setActivationCount(
      state.effectActivations,
      operation.effect.elementId,
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
    state.messageWaits.length === 0 &&
    state.timerWaits.length === 0 &&
    state.effectWaits.length === 0 &&
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

function choose(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.Choose }
  >,
  state: RuntimeState,
): RuntimeState {
  const selected = operation.candidates.find(({ condition }) =>
    evaluateSimpleBooleanExpression(
      condition,
      state.variables.process.bindings,
    )
  );
  return {
    ...state,
    controlTokens: addToken(
      removeToken(state.controlTokens, operation.input),
      selected?.output ?? operation.defaultOutput,
    ),
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

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}
