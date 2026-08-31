/** Shared lifecycle operations for tests that replace a live BPMN Worker. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import type { OpenUserTask } from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import {
  bpmnOpenUserTasksQueryName,
  bpmnSemanticTaskQueue,
  boundEffectActivities,
  createCorrelationCandidateScanActivities,
  createCorrelationRegistrationActivities,
} from "@bpmn-lean/temporal-testkit";
import type { EffectActivityImplementations } from "@bpmn-lean/temporal-testkit";
import { withDeadline } from "./temporal-test-support.ts";

const operationDeadlineMs = 10_000;
const openTaskPollIntervalMs = 25;

export type OpenTaskPollScheduler = Readonly<{
  now: () => number;
  delay: (durationMs: number) => Promise<void>;
}>;

const openTaskPollScheduler: OpenTaskPollScheduler = {
  now: () => performance.now(),
  delay,
};

export type WorkerLease = Readonly<{
  worker: Worker;
  completion: Promise<void>;
  failure: () => unknown;
}>;

export async function startBpmnTestWorker(
  environment: TestWorkflowEnvironment,
  workflowBundle: WorkflowBundleWithSourceMap,
  identity: string,
  activities?: EffectActivityImplementations,
): Promise<WorkerLease> {
  const worker = await withDeadline(
    Worker.create({
      connection: environment.nativeConnection,
      identity,
      taskQueue: bpmnSemanticTaskQueue,
      workflowBundle,
      activities: {
        ...(activities === undefined ? {} : boundEffectActivities(activities)),
        ...createCorrelationRegistrationActivities(
          environment.client.workflow as never,
          bpmnSemanticTaskQueue,
        ),
        ...createCorrelationCandidateScanActivities(
          environment.client.workflow as never,
        ),
      },
    }),
    operationDeadlineMs,
    "Temporal lifecycle Worker startup",
  );
  let failure: unknown;
  const completion = worker.run().catch((error: unknown) => {
    failure = error;
  });
  await delay(0);
  if (failure !== undefined) {
    throw failure;
  }
  return {
    worker,
    completion,
    failure: () => failure,
  };
}

export async function stopBpmnTestWorker(
  lease: WorkerLease,
): Promise<void> {
  lease.worker.shutdown();
  await withDeadline(
    lease.completion,
    operationDeadlineMs,
    "Temporal lifecycle Worker shutdown",
  );
  const failure = lease.failure();
  if (failure !== undefined) {
    throw failure;
  }
}

/**
 * Polls until the Workflow exposes exactly these open User Tasks, in this order.
 *
 * `armedDeadlineMs` extends the poll allowance by a deadline the model itself arms against the host
 * clock, for a task that cannot appear until that deadline fires. Without it the allowance is spent
 * on a wait the model prescribes, so the budget that remains for genuine host latency shrinks by the
 * deadline's length and the failure names a missing task rather than a deliberate wait.
 */
export async function waitForOpenUserTaskIds(
  handle: WorkflowHandle,
  expectedElementIds: ReadonlyArray<string>,
  scheduler: OpenTaskPollScheduler = openTaskPollScheduler,
  armedDeadlineMs = 0,
): Promise<ReadonlyArray<OpenUserTask>> {
  if (!Number.isFinite(armedDeadlineMs) || armedDeadlineMs < 0) {
    throw new TypeError(
      `armed deadline allowance must be a nonnegative duration, received ${armedDeadlineMs}`,
    );
  }
  const deadlineMs = scheduler.now() + operationDeadlineMs + armedDeadlineMs;
  let latestError: unknown;
  let latestTasks: ReadonlyArray<OpenUserTask> = [];
  while (scheduler.now() < deadlineMs) {
    try {
      const tasks = await withDeadline(
        handle.query<ReadonlyArray<OpenUserTask>>(
          bpmnOpenUserTasksQueryName,
        ),
        Math.min(1_000, Math.max(1, deadlineMs - scheduler.now())),
        "open-task Query",
      );
      latestError = undefined;
      latestTasks = tasks;
      if (
        tasks.length === expectedElementIds.length &&
        tasks.every(
          (task, index) =>
            task.id.elementId === expectedElementIds[index],
        )
      ) {
        return tasks;
      }
    } catch (error: unknown) {
      latestError = error;
    }
    const remainingMs = deadlineMs - scheduler.now();
    if (remainingMs > 0) {
      await scheduler.delay(Math.min(openTaskPollIntervalMs, remainingMs));
    }
  }
  throw latestError instanceof Error
    ? latestError
    : new Error(
        `Workflow did not expose User Tasks ${expectedElementIds.join(", ")}; ` +
          `latest was ${latestTasks.map(({ id }) => id.elementId).join(", ")}`,
      );
}

export async function replayBpmnHistory(
  workflowBundle: WorkflowBundleWithSourceMap,
  history: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>,
  workflowId: string,
): Promise<void> {
  let replayed = 0;
  for await (const result of Worker.runReplayHistories(
    { workflowBundle },
    [{ history, workflowId }],
  )) {
    assert.equal(result.workflowId, workflowId);
    assert.equal(result.error, undefined);
    replayed += 1;
  }
  assert.equal(replayed, 1);
}
