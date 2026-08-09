/**
 * Probes the pinned Temporal lifecycle facts needed to distinguish a permanent entity host from a closed-result command boundary.
 *
 * The semantic Process instance and command identity remain application data. Workflow identity, closure, Update retention, Worker restart, and replay are the Temporal oracle for this adapter-only experiment.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
import { requiredAt, withDeadline } from "./temporal-test-support.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";

import {
  ProcessCommandResultKind,
  BpmnProcessStartResultKind,
  bpmnCompleteUserTaskUpdateName,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
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
    sourceOverlay: null,
    semanticProfile: scenario.profile,
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);

  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-lifecycle-probe",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Temporal lifecycle environment startup",
  );
  let workerLease;

  try {
    const workflowBundle = await loadBpmnWorkflowBundle();
    workerLease = await startBpmnTestWorker(
      environment,
      workflowBundle,
      "bpmn-lean-lifecycle-probe",
    );
    const startResult = await withDeadline(
      startBpmnProcess(
        environment.client.workflow,
        scenario.stimuli[0],
        compilation.semanticProcess,
        { taskQueue: bpmnSemanticTaskQueue },
      ),
      operationDeadlineMs,
      "lifecycle Workflow start",
    );
    switch (startResult.kind) {
      case BpmnProcessStartResultKind.Started:
        break;
      case BpmnProcessStartResultKind.Rejected:
        throw new Error(
          `lifecycle Workflow was rejected: ${startResult.failure.code}`,
        );
    }
    const handle = startResult.handle;
    assert.equal(handle.workflowId, workflowId);
    const openTasks = await waitForOpenUserTaskIds(
      handle,
      ["UserTask_Approve"],
    );
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
    assert.equal(
      (await waitForOpenUserTaskIds(handle, ["UserTask_Approve"])).length,
      1,
    );

    await stopBpmnTestWorker(workerLease);
    workerLease = await startBpmnTestWorker(
      environment,
      workflowBundle,
      "bpmn-lean-lifecycle-probe",
    );

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

    await stopBpmnTestWorker(workerLease);
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
      replayBpmnHistory(workflowBundle, history, workflowId),
      operationDeadlineMs,
      "lifecycle history replay",
    );
  } finally {
    if (workerLease !== undefined) {
      await stopBpmnTestWorker(workerLease);
    }
    await withDeadline(
      environment.teardown(),
      operationDeadlineMs,
      "Temporal lifecycle environment teardown",
    );
  }
});
