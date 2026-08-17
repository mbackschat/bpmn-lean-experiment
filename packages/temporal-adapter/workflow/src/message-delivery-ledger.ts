/**
 * Deterministic host ledger for asynchronous Message delivery.
 *
 * Entries preserve accepted Signal order but never enter canonical BPMN state.
 * Exact retries reuse the first entry; conflicting command content is recorded
 * as an adapter request failure without reaching the semantic input queue.
 */
import {
  sameStimulus,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  CommandOutcome,
  DeliverMessageStimulus,
  Stimulus,
} from "@bpmn-lean/semantic-core";

import {
  MessageDeliveryResolutionKind,
} from "@bpmn-lean/temporal-protocol";
import type {
  MessageDeliveryRecord,
  MessageDeliveryResolution,
} from "@bpmn-lean/temporal-protocol";

export type MessageDeliveryAcceptance = Readonly<{
  enqueue: boolean;
}>;

export function messageDeliveryWillEnqueue(
  resolutions: ReadonlyArray<MessageDeliveryResolution>,
  stimulus: DeliverMessageStimulus,
  previouslyAccepted?: Stimulus,
): boolean {
  return classifyMessageDelivery(
    resolutions,
    stimulus,
    previouslyAccepted,
  ) === MessageDeliveryAdmission.Enqueue;
}

export function acceptMessageDelivery(
  resolutions: MessageDeliveryResolution[],
  stimulus: DeliverMessageStimulus,
  previouslyAccepted?: Stimulus,
): MessageDeliveryAcceptance {
  switch (classifyMessageDelivery(resolutions, stimulus, previouslyAccepted)) {
    case MessageDeliveryAdmission.Exact:
      return { enqueue: false };
    case MessageDeliveryAdmission.IdentityConflict:
      resolutions.push({
        kind: MessageDeliveryResolutionKind.RequestFailure,
        stimulus,
        failure: "commandIdentityConflict",
      });
      return { enqueue: false };
    case MessageDeliveryAdmission.Enqueue:
      resolutions.push({
        kind: MessageDeliveryResolutionKind.Pending,
        stimulus,
      });
      return { enqueue: true };
    default:
      throw new TypeError("Unsupported Message delivery admission");
  }
}

enum MessageDeliveryAdmission {
  Exact = "exact",
  IdentityConflict = "identityConflict",
  Enqueue = "enqueue",
}

function classifyMessageDelivery(
  resolutions: ReadonlyArray<MessageDeliveryResolution>,
  stimulus: DeliverMessageStimulus,
  previouslyAccepted?: Stimulus,
): MessageDeliveryAdmission {
  if (findMessageDeliveryResolution(resolutions, stimulus) !== undefined) {
    return MessageDeliveryAdmission.Exact;
  }
  const accepted = previouslyAccepted ?? resolutions.find(
    ({ stimulus: candidate }) => candidate.commandId === stimulus.commandId,
  )?.stimulus;
  return accepted !== undefined &&
      (
        stimulusCommandId(accepted) !== stimulus.commandId ||
        !sameStimulus(accepted, stimulus)
      )
    ? MessageDeliveryAdmission.IdentityConflict
    : MessageDeliveryAdmission.Enqueue;
}

export function recordMessageDeliveryOutcome(
  resolutions: MessageDeliveryResolution[],
  stimulus: DeliverMessageStimulus,
  outcome: CommandOutcome,
): void {
  const index = resolutions.findIndex(
    (resolution) =>
      resolution.kind === MessageDeliveryResolutionKind.Pending &&
      sameStimulus(resolution.stimulus, stimulus),
  );
  if (index < 0) {
    const existing = findMessageDeliveryResolution(resolutions, stimulus);
    if (
      existing?.kind === MessageDeliveryResolutionKind.Semantic &&
      existing.outcome === outcome
    ) {
      return;
    }
    throw new TypeError(
      `Message delivery ${stimulus.commandId} has no matching pending record`,
    );
  }
  resolutions[index] = {
    kind: MessageDeliveryResolutionKind.Semantic,
    stimulus,
    outcome,
  };
}

export function findMessageDeliveryResolution(
  resolutions: ReadonlyArray<MessageDeliveryResolution>,
  stimulus: DeliverMessageStimulus,
): MessageDeliveryResolution | undefined {
  return resolutions.find(
    ({ stimulus: candidate }) => sameStimulus(candidate, stimulus),
  );
}

export function completedMessageDeliveryRecords(
  resolutions: ReadonlyArray<MessageDeliveryResolution>,
): MessageDeliveryRecord[] {
  return resolutions.flatMap((resolution) => {
    switch (resolution.kind) {
      case MessageDeliveryResolutionKind.Pending:
        return [];
      case MessageDeliveryResolutionKind.Semantic:
      case MessageDeliveryResolutionKind.RequestFailure:
        return [resolution];
      default:
        return assertNever(resolution);
    }
  });
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported Message delivery resolution: ${String(value)}`,
  );
}
