/** The definition Schedule client keeps SDK handles behind four handle-free operations. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deleteTemporalDefinitionSchedule,
  describeTemporalDefinitionSchedule,
  pauseTemporalDefinitionSchedule,
} from "@bpmn-lean/temporal-client/definition-schedule";
import type {
  TemporalDefinitionScheduleClient,
} from "@bpmn-lean/temporal-client/definition-schedule";

const dueAtEpochMs = Date.UTC(2030, 0, 2, 3, 4, 6);

test("describes, pauses, and deletes by Schedule identity without returning a handle", async () => {
  const calls: string[] = [];
  const privateHandleSentinel = "private-handle-must-not-escape";
  const client = {
    schedule: {
      getHandle: (scheduleId: string) => ({
        privateHandleSentinel,
        describe: async () => {
          calls.push(`describe:${scheduleId}`);
          return rawDescription(scheduleId);
        },
        pause: async (note: string) => {
          calls.push(`pause:${scheduleId}:${note}`);
        },
        delete: async () => {
          calls.push(`delete:${scheduleId}`);
        },
      }),
    },
  } as unknown as TemporalDefinitionScheduleClient;

  const description = await describeTemporalDefinitionSchedule(
    client,
    "schedule-42",
  );
  await pauseTemporalDefinitionSchedule(client, "schedule-42");
  await deleteTemporalDefinitionSchedule(client, "schedule-42");

  assert.deepEqual(calls, [
    "describe:schedule-42",
    "pause:schedule-42:Paused by BPM platform cancellation reconciliation",
    "delete:schedule-42",
  ]);
  assert.equal(description.scheduleId, "schedule-42");
  assert.equal(description.spec.startAtEpochMs, dueAtEpochMs);
  assert.equal(description.info.nextActionEpochMs[0], dueAtEpochMs);
  assert.equal(description.action.retry?.maximumAttempts, 1);
  assert.equal(JSON.stringify(description).includes(privateHandleSentinel), false);
});

function rawDescription(scheduleId: string): unknown {
  const dueAt = new Date(dueAtEpochMs);
  const exact = <Value>(value: Value) => [{ start: value, end: value, step: 1 }];
  return {
    scheduleId,
    spec: {
      calendars: [{
        second: exact(6),
        minute: exact(4),
        hour: exact(3),
        dayOfMonth: exact(2),
        month: exact("JANUARY"),
        year: exact(2030),
        dayOfWeek: [{ start: "SUNDAY", end: "SATURDAY", step: 1 }],
        comment: undefined,
      }],
      intervals: [],
      skip: [],
      startAt: dueAt,
      endAt: dueAt,
      jitter: undefined,
      timezone: "UTC",
    },
    action: {
      type: "startWorkflow",
      workflowType: "runBpmnProcess",
      taskQueue: "definition-schedule-queue",
      workflowId: "configured-workflow-base-42",
      args: [{ kind: "triggerTimerStart" }, { kind: "semanticProcess" }],
      retry: {
        maximumAttempts: 1,
        initialInterval: 1_000,
        maximumInterval: 100_000,
        backoffCoefficient: 2,
        nonRetryableErrorTypes: [],
      },
      workflowExecutionTimeout: undefined,
      workflowRunTimeout: undefined,
      workflowTaskTimeout: undefined,
    },
    policies: {
      overlap: "SKIP",
      catchupWindow: 60_000,
      pauseOnFailure: true,
    },
    state: { paused: false, remainingActions: 1 },
    info: {
      recentActions: [],
      nextActionTimes: [dueAt],
      numActionsTaken: 0,
      numActionsMissedCatchupWindow: 0,
      numActionsSkippedOverlap: 0,
      createdAt: new Date(dueAtEpochMs - 1_000),
      lastUpdatedAt: undefined,
      runningActions: [],
    },
    searchAttributes: {},
    typedSearchAttributes: {},
    raw: {},
  };
}
