/** Live Product 2 evidence for exact confirmed-start Process-instance search. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  DefinitionScheduleStatus,
  MessageStartPublicationStatus,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ProcessInstanceSearchPage,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import {
  createPlatformServer,
  readPlatformServerConfig,
} from "@bpmn-lean/platform-server";
import type { PlatformServerRuntime } from "@bpmn-lean/platform-server";
import {
  ExternalTemporalRuntime,
  bpmnProcessWorkflowType,
  createCachedLocalEnvironment,
  createHostEffectActivities,
  decodeJsonPayload,
  historyEvents,
  withDeadline,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

import {
  deployDefinition,
  getDefinitionSchedule,
  getMessageStartPublication,
  putDefinitionSchedule,
  putMessageStartPublication,
  searchProcessInstances,
  startDefinition,
} from "./http-support.ts";
import type { CapturedJson } from "./http-support.ts";
import {
  assertWorkflowHostsInstance,
  listScheduleIds,
  listWorkflowExecutions,
  nextWholeSecond,
  requireOnlyNewIdentity,
  waitForOnlyNewWorkflow,
} from "./temporal-support.ts";
import type { TemporalWorkflowExecution } from "./temporal-support.ts";

const directProfile = "bpmn-2.0.2-user-task-preserved-notation-draft";
const timerProfile = "bpmn-2.0.2-timer-start-event-draft";
const messageProfile = "bpmn-2.0.2-message-start-event-draft";
const taskQueue = "bpmn-m2-process-instance-search";
const operationDeadlineMs = 10_000;
const environmentStartupDeadlineMs = 40_000;
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);
const directSourceUrl = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const timerSourceUrl = new URL(
  "../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);
const messageSourceUrl = new URL(
  "../../../scenarios/message-start-event/process.bpmn",
  import.meta.url,
);

test("searches three confirmed Product 2 starts without discovering private Temporal starts", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-m2-process-search-"));
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: `bpmn-m2-process-search-service-${process.pid}`,
      downloadDirectory: temporalCacheDirectory,
    }),
    environmentStartupDeadlineMs,
    "M2 Process-instance search Temporal environment startup",
  );
  let platform: PlatformServerRuntime | undefined;
  let worker: ExternalTemporalRuntime | undefined;
  const searchCaptures: CapturedJson<ProcessInstanceSearchPage>[] = [];

  try {
    worker = await startWorker(environment.address, environment.namespace ?? "default");
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      environment.namespace ?? "default",
    );
    const token = `${Date.now()}_${process.pid}`;
    const sharedProcessId = `Process_Search_Shared_${token}`;
    const messageProcessId = `Process_Search_Message_${token}`;
    const directTask = `Review direct start ${token}`;
    const scheduleTask = `Review scheduled start ${token}`;
    const messageTask = `Review Message Start ${token}`;
    const sources = await runtimeSources(
      sharedProcessId,
      messageProcessId,
      directTask,
      scheduleTask,
      messageTask,
      token,
    );

    const directDefinition = (await deployDefinition(origin, {
      bytes: sources.direct,
      sourceId: `direct-${token}.bpmn`,
      semanticProfile: directProfile,
    })).value;
    assert.equal(directDefinition.version, 1);
    const workflowsBeforeDirect = await listWorkflowExecutions(environment.client);
    const directStart = (await startDefinition(origin, directDefinition)).value;
    const directExecution = await waitForOnlyNewWorkflow(
      environment.client,
      workflowsBeforeDirect,
      "direct exact-version start",
    );
    await assertWorkflowHostsInstance(
      environment.client,
      directExecution,
      directStart.instance.processInstanceId,
      directTask,
    );

    const scheduleDefinition = (await deployDefinition(origin, {
      bytes: sources.timer,
      sourceId: `schedule-${token}.bpmn`,
      semanticProfile: timerProfile,
    })).value;
    assert.equal(scheduleDefinition.processId, sharedProcessId);
    assert.equal(scheduleDefinition.version, 2);
    assert.notEqual(
      scheduleDefinition.source.sha256,
      directDefinition.source.sha256,
    );
    const schedulesBefore = await listScheduleIds(environment.client);
    const workflowsBeforeSchedule = await listWorkflowExecutions(environment.client);
    const scheduleId = `search-schedule-${token}`;
    const scheduled = await putDefinitionSchedule(
      origin,
      scheduleDefinition,
      scheduleId,
      nextWholeSecond(2),
    );
    assert.equal(scheduled.value.status, DefinitionScheduleStatus.Scheduled);
    const privateScheduleId = requireOnlyNewIdentity(
      schedulesBefore,
      await listScheduleIds(environment.client),
      "definition schedule",
    );
    const startedSchedule = await waitForStartedSchedule(
      origin,
      scheduleDefinition,
      scheduleId,
    );
    const scheduleInstance = requireScheduleInstance(startedSchedule.value);
    const scheduleExecution = await waitForOnlyNewWorkflow(
      environment.client,
      workflowsBeforeSchedule,
      "one-action Timer Schedule",
    );
    await assertWorkflowHostsInstance(
      environment.client,
      scheduleExecution,
      scheduleInstance.processInstanceId,
      scheduleTask,
    );

    const firstPage = await searchProcessInstances(origin, { limit: 1 });
    searchCaptures.push(firstPage);
    assert.deepEqual(firstPage.value.instances, [scheduleInstance]);
    assert.ok(firstPage.value.nextCursor !== null);

    const messageDefinition = (await deployDefinition(origin, {
      bytes: sources.message,
      sourceId: `message-${token}.bpmn`,
      semanticProfile: messageProfile,
    })).value;
    assert.equal(messageDefinition.version, 1);
    const messageStart = messageDefinition.startCapabilities.messageStarts[0];
    assert.ok(messageStart !== undefined);
    const workflowsBeforeMessage = await listWorkflowExecutions(environment.client);
    const publicationId = `search-publication-${token}`;
    await putMessageStartPublication(
      origin,
      publicationId,
      messageDefinition,
      messageStart,
    );
    const acceptedPublication = await waitForAcceptedPublication(origin, publicationId);
    const messageInstance = requirePublicationInstance(acceptedPublication.value);
    const messageExecution = await waitForOnlyNewWorkflow(
      environment.client,
      workflowsBeforeMessage,
      "Message Start publication",
    );
    await assertWorkflowHostsInstance(
      environment.client,
      messageExecution,
      messageInstance.processInstanceId,
      messageTask,
    );

    const externalInstanceId = `Outside_Product_2_${token}`;
    const externalWorkflowId = `outside-product-two-${token}`;
    const externalExecution = await startOutsideProductTwo(
      environment.client,
      directExecution,
      externalWorkflowId,
      externalInstanceId,
    );
    await assertWorkflowHostsInstance(
      environment.client,
      externalExecution,
      externalInstanceId,
      directTask,
    );

    assertExactDistinctPublicIdentities([
      directStart.instance,
      scheduleInstance,
      messageInstance,
    ]);
    assertDistinctPrivateExecutions([
      directExecution,
      scheduleExecution,
      messageExecution,
      externalExecution,
    ]);

    await platform.close();
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      environment.namespace ?? "default",
    );

    const secondPage = await searchProcessInstances(origin, {
      cursor: firstPage.value.nextCursor,
      limit: 1,
    });
    searchCaptures.push(secondPage);
    assert.deepEqual(secondPage.value.instances, [directStart.instance]);
    assert.equal(secondPage.value.nextCursor, null);

    const all = await searchProcessInstances(origin, { limit: 100 });
    searchCaptures.push(all);
    assert.deepEqual(all.value.instances, [
      messageInstance,
      scheduleInstance,
      directStart.instance,
    ]);
    assert.equal(all.value.nextCursor, null);

    await assertExactFilters(
      origin,
      directStart.instance,
      scheduleInstance,
      messageInstance,
      searchCaptures,
    );
    const outside = await searchProcessInstances(origin, {
      processInstanceId: externalInstanceId,
    });
    searchCaptures.push(outside);
    assert.deepEqual(outside.value, { instances: [], nextCursor: null });

    assertSearchCapturesArePublic(searchCaptures, [
      privateScheduleId,
      taskQueue,
      ...[directExecution, scheduleExecution, messageExecution, externalExecution]
        .flatMap(({ workflowId, runId }) => [workflowId, runId]),
    ]);
  } finally {
    const cleanupFailures: unknown[] = [];
    for (const cleanup of [
      platform === undefined ? undefined : () => platform?.close(),
      worker === undefined ? undefined : () => worker?.shutdown(),
      () => environment.teardown(),
      () => rm(dataDirectory, { recursive: true, force: true }),
    ]) {
      try {
        await cleanup?.();
      } catch (error: unknown) {
        cleanupFailures.push(error);
      }
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(cleanupFailures, "M2 Process-instance search cleanup failed");
    }
  }
});

async function assertExactFilters(
  origin: string,
  direct: PublicProcessInstanceIdentity,
  scheduled: PublicProcessInstanceIdentity,
  message: PublicProcessInstanceIdentity,
  captures: CapturedJson<ProcessInstanceSearchPage>[],
): Promise<void> {
  const cases = [
    [{ processInstanceId: direct.processInstanceId }, [direct]],
    [{ processId: direct.definition.processId }, [scheduled, direct]],
    [{ version: scheduled.definition.version }, [scheduled]],
    [{ sourceSha256: message.definition.source.sha256 }, [message]],
  ] as const;
  for (const [request, expected] of cases) {
    const result = await searchProcessInstances(origin, request);
    captures.push(result);
    assert.deepEqual(result.value.instances, expected);
    assert.equal(result.value.nextCursor, null);
  }
}

async function startOutsideProductTwo(
  client: Awaited<ReturnType<typeof createCachedLocalEnvironment>>["client"],
  sourceExecution: TemporalWorkflowExecution,
  workflowId: string,
  processInstanceId: string,
): Promise<TemporalWorkflowExecution> {
  const sourceHandle = client.workflow.getHandle(
    sourceExecution.workflowId,
    sourceExecution.runId,
  );
  const history = await withDeadline(
    sourceHandle.fetchHistory(),
    operationDeadlineMs,
    "source Workflow history inspection",
  ) as TemporalHistory;
  const started = historyEvents(history, "workflowExecutionStartedEventAttributes");
  assert.equal(started.length, 1);
  const attributes = started[0]?.attributes;
  const input = requireRecord(attributes?.input, "Workflow start input");
  if (!Array.isArray(input.payloads) || input.payloads.length !== 3) {
    throw new TypeError("production Workflow start must retain exactly three argument payloads");
  }
  const start = requireRecord(
    decodeJsonPayload(input.payloads[0], "Workflow start stimulus"),
    "Workflow start stimulus",
  );
  const program = decodeJsonPayload(input.payloads[1], "Workflow start semantic program");
  const hostInput = decodeJsonPayload(input.payloads[2], "Workflow start host input");
  const before = await listWorkflowExecutions(client);
  await withDeadline(
    client.workflow.start(bpmnProcessWorkflowType, {
      taskQueue,
      workflowId,
      workflowIdReusePolicy: "REJECT_DUPLICATE",
      args: [{
        ...start,
        commandId: `outside-product-two-command-${process.pid}`,
        instanceId: processInstanceId,
      }, program, hostInput],
    }),
    operationDeadlineMs,
    "outside-Product-2 direct Workflow start",
  );
  return await waitForOnlyNewWorkflow(client, before, "outside-Product-2 direct start");
}

async function waitForStartedSchedule(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
): Promise<Awaited<ReturnType<typeof getDefinitionSchedule>>> {
  let latest: Awaited<ReturnType<typeof getDefinitionSchedule>> | undefined;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    latest = await getDefinitionSchedule(origin, definition, scheduleId);
    if (latest.value.status === DefinitionScheduleStatus.Started) {
      return latest;
    }
    await delay(50);
  }
  throw new Error(`definition Schedule did not start: ${JSON.stringify(latest?.value)}`);
}

async function waitForAcceptedPublication(
  origin: string,
  publicationId: string,
): Promise<Awaited<ReturnType<typeof getMessageStartPublication>>> {
  let latest: Awaited<ReturnType<typeof getMessageStartPublication>> | undefined;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    latest = await getMessageStartPublication(origin, publicationId);
    if (latest.value.status === MessageStartPublicationStatus.Accepted) {
      return latest;
    }
    await delay(25);
  }
  throw new Error(`Message Start publication was not accepted: ${JSON.stringify(latest?.value)}`);
}

function requireScheduleInstance(
  schedule: Awaited<ReturnType<typeof getDefinitionSchedule>>["value"],
): PublicProcessInstanceIdentity {
  assert.equal(schedule.status, DefinitionScheduleStatus.Started);
  if (schedule.status !== DefinitionScheduleStatus.Started) {
    throw new TypeError("started Schedule must expose a Process instance");
  }
  return schedule.instance;
}

function requirePublicationInstance(
  publication: Awaited<ReturnType<typeof getMessageStartPublication>>["value"],
): PublicProcessInstanceIdentity {
  assert.equal(publication.status, MessageStartPublicationStatus.Accepted);
  if (publication.status !== MessageStartPublicationStatus.Accepted) {
    throw new TypeError("accepted publication must expose a Process instance");
  }
  return publication.instance;
}

function assertExactDistinctPublicIdentities(
  instances: readonly PublicProcessInstanceIdentity[],
): void {
  assert.equal(new Set(instances.map(({ processInstanceId }) => processInstanceId)).size, 3);
  assert.equal(new Set(instances.map(({ definition }) => definition.source.sha256)).size, 3);
  assert.equal(new Set(instances.map(({ definition }) => definition.source.id)).size, 3);
  assert.equal(instances[0]?.definition.processId, instances[1]?.definition.processId);
  assert.notEqual(instances[0]?.definition.version, instances[1]?.definition.version);
}

function assertDistinctPrivateExecutions(
  executions: readonly TemporalWorkflowExecution[],
): void {
  assert.equal(new Set(executions.map(({ workflowId }) => workflowId)).size, executions.length);
  assert.equal(new Set(executions.map(({ runId }) => runId)).size, executions.length);
  for (const execution of executions) {
    assert.equal(execution.taskQueue, taskQueue);
  }
}

function assertSearchCapturesArePublic(
  captures: readonly CapturedJson<ProcessInstanceSearchPage>[],
  privateValues: readonly string[],
): void {
  const forbiddenKeys = new Set([
    "workflowid",
    "runid",
    "taskqueue",
    "memo",
    "history",
    "ordinal",
    "status",
    "timestamp",
    "origin",
    "startedat",
    "completedat",
    "createdat",
    "updatedat",
  ]);
  for (const capture of captures) {
    assertNoForbiddenKeys(capture.value, forbiddenKeys, "$search");
    for (const privateValue of privateValues) {
      assert.equal(
        capture.text.includes(privateValue),
        false,
        `search response disclosed private value ${privateValue}`,
      );
    }
  }
}

function assertNoForbiddenKeys(
  value: unknown,
  forbidden: ReadonlySet<string>,
  path: string,
): void {
  if (Array.isArray(value)) {
    value.forEach((candidate, index) =>
      assertNoForbiddenKeys(candidate, forbidden, `${path}[${index}]`)
    );
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, candidate] of Object.entries(value)) {
    const normalized = key.replaceAll(/[^A-Za-z0-9]/gu, "").toLowerCase();
    assert.equal(forbidden.has(normalized), false, `${path}.${key} is private or absent`);
    assertNoForbiddenKeys(candidate, forbidden, `${path}.${key}`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

async function runtimeSources(
  sharedProcessId: string,
  messageProcessId: string,
  directTask: string,
  scheduleTask: string,
  messageTask: string,
  token: string,
): Promise<Readonly<{ direct: Uint8Array; timer: Uint8Array; message: Uint8Array }>> {
  const [direct, timer, message] = await Promise.all([
    readFile(directSourceUrl, "utf8"),
    readFile(timerSourceUrl, "utf8"),
    readFile(messageSourceUrl, "utf8"),
  ]);
  return {
    direct: Buffer.from(direct
      .replaceAll("Definitions_SequentialUserTask", `Definitions_Direct_${token}`)
      .replaceAll("Process_SequentialUserTask", sharedProcessId)
      .replace('name="Approve"', `name="${directTask}"`)
      .replace(
        "https://bpmn-lean.local/scenarios/sequential-user-task",
        `https://third-party.invalid/search/direct/${token}`,
      )),
    timer: Buffer.from(timer
      .replaceAll("Definitions_TimerStart", `Definitions_Timer_${token}`)
      .replaceAll("Process_TimerStart", sharedProcessId)
      .replace('name="Review"', `name="${scheduleTask}"`)
      .replace(
        "https://bpmn-lean.local/tests/timer-start",
        `https://third-party.invalid/search/timer/${token}`,
      )),
    message: Buffer.from(message
      .replaceAll("Definitions_MessageStart", `Definitions_Message_${token}`)
      .replaceAll("Process_MessageStart", messageProcessId)
      .replaceAll(
        "Operation_ReceiveApprovalRequest",
        `Operation_ReceiveApprovalRequest_${token}`,
      )
      .replace('name="Approve"', `name="${messageTask}"`)
      .replace(
        "https://bpmn-lean.local/tests/message-start",
        `https://third-party.invalid/search/message/${token}`,
      )),
  };
}

async function startWorker(
  address: string,
  namespace: string,
): Promise<ExternalTemporalRuntime> {
  return await withDeadline(
    ExternalTemporalRuntime.connect({
      address,
      namespace,
      taskQueue,
      identity: `bpmn-m2-process-search-worker-${process.pid}`,
    }, createHostEffectActivities([])),
    20_000,
    "M2 Process-instance search production Worker startup",
  );
}

async function startPlatform(
  origin: string,
  port: number,
  dataDirectory: string,
  temporalAddress: string,
  temporalNamespace: string,
): Promise<PlatformServerRuntime> {
  const runtime = await createPlatformServer({
    ...readPlatformServerConfig({}),
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
    maxWorkProcesses: 100,
    maxWorkTasks: 1_000,
  });
  try {
    assert.equal(await runtime.listen(), origin);
    return runtime;
  } catch (error: unknown) {
    await runtime.close();
    throw error;
  }
}

async function allocatePort(): Promise<number> {
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
