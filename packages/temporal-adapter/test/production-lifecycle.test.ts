/**
 * Probes the pinned Temporal lifecycle facts needed to distinguish a permanent entity host from a closed-result command boundary.
 *
 * The semantic Process instance and command identity remain application data. Workflow identity, closure, Update retention, Worker restart, and replay are the Temporal oracle for this adapter-only experiment.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";
import type { WorkflowHandle } from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import type { OpenUserTask } from "@bpmn-lean/semantic-core";

import { requiredAt } from "./temporal-test-support.ts";

/** One running lifecycle Worker plus the failure its run loop observed. */
type WorkerLease = Readonly<{
  worker: Worker;
  completion: Promise<void>;
  failure: () => unknown;
}>;

import {
  ProcessCommandResultKind,
  bpmnCompleteUserTaskUpdateName,
  bpmnOpenUserTasksQueryName,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  isCompletedProcessReceipt,
  processWorkflowId,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-adapter";

const capsuleUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/",
  import.meta.url,
);
const scenarioUrl = new URL("scenario.json", capsuleUrl);
const bpmnUrl = new URL("process.bpmn", capsuleUrl);
const workflowsPath = fileURLToPath(
  new URL("../dist/workflows.js", import.meta.url),
);
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);
const workflowId = processWorkflowId("Instance_1");
const operationDeadlineMs = 10_000;

test("closed Workflow retains accepted command result without accepting a new command", async () => {
  const scenario = JSON.parse(await readFile(scenarioUrl, "utf8"));
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(bpmnUrl),
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    semanticProfile: scenario.profile,
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);

  const environment = await withDeadline(
    TestWorkflowEnvironment.createLocal({
      server: {
        executable: {
          type: "cached-download",
          version: "v1.8.1",
          downloadDir: temporalCacheDirectory,
        },
      },
      client: {
        identity: "bpmn-lean-lifecycle-probe",
      },
    }),
    40_000,
    "Temporal lifecycle environment startup",
  );
  let workerLease;

  try {
    workerLease = await startWorker(environment);
    const handle = await withDeadline(
      startBpmnProcess(
        environment.client.workflow,
        scenario.stimuli[0],
        compilation.semanticProcess,
      ),
      operationDeadlineMs,
      "lifecycle Workflow start",
    );
    assert.equal(handle.workflowId, workflowId);
    const openTasks = await waitForOpenTasks(handle);
    assert.equal(openTasks.length, 1);
    assert.equal(
      requiredAt(openTasks, 0, "open User Tasks").id.processInstanceId,
      "Instance_1",
    );

    const completion = scenario.stimuli[1];
    const conflictingCompletion = {
      ...completion,
      commandId: scenario.stimuli[0].commandId,
    };
    await assert.rejects(
      withDeadline(
        handle.executeUpdate(bpmnCompleteUserTaskUpdateName, {
          args: [conflictingCompletion],
          updateId: contentBoundUpdateId(conflictingCompletion),
        }),
        2_000,
        "conflicting command identity",
      ),
      (error: unknown) =>
        error instanceof Error &&
        error.cause instanceof ApplicationFailure &&
        error.cause.type === "BpmnCommandIdentityConflict",
    );
    assert.equal((await waitForOpenTasks(handle)).length, 1);

    await stopWorker(workerLease);
    workerLease = await startWorker(environment);

    const completionResult = await withDeadline(
      submitUserTaskCompletion(
        environment.client.workflow,
        "Instance_1",
        completion,
      ),
      operationDeadlineMs,
      "completion after Worker restart",
    );
    assert.deepEqual(completionResult, {
      kind: ProcessCommandResultKind.Semantic,
      commandId: completion.commandId,
      outcome: CommandOutcome.Committed,
    });

    const result = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "lifecycle Workflow result",
    );
    assert.equal(isCompletedProcessReceipt(result), true);
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "lifecycle Workflow history",
    );
    assert.equal(JSON.stringify(result).includes(workflowId), false);

    await stopWorker(workerLease);
    workerLease = undefined;

    const retainedOutcome = await withDeadline(
      handle.getUpdateHandle(contentBoundUpdateId(completion)).result(),
      operationDeadlineMs,
      "retained completion result",
    );
    assert.equal(retainedOutcome, CommandOutcome.Committed);

    const lateCompletion = {
      ...completion,
      commandId: "complete-user-task-after-workflow-closure",
    };
    // The same transport Update ID intentionally carries a different semantic command. Temporal returns the first result without invoking the Workflow handler.
    const reusedUpdateIdOutcome = await withDeadline(
      handle.executeUpdate(bpmnCompleteUserTaskUpdateName, {
        args: [lateCompletion],
        updateId: contentBoundUpdateId(completion),
      }),
      operationDeadlineMs,
      "payload-conflicting Update-ID retry",
    );
    assert.equal(reusedUpdateIdOutcome, CommandOutcome.Committed);

    const exactRetry = await withDeadline(
      submitUserTaskCompletion(
        environment.client.workflow,
        "Instance_1",
        completion,
      ),
      operationDeadlineMs,
      "exact completion retry",
    );
    assert.equal(exactRetry.kind, ProcessCommandResultKind.Semantic);
    assert.equal(exactRetry.outcome, CommandOutcome.Committed);

    const payloadConflictResult = await withDeadline(
      submitUserTaskCompletion(
        environment.client.workflow,
        "Instance_1",
        {
          ...completion,
          taskId: {
            ...completion.taskId,
            activation: 2,
          },
        },
      ),
      operationDeadlineMs,
      "payload-conflicting completion",
    );
    assert.equal(
      payloadConflictResult.kind,
      ProcessCommandResultKind.ProcessClosed,
    );

    const lateResult = await withDeadline(
      submitUserTaskCompletion(
        environment.client.workflow,
        "Instance_1",
        lateCompletion,
      ),
      operationDeadlineMs,
      "late completion",
    );
    assert.equal(lateResult.kind, ProcessCommandResultKind.ProcessClosed);
    assert.deepEqual(lateResult.receipt, result);

    const unknownResult = await withDeadline(
      submitUserTaskCompletion(
        environment.client.workflow,
        "Unknown_Instance",
        {
          ...lateCompletion,
          commandId: "unknown-process-command",
          taskId: {
            ...lateCompletion.taskId,
            processInstanceId: "Unknown_Instance",
          },
        },
      ),
      operationDeadlineMs,
      "unknown Process completion",
    );
    assert.deepEqual(unknownResult, {
      kind: ProcessCommandResultKind.ProcessUnknown,
      commandId: "unknown-process-command",
      processInstanceId: "Unknown_Instance",
    });

    const description = await withDeadline(
      handle.describe(),
      operationDeadlineMs,
      "closed Workflow description",
    );
    assert.equal(description.status.name, "COMPLETED");

    await assert.rejects(
      withDeadline(
        environment.client.workflow.start(bpmnProcessWorkflowType, {
          taskQueue: bpmnSemanticTaskQueue,
          workflowId,
          workflowIdReusePolicy: "REJECT_DUPLICATE",
          args: [scenario.stimuli[0], compilation.semanticProcess],
        }),
        operationDeadlineMs,
        "duplicate Workflow start",
      ),
      WorkflowExecutionAlreadyStartedError,
    );

    await withDeadline(
      replayHistory(history),
      operationDeadlineMs,
      "lifecycle history replay",
    );
  } finally {
    if (workerLease !== undefined) {
      await stopWorker(workerLease);
    }
    await withDeadline(
      environment.teardown(),
      operationDeadlineMs,
      "Temporal lifecycle environment teardown",
    );
  }
});

async function startWorker(
  environment: TestWorkflowEnvironment,
): Promise<WorkerLease> {
  const worker = await withDeadline(
    Worker.create({
      connection: environment.nativeConnection,
      identity: "bpmn-lean-lifecycle-probe",
      taskQueue: bpmnSemanticTaskQueue,
      workflowsPath,
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

async function stopWorker(lease: WorkerLease): Promise<void> {
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

async function waitForOpenTasks(
  handle: WorkflowHandle,
): Promise<ReadonlyArray<OpenUserTask>> {
  let latestError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const tasks = await withDeadline(
        handle.query<ReadonlyArray<OpenUserTask>>(bpmnOpenUserTasksQueryName),
        1_000,
        "open-task Query",
      );
      if (tasks.length > 0) {
        return tasks;
      }
    } catch (error: unknown) {
      latestError = error;
    }
    await delay(25);
  }
  throw latestError instanceof Error
    ? latestError
    : new Error("Workflow did not expose an open User Task");
}

async function replayHistory(
  history: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>,
): Promise<void> {
  let replayed = 0;
  for await (const result of Worker.runReplayHistories(
    { workflowsPath },
    [{ history, workflowId }],
  )) {
    assert.equal(result.workflowId, workflowId);
    assert.equal(result.error, undefined);
    replayed += 1;
  }
  assert.equal(replayed, 1);
}

function withDeadline<Value>(
  promise: Promise<Value>,
  timeoutMs: number,
  operation: string,
): Promise<Value> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operation} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
