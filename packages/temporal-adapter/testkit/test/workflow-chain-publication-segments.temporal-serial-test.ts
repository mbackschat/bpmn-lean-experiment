import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  CommandOutcome,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  WorkflowChainBudgetKind,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  createCachedLocalEnvironment,
  decodeWorkflowTerminalResult,
  getTestProcessHandle,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  observeTemporalExecutionPublication,
  observeTemporalFlowNodeOccurrences,
  processTerminalReceiptFormatV1,
  processWorkflowId,
  submitUserTaskCompletion,
  workflowChainProductionLimit,
  workflowTerminalResultFormatV1,
} from "@bpmn-lean/temporal-testkit";
import type {
  ExecutionPublicationPage,
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrencePage,
  FlowNodeOccurrenceStart,
  TemporalExecutionPublicationClient,
  TemporalFlowNodeOccurrencePublicationClient,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";

import {
  compileExecutionInput,
  loadJson,
  requiredAt,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import { historyEvents } from "./temporal-history-facts.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/user-task-cycle/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/user-task-cycle/process.bpmn",
  import.meta.url,
);
const operationDeadlineMs = 20_000;

type PublicationRequest = Readonly<{
  afterRevision: number;
  limit?: number;
}>;

type PairedPage = Readonly<{
  execution: ExecutionPublicationPage;
  occurrences: FlowNodeOccurrencePage;
}>;

test("traverses aligned publication segments without exposing Workflow Runs", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const start = requiredStart(scenario);
  const workflowId = processWorkflowId(start.instanceId);
  const completions = [1, 2, 3].map((index) => requiredCompletion(scenario, index));
  const publicValues: unknown[] = [];
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-chain-publication-segments",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "publication-segment Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  const observePair = async (request: PublicationRequest): Promise<PairedPage> => {
    const identity = {
      definition: semanticProcess.identity,
      processId: semanticProcess.processId,
      processInstanceId: start.instanceId,
    };
    const [execution, occurrences] = await Promise.all([
      observeTemporalExecutionPublication(
        environment.client.workflow as unknown as TemporalExecutionPublicationClient,
        workflowId,
        identity,
        request,
      ),
      observeTemporalFlowNodeOccurrences(
        environment.client.workflow as unknown as TemporalFlowNodeOccurrencePublicationClient,
        workflowId,
        identity,
        request,
      ),
    ]);
    publicValues.push(execution, occurrences);
    assert.equal(execution.kind, ExecutionPublicationResultKind.Available);
    assert.equal(
      occurrences.kind,
      FlowNodeOccurrencePublicationResultKind.Available,
    );
    if (
      execution.kind !== ExecutionPublicationResultKind.Available ||
      occurrences.kind !== FlowNodeOccurrencePublicationResultKind.Available
    ) {
      assert.fail("paired publication query did not return available pages");
    }
    assertAlignedPages(execution.page, occurrences.page);
    return { execution: execution.page, occurrences: occurrences.page };
  };

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-chain-publication-segments",
    );
    const firstHandle = await environment.client.workflow.start(
      bpmnProcessWorkflowType,
      {
        args: [
          start,
          semanticProcess,
          {
            protocol: "bpmn-lean.workflow-continuation.v1",
            kind: "initial",
            eventHistoryEventLimit: 4,
            eventHistoryByteLimit: workflowChainProductionLimit(
              WorkflowChainBudgetKind.EventHistoryBytes,
            ),
          },
        ],
        taskQueue: bpmnSemanticTaskQueue,
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      },
    );

    await waitForCompletionTarget(environment, start.instanceId, completions[0]!);
    const initialPage = await observePair({ afterRevision: 0 });
    assertPage(initialPage, 0, 4, 4, [[0, 4]]);
    const activationOne = startedReview(
      initialPage.occurrences,
      "start-user-task-cycle",
    );
    assert.deepEqual(openReview(initialPage.occurrences).id, activationOne.id);

    await complete(environment, start.instanceId, completions[0]!);
    await waitForCompletionTarget(environment, start.instanceId, completions[1]!);
    await waitForRunCount(environment, workflowId, 2);

    const firstBoundary = await observePair({ afterRevision: 0 });
    assertPage(firstBoundary, 0, 8, 8, [[0, 4], [4, 8]]);
    assertReviewEnded(
      firstBoundary.occurrences,
      "complete-cycle-repeat",
      activationOne.id,
    );
    const activationTwo = startedReview(
      firstBoundary.occurrences,
      "complete-cycle-repeat",
    );
    assert.deepEqual(openReview(firstBoundary.occurrences).id, activationTwo.id);

    await complete(environment, start.instanceId, completions[1]!);
    await waitForCompletionTarget(environment, start.instanceId, completions[2]!);
    await waitForRunCount(environment, workflowId, 3);

    const secondBoundary = await observePair({ afterRevision: 8 });
    assertPage(secondBoundary, 8, 12, 12, [[8, 12]]);
    assertReviewEnded(
      secondBoundary.occurrences,
      "complete-cycle-rework",
      activationTwo.id,
    );
    const activationThree = startedReview(
      secondBoundary.occurrences,
      "complete-cycle-rework",
    );
    assert.deepEqual(openReview(secondBoundary.occurrences).id, activationThree.id);

    await complete(environment, start.instanceId, completions[2]!);
    const rawTerminal = await withDeadline(
      firstHandle.result(),
      operationDeadlineMs,
      "publication-segment terminal result",
    );
    assertTerminalResult(rawTerminal, semanticProcess, start.instanceId);

    const beforeFirstSegmentBoundary = await observePair({ afterRevision: 0 });
    assertPage(beforeFirstSegmentBoundary, 0, 8, 16, [[0, 4], [4, 8]]);
    const immediatelyBeforeFirstBoundary = await observePair({ afterRevision: 4 });
    assertPage(immediatelyBeforeFirstBoundary, 4, 8, 16, [[4, 8]]);
    const atFirstSegmentBoundary = await observePair({ afterRevision: 8 });
    assertPage(atFirstSegmentBoundary, 8, 12, 16, [[8, 12]]);
    const atSecondSegmentBoundary = await observePair({ afterRevision: 12 });
    assertPage(atSecondSegmentBoundary, 12, 16, 16, [[12, 16]]);
    const atHead = await observePair({ afterRevision: 16 });
    assertPage(atHead, 16, 16, 16, []);

    assert.equal(beforeFirstSegmentBoundary.execution.current, null);
    assert.equal(beforeFirstSegmentBoundary.occurrences.currentOpen, null);
    assert.equal(immediatelyBeforeFirstBoundary.execution.current, null);
    assert.equal(immediatelyBeforeFirstBoundary.occurrences.currentOpen, null);
    assert.equal(atFirstSegmentBoundary.execution.current, null);
    assert.equal(atFirstSegmentBoundary.occurrences.currentOpen, null);
    assert.equal(atSecondSegmentBoundary.execution.current?.revision, 16);
    assert.deepEqual(atSecondSegmentBoundary.occurrences.currentOpen, []);
    assert.equal(atHead.execution.current?.revision, 16);
    assert.deepEqual(atHead.occurrences.currentOpen, []);
    assertReviewEnded(
      atFirstSegmentBoundary.occurrences,
      "complete-cycle-rework",
      activationTwo.id,
    );
    assertReviewEnded(
      atSecondSegmentBoundary.occurrences,
      "complete-cycle-exit",
      activationThree.id,
    );

    const histories = await workflowRunHistories(environment, workflowId);
    assert.equal(histories.length, 3);
    assert.equal(
      histories.reduce(
        (count, { history }) => count + historyEvents(
          history as TemporalHistory,
          "workflowExecutionContinuedAsNewEventAttributes",
        ).length,
        0,
      ),
      2,
    );
    for (const { runId, history } of histories) {
      await replayBpmnHistory(bundle, history, workflowId);
      const publicJson = JSON.stringify(publicValues);
      assert.equal(publicJson.includes(runId), false);
    }
    for (const value of publicValues) {
      assertNoPrivateSegmentFields(value);
    }
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

async function waitForCompletionTarget(
  environment: TestWorkflowEnvironment,
  processInstanceId: string,
  completion: CompleteUserTaskInstanceStimulus,
): Promise<void> {
  const open = await waitForOpenUserTaskIds(
    getTestProcessHandle(environment.client.workflow, processInstanceId),
    [completion.taskId.elementId],
  );
  assert.deepEqual(open.map(({ id }) => id), [completion.taskId]);
}

async function complete(
  environment: TestWorkflowEnvironment,
  processInstanceId: string,
  completion: CompleteUserTaskInstanceStimulus,
): Promise<void> {
  const result = await submitUserTaskCompletion(
    environment.client.workflow,
    processInstanceId,
    completion,
  );
  assert.equal(result.kind, "semantic");
  assert.equal(result.outcome, CommandOutcome.Committed);
}

function assertAlignedPages(
  execution: ExecutionPublicationPage,
  occurrences: FlowNodeOccurrencePage,
): void {
  assert.deepEqual(
    {
      requestedAfterRevision: occurrences.requestedAfterRevision,
      pageThroughRevision: occurrences.pageThroughRevision,
      headRevision: occurrences.headRevision,
      batches: occurrences.batches.map(batchRange),
    },
    {
      requestedAfterRevision: execution.requestedAfterRevision,
      pageThroughRevision: execution.pageThroughRevision,
      headRevision: execution.headRevision,
      batches: execution.batches.map(batchRange),
    },
  );
}

function assertPage(
  page: PairedPage,
  requestedAfterRevision: number,
  pageThroughRevision: number,
  headRevision: number,
  expectedRanges: ReadonlyArray<readonly [number, number]>,
): void {
  assert.equal(page.execution.requestedAfterRevision, requestedAfterRevision);
  assert.equal(page.execution.pageThroughRevision, pageThroughRevision);
  assert.equal(page.execution.headRevision, headRevision);
  assert.deepEqual(
    page.execution.batches.map(({ fromRevision, throughRevision }) => [
      fromRevision,
      throughRevision,
    ]),
    expectedRanges,
  );
  for (const batch of page.execution.batches) {
    assert.deepEqual(
      batch.transitions.map(({ revision }) => revision),
      revisionRange(batch.fromRevision + 1, batch.throughRevision),
    );
  }
  for (const batch of page.occurrences.batches) {
    assert.deepEqual(
      batch.transitions.map(({ revision }) => revision),
      revisionRange(batch.fromRevision + 1, batch.throughRevision),
    );
  }
}

function batchRange(batch: Readonly<{
  commandId: string;
  fromRevision: number;
  throughRevision: number;
  transitions: ReadonlyArray<Readonly<{ revision: number }>>;
}>) {
  return {
    commandId: batch.commandId,
    fromRevision: batch.fromRevision,
    throughRevision: batch.throughRevision,
    revisions: batch.transitions.map(({ revision }) => revision),
  };
}

function revisionRange(from: number, through: number): number[] {
  return Array.from({ length: through - from + 1 }, (_, index) => from + index);
}

function startedReview(
  page: FlowNodeOccurrencePage,
  commandId: string,
): FlowNodeOccurrenceStart {
  const values = requiredBatch(page, commandId).transitions.flatMap(
    ({ lifecycle }) => lifecycle.started,
  ).filter(({ elementId }) => elementId === "Review");
  assert.equal(values.length, 1);
  return values[0]!;
}

function assertReviewEnded(
  page: FlowNodeOccurrencePage,
  commandId: string,
  expected: FlowNodeOccurrenceStart["id"],
): void {
  const values = requiredBatch(page, commandId).transitions.flatMap(
    ({ lifecycle }) => lifecycle.ended,
  ).filter(({ id }) =>
    id.processInstanceId === expected.processInstanceId &&
    id.startRevision === expected.startRevision &&
    id.startIndex === expected.startIndex
  );
  assert.equal(values.length, 1);
}

function openReview(page: FlowNodeOccurrencePage) {
  const values = page.currentOpen?.filter(({ elementId }) => elementId === "Review") ?? [];
  assert.equal(values.length, 1);
  return values[0]!;
}

function requiredBatch(
  page: FlowNodeOccurrencePage,
  commandId: string,
): FlowNodeOccurrenceBatch {
  const batch = page.batches.find((candidate) => candidate.commandId === commandId);
  assert.ok(batch !== undefined, `missing occurrence batch ${commandId}`);
  return batch;
}

function assertTerminalResult(
  value: unknown,
  program: SemanticProcessProgram,
  processInstanceId: string,
): void {
  assert.ok(isRecord(value));
  assert.deepEqual(Object.keys(value).sort(), ["entries", "format", "receipt"]);
  assert.equal(value.format, workflowTerminalResultFormatV1);
  const terminal = decodeWorkflowTerminalResult(value);
  assert.equal(isCompletedProcessReceipt(terminal.receipt), true);
  assert.deepEqual(Object.keys(terminal.receipt).sort(), [
    "definition",
    "finalState",
    "format",
    "processId",
    "processInstanceId",
  ]);
  assert.equal(terminal.receipt.format, processTerminalReceiptFormatV1);
  assert.deepEqual(terminal.receipt.definition, program.identity);
  assert.equal(terminal.receipt.processId, program.processId);
  assert.equal(terminal.receipt.processInstanceId, processInstanceId);
  assert.equal(terminal.recoveryEntries.length, 3);
  assert.deepEqual(terminal.legacyMessageDeliveryRecords, []);
  assertNoPrivateSegmentFields(value);
}

async function workflowRunHistories(
  environment: TestWorkflowEnvironment,
  workflowId: string,
): Promise<ReadonlyArray<Readonly<{ runId: string; history: FetchedHistory }>>> {
  const runs: Array<Readonly<{ runId: string; history: FetchedHistory }>> = [];
  for await (const execution of environment.client.workflow.list()) {
    if (execution.workflowId === workflowId) {
      const history = await environment.client.workflow
        .getHandle(workflowId, execution.runId)
        .fetchHistory();
      runs.push({ runId: execution.runId, history });
    }
  }
  return runs;
}

type FetchedHistory = Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>;

async function waitForRunCount(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await countWorkflowRuns(environment, workflowId) === expected) return;
    await delay(25);
  }
  assert.fail(`Workflow chain did not reach ${expected} Runs`);
}

async function countWorkflowRuns(
  environment: TestWorkflowEnvironment,
  workflowId: string,
): Promise<number> {
  return withDeadline((async () => {
    let count = 0;
    for await (const execution of environment.client.workflow.list()) {
      if (execution.workflowId === workflowId) count += 1;
    }
    return count;
  })(), 1_000, "Workflow-chain Run listing");
}

function assertNoPrivateSegmentFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoPrivateSegmentFields(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(
      key,
      /^(?:runId|firstExecutionRunId|sha256)$|descriptor|digest|directory/iu,
    );
    assertNoPrivateSegmentFields(child);
  }
}

function requiredStart(scenario: Scenario) {
  const stimulus = requiredAt(scenario.stimuli, 0, "cycle stimuli");
  if (stimulus.kind !== StimulusKind.StartProcess) {
    throw new TypeError("cycle scenario has no Process start");
  }
  return stimulus;
}

function requiredCompletion(
  scenario: Scenario,
  index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = requiredAt(scenario.stimuli, index, "cycle stimuli");
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`cycle stimulus ${index} is not a User Task completion`);
  }
  return stimulus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
