/**
 * Deterministic host ledger for asynchronous Message delivery.
 *
 * Entries preserve accepted Signal order but never enter canonical BPMN state.
 * Exact retries reuse the first entry; conflicting command content is recorded
 * as an adapter request failure without reaching the semantic input queue.
 */
import {
  StimulusKind,
  isWellFormedStimulus,
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
} from "./contracts.js";
import type {
  MessageDeliveryRecord,
  MessageDeliveryResolution,
} from "./contracts.js";

export type MessageDeliveryAcceptance = Readonly<{
  enqueue: boolean;
}>;

export function acceptMessageDelivery(
  resolutions: MessageDeliveryResolution[],
  stimulus: DeliverMessageStimulus,
  previouslyAccepted?: Stimulus,
): MessageDeliveryAcceptance {
  const exact = findMessageDeliveryResolution(resolutions, stimulus);
  if (exact !== undefined) {
    return { enqueue: false };
  }
  const accepted = previouslyAccepted ??
    resolutions.find(
      ({ stimulus: candidate }) =>
        candidate.commandId === stimulus.commandId,
    )?.stimulus;
  if (
    accepted !== undefined &&
    (
      stimulusCommandId(accepted) !== stimulus.commandId ||
      !sameStimulus(accepted, stimulus)
    )
  ) {
    resolutions.push({
      kind: MessageDeliveryResolutionKind.RequestFailure,
      stimulus,
      failure: "commandIdentityConflict",
    });
    return { enqueue: false };
  }
  resolutions.push({
    kind: MessageDeliveryResolutionKind.Pending,
    stimulus,
  });
  return { enqueue: true };
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

export function isMessageDeliveryRecord(
  value: unknown,
): value is MessageDeliveryRecord {
  if (
    !isRecord(value) ||
    !isWellFormedStimulus(value.stimulus) ||
    value.stimulus.kind !== StimulusKind.DeliverMessage
  ) {
    return false;
  }
  switch (value.kind) {
    case MessageDeliveryResolutionKind.Semantic:
      return hasOnlyKeys(value, ["kind", "stimulus", "outcome"]) &&
        isCommandOutcome(value.outcome);
    case MessageDeliveryResolutionKind.RequestFailure:
      return hasOnlyKeys(value, ["kind", "stimulus", "failure"]) &&
        value.failure === "commandIdentityConflict";
    default:
      return false;
  }
}

function isCommandOutcome(value: unknown): value is CommandOutcome {
  return typeof value === "string" &&
    (
      value === "committed" ||
      value === "rolledBack" ||
      value === "rejected" ||
      value === "semanticFailure" ||
      value === "unsupported"
    );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key));
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported Message delivery resolution: ${String(value)}`,
  );
}
