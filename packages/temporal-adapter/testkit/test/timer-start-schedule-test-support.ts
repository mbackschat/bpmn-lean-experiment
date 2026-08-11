/** Test-only Temporal Schedule construction and service-observation support for Timer Start. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import {
  SemanticOperationKind,
} from "@bpmn-lean/semantic-core";
import type {
  ProcessStartStimulus,
  SemanticProcessProgram,
  TriggerTimerStartStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  CalendarSpec,
  Client,
  ScheduleDescription,
  ScheduleHandle,
} from "@temporalio/client";

import {
  BpmnProcessAdmissionResultKind,
  assessBpmnProcessAdmission,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  processWorkflowId,
} from "@bpmn-lean/temporal-testkit";

import { withDeadline } from "./temporal-test-support.ts";

const operationDeadlineMs = 10_000;

export type TimerStartScheduleInput = Readonly<{
  scheduleId: string;
  activationTime: Date;
  admittedStart: TriggerTimerStartStimulus;
  storedStart: ProcessStartStimulus;
  semanticProcess: SemanticProcessProgram;
}>;

export type TimerStartScheduleCreation = Readonly<{
  handle: ScheduleHandle;
  dueTime: Date;
  configuredWorkflowId: string;
}>;

export type TimerStartScheduleExecution = Readonly<{
  description: ScheduleDescription;
  workflowId: string;
  firstExecutionRunId: string;
}>;

export type ExactServiceResourceCounts = Readonly<{
  schedules: number;
  workflows: number;
}>;

/** One future whole-second host activation, leaving one second for Schedule creation. */
export function nextHostActivationTime(nowMs = Date.now()): Date {
  return new Date(Math.ceil(nowMs / 1_000) * 1_000 + 1_000);
}

/**
 * Runs the production semantic and host admission boundary before storing one Schedule action.
 *
 * `storedStart` is separate only so the test can distinguish pre-Schedule refusal from corruption
 * of an already-stored action. Production policy and any public Schedule API are outside this owner.
 */
export async function createAdmittedTimerStartSchedule(
  client: Client,
  input: TimerStartScheduleInput,
): Promise<TimerStartScheduleCreation | null> {
  const admission = assessBpmnProcessAdmission(
    input.admittedStart,
    input.semanticProcess,
  );
  switch (admission.kind) {
    case BpmnProcessAdmissionResultKind.Rejected:
      return null;
    case BpmnProcessAdmissionResultKind.Admitted:
      break;
  }

  const durationMs = exactTimerStartDurationMs(input.semanticProcess);
  const dueTime = new Date(input.activationTime.getTime() + durationMs);
  assert.equal(
    input.activationTime.getTime() % 1_000,
    0,
    "Schedule activation must be a whole UTC second",
  );
  assert.ok(
    dueTime.getTime() > Date.now(),
    "Timer Start Schedule due time must still be in the future",
  );
  const configuredWorkflowId = processWorkflowId(
    input.admittedStart.instanceId,
  );
  const handle = await withDeadline(
    client.schedule.create({
      scheduleId: input.scheduleId,
      spec: {
        calendars: [utcCalendarAt(dueTime)],
        startAt: dueTime,
        endAt: dueTime,
        timezone: "UTC",
      },
      action: {
        type: "startWorkflow",
        workflowType: bpmnProcessWorkflowType,
        taskQueue: bpmnSemanticTaskQueue,
        workflowId: configuredWorkflowId,
        args: [input.storedStart, input.semanticProcess],
        retry: { maximumAttempts: 1 },
      },
      state: { remainingActions: 1 },
    }),
    operationDeadlineMs,
    "Timer Start Schedule creation",
  );
  return { handle, dueTime, configuredWorkflowId };
}

/** Counts exact service-side resources instead of inferring them from local calls. */
export async function exactServiceResourceCounts(
  client: Client,
  scheduleId: string,
  workflowId: string,
): Promise<ExactServiceResourceCounts> {
  let schedules = 0;
  for await (const summary of client.schedule.list()) {
    if (summary.scheduleId === scheduleId) {
      schedules += 1;
    }
  }
  let workflows = 0;
  for await (const execution of client.workflow.list()) {
    if (execution.workflowId === workflowId) {
      workflows += 1;
    }
  }
  return { schedules, workflows };
}

/** Counts every Schedule and Workflow visible in the fresh test service. */
export async function allServiceResourceCounts(
  client: Client,
): Promise<ExactServiceResourceCounts> {
  let schedules = 0;
  for await (const _summary of client.schedule.list()) {
    schedules += 1;
  }
  let workflows = 0;
  for await (const _execution of client.workflow.list()) {
    workflows += 1;
  }
  return { schedules, workflows };
}

/** Waits until the service records the one expected action and its Workflow identity. */
export async function waitForExactScheduleAction(
  handle: ScheduleHandle,
  expectedDueTime: Date,
): Promise<TimerStartScheduleExecution> {
  const untilDueMs = expectedDueTime.getTime() - Date.now();
  if (untilDueMs > 0) {
    await delay(untilDueMs);
  }
  let latest: ScheduleDescription | undefined;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    latest = await withDeadline(
      handle.describe(),
      operationDeadlineMs,
      "Timer Start Schedule description",
    );
    if (latest.info.numActionsTaken === 1) {
      assert.equal(latest.info.recentActions.length, 1);
      const [action] = latest.info.recentActions;
      assert.ok(action !== undefined);
      assert.equal(action.scheduledAt.getTime(), expectedDueTime.getTime());
      assert.ok(action.takenAt.getTime() >= action.scheduledAt.getTime());
      assert.equal(action.action.type, "startWorkflow");
      assert.notEqual(action.action.workflow.workflowId, "");
      assert.notEqual(action.action.workflow.firstExecutionRunId, "");
      return {
        description: latest,
        workflowId: action.action.workflow.workflowId,
        firstExecutionRunId: action.action.workflow.firstExecutionRunId,
      };
    }
    await delay(25);
  }
  throw new Error(
    `Schedule ${handle.scheduleId} did not take its one expected action: ${JSON.stringify(latest?.info)}`,
  );
}

/** Proves the finished one-action Schedule has no permitted future action. */
export async function waitForExhaustedSchedule(
  handle: ScheduleHandle,
): Promise<ScheduleDescription> {
  let latest: ScheduleDescription | undefined;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    latest = await withDeadline(
      handle.describe(),
      operationDeadlineMs,
      "exhausted Timer Start Schedule description",
    );
    if (
      latest.info.numActionsTaken === 1 &&
      latest.info.nextActionTimes.length === 0 &&
      latest.info.runningActions.length === 0
    ) {
      assert.equal(latest.state.remainingActions, 0);
      assert.equal(latest.info.recentActions.length, 1);
      return latest;
    }
    await delay(25);
  }
  throw new Error(
    `Schedule ${handle.scheduleId} retained a future or running action: ${JSON.stringify(latest?.info)}`,
  );
}

function exactTimerStartDurationMs(program: SemanticProcessProgram): number {
  const starts = program.operations.filter(
    (operation) => operation.kind === SemanticOperationKind.InitiateTimer,
  );
  assert.equal(starts.length, 1, "Timer Start program must declare one initiation");
  const [start] = starts;
  assert.ok(start?.kind === SemanticOperationKind.InitiateTimer);
  assert.equal(start.timer.durationMs, 1_000);
  return start.timer.durationMs;
}

function utcCalendarAt(dueTime: Date) {
  const month = utcMonths[dueTime.getUTCMonth()];
  assert.ok(month !== undefined, "UTC month is outside the calendar domain");
  return {
    second: dueTime.getUTCSeconds(),
    minute: dueTime.getUTCMinutes(),
    hour: dueTime.getUTCHours(),
    dayOfMonth: dueTime.getUTCDate(),
    month,
    year: dueTime.getUTCFullYear(),
  } satisfies CalendarSpec;
}

const utcMonths = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
] as const;
