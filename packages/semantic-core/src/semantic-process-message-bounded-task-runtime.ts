/** Executable transitions for one User Task occurrence with an interrupting Message handler. */
import {
  ActivityBodyKind,
  ActivityHandlerKind,
  activityOccurrenceForTaskBody,
  compareActivityOccurrences,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import {
  StimulusKind,
} from "./contract.js";
import type {
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  MessageSubscriptionId,
  OccurrenceId,
} from "./contract.js";
import { operationIsSelectedFromProgram } from "./flow-node-occurrence-candidates.js";
import { sameMessageChannel } from "./message-channel.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitMessageBoundedUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  addToken,
  compareMessageWaits,
  compareUserTaskWaits,
  ControlStateKind,
  nextActivation,
  removeToken,
  sameOccurrence,
  sameScopeOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
  SemanticMessageWait,
  SemanticUserTaskWait,
} from "./semantic-process-state.js";

export type MessageBoundedPair = Readonly<{
  definition: AwaitMessageBoundedUserTaskOperation;
  record: ActivityOccurrence;
  task: SemanticUserTaskWait;
  message: SemanticMessageWait;
}>;

/** Atomically replaces the incoming token with the Activity, task, and Message subscription. */
export function armMessageBoundedUserTask(
  operation: AwaitMessageBoundedUserTaskOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const taskId = {
    processInstanceId: owner.processInstanceId,
    elementId: operation.task.elementId,
    activation: nextActivation(state.taskActivations, operation.task.elementId),
  } as const;
  const messageId = {
    processInstanceId: owner.processInstanceId,
    elementId: operation.boundaryMessage.elementId,
    activation: nextActivation(
      state.messageActivations,
      operation.boundaryMessage.elementId,
    ),
  } as const;
  const activityActivation = nextActivation(
    state.activityActivations,
    operation.task.elementId,
  );
  const record: ActivityOccurrence = {
    id: {
      processInstanceId: owner.processInstanceId,
      activityElementId: operation.task.elementId,
      activation: activityActivation,
    },
    owner,
    operationId: operation.id,
    body: { kind: ActivityBodyKind.UserTask, task: taskId },
    attachedHandlers: [{
      kind: ActivityHandlerKind.Message,
      occurrence: messageId,
    }],
  };
  const taskWait: SemanticUserTaskWait = {
    id: taskId,
    owner,
    name: operation.task.name,
    output: operation.task.output,
  };
  const messageWait: SemanticMessageWait = {
    id: messageId,
    owner,
    channel: operation.boundaryMessage.channel,
    output: operation.boundaryMessage.output,
  };
  return {
    ...state,
    activityOccurrences: [...state.activityOccurrences, record]
      .sort(compareActivityOccurrences),
    activityActivations: setActivationCount(
      state.activityActivations,
      operation.task.elementId,
      activityActivation,
    ),
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    userTaskWaits: [...state.userTaskWaits, taskWait].sort(compareUserTaskWaits),
    messageWaits: [...state.messageWaits, messageWait].sort(compareMessageWaits),
    taskActivations: setActivationCount(
      state.taskActivations,
      operation.task.elementId,
      taskId.activation,
    ),
    messageActivations: setActivationCount(
      state.messageActivations,
      operation.boundaryMessage.elementId,
      messageId.activation,
    ),
  };
}

/** Commits exact empty completion and withdraws the losing Message subscription. */
export function completeMessageBoundedUserTask(
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
  const pair = messageBoundedPairForTask(program, state, stimulus.taskId);
  return pair === undefined
    ? null
    : commitVictory(state, pair, pair.definition.task.output);
}

/** Commits exact payload-free delivery and cancels the losing User Task. */
export function interruptMessageBoundedUserTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: DeliverMessageStimulus,
): RuntimeState | null {
  if (stimulus.kind !== StimulusKind.DeliverMessage) {
    return null;
  }
  const pair = messageBoundedPairForSubscription(
    program,
    state,
    stimulus.subscriptionId,
  );
  return pair === undefined ||
      !sameMessageChannel(pair.message.channel, stimulus.channel)
    ? null
    : commitVictory(state, pair, pair.definition.boundaryMessage.output);
}

export function isMessageBoundedTaskDefinition(
  program: SemanticProcessProgram,
  taskId: OccurrenceId,
): boolean {
  return messageBoundedTaskOperations(program).some(
    (operation) => operation.task.elementId === taskId.elementId,
  );
}

export function isMessageBoundaryDefinition(
  program: SemanticProcessProgram,
  subscriptionId: OccurrenceId,
): boolean {
  return messageBoundedTaskOperations(program).some(
    (operation) =>
      operation.boundaryMessage.elementId === subscriptionId.elementId,
  );
}

export function messageBoundedPairForSubscription(
  program: SemanticProcessProgram,
  state: RuntimeState,
  subscriptionId: MessageSubscriptionId,
): MessageBoundedPair | undefined {
  const record = only(state.activityOccurrences.filter((candidate) =>
    candidate.attachedHandlers.some((handler) =>
      handler.kind === ActivityHandlerKind.Message &&
      sameOccurrence(handler.occurrence, subscriptionId)
    )
  ));
  return record === undefined
    ? undefined
    : messageBoundedPairForRecord(program, state, record);
}

function messageBoundedPairForTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  taskId: OccurrenceId,
): MessageBoundedPair | undefined {
  const record = activityOccurrenceForTaskBody(state.activityOccurrences, taskId);
  return record === undefined
    ? undefined
    : messageBoundedPairForRecord(program, state, record);
}

function messageBoundedPairForRecord(
  program: SemanticProcessProgram,
  state: RuntimeState,
  record: ActivityOccurrence,
): MessageBoundedPair | undefined {
  const definition = only(messageBoundedTaskOperations(program).filter(
    (operation) => operation.id === record.operationId,
  ));
  const messageHandlers = record.attachedHandlers.filter(
    (handler) => handler.kind === ActivityHandlerKind.Message,
  );
  const handler = messageHandlers.length === 1 ? messageHandlers[0] : undefined;
  if (
    definition === undefined ||
    !operationIsSelectedFromProgram(program, definition, record.owner) ||
    record.body.kind !== ActivityBodyKind.UserTask ||
    record.id.processInstanceId !== record.owner.processInstanceId ||
    record.id.activityElementId !== definition.task.elementId ||
    handler === undefined ||
    record.attachedHandlers.length !== 1
  ) {
    return undefined;
  }
  const bodyTask = record.body.task;
  const task = only(state.userTaskWaits.filter(({ id, owner, name, output }) =>
    sameOccurrence(id, bodyTask) &&
    sameScopeOccurrence(owner, record.owner) &&
    name === definition.task.name &&
    output === definition.task.output
  ));
  const message = only(state.messageWaits.filter(({ id, owner, channel, output }) =>
    sameOccurrence(id, handler.occurrence) &&
    sameScopeOccurrence(owner, record.owner) &&
    sameMessageChannel(channel, definition.boundaryMessage.channel) &&
    output === definition.boundaryMessage.output
  ));
  return task === undefined || message === undefined
    ? undefined
    : { definition, record, task, message };
}

function messageBoundedTaskOperations(
  program: SemanticProcessProgram,
): ReadonlyArray<AwaitMessageBoundedUserTaskOperation> {
  return program.operations.filter(
    (operation): operation is AwaitMessageBoundedUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitMessageBoundedUserTask,
  );
}

function commitVictory(
  state: RuntimeState,
  pair: MessageBoundedPair,
  output: string,
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
    messageWaits: state.messageWaits.filter(
      (candidate) => candidate !== pair.message,
    ),
    activityOccurrences: state.activityOccurrences.filter(
      (candidate) => !sameActivityOccurrence(candidate.id, pair.record.id),
    ),
  };
}

function only<T>(values: ReadonlyArray<T>): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}
