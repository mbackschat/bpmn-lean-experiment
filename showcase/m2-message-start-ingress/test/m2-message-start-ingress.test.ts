/** Live Product 2 evidence for exact-version one-shot Message Start ingress. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  MessageStartPublicationStatus,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import {
  createPlatformServer,
  readPlatformServerConfig,
} from "@bpmn-lean/platform-server";
import type {
  PlatformServerRuntime,
} from "@bpmn-lean/platform-server";
import { ProcessClient, ResultKind, workflowType } from "@bpmn-lean/temporal-host/client";
import { replayHistory } from "@bpmn-lean/temporal-host/worker";

import { showcaseEngineDeploymentEnvironment } from "../../engine-deployment.ts";
import {
  ShowcaseWorker,
  createCachedLocalEnvironment,
  environmentNamespace,
  noEffects,
  withDeadline,
} from "../src/host-worker.ts";

import {
  beginDiscardedPublication,
  deployDefinition,
  getMessageStartPublication,
  getMissingMessageStartPublication,
  putMessageStartPublication,
} from "./http-support.ts";
import type {
  CapturedJson,
} from "./http-support.ts";
import {
  assertCompletedMessageStartHistory,
  assertWorkerAbsentHistory,
  listScheduleIds,
  listWorkflowExecutions,
  processHandle,
  waitForOnlyNewWorkflow,
  waitForOpenUserTask,
  workflowStartArguments,
} from "./temporal-support.ts";
import type { TemporalHistory } from "./temporal-support.ts";

const profileId = "bpmn-2.0.2";
const taskQueue = "bpmn-m2-message-start-ingress";
const operationDeadlineMs = 10_000;
const environmentStartupDeadlineMs = 40_000;
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);
const sourceUrl = new URL(
  "../../../scenarios/message-start-event/process.bpmn",
  import.meta.url,
);

test("M2 publishes one exact Message Start after response loss and replays", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-m2-message-ingress-"));
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: `bpmn-m2-message-ingress-service-${process.pid}`,
      downloadDirectory: temporalCacheDirectory,
    }),
    environmentStartupDeadlineMs,
    "M2 Message Start Temporal environment startup",
  );
  // No Worker polls until the publication has started its Workflow, so its history shows a start no Worker took yet.
  const namespace = environmentNamespace(environment);
  const client = environment.client;
  let platform: PlatformServerRuntime | undefined;
  let replacementWorker: ShowcaseWorker | undefined;

  try {
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      namespace,
    );
    const token = `${Date.now()}_${process.pid}`;
    const processId = `Process_MessageStart_M2_${token}`;
    const versionOneOperation = `Operation_ReceiveApprovalRequest_V1_${token}`;
    const versionTwoOperation = `Operation_ReceiveApprovalRequest_V2_${token}`;
    const versionOneTask = `Review Message Start version 1 ${token}`;
    const versionTwoTask = `Review Message Start version 2 ${token}`;
    const template = await readFile(sourceUrl, "utf8");
    const publicCaptures: CapturedJson<unknown>[] = [];
    const versionOne = await deployDefinition(origin, {
      bytes: Buffer.from(sourceRevision(
        template,
        processId,
        versionOneOperation,
        versionOneTask,
        "one",
      )),
      sourceId: `message-start-version-1-${token}.bpmn`,
      semanticProfile: profileId,
    });
    publicCaptures.push(versionOne);
    assert.equal(versionOne.value.version, 1);
    assert.deepEqual(versionOne.value.startCapabilities.timerStarts, []);
    assert.deepEqual(versionOne.value.startCapabilities.messageStarts, [{
      startEventId: "MessageStart_ApprovalRequest",
      channel: {
        kind: "operationMessage",
        interfaceId: "Interface_ProcessMessages",
        interfaceOperationId: versionOneOperation,
        messageId: "Message_ApprovalRequest",
      },
    }]);
    const messageStart = versionOne.value.startCapabilities.messageStarts[0];
    assert.ok(messageStart !== undefined);

    const versionTwo = await deployDefinition(origin, {
      bytes: Buffer.from(sourceRevision(
        template,
        processId,
        versionTwoOperation,
        versionTwoTask,
        "two",
      )),
      sourceId: `message-start-version-2-${token}.bpmn`,
      semanticProfile: profileId,
    });
    publicCaptures.push(versionTwo);
    assert.equal(versionTwo.value.version, 2);
    assert.notEqual(versionTwo.value.source.sha256, versionOne.value.source.sha256);
    assert.equal(
      versionTwo.value.startCapabilities.messageStarts[0]?.channel.interfaceOperationId,
      versionTwoOperation,
    );
    const versionTwoMessageStart = versionTwo.value.startCapabilities.messageStarts[0];
    assert.ok(versionTwoMessageStart !== undefined);

    const workflowsBefore = await listWorkflowExecutions(client);
    const schedulesBefore = await listScheduleIds(client);
    assert.deepEqual(schedulesBefore, []);
    const publicationId = `publication-${token}`;
    const abort = new AbortController();
    const discardedResponse = beginDiscardedPublication(
      origin,
      publicationId,
      versionOne.value,
      messageStart,
      abort.signal,
    );
    const execution = await waitForOnlyNewWorkflow(client, workflowsBefore);
    abort.abort();
    await discardedResponse.catch((error: unknown) => {
      if (!(error instanceof Error) || error.name !== "AbortError") {
        throw error;
      }
    });
    await delay(50);
    assert.equal(execution.type, workflowType);
    assert.equal(execution.taskQueue, taskQueue);
    assert.deepEqual(await listScheduleIds(client), schedulesBefore);
    assert.equal((await listWorkflowExecutions(client)).length, workflowsBefore.length + 1);

    const handle = processHandle(client.workflow, execution);
    const absentHistory = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "published Process history while Worker is absent",
    ) as TemporalHistory;
    assertWorkerAbsentHistory(absentHistory);
    const startArguments = workflowStartArguments(absentHistory);
    assertVersionStart(startArguments, execution.memo, versionOne.value.source.sha256, versionOneOperation);
    assertNoSemanticInstanceFanout([startArguments]);

    await withDeadline(platform.close(), operationDeadlineMs, "response-loss platform close");
    platform = undefined;
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      namespace,
    );
    const recovered = await getMessageStartPublication(origin, publicationId);
    publicCaptures.push(recovered);
    assert.equal(recovered.value.status, MessageStartPublicationStatus.Accepted);
    assert.ok(recovered.value.instance !== null);
    assert.equal(recovered.value.definition.version, 1);
    assert.equal(recovered.value.instance.definition.version, 1);
    assert.equal(recovered.value.instance.definition.source.sha256, versionOne.value.source.sha256);
    const retry = await putMessageStartPublication(
      origin,
      publicationId,
      versionOne.value,
      messageStart,
    );
    publicCaptures.push(retry);
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.value, recovered.value);
    assert.equal((await listWorkflowExecutions(client)).length, workflowsBefore.length + 1);

    replacementWorker = await startWorker(environment);
    const processes = new ProcessClient(client, taskQueue);
    const task = await waitForOpenUserTask(handle, versionOneTask);
    assert.notEqual(task.name, versionTwoTask);
    assert.equal(task.id.processInstanceId, recovered.value.instance.processInstanceId);
    const completion = {
      kind: "command",
      commandId: `complete-message-start-${token}`,
      occurrence: task.id,
      action: { kind: "completeUserTask", values: [] },
    } as const;
    const command = await withDeadline(
      processes.command(execution.workflowId, completion),
      operationDeadlineMs,
      "Message Start User Task completion",
    );
    assert.equal(command.outcome, "committed");
    const terminal = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "published Process completion",
    );
    assert.equal(terminal.kind, ResultKind.Ended);
    assert.equal(terminal.kind === ResultKind.Ended ? terminal.status : null, "completed");
    assert.deepEqual(requireRecord(execution.memo, "start memo").definition, {
      ref: { definitionKey: processId, version: 1, sha256: versionOne.value.source.sha256 },
      profile: profileId,
      sourceOverlay: null,
    });
    // Under durable scheduling the host stamps every input with Workflow epoch time (packages/temporal-host/src/workflow-host.ts).
    const { logicalTimeMs, ...terminalState } = requireRecord(await processes.observation(execution.workflowId), "terminal state");
    assert.ok(Number.isSafeInteger(logicalTimeMs) && (logicalTimeMs as number) > 0);
    assert.deepEqual(terminalState, {
      kind: "state",
      instanceId: recovered.value.instance.processInstanceId,
      status: "completed",
      variables: [],
      scopes: [],
      openWaits: [],
    });
    const completedHistory = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "published Process completed history",
    ) as TemporalHistory;
    assertCompletedMessageStartHistory(completedHistory);

    await replacementWorker.shutdown();
    replacementWorker = undefined;
    await withDeadline(
      replayHistory(completedHistory, execution.workflowId),
      30_000,
      "published Process history replay",
    );

    const versionTwoReferencePublicationId = `version-two-reference-${token}`;
    const referenceWorkflowsBefore = await listWorkflowExecutions(client);
    const versionTwoReference = await putMessageStartPublication(
      origin,
      versionTwoReferencePublicationId,
      versionTwo.value,
      versionTwoMessageStart,
    );
    publicCaptures.push(versionTwoReference);
    const versionTwoExecution = await waitForOnlyNewWorkflow(
      client,
      referenceWorkflowsBefore,
    );
    const versionTwoHistory = await withDeadline(
      processHandle(client.workflow, versionTwoExecution).fetchHistory(),
      operationDeadlineMs,
      "exact version-2 reference Workflow history",
    ) as TemporalHistory;
    const versionTwoArguments = workflowStartArguments(versionTwoHistory);
    assertVersionStart(
      versionTwoArguments,
      versionTwoExecution.memo,
      versionTwo.value.source.sha256,
      versionTwoOperation,
    );
    assertNoSemanticInstanceFanout([startArguments, versionTwoArguments]);

    const fanoutWorkflowId = `direct-message-start-fanout-mutation-${token}`;
    const fanoutWorkflowsBefore = await listWorkflowExecutions(client);
    const directSchedulesBefore = await listScheduleIds(client);
    const fanoutArguments = fanoutStartArguments(
      versionTwoArguments,
      recovered.value.instance.processInstanceId,
      `fanout-message-start-${token}`,
    );
    await withDeadline(
      client.workflow.start(workflowType, {
        taskQueue,
        workflowId: fanoutWorkflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [fanoutArguments],
      }),
      operationDeadlineMs,
      "additional matching-version Workflow-start mutation",
    );
    const fanoutExecution = await waitForOnlyNewWorkflow(
      client,
      fanoutWorkflowsBefore,
    );
    assert.equal(fanoutExecution.workflowId, fanoutWorkflowId);
    assert.deepEqual(await listScheduleIds(client), directSchedulesBefore);
    const fanoutHistory = await withDeadline(
      processHandle(client.workflow, fanoutExecution).fetchHistory(),
      operationDeadlineMs,
      "additional matching-version Workflow history",
    ) as TemporalHistory;
    const recordedFanoutArguments = workflowStartArguments(fanoutHistory);
    assert.deepEqual(recordedFanoutArguments, fanoutArguments);
    assert.throws(
      () => assertNoSemanticInstanceFanout([startArguments, recordedFanoutArguments]),
      /semantic Process instance fanout/u,
    );

    const directPublicationId = `direct-start-${token}`;
    const directWorkflowId = `direct-message-start-mutation-${token}`;
    const directWorkflowsBefore = await listWorkflowExecutions(client);
    await withDeadline(
      client.workflow.start(workflowType, {
        taskQueue,
        workflowId: directWorkflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [directStartArguments(startArguments, directPublicationId)],
      }),
      operationDeadlineMs,
      "publication-linked direct Workflow-start mutation",
    );
    const directExecution = await waitForOnlyNewWorkflow(
      client,
      directWorkflowsBefore,
    );
    assert.equal(directExecution.workflowId, directWorkflowId);
    const missing = await getMissingMessageStartPublication(origin, directPublicationId);
    publicCaptures.push(missing);
    assert.equal(missing.value.error.code, PublicApiErrorCode.NotFound);

    assertPublicResponsesHidePrivateFacts(publicCaptures, [
      execution.workflowId,
      execution.runId,
      execution.taskQueue,
      versionTwoExecution.workflowId,
      versionTwoExecution.runId,
      fanoutExecution.workflowId,
      fanoutExecution.runId,
      directExecution.workflowId,
      directExecution.runId,
      completion.commandId,
      // The memo's definition identity and instance identity are public facts; its start intent is not.
      ...stringLeaves(requireRecord(execution.memo, "start memo").intent),
    ]);
  } finally {
    const cleanupFailures: unknown[] = [];
    for (const cleanup of [
      replacementWorker === undefined ? undefined : () => replacementWorker?.shutdown(),
      platform === undefined ? undefined : () => platform?.close(),
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
      throw new AggregateError(cleanupFailures, "M2 Message Start ingress cleanup failed");
    }
  }
});

async function startWorker(
  environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>,
): Promise<ShowcaseWorker> {
  return await withDeadline(
    ShowcaseWorker.start(environment, {
      taskQueue,
      identity: `bpmn-m2-message-ingress-replacement-${process.pid}`,
      effects: noEffects,
    }),
    20_000,
    "replacement host Worker startup",
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
    ...readPlatformServerConfig(showcaseEngineDeploymentEnvironment()),
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
    assert.equal(await withDeadline(runtime.listen(), operationDeadlineMs, "platform listen"), origin);
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

function sourceRevision(
  template: string,
  processId: string,
  operationId: string,
  taskName: string,
  revision: string,
): string {
  return template
    .replaceAll("Definitions_MessageStart", `Definitions_${processId}`)
    .replaceAll("Process_MessageStart", processId)
    .replaceAll("Operation_ReceiveApprovalRequest", operationId)
    .replace('name="Message start then user task"', `name="M2 Message Start ${revision}"`)
    .replace('name="Approve"', `name="${taskName}"`)
    .replace(
      "https://bpmn-lean.local/tests/message-start",
      `https://third-party.invalid/${processId}/${revision}`,
    );
}

/** The start stimulus a host Workflow's start arguments carry, in the scenario contract's form. */
function startStimulus(args: Record<string, unknown>): Record<string, unknown> {
  assert.equal(args.kind, "start");
  const start = requireRecord(args.start, "Message Start stimulus");
  assert.equal(start.kind, "start");
  return start;
}

/** The definition the start memo names (`packages/engine-api/src/start-dispatch.ts`) and the Message the start carries. */
function assertVersionStart(
  args: Record<string, unknown>,
  memo: unknown,
  sourceSha256: string,
  interfaceOperationId: string,
): void {
  const trigger = requireRecord(startStimulus(args).trigger, "Message Start trigger");
  assert.equal(trigger.kind, "message");
  const channel = requireRecord(trigger.channel, "Message Start channel");
  assert.equal(channel.interfaceOperationId, interfaceOperationId);
  const definition = requireRecord(requireRecord(memo, "start memo").definition, "start memo definition");
  assert.equal(requireRecord(definition.ref, "start memo definition ref").sha256, sourceSha256);
}

function assertNoSemanticInstanceFanout(starts: readonly Record<string, unknown>[]): void {
  const instances = new Set<string>();
  for (const args of starts) {
    const start = startStimulus(args);
    const instanceId = start.instanceId;
    if (typeof instanceId !== "string" || instanceId.length === 0) {
      throw new TypeError("Message Start stimulus needs a semantic Process instance identity");
    }
    if (instances.has(instanceId)) {
      throw new TypeError(`semantic Process instance fanout: ${instanceId}`);
    }
    instances.add(instanceId);
  }
}

function fanoutStartArguments(
  args: Record<string, unknown>,
  instanceId: string,
  commandId: string,
): Record<string, unknown> {
  return { ...args, start: { ...startStimulus(args), commandId, instanceId } };
}

function directStartArguments(args: Record<string, unknown>, identity: string): Record<string, unknown> {
  return fanoutStartArguments(args, `${identity}-instance`, `${identity}-command`);
}

function assertPublicResponsesHidePrivateFacts(
  captures: readonly CapturedJson<unknown>[],
  privateValues: readonly string[],
): void {
  const forbiddenKeys = new Set([
    "Memo",
    "checked",
    "checkedGraph",
    "checkedProcess",
    "commandId",
    "firstExecutionRunId",
    "memo",
    "program",
    "runId",
    "semanticProcess",
    "taskQueue",
    "workflowId",
  ]);
  for (const capture of captures) {
    assertNoForbiddenKeys(capture.value, forbiddenKeys, "$public");
    for (const privateValue of privateValues.filter((value) => value.length > 0)) {
      assert.equal(
        capture.text.includes(privateValue),
        false,
        `public response disclosed private value ${privateValue}`,
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
    assert.equal(forbidden.has(key), false, `${path}.${key} is private`);
    assertNoForbiddenKeys(candidate, forbidden, `${path}.${key}`);
  }
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringLeaves);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.values(value).flatMap(stringLeaves);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
