/** Persistent Message-boundary lifetime selected by ESL-MESSAGE-01 and ESL-HOST-01. */
import { StimulusKind } from "./contract.js";
import type { CompleteUserTaskInstanceStimulus, DeliverMessageStimulus, OccurrenceId } from "./contract.js";
import { sameMessageChannel } from "./message-channel.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { AwaitMessageMonitoredUserTaskOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { addToken, ControlStateKind } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import {
  armUserTaskWithBoundaryMessage,
  commitMessageTaskVictory,
  messageBoundaryPairForSubscription,
  messageBoundaryPairForTask,
} from "./semantic-process-message-bounded-task-runtime.js";

export function armMessageMonitoredUserTask(
  operation: AwaitMessageMonitoredUserTaskOperation, state: RuntimeState, owner: ScopeOccurrenceId,
): RuntimeState | null {
  return armUserTaskWithBoundaryMessage(operation, state, owner);
}

/** Host completion withdraws its persistent subscription without touching previously spawned work. */
export function completeMessageMonitoredUserTask(
  program: SemanticProcessProgram, state: RuntimeState, stimulus: CompleteUserTaskInstanceStimulus,
): RuntimeState | null {
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance || stimulus.submittedValues.length !== 0) {
    return null;
  }
  const pair = messageBoundaryPairForTask(program, state, stimulus.taskId);
  return pair?.definition.kind !== SemanticOperationKind.AwaitMessageMonitoredUserTask
    ? null : commitMessageTaskVictory(state, pair, pair.definition.task.output);
}

/** Each accepted delivery produces one token and retains the exact subscription identity. */
export function spawnFromMessageMonitoredUserTask(
  program: SemanticProcessProgram, state: RuntimeState, stimulus: DeliverMessageStimulus,
): RuntimeState | null {
  if (stimulus.kind !== StimulusKind.DeliverMessage || state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const pair = messageBoundaryPairForSubscription(program, state, stimulus.subscriptionId);
  return pair?.definition.kind !== SemanticOperationKind.AwaitMessageMonitoredUserTask ||
      !sameMessageChannel(pair.message.channel, stimulus.channel)
    ? null : {
      ...state,
      controlTokens: addToken(state.controlTokens, pair.definition.boundaryMessage.output, pair.record.owner),
    };
}

export function isMessageMonitoredTaskDefinition(program: SemanticProcessProgram, task: OccurrenceId): boolean {
  return program.operations.some((operation) =>
    operation.kind === SemanticOperationKind.AwaitMessageMonitoredUserTask &&
    operation.task.elementId === task.elementId);
}

export function isMonitoredMessageBoundaryDefinition(program: SemanticProcessProgram, subscription: OccurrenceId): boolean {
  return program.operations.some((operation) =>
    operation.kind === SemanticOperationKind.AwaitMessageMonitoredUserTask &&
    operation.boundaryMessage.elementId === subscription.elementId);
}
