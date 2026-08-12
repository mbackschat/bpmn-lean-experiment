/** Live Product 2 evidence for durable Human Work. */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type {
  PublicProcessInstanceIdentity,
  PublicWorkTask,
  WorkCompletionRequest,
} from "@bpmn-lean/platform-contracts";
import type { PlatformServerRuntime } from "@bpmn-lean/platform-server";
import {
  ExternalTemporalRuntime,
  createCachedLocalEnvironment,
  historyEvents,
  isCompletedProcessReceipt,
  processWorkflowId,
  withDeadline,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

import {
  claimTask,
  completeTask,
  discardCompletionResponse,
  deployDefinition,
  listWorkTasks,
  putDefinitionSchedule,
  putMessageStartPublication,
  readTaskDetail,
  readWorkAudit,
  startDefinition,
} from "./http-support.ts";
import type { CapturedJson } from "./http-support.ts";
import {
  humanWorkSources,
  messageProfile,
  metadataProfile,
  timerProfile,
} from "./fixture.ts";
import {
  allocatePort,
  listWorkflowExecutions,
  nextWholeSecond,
  operationDeadlineMs,
  replayHistory,
  startPlatform,
  startWorker,
  taskQueue,
  temporalCacheDirectory,
  waitForAcceptedPublication,
  waitForOneOpenTask,
  waitForOnlyNewWorkflow,
  waitForStartedSchedule,
} from "./runtime-support.ts";

test("runs the complete durable Human Work slice", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-m3-human-work-"));
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: `bpmn-m3-human-work-service-${process.pid}`,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "M3 Human Work Temporal environment startup",
  );
  let platform: PlatformServerRuntime | undefined;
  let worker: ExternalTemporalRuntime | undefined;
  const publicCaptures: CapturedJson<unknown>[] = [];

  try {
    worker = await startWorker(
      environment.address,
      environment.namespace ?? "default",
      `bpmn-m3-human-work-worker-${process.pid}`,
    );
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      environment.namespace ?? "default",
    );
    const token = `${Date.now()}_${process.pid}`;
    const sources = await humanWorkSources(token);

    const metadataDefinition = capture(publicCaptures, await deployDefinition(origin, {
      bytes: sources.metadata,
      sourceId: `human-work-${token}.bpmn`,
      semanticProfile: metadataProfile,
    })).value;
    const beforeDirect = await listWorkflowExecutions(environment.client);
    const direct = capture(publicCaptures,
      await startDefinition(origin, metadataDefinition)).value.instance;
    const directExecution = await waitForOnlyNewWorkflow(
      environment.client,
      beforeDirect,
      "direct Human Work start",
    );
    assert.equal(directExecution.workflowId, processWorkflowId(direct.processInstanceId));

    const timerDefinition = capture(publicCaptures, await deployDefinition(origin, {
      bytes: sources.timer,
      sourceId: `human-work-timer-${token}.bpmn`,
      semanticProfile: timerProfile,
    })).value;
    const scheduleId = `human-work-schedule-${token}`;
    const beforeSchedule = await listWorkflowExecutions(environment.client);
    capture(publicCaptures, await putDefinitionSchedule(
      origin,
      timerDefinition,
      scheduleId,
      nextWholeSecond(2),
    ));
    const scheduled = await waitForStartedSchedule(origin, timerDefinition, scheduleId);
    const scheduleExecution = await waitForOnlyNewWorkflow(
      environment.client,
      beforeSchedule,
      "Timer Schedule Human Work start",
    );
    assert.notEqual(
      scheduleExecution.workflowId,
      processWorkflowId(scheduled.instance.processInstanceId),
      "scheduled Work must use its service-returned execution address",
    );

    const messageDefinition = capture(publicCaptures, await deployDefinition(origin, {
      bytes: sources.message,
      sourceId: `human-work-message-${token}.bpmn`,
      semanticProfile: messageProfile,
    })).value;
    const messageStart = messageDefinition.startCapabilities.messageStarts[0];
    assert.ok(messageStart !== undefined);
    const publicationId = `human-work-publication-${token}`;
    const beforeMessage = await listWorkflowExecutions(environment.client);
    capture(publicCaptures, await putMessageStartPublication(
      origin,
      publicationId,
      messageDefinition,
      messageStart,
    ));
    const published = await waitForAcceptedPublication(origin, publicationId);
    const messageExecution = await waitForOnlyNewWorkflow(
      environment.client,
      beforeMessage,
      "Message Start Human Work start",
    );
    assert.equal(
      messageExecution.workflowId,
      processWorkflowId(published.instance.processInstanceId),
    );
    assertDistinctInstances([direct, scheduled.instance, published.instance]);

    const [metadataTask, timerTask, messageTask] = await Promise.all([
      waitForOneOpenTask(environment.client, directExecution, `Review request ${token}`),
      waitForOneOpenTask(environment.client, scheduleExecution, `Hidden timer task ${token}`),
      waitForOneOpenTask(environment.client, messageExecution, `Hidden message task ${token}`),
    ]);
    assert.ok(Object.hasOwn(metadataTask, "metadata"));
    assert.equal(Object.hasOwn(timerTask, "metadata"), false);
    assert.equal(Object.hasOwn(messageTask, "metadata"), false);

    const initialTasks = capture(publicCaptures, await listWorkTasks(origin));
    assert.equal(initialTasks.value.tasks.length, 1);
    const task = requireMetadataTask(initialTasks.value.tasks[0], direct);
    const detail = capture(publicCaptures, await readTaskDetail(origin, task.task.id));
    assert.deepEqual(detail.value.form, {
      fields: [{
        key: "approved",
        type: "boolean",
        currentValue: { kind: "absent" },
        compatibility: "compatible",
      }],
    });

    const claimActionId = `claim-${token}`;
    const claimed = capture(publicCaptures, await claimTask(origin, task.task.id, {
      actionId: claimActionId,
      expectedGeneration: task.claimGeneration,
    }));
    assert.deepEqual(claimed.value.claim, { actorId: "demo-user", generation: 1 });

    await platform.close();
    platform = undefined;
    await worker.shutdown();
    worker = undefined;
    worker = await startWorker(
      environment.address,
      environment.namespace ?? "default",
      `bpmn-m3-human-work-replacement-${process.pid}`,
    );
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      environment.namespace ?? "default",
    );
    const afterRestart = capture(publicCaptures, await listWorkTasks(origin));
    assert.deepEqual(afterRestart.value.tasks[0]?.claim, claimed.value.claim);

    const completionActionId = `complete-${token}`;
    const completionRequest: WorkCompletionRequest = {
      taskId: task.task.id,
      expectedClaimGeneration: claimed.value.claim.generation,
      submittedValues: [{
        key: "approved",
        value: { kind: "boolean", value: true },
      }],
    };
    const handle = environment.client.workflow.getHandle(
      processWorkflowId(direct.processInstanceId),
    );
    await discardCompletionResponse(
      origin,
      completionActionId,
      completionRequest,
    );
    const receipt = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "M3 Human Work completed Process receipt",
    );
    assert.equal(isCompletedProcessReceipt(receipt), true);
    if (!isCompletedProcessReceipt(receipt)) {
      throw new TypeError("M3 Human Work Workflow returned no completion receipt");
    }
    assert.deepEqual(
      receipt.finalState.variables.find(({ name }) => name === "approved"),
      { name: "approved", value: { kind: "boolean", value: true } },
    );
    await platform.close();
    platform = undefined;
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      environment.namespace ?? "default",
    );
    const retained = capture(publicCaptures, await completeTask(
      origin,
      completionActionId,
      completionRequest,
    ));
    assert.deepEqual(retained.value, {
      state: "committed",
      actionId: completionActionId,
      taskId: task.task.id,
    });
    assert.deepEqual(
      capture(publicCaptures, await listWorkTasks(origin)).value.tasks,
      [],
      "metadata-free Timer and Message tasks must remain policy-hidden",
    );

    const audit = capture(publicCaptures, await readWorkAudit(origin));
    assert.deepEqual(
      audit.value.events.map(({ action }) => [action.kind, action.outcome]),
      [
        ["claim", "claimed"],
        ["completion", "reserved"],
        ["completion", "committed"],
      ],
    );
    assert.equal(audit.value.nextCursor, null);
    assertPublicCaptures(publicCaptures, [
      processWorkflowId(direct.processInstanceId),
      taskQueue,
    ]);

    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "M3 Human Work completed history",
    ) as TemporalHistory;
    assert.equal(historyEvents(history, "workflowExecutionStartedEventAttributes").length, 1);
    assert.equal(historyEvents(history, "workflowExecutionUpdateAcceptedEventAttributes").length, 1);
    assert.equal(historyEvents(history, "workflowExecutionUpdateCompletedEventAttributes").length, 1);
    assert.equal(historyEvents(history, "workflowExecutionCompletedEventAttributes").length, 1);
    assert.equal(historyEvents(history, "activityTaskScheduledEventAttributes").length, 0);
    await worker.shutdown();
    worker = undefined;
    await replayHistory(history, handle.workflowId);
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
      throw new AggregateError(cleanupFailures, "M3 Human Work cleanup failed");
    }
  }
});

function requireMetadataTask(
  task: PublicWorkTask | undefined,
  direct: PublicProcessInstanceIdentity,
): PublicWorkTask {
  assert.ok(task !== undefined);
  assert.equal(task.hostingInstance.processInstanceId, direct.processInstanceId);
  assert.deepEqual(task.task.metadata, {
    assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
    form: { fields: [{ key: "approved", type: "boolean" }] },
  });
  assert.equal(task.claim, null);
  assert.equal(task.claimableByCurrentActor, true);
  return task;
}

function assertDistinctInstances(
  instances: readonly PublicProcessInstanceIdentity[],
): void {
  assert.equal(instances.length, 3);
  assert.equal(new Set(instances.map(({ processInstanceId }) => processInstanceId)).size, 3);
  assert.equal(new Set(instances.map(({ definition }) => definition.source.sha256)).size, 3);
}

function capture<Result>(
  captures: CapturedJson<unknown>[],
  captured: CapturedJson<Result>,
): CapturedJson<Result> {
  captures.push(captured);
  return captured;
}

function assertPublicCaptures(
  captures: readonly CapturedJson<unknown>[],
  privateValues: readonly string[],
): void {
  const forbidden = new Set([
    "locator",
    "workflowid",
    "runid",
    "taskqueue",
    "history",
    "memo",
    "intent",
    "intentsha256",
    "executionworkflowid",
  ]);
  for (const [index, captured] of captures.entries()) {
    assertNoForbiddenKeys(captured.value, forbidden, `$capture[${index}]`);
    for (const privateValue of privateValues) {
      assert.equal(
        captured.text.includes(privateValue),
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
      assertNoForbiddenKeys(candidate, forbidden, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, candidate] of Object.entries(value)) {
    assert.equal(forbidden.has(key.toLowerCase()), false, `${path}.${key} is private`);
    assertNoForbiddenKeys(candidate, forbidden, `${path}.${key}`);
  }
}
