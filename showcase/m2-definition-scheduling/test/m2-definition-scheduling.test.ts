/** Live Product 2 evidence for exact-version one-shot Timer Start scheduling. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

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
  deleteDefinitionSchedule,
  deleteDefinitionScheduleExpectingConflict,
  deployDefinition,
  getDefinitionSchedule,
  listDefinitionSchedules,
  putDefinitionSchedule,
} from "./http-support.ts";
import type {
  CapturedJson,
} from "./http-support.ts";
import {
  assertCompletedTimerStartHistory,
  assertWorkerAbsentHistory,
  listScheduleIds,
  listWorkflowIds,
  nextWholeSecond,
  processHandle,
  requireOnlyNewIdentity,
  waitForExactScheduleAction,
  waitForOpenUserTask,
  waitForScheduleCleanup,
} from "./temporal-support.ts";

const profileId = "bpmn-2.0.2-timer-start-event-draft";
const taskQueue = "bpmn-m2-definition-scheduling";
const operationDeadlineMs = 10_000;
const environmentStartupDeadlineMs = 40_000;
type UserTaskCompletion = Parameters<
  typeof submitUserTaskCompletionAtWorkflowId
>[3];
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);
const sourceUrl = new URL(
  "../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);

test("M2 schedules exact version 1, decides cancellation races, and replays", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-m2-scheduling-"));
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: `bpmn-m2-scheduling-service-${process.pid}`,
      downloadDirectory: temporalCacheDirectory,
    }),
    environmentStartupDeadlineMs,
    "M2 Temporal environment startup",
  );
  let platform: PlatformServerRuntime | undefined;
  let initialWorker: ExternalTemporalRuntime | undefined;
  let replacementWorker: ExternalTemporalRuntime | undefined;
  let replayRunner: TemporalScenarioRunner | undefined;

  try {
    initialWorker = await startWorker(environment.address, environment.namespace ?? "default", "initial");
    await delay(100);
    await initialWorker.shutdown();
    initialWorker = undefined;
    await delay(100);

    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      environment.namespace ?? "default",
    );
    const template = await readFile(sourceUrl, "utf8");
    const versionOneBytes = Buffer.from(
      template.replace('name="Review"', 'name="Review version 1"'),
      "utf8",
    );
    const versionTwoBytes = Buffer.from(
      template.replace('name="Review"', 'name="Review version 2"'),
      "utf8",
    );
    const publicCaptures: CapturedJson<unknown>[] = [];
    const versionOne = await deployDefinition(origin, {
      bytes: versionOneBytes,
      sourceId: "timer-start-version-1.bpmn",
      semanticProfile: profileId,
    });
    assert.equal(versionOne.value.version, 1);
    assert.deepEqual(versionOne.value.startCapabilities.messageStarts, []);
    assert.deepEqual(versionOne.value.startCapabilities.timerStarts, [{
      startEventId: "TimerStart_PT1S",
      durationMs: 1_000,
    }]);

    const scheduleIdsBefore = await listScheduleIds(environment.client);
    const primaryScheduleId = `schedule-version-1-${process.pid}`;
    const primaryPut = await putDefinitionSchedule(
      origin,
      versionOne.value,
      primaryScheduleId,
      nextWholeSecond(6),
    );
    publicCaptures.push(primaryPut);
    assert.equal(primaryPut.status, 201);
    assert.equal(primaryPut.value.status, "scheduled");
    assert.equal(primaryPut.value.definition.version, 1);
    assert.equal(
      Date.parse(primaryPut.value.dueAt) - Date.parse(primaryPut.value.activationAt),
      1_000,
    );
    const privateScheduleId = requireOnlyNewIdentity(
      scheduleIdsBefore,
      await listScheduleIds(environment.client),
      "version-1 schedule",
    );

    const versionTwo = await deployDefinition(origin, {
      bytes: versionTwoBytes,
      sourceId: "timer-start-version-2.bpmn",
      semanticProfile: profileId,
    });
    assert.equal(versionTwo.value.version, 2);
    assert.notEqual(versionTwo.value.source.sha256, versionOne.value.source.sha256);
    assert.deepEqual(
      (await listDefinitionSchedules(origin, versionTwo.value)).value.schedules,
      [],
    );

    await platform.close();
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      environment.namespace ?? "default",
    );
    const afterRestart = await getDefinitionSchedule(
      origin,
      versionOne.value,
      primaryScheduleId,
    );
    publicCaptures.push(afterRestart);
    assert.equal(afterRestart.value.status, "scheduled");
    assert.equal(afterRestart.value.definition.version, 1);

    const action = await waitForExactScheduleAction(
      environment.client,
      privateScheduleId,
      primaryPut.value.dueAt,
    );
    assert.equal(action.description.action.taskQueue, taskQueue);
    assertProgramSource(action.actionArgs[1], versionOne.value.source.sha256);
    assert.notEqual(action.workflowId, action.description.action.workflowId);
    const absentHistory = await withDeadline(
      environment.client.workflow
        .getHandle(action.workflowId, action.firstExecutionRunId)
        .fetchHistory(),
      operationDeadlineMs,
      "scheduled Process history while Worker is absent",
    ) as TemporalHistory;
    assertWorkerAbsentHistory(absentHistory);

    const actionWins = await deleteDefinitionScheduleExpectingConflict(
      origin,
      versionOne.value,
      primaryScheduleId,
    );
    publicCaptures.push(actionWins);
    assert.equal(actionWins.value.error.code, "conflict");
    const started = await getDefinitionSchedule(
      origin,
      versionOne.value,
      primaryScheduleId,
    );
    publicCaptures.push(started);
    assert.equal(started.value.status, "started");
    assert.ok(started.value.instance !== null);
    assert.equal(started.value.instance.definition.version, 1);
    assert.equal(started.value.instance.definition.source.sha256, versionOne.value.source.sha256);
    assert.equal(started.value.scheduleId, primaryScheduleId);
    const versionOneList = await listDefinitionSchedules(origin, versionOne.value);
    publicCaptures.push(versionOneList);
    assert.deepEqual(versionOneList.value.schedules, [started.value]);
    await waitForScheduleCleanup(environment.client, privateScheduleId);

    replacementWorker = await startWorker(
      environment.address,
      environment.namespace ?? "default",
      "replacement",
    );
    const handle = replacementWorker.workflowClient.getHandle(
      action.workflowId,
      action.firstExecutionRunId,
    );
    const task = await waitForOpenUserTask(
      processHandle(
        environment.client.workflow,
        action.workflowId,
        action.firstExecutionRunId,
      ),
      "Review version 1",
    );
    assert.equal(task.id.processInstanceId, started.value.instance.processInstanceId);
    assert.notEqual(task.name, "Review version 2");
    const completion = {
      kind: "completeUserTaskInstance" as UserTaskCompletion["kind"],
      commandId: `complete-scheduled-version-1-${process.pid}`,
      taskId: task.id,
      submittedValues: [],
    } as const satisfies UserTaskCompletion;
    const command = await submitUserTaskCompletionAtWorkflowId(
      replacementWorker.workflowClient,
      action.workflowId,
      started.value.instance.processInstanceId,
      completion,
    );
    assert.equal(command.kind, ProcessCommandResultKind.Semantic);
    if (command.kind !== ProcessCommandResultKind.Semantic) {
      throw new TypeError("scheduled Process completion did not return a semantic command result");
    }
    assert.equal(command.outcome, "committed");
    const receipt = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "scheduled version-1 Process completion",
    );
    assert.equal(isCompletedProcessReceipt(receipt), true);
    if (!isCompletedProcessReceipt(receipt)) {
      throw new TypeError("scheduled Process returned a malformed completion receipt");
    }
    assert.equal(receipt.processInstanceId, started.value.instance.processInstanceId);
    assert.equal(receipt.definition.sourceSha256, versionOne.value.source.sha256);
    assert.notEqual(receipt.definition.sourceSha256, versionTwo.value.source.sha256);
    assert.equal(receipt.finalState.status, "completed");
    const completedHistory = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "scheduled version-1 Process history",
    ) as TemporalHistory;
    assertCompletedTimerStartHistory(completedHistory);

    await replacementWorker.shutdown();
    replacementWorker = undefined;
    replayRunner = await withDeadline(
      TemporalScenarioRunner.create({ downloadDirectory: temporalCacheDirectory }),
      30_000,
      "M2 replay runner startup",
    );
    await withDeadline(
      replayRunner.replayHistory(completedHistory, action.workflowId),
      operationDeadlineMs,
      "scheduled version-1 history replay",
    );
    await replayRunner.shutdown();
    replayRunner = undefined;

    const schedulesBeforeDirectStart = await listScheduleIds(environment.client);
    const directInput = directWorkflowInput(action.actionArgs[0]);
    const directWorkflowId = `direct-start-mutation-${process.pid}`;
    await withDeadline(
      environment.client.workflow.start(bpmnProcessWorkflowType, {
        taskQueue,
        workflowId: directWorkflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [directInput, action.actionArgs[1]],
      }),
      operationDeadlineMs,
      "direct Workflow-start mutation",
    );
    assert.deepEqual(
      await listScheduleIds(environment.client),
      schedulesBeforeDirectStart,
      "a direct Workflow start must create no Schedule action",
    );
    assert.deepEqual(
      (await listDefinitionSchedules(origin, versionTwo.value)).value.schedules,
      [],
      "latest version lookup cannot satisfy the version-1 schedule",
    );

    const workflowsBeforeCancellation = await listWorkflowIds(environment.client);
    const cancellationScheduleId = `cancel-before-due-${process.pid}`;
    const cancellationSchedulesBefore = await listScheduleIds(environment.client);
    const cancellationPut = await putDefinitionSchedule(
      origin,
      versionOne.value,
      cancellationScheduleId,
      nextWholeSecond(2),
    );
    publicCaptures.push(cancellationPut);
    assert.equal(cancellationPut.value.status, "scheduled");
    const cancellationPrivateId = requireOnlyNewIdentity(
      cancellationSchedulesBefore,
      await listScheduleIds(environment.client),
      "cancellation schedule",
    );
    const cancelled = await deleteDefinitionSchedule(
      origin,
      versionOne.value,
      cancellationScheduleId,
    );
    publicCaptures.push(cancelled);
    assert.equal(cancelled.value.status, "cancelled");
    assert.equal(cancelled.value.instance, null);
    await waitForScheduleCleanup(environment.client, cancellationPrivateId);

    await platform.close();
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      environment.namespace ?? "default",
    );
    const repeatedCancellation = await deleteDefinitionSchedule(
      origin,
      versionOne.value,
      cancellationScheduleId,
    );
    publicCaptures.push(repeatedCancellation);
    assert.deepEqual(repeatedCancellation.value, cancelled.value);
    const waitPastCancellationDue = Date.parse(cancellationPut.value.dueAt) - Date.now() + 250;
    if (waitPastCancellationDue > 0) {
      await delay(waitPastCancellationDue);
    }
    assert.deepEqual(
      await listWorkflowIds(environment.client),
      workflowsBeforeCancellation,
      "a durably cancelled Schedule must start no Workflow",
    );

    assertPublicResponsesHidePrivateIdentities(publicCaptures, [
      privateScheduleId,
      cancellationPrivateId,
      action.workflowId,
      action.firstExecutionRunId,
      action.description.action.workflowId,
    ]);
  } finally {
    const cleanupFailures: unknown[] = [];
    for (const cleanup of [
      replayRunner === undefined ? undefined : () => replayRunner?.shutdown(),
      replacementWorker === undefined ? undefined : () => replacementWorker?.shutdown(),
      initialWorker === undefined ? undefined : () => initialWorker?.shutdown(),
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
      throw new AggregateError(cleanupFailures, "M2 scheduling cleanup failed");
    }
  }
});

async function startWorker(
  address: string,
  namespace: string,
  role: string,
): Promise<ExternalTemporalRuntime> {
  return await withDeadline(
    ExternalTemporalRuntime.connect({
      address,
      namespace,
      taskQueue,
      identity: `bpmn-m2-scheduling-${role}-${process.pid}`,
    }, createHostEffectActivities([])),
    20_000,
    `${role} production Worker startup`,
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

function assertProgramSource(value: unknown, sourceSha256: string): void {
  const program = requireRecord(value, "Schedule semantic program");
  const identity = requireRecord(program.identity, "Schedule semantic program identity");
  assert.equal(identity.sourceSha256, sourceSha256);
}

function directWorkflowInput(value: unknown): Record<string, unknown> {
  const start = requireRecord(value, "Schedule start stimulus");
  assert.equal(start.kind, "triggerTimerStart");
  return {
    ...start,
    commandId: `direct-start-mutation-command-${process.pid}`,
    instanceId: `DirectStartMutation_${process.pid}`,
  };
}

function assertPublicResponsesHidePrivateIdentities(
  captures: readonly CapturedJson<unknown>[],
  privateIdentities: readonly string[],
): void {
  const forbiddenKeys = new Set([
    "configuredWorkflowId",
    "configuredWorkflowIdBase",
    "firstExecutionRunId",
    "hostScheduleId",
    "runId",
    "temporalScheduleId",
    "workflowId",
  ]);
  for (const capture of captures) {
    assertNoForbiddenKeys(capture.value, forbiddenKeys, "$public");
    for (const privateIdentity of privateIdentities) {
      assert.equal(
        capture.text.includes(privateIdentity),
        false,
        `public response disclosed private identity ${privateIdentity}`,
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

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
