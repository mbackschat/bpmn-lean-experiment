import { Buffer } from "node:buffer";
import { isDeepStrictEqual } from "node:util";

import type {
  CanonicalObservation,
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
} from "@bpmn-lean/semantic-core";
import {
  CanonicalObservationKind,
  CommandOutcome as CommandOutcomeValue,
  ProcessStatus,
  StimulusKind,
  isWellFormedStimulus,
} from "@bpmn-lean/semantic-core";

import type {
  CompletedProcessReceipt,
  TemporalHistory,
} from "./contracts.js";

class HarnessEvidenceInfrastructureError extends Error {
  public override readonly name = "HarnessEvidenceInfrastructureError";
}

/**
 * Reconciles Query-transported trace evidence with independently durable facts.
 *
 * This is a conformance-harness extraction contract, not a production observation API. Completion-command outcomes are bound to completed Update results in Event History, and a terminal state is bound to the completed Process receipt. The start command is a Workflow argument rather than an Update and is therefore excluded from durable Update-result reconciliation. Intermediate state observations remain Query-only evidence and are checked independently against the pure semantic core.
 */
export function reconcileHarnessTraceEvidence(
  trace: ReadonlyArray<CanonicalObservation>,
  receipt: CompletedProcessReceipt | null,
  history: TemporalHistory,
): void {
  const durableOutcomes = durableUpdateOutcomes(history);
  const queryOutcomes = trace.filter(
    (
      observation,
    ): observation is Extract<
      CanonicalObservation,
      { kind: CanonicalObservationKind.Command }
    > =>
      observation.kind === CanonicalObservationKind.Command &&
      durableOutcomes.has(observation.commandId),
  );

  if (queryOutcomes.length !== durableOutcomes.size) {
    throw new TypeError(
      "Query trace and durable Event History contain different completed Update commands",
    );
  }
  for (const observation of queryOutcomes) {
    const durableOutcome = durableOutcomes.get(observation.commandId);
    if (durableOutcome !== observation.outcome) {
      throw new TypeError(
        `Query command ${observation.commandId} does not match its durable Update result`,
      );
    }
  }

  const finalState = trace.findLast(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  if (receipt === null) {
    if (finalState !== undefined) {
      throw new TypeError(
        "Query trace is terminal but no completed Process receipt exists",
      );
    }
    return;
  }
  if (
    finalState === undefined ||
    !isDeepStrictEqual(finalState, receipt.finalState)
  ) {
    throw new TypeError(
      "Query terminal state does not match the completed Process receipt",
    );
  }
}

/**
 * Requires one history-backed durable timer with the exact requested duration and matching fired
 * event. A pure semantic trace can remain correct when an adapter bypasses sleep, so this is the
 * independent host-mechanism discriminator.
 */
export function requireDurableTimerHistory(
  history: TemporalHistory,
  expectedDurationMs: number,
): void {
  const started = history.events.flatMap((rawEvent) => {
    const event = asRecord(rawEvent, "Temporal history event");
    const attributes = optionalRecord(event.timerStartedEventAttributes);
    return attributes === undefined ? [] : [{ event, attributes }];
  });
  const fired = history.events.flatMap((rawEvent) => {
    const event = asRecord(rawEvent, "Temporal history event");
    const attributes = optionalRecord(event.timerFiredEventAttributes);
    return attributes === undefined ? [] : [{ event, attributes }];
  });
  if (started.length !== 1 || fired.length !== 1) {
    throw new TypeError(
      "Temporal history must contain exactly one durable timer-started/timer-fired pair",
    );
  }
  const start = started[0];
  const fire = fired[0];
  if (start === undefined || fire === undefined) {
    throw new TypeError("Temporal history lost its durable timer pair");
  }
  const duration = asRecord(
    start.attributes.startToFireTimeout,
    "Timer-started duration",
  );
  const durationMs =
    integerToBigInt(duration.seconds ?? 0) * 1000n +
    BigInt(requiredNonNegativeInteger(
      duration.nanos ?? 0,
      "Timer-started duration nanos",
    )) / 1_000_000n;
  if (durationMs !== BigInt(expectedDurationMs)) {
    throw new TypeError(
      `Temporal durable timer duration ${durationMs}ms differs from ${expectedDurationMs}ms`,
    );
  }
  if (
    start.attributes.timerId !== fire.attributes.timerId ||
    requiredEventId(
        start.event.eventId,
        "Timer-started event ID",
      ) !==
      requiredEventId(
        fire.attributes.startedEventId,
        "Timer-fired started event ID",
      )
  ) {
    throw new TypeError(
      "Temporal timer-fired event does not identify its timer-started event",
    );
  }
}

function durableUpdateOutcomes(
  history: TemporalHistory,
): ReadonlyMap<string, CommandOutcome> {
  const acceptedCommands = new Map<
    string,
    CompleteUserTaskInstanceStimulus
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

function integerToBigInt(value: unknown): bigint {
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

function requiredNonNegativeInteger(
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
): CompleteUserTaskInstanceStimulus {
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
    stimulus.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError(
      "Accepted Workflow Update payload is not a completion stimulus",
    );
  }
  return stimulus;
}

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

function decodeJsonPayload(value: unknown, description: string): unknown {
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

function optionalEventId(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requiredEventId(value, "Temporal history event ID");
}

function requiredEventId(value: unknown, description: string): string {
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

function optionalRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return value === undefined || value === null
    ? undefined
    : asRecord(value, "Temporal history attributes");
}

function asRecord(
  value: unknown,
  description: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(`${description} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function asArray(
  value: unknown,
  description: string,
): ReadonlyArray<unknown> {
  if (!Array.isArray(value)) {
    throw new TypeError(`${description} must be an array`);
  }
  return value;
}
