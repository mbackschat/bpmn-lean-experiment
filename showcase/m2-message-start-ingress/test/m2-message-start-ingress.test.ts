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
} from "@bpmn-lean/platform-server";
import type {
  PlatformServerRuntime,
} from "@bpmn-lean/platform-server";
import {
  ExternalTemporalRuntime,
  ProcessCommandResultKind,
  TemporalScenarioRunner,
  bpmnProcessWorkflowType,
  createCachedLocalEnvironment,
  createHostEffectActivities,
  isCompletedProcessReceipt,
  submitUserTaskCompletionAtWorkflowId,
  withDeadline,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

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

const profileId = "bpmn-2.0.2-message-start-event-draft";
const taskQueue = "bpmn-m2-message-start-ingress";
const operationDeadlineMs = 10_000;
const environmentStartupDeadlineMs = 40_000;
type UserTaskCompletion = Parameters<
  typeof submitUserTaskCompletionAtWorkflowId
>[3];
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
  let platform: PlatformServerRuntime | undefined;
  let replacementWorker: ExternalTemporalRuntime | undefined;
  let replayRunner: TemporalScenarioRunner | undefined;

  try {
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      environment.namespace ?? "default",
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

    const workflowsBefore = await listWorkflowExecutions(environment.client);
    const schedulesBefore = await listScheduleIds(environment.client);
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
    const execution = await waitForOnlyNewWorkflow(environment.client, workflowsBefore);
    abort.abort();
    await discardedResponse.catch((error: unknown) => {
      if (!(error instanceof Error) || error.name !== "AbortError") {
        throw error;
      }
    });
    await delay(50);
    assert.equal(execution.type, bpmnProcessWorkflowType);
    assert.equal(execution.taskQueue, taskQueue);
    assert.deepEqual(await listScheduleIds(environment.client), schedulesBefore);
    assert.equal((await listWorkflowExecutions(environment.client)).length, workflowsBefore.length + 1);

    const handle = processHandle(environment.client.workflow, execution);
    const absentHistory = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "published Process history while Worker is absent",
    ) as TemporalHistory;
    assertWorkerAbsentHistory(absentHistory);
    const startArguments = workflowStartArguments(absentHistory);
    assertVersionStart(startArguments, versionOne.value.source.sha256, versionOneOperation);
    assertNoSemanticInstanceFanout([startArguments]);

    await withDeadline(platform.close(), operationDeadlineMs, "response-loss platform close");
    platform = undefined;
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      environment.namespace ?? "default",
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
    assert.equal((await listWorkflowExecutions(environment.client)).length, workflowsBefore.length + 1);

    replacementWorker = await startWorker(
      environment.address,
      environment.namespace ?? "default",
    );
    const task = await waitForOpenUserTask(handle, versionOneTask);
    assert.notEqual(task.name, versionTwoTask);
    assert.equal(task.id.processInstanceId, recovered.value.instance.processInstanceId);
    const completion = {
      kind: "completeUserTaskInstance" as UserTaskCompletion["kind"],
      commandId: `complete-message-start-${token}`,
      taskId: task.id,
      submittedValues: [],
    } as const satisfies UserTaskCompletion;
    const command = await submitUserTaskCompletionAtWorkflowId(
      replacementWorker.workflowClient,
      execution.workflowId,
      recovered.value.instance.processInstanceId,
      completion,
    );
    assert.equal(command.kind, ProcessCommandResultKind.Semantic);
    if (command.kind !== ProcessCommandResultKind.Semantic) {
      throw new TypeError("Message Start completion did not return a semantic command result");
    }
    assert.equal(command.outcome, "committed");
    const receipt = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "published Process completion",
    );
    assert.equal(isCompletedProcessReceipt(receipt), true);
    if (!isCompletedProcessReceipt(receipt)) {
      throw new TypeError("published Process returned a malformed completion receipt");
    }
    assert.deepEqual(receipt.definition, {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: profileId,
      sourceId: versionOne.value.source.id,
      sourceSha256: versionOne.value.source.sha256,
      sourceOverlay: null,
    });
    assert.equal(receipt.processId, processId);
    assert.equal(receipt.processInstanceId, recovered.value.instance.processInstanceId);
    assert.notEqual(receipt.definition.sourceSha256, versionTwo.value.source.sha256);
    assert.deepEqual(receipt.finalState, {
      kind: "state",
      instanceId: recovered.value.instance.processInstanceId,
      status: "completed",
      activeWaits: [],
      openUserTasks: [],
      openMessageSubscriptions: [],
      openTimers: [],
      openEffects: [],
      variables: [],
      enabledInteractions: [],
      logicalTimeMs: 0,
    });
    const completedHistory = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "published Process completed history",
    ) as TemporalHistory;
    assertCompletedMessageStartHistory(completedHistory);

    await replacementWorker.shutdown();
    replacementWorker = undefined;
    replayRunner = await withDeadline(
      TemporalScenarioRunner.create({ downloadDirectory: temporalCacheDirectory }),
      30_000,
      "M2 Message Start replay runner startup",
    );
    await withDeadline(
      replayRunner.replayHistory(completedHistory, execution.workflowId),
      operationDeadlineMs,
      "published Process history replay",
    );
    await replayRunner.shutdown();
    replayRunner = undefined;

    const versionTwoReferencePublicationId = `version-two-reference-${token}`;
    const referenceWorkflowsBefore = await listWorkflowExecutions(environment.client);
    const versionTwoReference = await putMessageStartPublication(
      origin,
      versionTwoReferencePublicationId,
      versionTwo.value,
      versionTwoMessageStart,
    );
    publicCaptures.push(versionTwoReference);
    const versionTwoExecution = await waitForOnlyNewWorkflow(
      environment.client,
      referenceWorkflowsBefore,
    );
    const versionTwoHistory = await withDeadline(
      processHandle(environment.client.workflow, versionTwoExecution).fetchHistory(),
      operationDeadlineMs,
      "exact version-2 reference Workflow history",
    ) as TemporalHistory;
    const versionTwoArguments = workflowStartArguments(versionTwoHistory);
    assertVersionStart(
      versionTwoArguments,
      versionTwo.value.source.sha256,
      versionTwoOperation,
    );
    assertNoSemanticInstanceFanout([startArguments, versionTwoArguments]);

    const fanoutWorkflowId = `direct-message-start-fanout-mutation-${token}`;
    const fanoutWorkflowsBefore = await listWorkflowExecutions(environment.client);
    const directSchedulesBefore = await listScheduleIds(environment.client);
    const fanoutStimulus = fanoutStartInput(
      versionTwoArguments[0],
      recovered.value.instance.processInstanceId,
      `fanout-message-start-${token}`,
    );
    await withDeadline(
      environment.client.workflow.start(bpmnProcessWorkflowType, {
        taskQueue,
        workflowId: fanoutWorkflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [fanoutStimulus, versionTwoArguments[1]],
      }),
      operationDeadlineMs,
      "additional matching-version Workflow-start mutation",
    );
    const fanoutExecution = await waitForOnlyNewWorkflow(
      environment.client,
      fanoutWorkflowsBefore,
    );
    assert.equal(fanoutExecution.workflowId, fanoutWorkflowId);
    assert.deepEqual(await listScheduleIds(environment.client), directSchedulesBefore);
    const fanoutHistory = await withDeadline(
      processHandle(environment.client.workflow, fanoutExecution).fetchHistory(),
      operationDeadlineMs,
      "additional matching-version Workflow history",
    ) as TemporalHistory;
    const recordedFanoutArguments = workflowStartArguments(fanoutHistory);
    assert.deepEqual(recordedFanoutArguments, [fanoutStimulus, versionTwoArguments[1]]);
    assert.throws(
      () => assertNoSemanticInstanceFanout([startArguments, recordedFanoutArguments]),
      /semantic Process instance fanout/u,
    );

    const directPublicationId = `direct-start-${token}`;
    const directWorkflowId = `direct-message-start-mutation-${token}`;
    const directWorkflowsBefore = await listWorkflowExecutions(environment.client);
    await withDeadline(
      environment.client.workflow.start(bpmnProcessWorkflowType, {
        taskQueue,
        workflowId: directWorkflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [directStartInput(startArguments[0], directPublicationId), startArguments[1]],
      }),
      operationDeadlineMs,
      "publication-linked direct Workflow-start mutation",
    );
    const directExecution = await waitForOnlyNewWorkflow(
      environment.client,
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
      ...stringLeaves(execution.memo),
    ]);
  } finally {
    const cleanupFailures: unknown[] = [];
    for (const cleanup of [
      replayRunner === undefined ? undefined : () => replayRunner?.shutdown(),
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
  address: string,
  namespace: string,
): Promise<ExternalTemporalRuntime> {
  return await withDeadline(
    ExternalTemporalRuntime.connect({
      address,
      namespace,
      taskQueue,
      identity: `bpmn-m2-message-ingress-replacement-${process.pid}`,
    }, createHostEffectActivities([])),
    20_000,
    "replacement production Worker startup",
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

function assertVersionStart(
  args: readonly [unknown, unknown],
  sourceSha256: string,
  interfaceOperationId: string,
): void {
  const start = requireRecord(args[0], "Message Start stimulus");
  const channel = requireRecord(start.channel, "Message Start channel");
  assert.equal(start.kind, "triggerMessageStart");
  assert.equal(channel.interfaceOperationId, interfaceOperationId);
  const program = requireRecord(args[1], "Message Start semantic program");
  const identity = requireRecord(program.identity, "Message Start semantic program identity");
  assert.equal(identity.sourceSha256, sourceSha256);
}

function assertNoSemanticInstanceFanout(
  starts: readonly (readonly [unknown, unknown])[],
): void {
  const instances = new Set<string>();
  for (const [stimulus] of starts) {
    const start = requireRecord(stimulus, "Message Start stimulus");
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

function fanoutStartInput(
  value: unknown,
  instanceId: string,
  commandId: string,
): Record<string, unknown> {
  const start = requireRecord(value, "Message Start stimulus");
  assert.equal(start.kind, "triggerMessageStart");
  return { ...start, commandId, instanceId };
}

function directStartInput(value: unknown, identity: string): Record<string, unknown> {
  return fanoutStartInput(value, `${identity}-instance`, `${identity}-command`);
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
