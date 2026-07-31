import {
  StimulusKind,
} from "./contract.js";
import type {
  DeliverMessageStimulus,
} from "./contract.js";
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  MessageChannel,
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  addToken,
  compareMessageWaits,
  ControlStateKind,
  removeToken,
  sameOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export function createMessageWait(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitMessage }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState {
  if (state.control.kind !== ControlStateKind.Running) {
    return state;
  }
  const activation =
    (state.messageActivations.find(
      ({ elementId }) => elementId === operation.message.elementId,
    )?.count ?? 0) + 1;
  return {
    ...state,
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    messageWaits: [
      ...state.messageWaits,
      {
        id: {
          processInstanceId: state.control.instanceId,
          elementId: operation.message.elementId,
          activation,
        },
        owner,
        channel: operation.message.channel,
        output: operation.output,
      },
    ].sort(compareMessageWaits),
    messageActivations: setActivationCount(
      state.messageActivations,
      operation.message.elementId,
      activation,
    ),
  };
}

export function deliverMessage(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: DeliverMessageStimulus,
): RuntimeState | null {
  if (
    stimulus.kind !== StimulusKind.DeliverMessage ||
    state.control.kind !== ControlStateKind.Running
  ) {
    return null;
  }
  const wait = state.messageWaits.find((candidate) =>
    sameOccurrence(candidate.id, stimulus.subscriptionId)
  );
  if (wait === undefined || !sameChannel(wait.channel, stimulus.channel)) {
    return null;
  }
  const operation = program.operations.find(
    (
      candidate,
    ): candidate is Extract<
      SemanticOperation,
      { kind: SemanticOperationKind.AwaitMessage }
    > =>
      candidate.kind === SemanticOperationKind.AwaitMessage &&
      candidate.message.elementId === wait.id.elementId,
  );
  if (
    operation === undefined ||
    !sameChannel(wait.channel, operation.message.channel)
  ) {
    return null;
  }
  return {
    ...state,
    controlTokens: addToken(state.controlTokens, wait.output, wait.owner),
    messageWaits: state.messageWaits.filter(
      (candidate) => candidate !== wait,
    ),
  };
}

function sameChannel(left: MessageChannel, right: MessageChannel): boolean {
  return left.interfaceId === right.interfaceId &&
    left.interfaceOperationId === right.interfaceOperationId &&
    left.messageId === right.messageId;
}
