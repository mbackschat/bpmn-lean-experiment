/** Reconciles the combined open-task Query against the committed core projection. */
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import type {
  CanonicalObservation,
  OpenUserTask,
} from "@bpmn-lean/semantic-core";
import {
  bpmnOpenUserTasksQueryName,
  bpmnTraceQueryName,
  isCompletedProcessReceipt,
  reconcileHarnessTraceEvidence,
  submitUserTaskCompletionAtWorkflowId,
} from "@bpmn-lean/temporal-testkit";
import type {
  CompletedProcessReceipt,
  ProcessCommandResult,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";
import type { WorkflowHandle } from "@temporalio/client";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  DefaultLogger,
  Worker,
  bundleWorkflowCode,
} from "@temporalio/worker";

import type {
  ParallelUserTaskMetadataOrderFixture,
} from "./parallel-user-task-metadata-fixture.ts";
import { replayBpmnHistory } from "./temporal-worker-test-support.ts";
import { withDeadline } from "./temporal-test-support.ts";

const workflowsPath = fileURLToPath(new URL(
  "./parallel-user-task-metadata-query-mutation-workflows.ts",
  import.meta.url,
));
const operationDeadlineMs = 10_000;

const queryMutationKind = {
  MetadataDrop: "metadataDrop",
  SiblingDrop: "siblingDrop",
} as const;
type QueryMutationKind = typeof queryMutationKind[keyof typeof queryMutationKind];

export type ParallelUserTaskMetadataQueryMutationEvidence = Readonly<{
  kind: "metadataDrop" | "siblingDrop";
  intermediateTasks: ReadonlyArray<OpenUserTask>;
  completionResults: readonly [ProcessCommandResult, ProcessCommandResult];
  receipt: CompletedProcessReceipt;
  trace: ReadonlyArray<CanonicalObservation>;
  history: TemporalHistory;
  replayed: true;
}>;

export async function runParallelUserTaskMetadataQueryMutations(
  environment: TestWorkflowEnvironment,
  metadataDrop: ParallelUserTaskMetadataOrderFixture,
  siblingDrop: ParallelUserTaskMetadataOrderFixture,
): Promise<readonly [
  ParallelUserTaskMetadataQueryMutationEvidence,
  ParallelUserTaskMetadataQueryMutationEvidence,
]> {
  const bundle = await withDeadline(
    bundleWorkflowCode({
      workflowsPath,
      logger: new DefaultLogger("ERROR"),
    }),
    operationDeadlineMs,
    "parallel User Task metadata mutation Workflow bundle",
  );
  return [
    await runQueryMutation(
      environment,
      bundle,
      queryMutationKind.MetadataDrop,
      metadataDrop,
    ),
    await runQueryMutation(
      environment,
      bundle,
      queryMutationKind.SiblingDrop,
      siblingDrop,
    ),
  ];
}

export function reconcileParallelUserTaskMetadataQuery(
  queried: ReadonlyArray<OpenUserTask>,
  committed: ReadonlyArray<OpenUserTask>,
): void {
  if (
    queried.length !== committed.length ||
    queried.some((task, index) => {
      const expected = committed[index];
      return expected === undefined ||
        !isDeepStrictEqual(
          { id: task.id, name: task.name, state: task.state },
          { id: expected.id, name: expected.name, state: expected.state },
        );
    })
  ) {
    throw new TypeError(
      "Query open User Task sibling set does not match committed semantic projection",
    );
  }
  if (
    queried.some((task, index) =>
      !isDeepStrictEqual(task.metadata, committed[index]?.metadata)
    )
  ) {
    throw new TypeError(
      "Query open User Task metadata does not match committed semantic projection",
    );
  }
}

async function runQueryMutation(
  environment: TestWorkflowEnvironment,
  bundle: WorkflowBundleWithSourceMap,
  mutation: QueryMutationKind,
  fixture: ParallelUserTaskMetadataOrderFixture,
): Promise<ParallelUserTaskMetadataQueryMutationEvidence> {
  const taskQueue = `bpmn-parallel-metadata-${mutation}`;
  const workflowId = `parallel-metadata-${mutation}-${fixture.start.instanceId}`;
  const workflowType = mutation === queryMutationKind.MetadataDrop
    ? "runBpmnProcessParallelMetadataDropQueryMutation"
    : "runBpmnProcessParallelSiblingDropQueryMutation";
  const worker = await withDeadline(
    Worker.create({
      connection: environment.nativeConnection,
      identity: `bpmn-lean-parallel-metadata-${mutation}`,
      taskQueue,
      workflowBundle: bundle,
    }),
    operationDeadlineMs,
    `parallel ${mutation} mutation Worker startup`,
  );
  let workerFailure: unknown;
  const workerRun = worker.run().catch((error: unknown) => {
    workerFailure = error;
  });
  let evidence: Omit<
    ParallelUserTaskMetadataQueryMutationEvidence,
    "replayed"
  > | undefined;
  let replayHistory: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>> |
    undefined;

  try {
    const handle = await withDeadline(
      environment.client.workflow.start(workflowType, {
        taskQueue,
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [fixture.start, fixture.semanticProcess],
      }),
      operationDeadlineMs,
      `parallel ${mutation} mutation Workflow start`,
    );
    await waitForTrace(handle);
    const first = await withDeadline(
      submitUserTaskCompletionAtWorkflowId(
        environment.client.workflow,
        workflowId,
        fixture.start.instanceId,
        fixture.completions[0],
      ),
      operationDeadlineMs,
      `parallel ${mutation} first completion`,
    );
    const intermediateTasks = await withDeadline(
      handle.query<ReadonlyArray<OpenUserTask>>(bpmnOpenUserTasksQueryName),
      operationDeadlineMs,
      `parallel ${mutation} intermediate Query`,
    );
    const second = await withDeadline(
      submitUserTaskCompletionAtWorkflowId(
        environment.client.workflow,
        workflowId,
        fixture.start.instanceId,
        fixture.completions[1],
      ),
      operationDeadlineMs,
      `parallel ${mutation} second completion`,
    );
    const receiptValue = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      `parallel ${mutation} mutation receipt`,
    );
    if (!isCompletedProcessReceipt(receiptValue)) {
      throw new TypeError(`parallel ${mutation} mutation returned no receipt`);
    }
    const trace = await withDeadline(
      handle.query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName),
      operationDeadlineMs,
      `parallel ${mutation} mutation trace Query`,
    );
    const fetchedHistory = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      `parallel ${mutation} mutation history fetch`,
    );
    replayHistory = fetchedHistory;
    const history = fetchedHistory as TemporalHistory;
    reconcileHarnessTraceEvidence(trace, receiptValue, history);
    evidence = {
      kind: mutation,
      intermediateTasks,
      completionResults: [first, second],
      receipt: receiptValue,
      trace,
      history,
    };
  } finally {
    worker.shutdown();
    await withDeadline(
      workerRun,
      operationDeadlineMs,
      `parallel ${mutation} mutation Worker cleanup`,
    );
    if (workerFailure !== undefined) {
      throw workerFailure;
    }
  }
  if (evidence === undefined || replayHistory === undefined) {
    throw new TypeError(`parallel ${mutation} mutation produced no evidence`);
  }
  await replayBpmnHistory(bundle, replayHistory, workflowId);
  return { ...evidence, replayed: true };
}

async function waitForTrace(
  handle: WorkflowHandle,
): Promise<void> {
  let latestError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const trace = await handle.query<ReadonlyArray<CanonicalObservation>>(
        bpmnTraceQueryName,
      );
      if (trace.length >= 3) {
        return;
      }
    } catch (error: unknown) {
      latestError = error;
    }
    await delay(25);
  }
  throw latestError instanceof Error
    ? latestError
    : new Error("parallel Query mutation did not reach its initial wait");
}
