import {
  addActivityVariableScope,
  evaluateInputMappings,
} from "./semantic-process-data.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation } from "./semantic-process-contract.js";
import {
  compareEffectWaits,
  compareTimerWaits,
  compareUserTaskWaits,
  ControlStateKind,
  removeToken,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export function createUserTaskWait(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitUserTask }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
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
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    userTaskWaits: [
      ...state.userTaskWaits,
      {
        id: {
          processInstanceId: owner.processInstanceId,
          elementId: operation.task.elementId,
          activation,
        },
        owner,
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

export function createTimerWait(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitTimer }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
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
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    timerWaits: [
      ...state.timerWaits,
      {
        id: {
          processInstanceId: owner.processInstanceId,
          elementId: operation.timer.elementId,
          activation,
        },
        owner,
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

export function createEffectWait(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitEffect }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState {
  if (state.control.kind !== ControlStateKind.Running) {
    return state;
  }
  const activation =
    (state.effectActivations.find(
      ({ elementId }) => elementId === operation.effect.elementId,
    )?.count ?? 0) + 1;
  const id = {
    processInstanceId: owner.processInstanceId,
    elementId: operation.effect.elementId,
    activation,
  };
  const arguments_ = evaluateInputMappings(operation.effect.inputMappings);
  return {
    ...state,
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    effectWaits: [
      ...state.effectWaits,
      {
        id,
        owner,
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
