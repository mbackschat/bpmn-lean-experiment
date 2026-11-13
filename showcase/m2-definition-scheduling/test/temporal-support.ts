/** Service-side Schedule, Workflow, and Event History evidence for the M2 witness. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { observationOf } from "@bpmn-lean/temporal-host/client";

import { timerFiringWorkflowType } from "@bpmn-lean/temporal-host/host";
import type { TimerFiringArgs } from "@bpmn-lean/temporal-host/host";

import { withDeadline } from "../src/host-worker.ts";
import type { TemporalEnvironment } from "../src/host-worker.ts";

const operationDeadlineMs = 10_000;

type TemporalClient = TemporalEnvironment["client"];
type ScheduleHandle = ReturnType<TemporalClient["schedule"]["getHandle"]>;
type ScheduleDescription = Awaited<ReturnType<ScheduleHandle["describe"]>>;
type ProcessHandle = ReturnType<TemporalClient["workflow"]["getHandle"]>;
export type TemporalHistory = Awaited<ReturnType<ProcessHandle["fetchHistory"]>>;
type HistoryEntry = NonNullable<TemporalHistory["events"]>[number];

/** The canonical state query of the host's process Workflow (`packages/temporal-host/src/protocol.ts`). */

/** The Schedule's one taken action: the firing Workflow it started, which submits the occurrence to the population. */
export type ObservedScheduleAction = Readonly<{
  hostScheduleId: string;
  /** The firing Workflow's execution ID: the action's Workflow ID base with the action time appended. */
  workflowId: string;
  firstExecutionRunId: string;
  firing: TimerFiringArgs;
  description: ScheduleDescription;
}>;

export type OpenUserTaskSnapshot = Readonly<{
  id: Readonly<{
    processInstanceId: string;
    elementId: string;
    activation: number;
  }>;
  name: string | null;
}>;

/** The instant a Schedule acts for an occurrence: a calendar spec has no finer unit than the second. */
export function firstWholeSecondNotBefore(dueAtMs: number): number {
  return Math.ceil(dueAtMs / 1_000) * 1_000;
}

export async function listScheduleIds(client: TemporalClient): Promise<readonly string[]> {
  return await withDeadline(
    collectScheduleIds(client),
    operationDeadlineMs,
    "Temporal Schedule listing",
  );
}

/** The IDs of the Workflows of exactly `types`, so unrelated population Workflows never disturb a comparison. */
export async function listWorkflowIds(
  client: TemporalClient,
  types: readonly string[],
): Promise<readonly string[]> {
  return await withDeadline(
    collectWorkflowIds(client, types),
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
  const actionAtMs = firstWholeSecondNotBefore(dueAtMs);
  const waitMs = actionAtMs - Date.now();
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
        assert.equal(recent.scheduledAt.getTime(), actionAtMs);
        assert.ok(recent.takenAt.getTime() >= actionAtMs);
      }
      assert.equal(latest.state.remainingActions, 0);
      assert.equal(latest.info.numActionsTaken, 1);
      assert.equal(latest.info.numActionsMissedCatchupWindow, 0);
      assert.equal(latest.info.numActionsSkippedOverlap, 0);
      assert.equal(latest.info.nextActionTimes.length, 0);
      assert.equal(latest.action.type, "startWorkflow");
      assert.equal(latest.action.workflowType, timerFiringWorkflowType);
      const actionArgs = latest.action.args;
      assert.ok(Array.isArray(actionArgs));
      assert.equal(actionArgs.length, 1);
      const firing = requireRecord(actionArgs[0], "Schedule firing arguments");
      assert.equal(firing.dueMs, dueAtMs, "the action fires the occurrence the Schedule was created for");
      return {
        hostScheduleId,
        workflowId: execution.workflowId,
        firstExecutionRunId: execution.firstExecutionRunId,
        firing: firing as unknown as TimerFiringArgs,
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
        observationOf(handle),
        1_000,
        "scheduled Process state observation Query",
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

/** The firing Workflow of a due action has started and no Worker has taken its first Workflow task. */
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

/**
 * A firing Workflow that has submitted its occurrence to the population: one Run, one Activity (the submission, whose
 * transport retries add no history events), no timer and no Signal, closed with the population's answer. The answer
 * itself, a started instance or the engine's refusal, is read through the public Schedule.
 */
export function assertAnsweredFiringHistory(history: TemporalHistory): void {
  assert.equal(historyEvents(history, "workflowExecutionStartedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionCompletedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionContinuedAsNewEventAttributes").length, 0);
  assert.equal(historyEvents(history, "activityTaskScheduledEventAttributes").length, 1);
  assert.equal(historyEvents(history, "timerStartedEventAttributes").length, 0);
  assert.equal(historyEvents(history, "workflowExecutionSignaledEventAttributes").length, 0);
}

/**
 * One Run that started and completed, with no timer and no Signal: the timer-started User Task Process commits its
 * start through the population's Update-with-Start, takes its one completion and ends. The host's own event total and
 * its Update and Activity counts, which carry the population hand-offs, are not pinned here.
 */
export function assertCompletedTimerStartHistory(history: TemporalHistory): void {
  assert.equal(historyEvents(history, "workflowExecutionStartedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionCompletedEventAttributes").length, 1);
  assert.equal(historyEvents(history, "workflowExecutionContinuedAsNewEventAttributes").length, 0);
  assert.ok(historyEvents(history, "workflowExecutionUpdateAcceptedEventAttributes").length >= 1);
  assert.equal(historyEvents(history, "timerStartedEventAttributes").length, 0);
  assert.equal(historyEvents(history, "workflowExecutionSignaledEventAttributes").length, 0);
}

export function historyEvents(history: TemporalHistory, attribute: keyof HistoryEntry): readonly HistoryEntry[] {
  return (history.events ?? []).filter((event) => event[attribute] !== undefined && event[attribute] !== null);
}

/** The handle of a Workflow chain, addressed by ID so it reaches whichever Run is current. */
export function processHandle(
  client: TemporalClient["workflow"],
  workflowId: string,
  firstExecutionRunId?: string,
): ProcessHandle {
  return client.getHandle(workflowId, firstExecutionRunId);
}

async function collectScheduleIds(client: TemporalClient): Promise<string[]> {
  const identities: string[] = [];
  for await (const summary of client.schedule.list()) {
    identities.push(summary.scheduleId);
  }
  return identities.sort();
}

async function collectWorkflowIds(client: TemporalClient, types: readonly string[]): Promise<string[]> {
  const identities: string[] = [];
  for await (const execution of client.workflow.list()) {
    if (types.includes(execution.type)) {
      identities.push(execution.workflowId);
    }
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
