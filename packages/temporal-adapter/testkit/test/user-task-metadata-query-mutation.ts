/** Host, reconciliation, and replay support for the metadata Query mutation. */
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  bpmnTraceQueryName,
  isCompletedProcessReceipt,
  submitUserTaskCompletionAtWorkflowId,
} from "@bpmn-lean/temporal-testkit";
import type {
  CompletedProcessReceipt,
  ProcessCommandResult,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  DefaultLogger,
  Worker,
  bundleWorkflowCode,
} from "@temporalio/worker";

import {
  replayBpmnHistory,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import { withDeadline } from "./temporal-test-support.ts";

const workflowsPath = fileURLToPath(new URL(
  "./user-task-metadata-query-mutation-workflows.ts",
  import.meta.url,
));
const taskQueue = "bpmn-user-task-metadata-query-mutation";
const workflowId = "user-task-metadata-query-mutation";
const workflowType = "runBpmnProcessUserTaskMetadataQueryMutation";
const operationDeadlineMs = 10_000;

export type UserTaskMetadataQueryMutationEvidence = Readonly<{
  openTasks: ReadonlyArray<OpenUserTask>;
  result: ProcessCommandResult;
  receipt: CompletedProcessReceipt;
  trace: ReadonlyArray<CanonicalObservation>;
  history: TemporalHistory;
  replayed: true;
}>;

export async function runUserTaskMetadataQueryMutation(
  environment: TestWorkflowEnvironment,
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
  completion: CompleteUserTaskInstanceStimulus,
): Promise<UserTaskMetadataQueryMutationEvidence> {
  const bundle = await withDeadline(
    bundleWorkflowCode({
      workflowsPath,
      logger: new DefaultLogger("ERROR"),
    }),
    operationDeadlineMs,
    "User Task metadata mutation Workflow bundle",
  );
  const worker = await withDeadline(
    Worker.create({
      connection: environment.nativeConnection,
      identity: "bpmn-lean-user-task-metadata-query-mutation",
      taskQueue,
      workflowBundle: bundle,
    }),
    operationDeadlineMs,
    "User Task metadata mutation Worker startup",
  );
  let workerFailure: unknown;
  const workerRun = worker.run().catch((error: unknown) => {
    workerFailure = error;
  });
  let evidence: Omit<UserTaskMetadataQueryMutationEvidence, "replayed"> |
    undefined;
  let replayHistory: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>> |
    undefined;

  try {
    const handle = await withDeadline(
      environment.client.workflow.start(workflowType, {
        taskQueue,
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [start, semanticProcess],
      }),
      operationDeadlineMs,
      "User Task metadata mutation Workflow start",
    );
    const openTasks = await waitForOpenUserTaskIds(
      handle,
      [completion.taskId.elementId],
    );
    const result = await withDeadline(
      submitUserTaskCompletionAtWorkflowId(
        environment.client.workflow,
        workflowId,
        start.instanceId,
        completion,
      ),
      operationDeadlineMs,
      "User Task metadata mutation completion",
    );
    const receiptValue = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "User Task metadata mutation receipt",
    );
    if (!isCompletedProcessReceipt(receiptValue)) {
      throw new TypeError("metadata Query mutation returned no receipt");
    }
    const trace = await withDeadline(
      handle.query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName),
      operationDeadlineMs,
      "User Task metadata mutation trace Query",
    );
    const fetchedHistory = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "User Task metadata mutation history fetch",
    );
    replayHistory = fetchedHistory;
    evidence = {
      openTasks,
      result,
      receipt: receiptValue,
      trace,
      history: fetchedHistory as TemporalHistory,
    };
  } finally {
    worker.shutdown();
    await withDeadline(
      workerRun,
      operationDeadlineMs,
      "User Task metadata mutation Worker cleanup",
    );
    if (workerFailure !== undefined) {
      throw workerFailure;
    }
  }
  if (evidence === undefined || replayHistory === undefined) {
    throw new TypeError("metadata Query mutation produced no evidence");
  }
  await replayBpmnHistory(bundle, replayHistory, workflowId);
  return { ...evidence, replayed: true };
}

export function reconcileOpenTaskMetadataEvidence(
  queried: ReadonlyArray<OpenUserTask>,
  committed: ReadonlyArray<OpenUserTask>,
): void {
  if (!isDeepStrictEqual(queried, committed)) {
    throw new TypeError(
      "Query open User Task metadata does not match committed semantic projection at metadata",
    );
  }
}
