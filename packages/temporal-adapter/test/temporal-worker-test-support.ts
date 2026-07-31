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
} from "@bpmn-lean/temporal-adapter";
import { withDeadline } from "./temporal-test-support.ts";

const operationDeadlineMs = 10_000;

export type WorkerLease = Readonly<{
  worker: Worker;
  completion: Promise<void>;
  failure: () => unknown;
}>;

export async function startBpmnTestWorker(
  environment: TestWorkflowEnvironment,
  workflowBundle: WorkflowBundleWithSourceMap,
  identity: string,
): Promise<WorkerLease> {
  const worker = await withDeadline(
    Worker.create({
      connection: environment.nativeConnection,
      identity,
      taskQueue: bpmnSemanticTaskQueue,
      workflowBundle,
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

export async function waitForOpenUserTaskIds(
  handle: WorkflowHandle,
  expectedElementIds: ReadonlyArray<string>,
): Promise<ReadonlyArray<OpenUserTask>> {
  let latestError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const tasks = await withDeadline(
        handle.query<ReadonlyArray<OpenUserTask>>(
          bpmnOpenUserTasksQueryName,
        ),
        1_000,
        "open-task Query",
      );
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
    await delay(25);
  }
  throw latestError instanceof Error
    ? latestError
    : new Error(
        `Workflow did not expose User Tasks ${expectedElementIds.join(", ")}`,
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
