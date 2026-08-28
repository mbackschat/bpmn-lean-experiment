import {
  applyInternalOrdinaryArmingPatch,
  deriveInternalOrdinaryArmingPatch,
} from "./internal-transition-ordinary-arming-patch.js";
import {
  StimulusKind,
} from "./contract.js";
import type {
  DeliverMessageStimulus,
} from "./contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  sameMessageChannel,
} from "./message-channel.js";
import {
  addToken,
  ControlStateKind,
  sameOccurrence,
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
  const patch = deriveInternalOrdinaryArmingPatch(operation, state, owner);
  return patch === null ? state : applyInternalOrdinaryArmingPatch(state, patch);
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
    !sameMessageChannel(wait.channel, stimulus.channel)
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
