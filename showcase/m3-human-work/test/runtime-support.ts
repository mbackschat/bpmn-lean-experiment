import assert from "node:assert/strict";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  DefinitionScheduleStatus,
  MessageStartPublicationStatus,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionSchedule,
  DeployedDefinitionVersion,
  MessageStartPublication,
} from "@bpmn-lean/platform-contracts";
import { createPlatformServer } from "@bpmn-lean/platform-server";
import type { PlatformServerRuntime } from "@bpmn-lean/platform-server";
import {
  bpmnOpenUserTasksQueryName,
  ExternalTemporalRuntime,
  TemporalScenarioRunner,
  createCachedLocalEnvironment,
  createHostEffectActivities,
  withDeadline,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
} from "@bpmn-lean/temporal-testkit";

type OpenUserTask = Readonly<{
  id: Readonly<{
    processInstanceId: string;
    elementId: string;
    activation: number;
  }>;
  name: string | null;
  state: "active";
  metadata?: Readonly<{
    assignment: Readonly<{
      candidates: readonly Readonly<{ kind: "group"; id: string }>[];
    }>;
    form: Readonly<{
      fields: readonly Readonly<{ key: string; type: "string" | "boolean" }>[];
    }>;
  }>;
}>;

import {
  getDefinitionSchedule,
  getMessageStartPublication,
} from "./http-support.ts";

export const taskQueue = "bpmn-m3-human-work";
export const operationDeadlineMs = 10_000;
export const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);

export type TemporalEnvironment = Awaited<ReturnType<typeof createCachedLocalEnvironment>>;
type TemporalClient = TemporalEnvironment["client"];

export type TemporalWorkflowExecution = Readonly<{
  workflowId: string;
  runId: string;
}>;

export function startWorker(
  address: string,
  namespace: string,
  identity: string,
): Promise<ExternalTemporalRuntime> {
  return withDeadline(
    ExternalTemporalRuntime.connect({ address, namespace, taskQueue, identity },
      createHostEffectActivities([])),
    20_000,
    "M3 Human Work Worker startup",
  );
}

export async function startPlatform(
  origin: string,
  port: number,
  dataDirectory: string,
  temporalAddress: string,
  temporalNamespace: string,
): Promise<PlatformServerRuntime> {
  const runtime = await createPlatformServer({
    host: "127.0.0.1",
    port,
    publicOrigin: origin,
    dataDirectory,
    maxSourceBytes: 1024 * 1024,
    parserDeadlineMs: 5_000,
    temporalAddress,
    temporalNamespace,
    temporalTaskQueue: taskQueue,
    temporalConnectTimeoutMs: 5_000,
    fakeActorId: "demo-user",
    fakeActorGroups: ["reviewers"],
    maxWorkProcesses: 10,
    maxWorkTasks: 20,
  });
  try {
    assert.equal(await runtime.listen(), origin);
    return runtime;
  } catch (error: unknown) {
    await runtime.close();
    throw error;
  }
}

export async function waitForStartedSchedule(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
): Promise<Extract<DefinitionSchedule, { status: "started" }>> {
  let latest: DefinitionSchedule | undefined;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    latest = (await getDefinitionSchedule(origin, definition, scheduleId)).value;
    if (latest.status === DefinitionScheduleStatus.Started) return latest;
    await delay(25);
  }
  throw new Error(`definition Schedule did not start: ${JSON.stringify(latest)}`);
}

export async function waitForAcceptedPublication(
  origin: string,
  publicationId: string,
): Promise<Extract<MessageStartPublication, { status: "accepted" }>> {
  let latest: MessageStartPublication | undefined;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    latest = (await getMessageStartPublication(origin, publicationId)).value;
    if (latest.status === MessageStartPublicationStatus.Accepted) return latest;
    await delay(25);
  }
  throw new Error(`Message Start publication was not accepted: ${JSON.stringify(latest)}`);
}

export function nextWholeSecond(offsetSeconds: number, now = Date.now()): string {
  assert.ok(Number.isSafeInteger(offsetSeconds) && offsetSeconds > 0);
  return new Date(Math.ceil(now / 1_000) * 1_000 + offsetSeconds * 1_000)
    .toISOString();
}

export async function listWorkflowExecutions(
  client: TemporalClient,
): Promise<readonly TemporalWorkflowExecution[]> {
  return await withDeadline(
    collectWorkflowExecutions(client),
    operationDeadlineMs,
    "M3 Human Work Workflow listing",
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
    if (added.length === 1) return added[0]!;
    assert.ok(added.length < 2, `${label} must create exactly one Workflow`);
    await delay(25);
  }
  throw new Error(`${label} did not create exactly one Workflow: ${JSON.stringify(latest)}`);
}

export async function waitForOneOpenTask(
  client: TemporalClient,
  execution: TemporalWorkflowExecution,
  expectedName: string,
): Promise<OpenUserTask> {
  const handle = client.workflow.getHandle<BpmnProcessWorkflow>(
    execution.workflowId,
    execution.runId,
  );
  let latest: readonly OpenUserTask[] = [];
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      latest = await withDeadline(
        handle.query<readonly OpenUserTask[]>(bpmnOpenUserTasksQueryName),
        1_000,
        `${expectedName} open-task Query`,
      );
      if (latest.length === 1 && latest[0]?.name === expectedName) return latest[0];
    } catch {
      // Visibility can expose a start before its first Workflow task is queryable.
    }
    await delay(25);
  }
  throw new Error(`${expectedName} did not become open: ${JSON.stringify(latest)}`);
}

export async function allocatePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("ephemeral listener did not expose a TCP address");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
  return address.port;
}

export async function replayHistory(history: unknown, workflowId: string): Promise<void> {
  const runner = await withDeadline(
    TemporalScenarioRunner.create({ downloadDirectory: temporalCacheDirectory }),
    30_000,
    "M3 Human Work replay runner startup",
  );
  try {
    await withDeadline(
      runner.replayHistory(history, workflowId),
      operationDeadlineMs,
      "M3 Human Work history replay",
    );
  } finally {
    await runner.shutdown();
  }
}

async function collectWorkflowExecutions(
  client: TemporalClient,
): Promise<TemporalWorkflowExecution[]> {
  const executions: TemporalWorkflowExecution[] = [];
  for await (const execution of client.workflow.list()) {
    executions.push({ workflowId: execution.workflowId, runId: execution.runId });
  }
  return executions.sort((left, right) => left.workflowId.localeCompare(right.workflowId));
}
