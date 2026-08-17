/** Durable metadata, sibling, replacement, duplicate, stale-refusal, mutation, and replay evidence. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  ScenarioResult,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";

import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  asArray,
  asRecord,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  decodeJsonPayload,
  durableUpdateOutcomes,
  getTestProcessHandle,
  readTestProcessTerminalResult,
  historyEvents,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  readBpmnProcessTrace,
  reconcileHarnessTraceEvidence,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type {
  CompletedProcessReceipt,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  loadParallelUserTaskMetadataFixture,
  withParallelMetadataExecutionIdentity,
} from "./parallel-user-task-metadata-fixture.ts";
import type {
  ParallelUserTaskMetadataOrderFixture,
} from "./parallel-user-task-metadata-fixture.ts";
import {
  reconcileParallelUserTaskMetadataQuery,
  runParallelUserTaskMetadataQueryMutations,
} from "./parallel-user-task-metadata-query-mutation.ts";
import {
  acceptedCompletionOrder,
  assertNoNonUpdateBpmnHostEvents,
  assertUpdatesCompleteBeforeWorkflow,
} from "./temporal-history-facts.ts";
import {
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const operationDeadlineMs = 10_000;
const identity = "bpmn-lean-parallel-user-task-metadata";

test("parallel User Task metadata survives both orders, Worker replacement, duplicate recovery, stale refusal, mutations, and replay", async () => {
  const fixture = await loadParallelUserTaskMetadataFixture();
  const executions = fixture.orders.map((order, index) =>
    withParallelMetadataExecutionIdentity(
      order,
      `ParallelReview_Temporal_${index + 1}`,
    )
  );
  const [contentThenRisk, riskThenContent] = executions;
  assert.ok(contentThenRisk !== undefined && riskThenContent !== undefined);
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "parallel User Task metadata Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    worker = await startBpmnTestWorker(environment, bundle, identity);
    const histories: Array<Readonly<{
      history: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>;
      workflowId: string;
    }>> = [];
    for (const [index, execution] of executions.entries()) {
      const evidence = await runOrder(
        environment,
        execution,
        worker,
        async () => {
          if (worker === undefined) {
            throw new TypeError("parallel metadata Worker lease was lost");
          }
          await stopBpmnTestWorker(worker);
          worker = await startBpmnTestWorker(
            environment,
            bundle,
            `${identity}-replacement-${index}`,
          );
        },
      );
      histories.push(evidence);
    }

    await stopBpmnTestWorker(worker);
    worker = undefined;
    for (const { history, workflowId } of histories) {
      await replayBpmnHistory(bundle, history, workflowId);
    }

    const mutationExecutions = [
      withParallelMetadataExecutionIdentity(
        contentThenRisk,
        "ParallelReview_MetadataDrop_1",
      ),
      withParallelMetadataExecutionIdentity(
        riskThenContent,
        "ParallelReview_SiblingDrop_1",
      ),
    ] as const;
    const mutations = await runParallelUserTaskMetadataQueryMutations(
      environment,
      mutationExecutions[0],
      mutationExecutions[1],
    );
    for (const [index, mutation] of mutations.entries()) {
      const expected = mutationExecutions[index];
      assert.ok(expected !== undefined);
      assert.deepEqual(mutation.completionResults, [
        semanticCommitted(expected.completions[0].commandId),
        semanticCommitted(expected.completions[1].commandId),
      ]);
      assert.equal(mutation.replayed, true);
      assert.deepEqual(mutation.receipt.finalState, expectedTerminal(expected.expected));
      assert.throws(
        () =>
          reconcileParallelUserTaskMetadataQuery(
            mutation.intermediateTasks,
            expected.intermediateTasks,
          ),
        mutation.kind === "metadataDrop" ? /metadata/u : /sibling/u,
      );
    }
  } finally {
    try {
      if (worker !== undefined) {
        await stopBpmnTestWorker(worker);
      }
    } finally {
      await withDeadline(
        environment.teardown(),
        operationDeadlineMs,
        "parallel User Task metadata Temporal environment teardown",
      );
    }
  }
});

async function runOrder(
  environment: TestWorkflowEnvironment,
  fixture: ParallelUserTaskMetadataOrderFixture,
  worker: WorkerLease,
  replaceWorker: () => Promise<void>,
): Promise<Readonly<{
  history: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>;
  workflowId: string;
}>> {
  assert.equal(worker.failure(), undefined);
  const started = await withDeadline(
    startBpmnProcess(
      environment.client.workflow,
      fixture.start,
      fixture.semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    ),
    operationDeadlineMs,
    "parallel User Task metadata Workflow start",
  );
  assert.equal(started.kind, BpmnProcessStartResultKind.Started);
  if (started.kind !== BpmnProcessStartResultKind.Started) {
    throw new TypeError("parallel User Task metadata Workflow was rejected");
  }
  const handle = getTestProcessHandle(
    environment.client.workflow,
    started.processInstanceId,
  );
  assert.deepEqual(
    await waitForOpenUserTaskIds(
      handle,
      fixture.initialTasks.map(({ id }) => id.elementId),
    ),
    fixture.initialTasks,
  );

  const firstResult = await withDeadline(
    submitUserTaskCompletion(
      environment.client.workflow,
      fixture.start.instanceId,
      fixture.completions[0],
    ),
    operationDeadlineMs,
    "parallel User Task metadata first completion",
  );
  assert.deepEqual(
    firstResult,
    semanticCommitted(fixture.completions[0].commandId),
  );
  await replaceWorker();
  assert.equal(
    await handle.getUpdateHandle(
      contentBoundUpdateId(fixture.completions[0]),
    ).result(),
    CommandOutcome.Committed,
  );
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      fixture.start.instanceId,
      fixture.completions[0],
    ),
    firstResult,
  );
  const intermediateTasks = await waitForOpenUserTaskIds(
    handle,
    fixture.intermediateTasks.map(({ id }) => id.elementId),
  );
  reconcileParallelUserTaskMetadataQuery(
    intermediateTasks,
    fixture.intermediateTasks,
  );
  const intermediateTrace = await readBpmnProcessTrace(
    environment.client.workflow,
    fixture.start.instanceId,
  );
  const intermediateState = intermediateTrace.findLast(
    ({ kind }) => kind === CanonicalObservationKind.State,
  );
  assert.ok(intermediateState !== undefined);
  const staleCompletion: CompleteUserTaskInstanceStimulus = {
    ...fixture.completions[0],
    commandId: `${fixture.completions[0].commandId}-fresh-stale`,
  };
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      fixture.start.instanceId,
      staleCompletion,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: staleCompletion.commandId,
      outcome: CommandOutcome.Rejected,
    },
  );
  const tasksAfterStaleRefusal = await waitForOpenUserTaskIds(
    handle,
    fixture.intermediateTasks.map(({ id }) => id.elementId),
  );
  assert.deepEqual(tasksAfterStaleRefusal, intermediateTasks);
  const traceAfterStaleRefusal = await readBpmnProcessTrace(
    environment.client.workflow,
    fixture.start.instanceId,
  );
  assert.deepEqual(traceAfterStaleRefusal.slice(0, -2), intermediateTrace);
  assert.deepEqual(traceAfterStaleRefusal.at(-2), {
    kind: CanonicalObservationKind.Command,
    commandId: staleCompletion.commandId,
    outcome: CommandOutcome.Rejected,
  });
  assert.deepEqual(traceAfterStaleRefusal.at(-1), intermediateState);

  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      fixture.start.instanceId,
      fixture.completions[1],
    ),
    semanticCommitted(fixture.completions[1].commandId),
  );
  const receiptValue = (await withDeadline(
    readTestProcessTerminalResult(handle),
    operationDeadlineMs,
    "parallel User Task metadata terminal result",
  )).receipt;
  assert.equal(isCompletedProcessReceipt(receiptValue), true);
  if (!isCompletedProcessReceipt(receiptValue)) {
    throw new TypeError("parallel metadata Workflow returned no receipt");
  }
  assertTerminalReceipt(receiptValue, fixture);
  const trace = await readBpmnProcessTrace(
    environment.client.workflow,
    fixture.start.instanceId,
  );
  assert.deepEqual(trace, [
    ...fixture.expected.trace.slice(0, -2),
    {
      kind: CanonicalObservationKind.Command,
      commandId: staleCompletion.commandId,
      outcome: CommandOutcome.Rejected,
    },
    intermediateState,
    ...fixture.expected.trace.slice(-2),
  ]);
  const history = await handle.fetchHistory();
  const temporalHistory = history as TemporalHistory;
  const acceptedCompletions = [
    fixture.completions[0],
    staleCompletion,
    fixture.completions[1],
  ];
  assertExactAcceptedCompletions(temporalHistory, acceptedCompletions);
  assert.deepEqual(
    durableUpdateOutcomes(temporalHistory),
    new Map([
      [fixture.completions[0].commandId, CommandOutcome.Committed],
      [staleCompletion.commandId, CommandOutcome.Rejected],
      [fixture.completions[1].commandId, CommandOutcome.Committed],
    ]),
  );
  assert.deepEqual(
    acceptedCompletionOrder(temporalHistory),
    acceptedCompletions.map(({ commandId }) => commandId),
  );
  assertUpdatesCompleteBeforeWorkflow(temporalHistory, 3);
  assertNoNonUpdateBpmnHostEvents(temporalHistory, "parallel User Task metadata");
  reconcileHarnessTraceEvidence(trace, receiptValue, temporalHistory);
  return { history, workflowId: handle.workflowId };
}

function assertTerminalReceipt(
  receipt: CompletedProcessReceipt,
  fixture: ParallelUserTaskMetadataOrderFixture,
): void {
  assert.deepEqual(receipt.finalState, expectedTerminal(fixture.expected));
  assert.deepEqual(receipt.finalState.openUserTasks, []);
  assert.deepEqual(receipt.finalState.variables, [
    {
      name: "contentApproved",
      value: { kind: "boolean", value: true },
    },
    { name: "riskApproved", value: { kind: "boolean", value: true } },
  ]);
}

function assertExactAcceptedCompletions(
  history: TemporalHistory,
  expected: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
): void {
  const accepted = historyEvents(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  );
  assert.equal(accepted.length, expected.length);
  assert.deepEqual(
    accepted.map((event) => {
      const request = asRecord(event.attributes.acceptedRequest, "accepted Update");
      const input = asRecord(request.input, "accepted Update input");
      assert.equal(input.name, "bpmn-complete-user-task");
      const args = asRecord(input.args, "accepted Update arguments");
      return decodeJsonPayload(
        asArray(args.payloads, "accepted Update payloads")[0],
        "accepted User Task completion",
      );
    }),
    expected,
  );
}

function semanticCommitted(commandId: string) {
  return {
    kind: ProcessCommandResultKind.Semantic,
    commandId,
    outcome: CommandOutcome.Committed,
  } as const;
}

function expectedTerminal(
  expected: ScenarioResult,
): StateObservation & { status: ProcessStatus.Completed } {
  const terminal = expected.trace.findLast(
    (
      observation,
    ): observation is StateObservation & { status: ProcessStatus.Completed } =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  assert.ok(terminal !== undefined, "parallel scenario has no terminal state");
  return terminal;
}
