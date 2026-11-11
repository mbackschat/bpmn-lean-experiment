/** Service-side Workflow, Schedule, and Event History evidence for Message Start ingress. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { withDeadline } from "../src/host-worker.ts";
import type { TemporalEnvironment } from "../src/host-worker.ts";

const operationDeadlineMs = 10_000;

type TemporalClient = TemporalEnvironment["client"];
type ProcessHandle = ReturnType<TemporalClient["workflow"]["getHandle"]>;
export type TemporalHistory = Awaited<ReturnType<ProcessHandle["fetchHistory"]>>;
type HistoryEntry = NonNullable<TemporalHistory["events"]>[number];

/** The canonical state query of the host's process Workflow (`packages/temporal-host/src/protocol.ts`). */
const observationQueryName = "observation";

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
  return client.getHandle(execution.workflowId, execution.runId);
}

export async function waitForOpenUserTask(
  handle: ProcessHandle,
  expectedName: string,
): Promise<OpenUserTaskSnapshot> {
  let latest: unknown;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      latest = await withDeadline(
        handle.query(observationQueryName),
        1_000,
        "Message Start state observation Query",
      );
      const tasks = decodeOpenUserTasks(latest);
      if (tasks.length === 1 && tasks[0]?.name === expectedName) {
        return tasks[0];
      }
    } catch {
      // Temporal accepts the start before the Worker has run its first Workflow task to answer a Query.
    }
    await delay(25);
  }
  throw new Error(
    `Message Start Process did not expose User Task ${expectedName}: ${JSON.stringify(latest)}`,
  );
}

/** The host Workflow's one start argument (`RunProcessArgs` of `packages/temporal-host/src/host-contract.ts`). */
export function workflowStartArguments(history: TemporalHistory): Record<string, unknown> {
  const started = historyEvents(history, "workflowExecutionStartedEventAttributes");
  assert.equal(started.length, 1);
  const attributes = started[0]?.workflowExecutionStartedEventAttributes;
  const input = requireRecord(attributes?.input, "Workflow start input");
  if (!Array.isArray(input.payloads) || input.payloads.length !== 1) {
    throw new TypeError("a host Workflow start must retain exactly one argument payload");
  }
  return requireRecord(decodeJsonPayload(input.payloads[0], "Workflow start arguments"), "Workflow start arguments");
}

/**
 * One Run, one Update, and none of the cross-Workflow, timer or Activity events: the Message-started User Task Process
 * commits its start and its one completion and ends. The old adapter's exact event total (14, with its markers and
 * search-attribute upserts) was the shape of that Workflow; the host's own total is not pinned here.
 */
export function assertCompletedMessageStartHistory(history: TemporalHistory): void {
  assert.equal(historyEvents(history, "workflowExecutionStartedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionCompletedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionUpdateAcceptedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionUpdateCompletedEventAttributes").length, 1);
  for (const attributes of [
    "workflowExecutionContinuedAsNewEventAttributes",
    "workflowExecutionSignaledEventAttributes",
    "signalExternalWorkflowExecutionInitiatedEventAttributes",
    "externalWorkflowExecutionSignaledEventAttributes",
    "timerStartedEventAttributes",
    "activityTaskScheduledEventAttributes",
    "startChildWorkflowExecutionInitiatedEventAttributes",
    "childWorkflowExecutionStartedEventAttributes",
  ]) {
    assert.equal(
      historyEvents(history, attributes as keyof HistoryEntry).length,
      0,
      `Message Start history unexpectedly contains ${attributes}`,
    );
  }
}

export function historyEvents(history: TemporalHistory, attribute: keyof HistoryEntry): readonly HistoryEntry[] {
  return (history.events ?? []).filter((event) => event[attribute] !== undefined && event[attribute] !== null);
}

/** A Temporal payload of the SDK's default JSON converter: UTF-8 JSON bytes. */
function decodeJsonPayload(value: unknown, description: string): unknown {
  const data = requireRecord(value, description).data;
  if (typeof data !== "string" && !(data instanceof Uint8Array)) {
    throw new TypeError(`${description} has no JSON payload data`);
  }
  return JSON.parse(typeof data === "string" ? Buffer.from(data, "base64").toString("utf8") : Buffer.from(data).toString("utf8"));
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

/** The open User Task waits of a canonical state observation (`canonical-result.schema.json#/$defs/state`). */
function decodeOpenUserTasks(value: unknown): OpenUserTaskSnapshot[] {
  const openWaits = requireRecord(value, "state observation").openWaits;
  if (!Array.isArray(openWaits)) {
    throw new TypeError("state observation openWaits must be an array");
  }
  return openWaits.filter((candidate) =>
    requireRecord(requireRecord(candidate, "open wait").detail, "open wait detail").kind === "userTask"
  ).map((candidate, index) => {
    const wait = requireRecord(candidate, `open User Task ${index}`);
    const task: Record<string, unknown> = { ...requireRecord(wait.detail, `open User Task ${index} detail`), id: wait.id };
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
