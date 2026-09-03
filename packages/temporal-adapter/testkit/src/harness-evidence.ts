import { Buffer } from "node:buffer";
import { isDeepStrictEqual } from "node:util";

import type {
  CanonicalObservation,
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
  EffectExecutionResult,
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
import type { EffectActivityResult } from "./contracts.js";
import {
  EffectExecutionResultKind,
} from "./contracts.js";
import type {
  EffectRequest,
} from "./contracts.js";

import {
  asArray,
  asRecord,
  decodeJsonPayload,
  durableUpdateOutcomes,
  durationMilliseconds,
  historyEvents,
  integerToBigInt,
  optionalRecord,
  requiredEventId,
  requiredNonNegativeInteger,
} from "./history-evidence-decoding.js";

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

/**
 * Binds canonical Service Task completion to one exact non-local Activity execution policy.
 *
 * The request must be the committed-intent rendering, retries remain raw history evidence, and
 * only the exact closed typed result may authorize the semantic completion derived by the Workflow.
 */
export function requireDurableEffectActivityHistory(
  history: TemporalHistory,
  expectedRequest: EffectRequest,
  expectedAttempts: number,
  expectedResult: EffectExecutionResult = {
    kind: EffectExecutionResultKind.Success,
    localPatch: [],
  },
  expectedPolicy: Readonly<{ heartbeatTimeoutMs?: number }> = {},
): void {
  if (
    !Number.isSafeInteger(expectedAttempts) ||
    expectedAttempts < 1 ||
    expectedAttempts > 2
  ) {
    throw new TypeError(
      "Effect Activity evidence requires one or two attempts",
    );
  }
  const scheduled = historyEvents(
    history,
    "activityTaskScheduledEventAttributes",
  );
  const started = historyEvents(
    history,
    "activityTaskStartedEventAttributes",
  );
  const failed = historyEvents(
    history,
    "activityTaskFailedEventAttributes",
  );
  const completed = historyEvents(
    history,
    "activityTaskCompletedEventAttributes",
  );
  if (
    scheduled.length !== 1 ||
    started.length !== 1 ||
    failed.length !== 0 ||
    completed.length !== 1
  ) {
    throw new TypeError(
      `Temporal history does not contain the exact scheduled/attempt/completed effect Activity shape: scheduled=${scheduled.length}, started=${started.length}, failed=${failed.length}, completed=${completed.length}`,
    );
  }

  const scheduledEvent = scheduled[0];
  const completedEvent = completed[0];
  if (scheduledEvent === undefined || completedEvent === undefined) {
    throw new TypeError("Temporal history lost its effect Activity events");
  }
  const scheduledEventId = requireEffectActivitySchedule(
    scheduledEvent,
    expectedRequest,
    2,
    expectedPolicy.heartbeatTimeoutMs ?? 0,
  );
  requireFinalEffectAttempt(
    started[0],
    scheduledEventId,
    expectedAttempts,
  );
  if (
    requiredEventId(
      completedEvent.attributes.scheduledEventId,
      "Effect Activity completed scheduled-event ID",
    ) !== scheduledEventId
  ) {
    throw new TypeError(
      "Effect Activity completion does not identify its schedule",
    );
  }
  const result = asRecord(
    completedEvent.attributes.result,
    "Effect Activity completed result",
  );
  const resultPayloads = asArray(
    result.payloads,
    "Effect Activity completed result payloads",
  );
  if (
    resultPayloads.length !== 1 ||
    !isDeepStrictEqual(
      decodeJsonPayload(
        resultPayloads[0],
        "Effect Activity completed result",
      ),
      expectedResult,
    )
  ) {
    throw new TypeError(
      "Effect Activity history has no exact typed result",
    );
  }
}

/** Requires two separately scheduled one-attempt Activities around one committed incident retry. */
export function requireDurableIncidentActivityHistory(
  history: TemporalHistory,
  expectedRequest: EffectRequest,
  expectedResults: readonly [EffectActivityResult, EffectActivityResult],
): void {
  const scheduled = historyEvents(
    history,
    "activityTaskScheduledEventAttributes",
  );
  const started = historyEvents(
    history,
    "activityTaskStartedEventAttributes",
  );
  const completed = historyEvents(
    history,
    "activityTaskCompletedEventAttributes",
  );
  const failed = historyEvents(
    history,
    "activityTaskFailedEventAttributes",
  );
  if (
    scheduled.length !== 2 ||
    started.length !== 2 ||
    completed.length !== 2 ||
    failed.length !== 0
  ) {
    throw new TypeError(
      "Incident history must contain two separate completed one-attempt effect Activities",
    );
  }
  for (let index = 0; index < 2; index += 1) {
    const scheduledEvent = scheduled[index];
    const startedEvent = started[index];
    const completedEvent = completed[index];
    const expectedResult = expectedResults[index];
    if (
      scheduledEvent === undefined ||
      startedEvent === undefined ||
      completedEvent === undefined ||
      expectedResult === undefined
    ) {
      throw new TypeError("Incident Activity history lost one indexed event");
    }
    const scheduledEventId = requireEffectActivitySchedule(
      scheduledEvent,
      expectedRequest,
      1,
    );
    requireFinalEffectAttempt(startedEvent, scheduledEventId, 1);
    if (
      requiredEventId(
        completedEvent.attributes.scheduledEventId,
        "Incident Activity completed scheduled-event ID",
      ) !== scheduledEventId
    ) {
      throw new TypeError("Incident Activity completion identifies another schedule");
    }
    const result = asRecord(
      completedEvent.attributes.result,
      "Incident Activity completed result",
    );
    const payloads = asArray(
      result.payloads,
      "Incident Activity completed result payloads",
    );
    if (
      payloads.length !== 1 ||
      !isDeepStrictEqual(
        decodeJsonPayload(payloads[0], "Incident Activity completed result"),
        expectedResult,
      )
    ) {
      throw new TypeError("Incident Activity history has the wrong typed result");
    }
  }
}

export function requireExhaustedEffectActivityHistory(
  history: TemporalHistory,
  expectedRequest: EffectRequest,
): void {
  const scheduled = historyEvents(
    history,
    "activityTaskScheduledEventAttributes",
  );
  const started = historyEvents(
    history,
    "activityTaskStartedEventAttributes",
  );
  const failed = historyEvents(
    history,
    "activityTaskFailedEventAttributes",
  );
  const completed = historyEvents(
    history,
    "activityTaskCompletedEventAttributes",
  );
  const workflowFailed = historyEvents(
    history,
    "workflowExecutionFailedEventAttributes",
  );
  if (
    scheduled.length !== 1 ||
    started.length !== 1 ||
    failed.length !== 1 ||
    completed.length !== 0 ||
    workflowFailed.length !== 1
  ) {
    throw new TypeError(
      "Temporal history does not contain one exhausted effect Activity and failed Workflow",
    );
  }
  const scheduledEvent = scheduled[0];
  const failedEvent = failed[0];
  if (scheduledEvent === undefined || failedEvent === undefined) {
    throw new TypeError(
      "Temporal history lost its exhausted effect Activity events",
    );
  }
  const scheduledEventId = requireEffectActivitySchedule(
    scheduledEvent,
    expectedRequest,
  );
  requireFinalEffectAttempt(started[0], scheduledEventId, 2);
  if (
    requiredEventId(
      failedEvent.attributes.scheduledEventId,
      "Effect Activity failed scheduled-event ID",
    ) !== scheduledEventId
  ) {
    throw new TypeError(
      "Exhausted effect Activity failure does not identify its schedule",
    );
  }
}

export type HistoryEvent = Readonly<{
  event: Readonly<Record<string, unknown>>;
  attributes: Readonly<Record<string, unknown>>;
}>;

function requireEffectActivitySchedule(
  scheduledEvent: HistoryEvent,
  expectedRequest: EffectRequest,
  expectedMaximumAttempts = 2,
  expectedHeartbeatTimeoutMs = 0,
): string {
  if (
    !Number.isSafeInteger(expectedHeartbeatTimeoutMs) ||
    expectedHeartbeatTimeoutMs < 0
  ) {
    throw new TypeError(
      "Effect Activity expected heartbeat timeout must be a non-negative safe integer",
    );
  }
  const activityType = asRecord(
    scheduledEvent.attributes.activityType,
    "Effect Activity type",
  );
  if (activityType.name !== "executeBpmnEffect") {
    throw new TypeError(
      "Temporal history scheduled an unexpected effect Activity type",
    );
  }
  const input = asRecord(
    scheduledEvent.attributes.input,
    "Effect Activity input",
  );
  const payloads = asArray(
    input.payloads,
    "Effect Activity input payloads",
  );
  if (
    payloads.length !== 1 ||
    !isDeepStrictEqual(
      decodeJsonPayload(payloads[0], "Effect Activity request"),
      expectedRequest,
    )
  ) {
    throw new TypeError(
      "Temporal history Activity request differs from committed effect intent",
    );
  }
  if (
    durationMilliseconds(
      scheduledEvent.attributes.startToCloseTimeout,
      "Effect Activity start-to-close timeout",
    ) !== 2_000n ||
    durationMilliseconds(
      scheduledEvent.attributes.scheduleToCloseTimeout,
      "Effect Activity schedule-to-close timeout",
    ) !== 10_000n
  ) {
    throw new TypeError(
      "Temporal history does not carry the exact effect Activity timeout policy",
    );
  }
  const heartbeat = optionalRecord(
    scheduledEvent.attributes.heartbeatTimeout,
  );
  const heartbeatTimeoutMs = heartbeat === undefined
    ? 0n
    : durationMilliseconds(heartbeat, "Effect Activity heartbeat timeout");
  if (heartbeatTimeoutMs !== BigInt(expectedHeartbeatTimeoutMs)) {
    throw new TypeError(
      "Temporal history does not carry the exact effect Activity heartbeat policy",
    );
  }
  const retryPolicy = asRecord(
    scheduledEvent.attributes.retryPolicy,
    "Effect Activity retry policy",
  );
  if (
    integerToBigInt(retryPolicy.maximumAttempts) !==
      BigInt(expectedMaximumAttempts) ||
    durationMilliseconds(
      retryPolicy.initialInterval,
      "Effect Activity initial retry interval",
    ) !== 100n ||
    retryPolicy.backoffCoefficient !== 1
  ) {
    throw new TypeError(
      "Temporal history does not carry the exact effect Activity retry policy",
    );
  }
  return requiredEventId(
    scheduledEvent.event.eventId,
    "Effect Activity scheduled event ID",
  );
}

function requireFinalEffectAttempt(
  finalStarted: HistoryEvent | undefined,
  scheduledEventId: string,
  expectedAttempts: number,
): void {
  if (
    finalStarted === undefined ||
    requiredEventId(
      finalStarted.attributes.scheduledEventId,
      "Effect Activity started scheduled-event ID",
    ) !== scheduledEventId ||
    integerToBigInt(finalStarted.attributes.attempt) !==
      BigInt(expectedAttempts) ||
    (
      expectedAttempts > 1 &&
      optionalRecord(finalStarted.attributes.lastFailure) === undefined
    )
  ) {
    throw new TypeError(
      "Effect Activity final durable attempt does not match its retry evidence",
    );
  }
}
