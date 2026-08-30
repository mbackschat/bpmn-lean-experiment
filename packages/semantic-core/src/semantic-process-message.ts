import {
  applyInternalOrdinaryArmingPatch,
  deriveInternalOrdinaryArmingPatch,
} from "./internal-transition-ordinary-arming-patch.js";
import { ActivityHandlerKind } from "./activity-occurrence.js";
import {
  StimulusKind,
} from "./contract.js";
import type {
  DeliverMessageStimulus,
  DeliverPayloadMessageStimulus,
} from "./contract.js";
import {
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { mergeProcessVariableBindings } from "./semantic-process-data.js";
import {
  sameMessageChannel,
} from "./message-channel.js";
import {
  addToken,
  ControlStateKind,
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export function createMessageWait(
  operation: Extract<
    SemanticOperation,
    {
      kind:
        | SemanticOperationKind.AwaitMessage
        | SemanticOperationKind.AwaitPayloadMessage;
    }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState {
  const patch = deriveInternalOrdinaryArmingPatch(operation, state, owner);
  return patch === null ? state : applyInternalOrdinaryArmingPatch(state, patch);
}

/** Resolves the immutable Program arm that decides which delivery interaction one Message wait publishes. */
export function messageWaitRequiresPayload(
  program: SemanticProcessProgram,
  state: RuntimeState,
  wait: RuntimeState["messageWaits"][number],
): boolean | null {
  const declarers = program.operations.filter((operation) => {
    if (!operationIsSelectedFromProgram(program, operation, wait.owner)) {
      return false;
    }
    switch (operation.kind) {
      case SemanticOperationKind.AwaitMessage:
      case SemanticOperationKind.AwaitPayloadMessage:
        return operation.message.elementId === wait.id.elementId &&
          operation.output === wait.output &&
          sameMessageChannel(operation.message.channel, wait.channel);
      case SemanticOperationKind.AwaitMessageBoundedUserTask:
        return operation.boundaryMessage.elementId === wait.id.elementId &&
          operation.boundaryMessage.output === wait.output &&
          sameMessageChannel(
            operation.boundaryMessage.channel,
            wait.channel,
          );
      case SemanticOperationKind.AwaitEventRace:
        return operation.message.elementId === wait.id.elementId &&
          operation.message.output === wait.output &&
          sameMessageChannel(operation.message.channel, wait.channel) &&
          state.eventRaces.filter((record) =>
            record.id.elementId === operation.origin.elementId &&
            sameOccurrence(record.messageSubscriptionId, wait.id) &&
            sameScopeOccurrence(record.owner, wait.owner)
          ).length === 1;
      default:
        return false;
    }
  });
  return declarers.length !== 1
    ? null
    : declarers[0]?.kind === SemanticOperationKind.AwaitPayloadMessage;
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
  if (
    wait === undefined ||
    !sameMessageChannel(wait.channel, stimulus.channel) ||
    messageWaitIsAttachedToActivity(state, wait)
  ) {
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
    !sameMessageChannel(wait.channel, operation.message.channel)
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

/** Assigns and routes one required Message payload while withdrawing its subscription atomically. */
export function deliverPayloadMessage(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: DeliverPayloadMessageStimulus,
): RuntimeState | null {
  if (
    stimulus.kind !== StimulusKind.DeliverPayloadMessage ||
    state.control.kind !== ControlStateKind.Running
  ) {
    return null;
  }
  const waits = state.messageWaits.filter((candidate) =>
    sameOccurrence(candidate.id, stimulus.subscriptionId)
  );
  const wait = waits.length === 1 ? waits[0] : undefined;
  if (
    wait === undefined ||
    !sameMessageChannel(wait.channel, stimulus.channel) ||
    messageWaitIsAttachedToActivity(state, wait)
  ) {
    return null;
  }
  const declarers = program.operations.filter(
    (
      candidate,
    ): candidate is Extract<
      SemanticOperation,
      { kind: SemanticOperationKind.AwaitPayloadMessage }
    > =>
      candidate.kind === SemanticOperationKind.AwaitPayloadMessage &&
      candidate.message.elementId === wait.id.elementId &&
      candidate.output === wait.output &&
      sameMessageChannel(wait.channel, candidate.message.channel) &&
      operationIsSelectedFromProgram(program, candidate, wait.owner),
  );
  const operation = declarers.length === 1 ? declarers[0] : undefined;
  if (operation === undefined) {
    return null;
  }
  return {
    ...state,
    controlTokens: addToken(state.controlTokens, wait.output, wait.owner),
    messageWaits: state.messageWaits.filter(
      (candidate) => candidate !== wait,
    ),
    variables: {
      ...state.variables,
      process: {
        bindings: mergeProcessVariableBindings(
          state.variables.process.bindings,
          [{
            name: operation.directOutput.targetPropertyId,
            value: stimulus.payload,
          }],
        ),
      },
    },
  };
}

/** Direct catch delivery never consumes a handler wait owned by an Activity occurrence. */
function messageWaitIsAttachedToActivity(
  state: RuntimeState,
  wait: RuntimeState["messageWaits"][number],
): boolean {
  return state.activityOccurrences.some((record) =>
    record.attachedHandlers.some((handler) =>
      handler.kind === ActivityHandlerKind.Message &&
      sameOccurrence(handler.occurrence, wait.id)
    )
  );
}
