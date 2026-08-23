/** Service-side Workflow, Schedule, and Event History evidence for Message Start ingress. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import {
  bpmnOpenUserTasksQueryName,
  createCachedLocalEnvironment,
  decodeJsonPayload,
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
type ProcessHandle = ReturnType<TemporalClient["workflow"]["getHandle"]>;

export type TemporalWorkflowExecution = Readonly<{
  workflowId: string;
  runId: string;
  type: string;
  taskQueue: string;
  memo: Readonly<Record<string, unknown>> | undefined;
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

export async function listWorkflowExecutions(
  client: TemporalClient,
): Promise<readonly TemporalWorkflowExecution[]> {
  return await withDeadline(
    collectWorkflowExecutions(client),
    operationDeadlineMs,
    "Temporal Workflow listing",
  );
}

export async function listScheduleIds(client: TemporalClient): Promise<readonly string[]> {
  return await withDeadline(
    collectScheduleIds(client),
    operationDeadlineMs,
    "Temporal Schedule listing",
  );
}

export async function waitForOnlyNewWorkflow(
  client: TemporalClient,
  before: readonly TemporalWorkflowExecution[],
): Promise<TemporalWorkflowExecution> {
  const previous = new Set(before.map(({ workflowId }) => workflowId));
  let latest: readonly TemporalWorkflowExecution[] = [];
  for (let attempt = 0; attempt < 160; attempt += 1) {
    latest = await listWorkflowExecutions(client);
    const added = latest.filter(({ workflowId }) => !previous.has(workflowId));
    if (added.length === 1) {
      return added[0] as TemporalWorkflowExecution;
    }
    assert.ok(added.length < 2, "one publication must not fan out to multiple Workflows");
    await delay(25);
  }
  throw new Error(`publication did not create exactly one Workflow: ${JSON.stringify(latest)}`);
}

export function processHandle(
  client: TemporalClient["workflow"],
  execution: TemporalWorkflowExecution,
): ProcessHandle {
  return client.getHandle<BpmnProcessWorkflow>(execution.workflowId, execution.runId);
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
        "Message Start open User Task Query",
      );
      const tasks = decodeOpenUserTasks(latest);
      if (tasks.length === 1 && tasks[0]?.name === expectedName) {
        return tasks[0];
      }
    } catch {
      // Temporal accepts the start before the replacement Worker can answer its first Query.
    }
    await delay(25);
  }
  throw new Error(
    `Message Start Process did not expose User Task ${expectedName}: ${JSON.stringify(latest)}`,
  );
}

export function assertWorkerAbsentHistory(history: TemporalHistory): void {
  assert.equal(historyEvents(history, "workflowExecutionStartedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowTaskStartedEventAttributes").length, 0);
}

export function workflowStartArguments(history: TemporalHistory): readonly [unknown, unknown] {
  const started = historyEvents(history, "workflowExecutionStartedEventAttributes");
  assert.equal(started.length, 1);
  const attributes = started[0]?.attributes;
  const input = requireRecord(attributes?.input, "Workflow start input");
  if (!Array.isArray(input.payloads) || input.payloads.length !== 2) {
    throw new TypeError("Workflow start must retain exactly two argument payloads");
  }
  return [
    decodeJsonPayload(input.payloads[0], "Workflow start stimulus"),
    decodeJsonPayload(input.payloads[1], "Workflow start semantic program"),
  ];
}

export function assertCompletedMessageStartHistory(history: TemporalHistory): void {
  assert.equal(history.events.length, 10);
  assert.equal(historyEvents(history, "workflowExecutionStartedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionCompletedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionUpdateAcceptedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionUpdateCompletedEventAttributes").length, 1);
  for (const attributes of [
    "workflowExecutionSignaledEventAttributes",
    "signalExternalWorkflowExecutionInitiatedEventAttributes",
    "externalWorkflowExecutionSignaledEventAttributes",
    "timerStartedEventAttributes",
    "activityTaskScheduledEventAttributes",
    "startChildWorkflowExecutionInitiatedEventAttributes",
    "childWorkflowExecutionStartedEventAttributes",
  ]) {
    assert.equal(
      historyEvents(history, attributes).length,
      0,
      `Message Start history unexpectedly contains ${attributes}`,
    );
  }
}

async function collectWorkflowExecutions(
  client: TemporalClient,
): Promise<TemporalWorkflowExecution[]> {
  const executions: TemporalWorkflowExecution[] = [];
  for await (const execution of client.workflow.list()) {
    executions.push({
      workflowId: execution.workflowId,
      runId: execution.runId,
      type: execution.type,
      taskQueue: execution.taskQueue,
      memo: execution.memo,
    });
  }
  return executions.sort((left, right) =>
    left.workflowId < right.workflowId ? -1 : left.workflowId > right.workflowId ? 1 : 0);
}

async function collectScheduleIds(client: TemporalClient): Promise<string[]> {
  const identities: string[] = [];
  for await (const summary of client.schedule.list()) {
    identities.push(summary.scheduleId);
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
