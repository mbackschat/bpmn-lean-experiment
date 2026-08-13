/**
 * Strict protobuf/JSON decoding helpers for durable Temporal Event History evidence.
 */
import { Buffer } from "node:buffer";
import { isDeepStrictEqual } from "node:util";

import type {
  CancelIncidentProcessStimulus,
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
  RetryIncidentStimulus,
} from "@bpmn-lean/semantic-core";
import {
  CommandOutcome as CommandOutcomeValue,
  StimulusKind,
  isWellFormedStimulus,
} from "@bpmn-lean/semantic-core";

import type {
  TemporalHistory,
} from "./contracts.js";
import type {
  HistoryEvent,
} from "./harness-evidence.js";

class HarnessEvidenceInfrastructureError extends Error {
  public override readonly name = "HarnessEvidenceInfrastructureError";
}

export function historyEvents(
  history: TemporalHistory,
  attributesName: string,
): ReadonlyArray<HistoryEvent> {
  return history.events.flatMap((rawEvent) => {
    const event = asRecord(rawEvent, "Temporal history event");
    const attributes = optionalRecord(event[attributesName]);
    return attributes === undefined ? [] : [{ event, attributes }];
  });
}

export function durationMilliseconds(
  value: unknown,
  description: string,
): bigint {
  const duration = asRecord(value, description);
  const nanos = integerToBigInt(duration.nanos ?? 0);
  if (nanos < 0n || nanos % 1_000_000n !== 0n) {
    throw new TypeError(
      `${description} must have a non-negative whole-millisecond nanos component`,
    );
  }
  return integerToBigInt(duration.seconds ?? 0) * 1_000n +
    nanos / 1_000_000n;
}

export function durableUpdateOutcomes(
  history: TemporalHistory,
): ReadonlyMap<string, CommandOutcome> {
  const acceptedCommands = new Map<
    string,
    DurableUpdateStimulus
  >();
  const outcomes = new Map<string, CommandOutcome>();

  for (const rawEvent of history.events) {
    const event = asRecord(rawEvent, "Temporal history event");
    const eventId = optionalEventId(event.eventId);
    const acceptedAttributes = optionalRecord(
      event.workflowExecutionUpdateAcceptedEventAttributes,
    );
    if (acceptedAttributes !== undefined) {
      if (eventId === undefined) {
        throw new TypeError(
          "Accepted Workflow Update event has no usable event ID",
        );
      }
      const stimulus = decodeAcceptedStimulus(acceptedAttributes);
      acceptedCommands.set(eventId, stimulus);
      continue;
    }

    const completedAttributes = optionalRecord(
      event.workflowExecutionUpdateCompletedEventAttributes,
    );
    if (completedAttributes === undefined) {
      continue;
    }
    const acceptedEventId = requiredEventId(
      completedAttributes.acceptedEventId,
      "Completed Workflow Update accepted event ID",
    );
    const stimulus = acceptedCommands.get(acceptedEventId);
    if (stimulus === undefined) {
      throw new TypeError(
        `Completed Workflow Update refers to unknown accepted event ${acceptedEventId}`,
      );
    }
    const outcome = decodeCompletedOutcome(completedAttributes);
    const existing = outcomes.get(stimulus.commandId);
    if (existing !== undefined && existing !== outcome) {
      throw new TypeError(
        `Durable Event History contains conflicting results for command ${stimulus.commandId}`,
      );
    }
    outcomes.set(stimulus.commandId, outcome);
  }

  return outcomes;
}

export function integerToBigInt(value: unknown): bigint {
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "string"
  ) {
    return BigInt(value);
  }
  const long = asRecord(value, "Temporal integer");
  if (
    typeof long.low !== "number" ||
    typeof long.high !== "number"
  ) {
    throw new TypeError("Temporal integer has an unsupported representation");
  }
  const low = BigInt(long.low >>> 0);
  const high = BigInt(long.high >>> 0);
  const unsigned = (high << 32n) | low;
  return long.unsigned === true || long.high >= 0
    ? unsigned
    : unsigned - (1n << 64n);
}

export function requiredNonNegativeInteger(
  value: unknown,
  description: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new TypeError(`${description} must be a non-negative integer`);
  }
  return value;
}

function decodeAcceptedStimulus(
  attributes: Readonly<Record<string, unknown>>,
): DurableUpdateStimulus {
  const acceptedRequest = asRecord(
    attributes.acceptedRequest,
    "Accepted Workflow Update request",
  );
  const input = asRecord(
    acceptedRequest.input,
    "Accepted Workflow Update input",
  );
  const args = asRecord(input.args, "Accepted Workflow Update arguments");
  const payloads = asArray(
    args.payloads,
    "Accepted Workflow Update argument payloads",
  );
  if (payloads.length !== 1) {
    throw new TypeError(
      "Accepted Workflow Update must contain exactly one stimulus payload",
    );
  }
  const stimulus: unknown = decodeJsonPayload(
    payloads[0],
    "Accepted Workflow Update stimulus",
  );
  if (
    !isWellFormedStimulus(stimulus) ||
    stimulus.kind !== StimulusKind.CompleteUserTaskInstance &&
    stimulus.kind !== StimulusKind.RetryIncident &&
    stimulus.kind !== StimulusKind.CancelIncidentProcess
  ) {
    throw new TypeError(
      "Accepted Workflow Update payload is not an admitted Update stimulus",
    );
  }
  return stimulus;
}

type DurableUpdateStimulus =
  | CancelIncidentProcessStimulus
  | CompleteUserTaskInstanceStimulus
  | RetryIncidentStimulus;

function decodeCompletedOutcome(
  attributes: Readonly<Record<string, unknown>>,
): CommandOutcome {
  const updateOutcome = asRecord(
    attributes.outcome,
    "Completed Workflow Update outcome",
  );
  if (updateOutcome.failure !== undefined && updateOutcome.failure !== null) {
    throw new HarnessEvidenceInfrastructureError(
      "Completed Workflow Update has a failure outcome and no semantic command result",
    );
  }
  const success = asRecord(
    updateOutcome.success,
    "Completed Workflow Update success",
  );
  const payloads = asArray(
    success.payloads,
    "Completed Workflow Update result payloads",
  );
  if (payloads.length !== 1) {
    throw new TypeError(
      "Completed Workflow Update must contain exactly one result payload",
    );
  }
  const outcome = decodeJsonPayload(
    payloads[0],
    "Completed Workflow Update result",
  );
  if (!isCommandOutcome(outcome)) {
    throw new TypeError(
      "Completed Workflow Update result is not a command outcome",
    );
  }
  return outcome;
}

export function decodeJsonPayload(
  value: unknown,
  description: string,
): unknown {
  const payload = asRecord(value, description);
  const data = payload.data;
  if (
    typeof data !== "string" &&
    !Buffer.isBuffer(data) &&
    !(data instanceof Uint8Array)
  ) {
    throw new TypeError(`${description} has no JSON payload data`);
  }
  try {
    return JSON.parse(
      typeof data === "string" ? data : Buffer.from(data).toString("utf8"),
    );
  } catch (error: unknown) {
    throw new TypeError(`${description} is not valid JSON`, {
      cause: error,
    });
  }
}

function isCommandOutcome(value: unknown): value is CommandOutcome {
  switch (value) {
    case CommandOutcomeValue.Committed:
    case CommandOutcomeValue.RolledBack:
    case CommandOutcomeValue.Rejected:
    case CommandOutcomeValue.SemanticFailure:
    case CommandOutcomeValue.Unsupported:
      return true;
    default:
      return false;
  }
}

export function optionalEventId(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requiredEventId(value, "Temporal history event ID");
}

export function requiredEventId(value: unknown, description: string): string {
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "string"
  ) {
    return String(value);
  }
  const long = asRecord(value, description);
  if (
    typeof long.low !== "number" ||
    typeof long.high !== "number" ||
    typeof long.unsigned !== "boolean"
  ) {
    throw new TypeError(`${description} is not a supported integer`);
  }
  return `${long.high}:${long.low}:${long.unsigned ? "u" : "s"}`;
}

export function optionalRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return value === undefined || value === null
    ? undefined
    : asRecord(value, "Temporal history attributes");
}

export function asRecord(
  value: unknown,
  description: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(`${description} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

export function asArray(
  value: unknown,
  description: string,
): ReadonlyArray<unknown> {
  if (!Array.isArray(value)) {
    throw new TypeError(`${description} must be an array`);
  }
  return value;
}
