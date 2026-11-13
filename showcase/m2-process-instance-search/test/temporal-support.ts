/** Test-only Temporal inspection for the M2 Process-instance search witness. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { observationOf } from "@bpmn-lean/temporal-host/client";

import { withDeadline } from "../src/host-worker.ts";
import type { TemporalEnvironment } from "../src/host-worker.ts";

const operationDeadlineMs = 10_000;

type TemporalClient = TemporalEnvironment["client"];
type ProcessHandle = ReturnType<TemporalClient["workflow"]["getHandle"]>;

/** The canonical state query of the host's process Workflow (`packages/temporal-host/src/protocol.ts`). */

export type TemporalWorkflowExecution = Readonly<{
  workflowId: string;
  runId: string;
  type: string;
  taskQueue: string;
  memo: Readonly<Record<string, unknown>> | undefined;
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

export async function waitForOnlyNewWorkflow(
  client: TemporalClient,
  before: readonly TemporalWorkflowExecution[],
  label: string,
): Promise<TemporalWorkflowExecution> {
  const previous = new Set(before.map(({ workflowId }) => workflowId));
  let latest: readonly TemporalWorkflowExecution[] = [];
  for (let attempt = 0; attempt < 200; attempt += 1) {
    latest = await listWorkflowExecutions(client);
    const added = latest.filter(({ workflowId }) => !previous.has(workflowId));
    if (added.length === 1) {
      return added[0] as TemporalWorkflowExecution;
    }
    assert.ok(added.length < 2, `${label} must create exactly one Workflow`);
    await delay(25);
  }
  throw new Error(`${label} did not create exactly one Workflow: ${JSON.stringify(latest)}`);
}

export async function assertWorkflowHostsInstance(
  client: TemporalClient,
  execution: TemporalWorkflowExecution,
  expectedProcessInstanceId: string,
  expectedTaskName: string,
): Promise<void> {
  const handle = processHandle(client.workflow, execution);
  let latest: unknown;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      latest = await withDeadline(
        observationOf(handle),
        1_000,
        `${expectedTaskName} state observation Query`,
      );
      const tasks = decodeOpenUserTasks(latest);
      if (tasks.length === 1 && tasks[0]?.name === expectedTaskName) {
        assert.equal(tasks[0].processInstanceId, expectedProcessInstanceId);
        return;
      }
    } catch {
      // Visibility can report the start before its first Worker task is queryable.
    }
    await delay(25);
  }
  throw new Error(
    `${expectedTaskName} did not expose Process instance ${expectedProcessInstanceId}: ${JSON.stringify(latest)}`,
  );
}

export async function listScheduleIds(client: TemporalClient): Promise<readonly string[]> {
  return await withDeadline(
    collectScheduleIds(client),
    operationDeadlineMs,
    "Temporal Schedule listing",
  );
}

export function requireOnlyNewIdentity(
  before: readonly string[],
  after: readonly string[],
  label: string,
): string {
  const previous = new Set(before);
  const added = after.filter((value) => !previous.has(value));
  assert.equal(added.length, 1, `${label} must add exactly one private identity`);
  const identity = added[0];
  assert.ok(identity !== undefined && identity.length > 0);
  return identity;
}

/** The Workflow `workflowId` addresses, once it exists; a Timer Start's Process is addressed by its engine identity. */
export async function waitForWorkflow(
  client: TemporalClient,
  workflowId: string,
  label: string,
): Promise<TemporalWorkflowExecution> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const found = (await listWorkflowExecutions(client)).find((execution) => execution.workflowId === workflowId);
    if (found !== undefined) {
      return found;
    }
    await delay(25);
  }
  throw new Error(`${label} did not create Workflow ${workflowId}`);
}

function processHandle(
  client: TemporalClient["workflow"],
  execution: TemporalWorkflowExecution,
): ProcessHandle {
  return client.getHandle(execution.workflowId, execution.runId);
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
function decodeOpenUserTasks(
  value: unknown,
): ReadonlyArray<Readonly<{ processInstanceId: string; name: string | null }>> {
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
    if (task.name !== null && typeof task.name !== "string") {
      throw new TypeError(`open User Task ${index} name must be string or null`);
    }
    return { processInstanceId, name: task.name };
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
