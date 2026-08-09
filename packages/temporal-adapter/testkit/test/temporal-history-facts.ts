/**
 * Durable Event History assertions for the Temporal integration suite.
 *
 * A fetched history is untrusted decoded input: the adapter contract types its
 * events as `unknown`, so every field this module reads is narrowed explicitly
 * and a missing or mistyped segment fails with its exact path. Host event and
 * attribute names are Temporal facts, never BPMN semantic facts.
 */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import { CommandOutcome } from "@bpmn-lean/semantic-core";
import {
  isCompletedProcessReceipt,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

import type { TemporalExecutionInput } from "./temporal-test-support.ts";

export const expectedTemporalIdentity = "bpmn-lean-test-runtime";

type HistoryRecord = Readonly<Record<string, unknown>>;

function historyRecord(value: unknown, label: string): HistoryRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} is not an Event History record`);
  }
  return value as HistoryRecord;
}

/** Walks one decoded Event History path, naming the first absent segment. */
function historyPath(
  value: unknown,
  ...path: ReadonlyArray<string | number>
): unknown {
  let current = value;
  const walked: Array<string | number> = [];
  for (const segment of path) {
    walked.push(segment);
    const location = walked.join(".");
    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        throw new TypeError(`${location} is not an Event History list`);
      }
      current = current[segment];
    } else {
      current = historyRecord(current, location)[segment];
    }
    if (current === undefined) {
      throw new TypeError(`Event History has no ${location}`);
    }
  }
  return current;
}

export function collectTemporalIdentities(
  value: unknown,
  identities: Set<string> = new Set(),
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTemporalIdentities(item, identities);
    }
    return identities;
  }
  if (value === null || typeof value !== "object") {
    return identities;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "identity" && typeof item === "string") {
      identities.add(item);
    } else {
      collectTemporalIdentities(item, identities);
    }
  }
  return identities;
}

export function requiredHistoryEvent(
  history: TemporalHistory,
  attributesName: string,
): HistoryRecord {
  const matches = historyEvents(history, attributesName);
  assert.equal(
    matches.length,
    1,
    `expected exactly one history event with ${attributesName}`,
  );
  const [match] = matches;
  assert.ok(match !== undefined, `no history event has ${attributesName}`);
  return match;
}

export function historyEvents(
  history: TemporalHistory,
  attributesName: string,
): ReadonlyArray<HistoryRecord> {
  return history.events
    .map((event, index) => historyRecord(event, `events[${index}]`))
    .filter((event) => {
      const attributes = event[attributesName];
      return (
        attributes !== undefined &&
        attributes !== null &&
        Object.keys(historyRecord(attributes, attributesName)).length > 0
      );
    });
}

/**
 * Guards an Update-only hosted semantic path against accidental hosting through a
 * Signal, Timer, Activity, Child Workflow, or cancellation event family.
 */
export function assertNoNonUpdateBpmnHostEvents(
  history: TemporalHistory,
  label: string,
): void {
  for (const attributesName of [
    "workflowExecutionSignaledEventAttributes",
    "timerStartedEventAttributes",
    "activityTaskScheduledEventAttributes",
    "startChildWorkflowExecutionInitiatedEventAttributes",
    "workflowExecutionCancelRequestedEventAttributes",
    "workflowExecutionCanceledEventAttributes",
    "requestCancelExternalWorkflowExecutionInitiatedEventAttributes",
    "externalWorkflowExecutionCancelRequestedEventAttributes",
    "childWorkflowExecutionCanceledEventAttributes",
  ]) {
    assert.equal(
      historyEvents(history, attributesName).length,
      0,
      `${label} history unexpectedly contains ${attributesName}`,
    );
  }
}

/** Decodes one payload, which the codec delivers as base64 text or as bytes. */
export function decodeJsonPayload(payload: unknown): unknown {
  const data = historyRecord(payload, "payload")["data"];
  if (typeof data === "string") {
    return JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  }
  assert.ok(
    data instanceof Uint8Array,
    "payload data is neither base64 text nor bytes",
  );
  return JSON.parse(Buffer.from(data).toString("utf8"));
}

/**
 * Reads a Temporal `int64` as a `bigint`.
 *
 * The gRPC codec may deliver either a JavaScript number/string or a Long-style
 * `{ low, high, unsigned }` record, so both encodings are accepted.
 */
export function temporalInt64ToBigInt(value: unknown): bigint {
  if (typeof value === "number" || typeof value === "string") {
    return BigInt(value);
  }
  if (typeof value === "bigint") {
    return value;
  }
  const record = historyRecord(value, "int64");
  const { low, high, unsigned } = record;
  if (typeof low !== "number" || typeof high !== "number") {
    throw new TypeError("int64 is neither a scalar nor a Long-style record");
  }
  const combined = (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0);
  return unsigned === true || high >= 0 ? combined : combined - (1n << 64n);
}

export function assertExactCompletionUpdateHistory(
  history: TemporalHistory,
  { scenario, semanticProcess }: TemporalExecutionInput,
): void {
  const accepted = requiredHistoryEvent(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  );
  const updateCompleted = requiredHistoryEvent(
    history,
    "workflowExecutionUpdateCompletedEventAttributes",
  );
  assert.deepEqual(
    collectTemporalIdentities(history),
    new Set([expectedTemporalIdentity]),
  );
  assert.equal(
    historyEvents(history, "workflowExecutionSignaledEventAttributes").length,
    0,
  );

  const started = requiredHistoryEvent(
    history,
    "workflowExecutionStartedEventAttributes",
  );
  const startedPath = [
    "workflowExecutionStartedEventAttributes",
    "input",
    "payloads",
  ] as const;
  assert.deepEqual(
    decodeJsonPayload(historyPath(started, ...startedPath, 0)),
    scenario.stimuli[0],
  );
  assert.deepEqual(
    decodeJsonPayload(historyPath(started, ...startedPath, 1)),
    semanticProcess,
  );

  assert.equal(
    historyPath(
      accepted,
      "workflowExecutionUpdateAcceptedEventAttributes",
      "acceptedRequest",
      "input",
      "name",
    ),
    "bpmn-complete-user-task",
  );
  assert.deepEqual(
    decodeJsonPayload(acceptedCompletionArgument(accepted)),
    scenario.stimuli[1],
  );

  assert.equal(
    temporalInt64ToBigInt(
      historyPath(
        updateCompleted,
        "workflowExecutionUpdateCompletedEventAttributes",
        "acceptedEventId",
      ),
    ),
    temporalInt64ToBigInt(historyPath(accepted, "eventId")),
  );
  assert.equal(
    decodeJsonPayload(
      historyPath(
        updateCompleted,
        "workflowExecutionUpdateCompletedEventAttributes",
        "outcome",
        "success",
        "payloads",
        0,
      ),
    ),
    CommandOutcome.Committed,
  );

  const workflowCompleted = requiredHistoryEvent(
    history,
    "workflowExecutionCompletedEventAttributes",
  );
  assert.equal(
    isCompletedProcessReceipt(
      decodeJsonPayload(
        historyPath(
          workflowCompleted,
          "workflowExecutionCompletedEventAttributes",
          "result",
          "payloads",
          0,
        ),
      ),
    ),
    true,
  );
}

export function acceptedCompletionOrder(
  history: TemporalHistory,
): ReadonlyArray<unknown> {
  return historyEvents(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  ).map((event) => {
    const stimulus = decodeJsonPayload(acceptedCompletionArgument(event));
    return historyRecord(stimulus, "accepted completion stimulus")["commandId"];
  });
}

export function assertUpdatesCompleteBeforeWorkflow(
  history: TemporalHistory,
  expectedCount: number,
): void {
  const accepted = historyEvents(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  );
  const completed = historyEvents(
    history,
    "workflowExecutionUpdateCompletedEventAttributes",
  );
  const workflowCompleted = requiredHistoryEvent(
    history,
    "workflowExecutionCompletedEventAttributes",
  );
  assert.equal(accepted.length, expectedCount);
  assert.equal(completed.length, expectedCount);
  const acceptedIds = new Set(
    accepted.map((event) =>
      temporalInt64ToBigInt(historyPath(event, "eventId")),
    ),
  );
  for (const event of completed) {
    assert.equal(
      acceptedIds.has(
        temporalInt64ToBigInt(
          historyPath(
            event,
            "workflowExecutionUpdateCompletedEventAttributes",
            "acceptedEventId",
          ),
        ),
      ),
      true,
    );
    assert.equal(
      temporalInt64ToBigInt(historyPath(event, "eventId")) <
        temporalInt64ToBigInt(historyPath(workflowCompleted, "eventId")),
      true,
    );
  }
}

function acceptedCompletionArgument(event: HistoryRecord): unknown {
  return historyPath(
    event,
    "workflowExecutionUpdateAcceptedEventAttributes",
    "acceptedRequest",
    "input",
    "args",
    "payloads",
    0,
  );
}
