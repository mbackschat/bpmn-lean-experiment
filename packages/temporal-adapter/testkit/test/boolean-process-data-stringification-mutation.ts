/** Host and replay support for the test-owned Boolean stringification Workflow. */
import { fileURLToPath } from "node:url";

import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
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
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowHandle } from "@temporalio/client";
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
  "./boolean-process-data-stringification-mutation-workflows.ts",
  import.meta.url,
));
const taskQueue = "bpmn-boolean-stringification-mutation";
const workflowId = "boolean-stringification-mutation";
const workflowType = "runBpmnProcessBooleanStringificationMutation";
const operationDeadlineMs = 10_000;

export type BooleanStringificationMutationEvidence = Readonly<{
  result: ProcessCommandResult;
  receipt: CompletedProcessReceipt;
  trace: ReadonlyArray<CanonicalObservation>;
  history: TemporalHistory;
  replayed: true;
}>;

export async function runBooleanStringificationMutation(
  environment: TestWorkflowEnvironment,
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
  completion: CompleteUserTaskInstanceStimulus,
): Promise<BooleanStringificationMutationEvidence> {
  const bundle = await withDeadline(
    bundleWorkflowCode({
      workflowsPath,
      logger: new DefaultLogger("ERROR"),
    }),
    operationDeadlineMs,
    "Boolean stringification Workflow bundle",
  );
  const worker = await withDeadline(
    Worker.create({
      connection: environment.nativeConnection,
      identity: "bpmn-lean-boolean-stringification-mutation",
      taskQueue,
      workflowBundle: bundle,
    }),
    operationDeadlineMs,
    "Boolean stringification Worker startup",
  );
  let workerFailure: unknown;
  const workerRun = worker.run().catch((error: unknown) => {
    workerFailure = error;
  });
  let evidence: Omit<BooleanStringificationMutationEvidence, "replayed"> |
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
      "Boolean stringification Workflow start",
    );
    await waitForOpenUserTaskIds(handle, [completion.taskId.elementId]);
    const result = await withDeadline(
      submitUserTaskCompletionAtWorkflowId(
        environment.client.workflow,
        workflowId,
        start.instanceId,
        completion,
      ),
      operationDeadlineMs,
      "Boolean stringification Update",
    );
    const receiptValue = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "Boolean stringification mutation result",
    );
    if (!isCompletedProcessReceipt(receiptValue)) {
      throw new TypeError("Boolean stringification returned no receipt");
    }
    const trace = await withDeadline(
      handle.query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName),
      operationDeadlineMs,
      "Boolean stringification trace Query",
    );
    const fetchedHistory = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "Boolean stringification history fetch",
    );
    replayHistory = fetchedHistory;
    evidence = {
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
      "Boolean stringification Worker cleanup",
    );
    if (workerFailure !== undefined) {
      throw workerFailure;
    }
  }
  if (evidence === undefined || replayHistory === undefined) {
    throw new TypeError("Boolean stringification produced no evidence");
  }
  await withDeadline(
    replayBpmnHistory(bundle, replayHistory, workflowId),
    operationDeadlineMs,
    "Boolean stringification history replay",
  );
  return { ...evidence, replayed: true };
}
