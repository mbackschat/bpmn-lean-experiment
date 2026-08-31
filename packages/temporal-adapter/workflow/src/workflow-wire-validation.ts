/**
 * Validates untrusted stimulus payloads arriving at the Workflow's Update and Signal handlers.
 *
 * This is the Workflow's trust boundary. A caller can send any payload and can reuse a command
 * identifier, so each handler must establish the stimulus shape before the semantic core sees it,
 * and must refuse a reused identifier that carries different content rather than let the second
 * send silently win or duplicate a committed command.
 *
 * The two failure kinds here are deliberately different. A malformed payload is a caller error the
 * handler rejects with a `TypeError`, which Temporal answers to that caller alone and which leaves
 * the Workflow running. A reused identifier carrying different content is a non-retryable
 * `ApplicationFailure`, because it means two callers disagree about what one command was and no
 * retry can resolve that.
 */
import { ApplicationFailure } from "@temporalio/workflow";

import {
  isWellFormedStimulus,
  sameStimulus,
  stimulusCommandId,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  DeliverCorrelatedPayloadMessageStimulus,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import type {
  MessageDeliveryStimulus,
} from "@bpmn-lean/temporal-protocol";

/**
 * Establishes that an Update payload is one well-formed completion stimulus, and that it agrees with
 * any already-accepted stimulus carrying the same command identifier.
 */
export function validateCompleteUserTaskUpdate(
  acceptedStimuli: ReadonlyArray<Stimulus>,
  stimulus: CompleteUserTaskInstanceStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError(
      "Completion Update must contain one well-formed task-instance stimulus",
    );
  }
  const accepted = acceptedStimulus(acceptedStimuli, stimulusCommandId(value));
  if (accepted !== undefined) {
    requireSameCommandStimulus(accepted, value);
  }
}

/** Validates the private globally selected delivery before it enters Process state. */
export function validateDeliverCorrelatedMessageUpdate(
  acceptedStimuli: ReadonlyArray<Stimulus>,
  processInstanceId: string,
  stimulus: DeliverCorrelatedPayloadMessageStimulus,
): void {
  const value = stimulus as unknown;
  if (!isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.DeliverCorrelatedPayloadMessage ||
    value.subscriptionId.processInstanceId !== processInstanceId) {
    throw new TypeError(
      "Correlated Message Update must contain one well-formed selected target",
    );
  }
  const accepted = acceptedStimulus(acceptedStimuli, stimulusCommandId(value));
  if (accepted !== undefined) {
    requireSameCommandStimulus(accepted, value);
  }
}

/**
 * Establishes that a Signal payload is one well-formed delivery stimulus.
 *
 * A Signal has no reply channel, so there is no identifier-agreement check here: its caller cannot
 * be told about a conflict, and the accepted-command log is consulted by the delivery path instead.
 */
export function validateDeliverMessageSignal(
  stimulus: MessageDeliveryStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    (
      value.kind !== StimulusKind.DeliverMessage &&
      value.kind !== StimulusKind.DeliverPayloadMessage
    )
  ) {
    throw new TypeError(
      "Message Signal must contain one well-formed delivery stimulus",
    );
  }
}

/** The already-accepted stimulus carrying `commandId`, if this Workflow has seen one. */
export function acceptedStimulus(
  acceptedStimuli: ReadonlyArray<Stimulus>,
  commandId: string,
): Stimulus | undefined {
  return acceptedStimuli.find(
    (candidate) => stimulusCommandId(candidate) === commandId,
  );
}

export function requireSameCommandStimulus(
  accepted: Stimulus,
  stimulus: Stimulus,
): void {
  if (!sameStimulus(accepted, stimulus)) {
    throw ApplicationFailure.nonRetryable(
      `Command ID ${stimulusCommandId(stimulus)} was reused with a different stimulus`,
      "BpmnCommandIdentityConflict",
    );
  }
}
