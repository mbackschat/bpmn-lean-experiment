/** Service-side Schedule, Workflow, and Event History evidence for the M2 witness. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import {
  bpmnOpenUserTasksQueryName,
  createCachedLocalEnvironment,
  historyEvents,
  withDeadline,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

const operationDeadlineMs = 10_000;

type TemporalEnvironment = Awaited<ReturnType<typeof createCachedLocalEnvironment>>;
type TemporalClient = TemporalEnvironment["client"];
type ScheduleHandle = ReturnType<TemporalClient["schedule"]["getHandle"]>;
type ScheduleDescription = Awaited<ReturnType<ScheduleHandle["describe"]>>;
type ProcessHandle = ReturnType<TemporalClient["workflow"]["getHandle"]>;

export type ObservedScheduleAction = Readonly<{
  hostScheduleId: string;
  workflowId: string;
  firstExecutionRunId: string;
  actionArgs: readonly unknown[];
  description: ScheduleDescription;
}>;

export type OpenUserTaskSnapshot = Readonly<{
  id: Readonly<{
    processInstanceId: string;
    elementId: string;
    activation: number;
  }>;
  name: string | null;
  state: string;
}>;

export function nextWholeSecond(offsetSeconds: number, nowMs = Date.now()): string {
  assert.ok(Number.isSafeInteger(offsetSeconds) && offsetSeconds > 0);
  return new Date(Math.ceil(nowMs / 1_000) * 1_000 + offsetSeconds * 1_000)
    .toISOString();
}

export async function listScheduleIds(client: TemporalClient): Promise<readonly string[]> {
  return await withDeadline(
    collectScheduleIds(client),
    operationDeadlineMs,
    "Temporal Schedule listing",
  );
}

export async function listWorkflowIds(client: TemporalClient): Promise<readonly string[]> {
  return await withDeadline(
    collectWorkflowIds(client),
    operationDeadlineMs,
    "Temporal Workflow listing",
  );
}

export function requireOnlyNewIdentity(
  before: readonly string[],
  after: readonly string[],
  label: string,
): string {
  const previous = new Set(before);
  const added = after.filter((value) => !previous.has(value));
  assert.equal(added.length, 1, `${label} must add exactly one service identity`);
  const identity = added[0];
  assert.ok(identity !== undefined && identity.length > 0);
  return identity;
}

export async function waitForExactScheduleAction(
  client: TemporalClient,
  hostScheduleId: string,
  dueAt: string,
): Promise<ObservedScheduleAction> {
  const handle = client.schedule.getHandle(hostScheduleId);
  const dueAtMs = Date.parse(dueAt);
  const waitMs = dueAtMs - Date.now();
  if (waitMs > 0) {
    await delay(waitMs);
  }
  let latest: ScheduleDescription | undefined;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    latest = await withDeadline(
      handle.describe(),
      operationDeadlineMs,
      "definition Schedule action description",
    );
    if (latest.info.numActionsTaken === 1) {
      const recent = latest.info.recentActions[0];
      const running = latest.info.runningActions[0];
      const execution = running?.type === "startWorkflow"
        ? running.workflow
        : recent?.action.type === "startWorkflow"
          ? recent.action.workflow
          : undefined;
      assert.ok(execution !== undefined, "Schedule action has no Workflow execution identity");
      if (recent !== undefined) {
        assert.equal(recent.scheduledAt.getTime(), dueAtMs);
        assert.ok(recent.takenAt.getTime() >= dueAtMs);
      }
      assert.equal(latest.state.remainingActions, 0);
      assert.equal(latest.info.numActionsTaken, 1);
      assert.equal(latest.info.numActionsMissedCatchupWindow, 0);
      assert.equal(latest.info.numActionsSkippedOverlap, 0);
      assert.equal(latest.info.nextActionTimes.length, 0);
      assert.equal(latest.action.type, "startWorkflow");
      const actionArgs = latest.action.args;
      assert.ok(Array.isArray(actionArgs));
      assert.equal(actionArgs.length, 2);
      return {
        hostScheduleId,
        workflowId: execution.workflowId,
        firstExecutionRunId: execution.firstExecutionRunId,
        actionArgs: [...actionArgs],
        description: latest,
      };
    }
    await delay(25);
  }
  throw new Error(
    `Schedule ${hostScheduleId} did not take exactly one action: ${JSON.stringify(latest?.info)}`,
  );
}

export async function waitForScheduleCleanup(
  client: TemporalClient,
  hostScheduleId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!(await listScheduleIds(client)).includes(hostScheduleId)) {
      return;
    }
    await delay(25);
  }
  throw new Error(`Schedule ${hostScheduleId} was not cleaned up`);
}

export async function waitForOpenUserTask(
  handle: ProcessHandle,
  expectedName: string,
): Promise<OpenUserTaskSnapshot> {
  let latest: unknown;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      latest = await withDeadline(
        handle.query(bpmnOpenUserTasksQueryName),
        1_000,
        "scheduled Process open User Task Query",
      );
      const tasks = decodeOpenUserTasks(latest);
      if (tasks.length === 1 && tasks[0]?.name === expectedName) {
        return tasks[0];
      }
    } catch {
      // The service accepted the start before a replacement Worker could answer its first Query.
    }
    await delay(25);
  }
  throw new Error(
    `scheduled Process did not expose User Task ${expectedName}: ${JSON.stringify(latest)}`,
  );
}

export function assertWorkerAbsentHistory(history: TemporalHistory): void {
  assert.equal(
    historyEvents(history, "workflowExecutionStartedEventAttributes").length,
    1,
  );
  assert.equal(
    historyEvents(history, "workflowTaskStartedEventAttributes").length,
    0,
  );
}

export function assertCompletedTimerStartHistory(history: TemporalHistory): void {
  assert.equal(history.events.length, 10);
  assert.equal(historyEvents(history, "workflowExecutionStartedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionCompletedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionUpdateAcceptedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionUpdateCompletedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "timerStartedEventAttributes").length, 0);
  assert.equal(historyEvents(history, "workflowExecutionSignaledEventAttributes").length, 0);
}

export function processHandle(
  client: TemporalClient["workflow"],
  workflowId: string,
  firstExecutionRunId: string,
): ProcessHandle {
  return client.getHandle<BpmnProcessWorkflow>(workflowId, firstExecutionRunId);
}

async function collectScheduleIds(client: TemporalClient): Promise<string[]> {
  const identities: string[] = [];
  for await (const summary of client.schedule.list()) {
    identities.push(summary.scheduleId);
  }
  return identities.sort();
}

async function collectWorkflowIds(client: TemporalClient): Promise<string[]> {
  const identities: string[] = [];
  for await (const execution of client.workflow.list()) {
    identities.push(execution.workflowId);
  }
  return identities.sort();
}

function decodeOpenUserTasks(value: unknown): OpenUserTaskSnapshot[] {
  if (!Array.isArray(value)) {
    throw new TypeError("open User Task Query must return an array");
  }
  return value.map((candidate, index) => {
    const task = requireRecord(candidate, `open User Task ${index}`);
    const id = requireRecord(task.id, `open User Task ${index} identity`);
    const processInstanceId = requireNonemptyString(
      id.processInstanceId,
      `open User Task ${index} processInstanceId`,
    );
    const elementId = requireNonemptyString(
      id.elementId,
      `open User Task ${index} elementId`,
    );
    if (!Number.isSafeInteger(id.activation) || Number(id.activation) <= 0) {
      throw new TypeError(`open User Task ${index} activation must be positive`);
    }
    if (task.name !== null && typeof task.name !== "string") {
      throw new TypeError(`open User Task ${index} name must be string or null`);
    }
    return {
      id: { processInstanceId, elementId, activation: Number(id.activation) },
      name: task.name,
      state: requireNonemptyString(task.state, `open User Task ${index} state`),
    };
  });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireNonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a nonempty string`);
  }
  return value;
}
