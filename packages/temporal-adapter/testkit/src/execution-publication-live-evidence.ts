/** Live retention, pagination, Worker-replacement, and replay evidence for execution publication. */
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";

import {
  CommandOutcome,
  SemanticTransitionKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  PublicControlTokenPosition,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowHandle,
} from "@temporalio/client";
import { WorkflowUpdateStage } from "@temporalio/client";
import type {
  TestWorkflowEnvironment,
} from "@temporalio/testing";
import {
  Worker,
} from "@temporalio/worker";
import type {
  WorkflowBundleWithSourceMap,
} from "@temporalio/worker";

import {
  observeTemporalExecutionPublication,
  observeTemporalFlowNodeOccurrences,
  submitUserTaskCompletionAtWorkflowId,
} from "@bpmn-lean/temporal-client";
import type {
  TemporalExecutionPublicationClient,
  TemporalFlowNodeOccurrencePublicationClient,
} from "@bpmn-lean/temporal-client";
import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  ProcessCommandResultKind,
  bpmnCompleteUserTaskUpdateName,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  isCompletedProcessReceipt,
  productionBpmnWorkflowInitialHostInput,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  ExecutionPublicationPage,
  ExecutionPublicationResult,
  FlowNodeOccurrencePage,
  ProcessCommandResult,
} from "@bpmn-lean/temporal-protocol";
import {
  loadBpmnWorkflowBundle,
} from "@bpmn-lean/temporal-worker";

import { withDeadline } from "./contracts.js";
import type { TemporalHistory } from "./contracts.js";
import { createCachedLocalEnvironment } from "./ephemeral-server.js";
import { readTestProcessTerminalResult } from "./private-process-handle.js";
import { requireStartStimulus } from "./runner-support.js";
import { startScenarioWorkflow } from "./runner-workflow-start.js";
import { historyEvents } from "./history-evidence-decoding.js";
import { requireScenarioAdmission } from "./scenario-admission.js";

const operationDeadlineMs = 10_000;
const environmentDeadlineMs = 40_000;
const suiteDeadlineMs = 55_000;

export type ExecutionPublicationEvidenceInput = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
}>;

export type ExecutionPublicationCycleEvidence = Readonly<{
  terminal: ExecutionPublicationPage;
  reviewOperationRevisions: number[];
  completionActivations: number[];
  history: TemporalHistory;
  retainedAfterReplay: ExecutionPublicationPage;
}>;

export type ExecutionPublicationLiveEvidence = Readonly<{
  immediateKind: ExecutionPublicationResult["kind"];
  start: ExecutionPublicationPage;
  repeatedStart: ExecutionPublicationPage;
  afterFirstCompletion: ExecutionPublicationPage;
  terminalSuffix: ExecutionPublicationPage;
  terminal: ExecutionPublicationPage;
  firstTerminalPage: ExecutionPublicationPage;
  secondTerminalPage: ExecutionPublicationPage;
  atHead: ExecutionPublicationPage;
  retainedAfterReplay: ExecutionPublicationPage;
  insideBatch: ExecutionPublicationResult;
  aheadOfHead: ExecutionPublicationResult;
  queryHistoryEventCounts: readonly [before: number, after: number];
  historyDerivedRevisionMutation: number;
  startStateDifferenceMutation: string[];
  history: TemporalHistory;
  parallelRunIds: string[];
  parallelHistories: TemporalHistory[];
  replayedParallelRunIds: string[];
  preCompletionHistory: TemporalHistory;
  startOccurrences: FlowNodeOccurrencePage;
  parallelPages: PairedPublicationPages;
  retainedOccurrencesAfterReplay: FlowNodeOccurrencePage[];
  firstCompletionRecovery: Readonly<{
    acceptedRunId: string;
    acceptedOutcome: CommandOutcome;
    recoveredOutcome: unknown;
    duplicateResult: ProcessCommandResult;
    before: PairedPublicationPages;
    after: PairedPublicationPages;
  }>;
  cycle: ExecutionPublicationCycleEvidence;
}>;

type PairedPublicationPages = Readonly<{
  execution: ExecutionPublicationPage[];
  occurrences: FlowNodeOccurrencePage[];
}>;

/** Runs the approved parallel witness and repeated-element negative against one real Temporal service. */
export function runExecutionPublicationLiveEvidence(
  downloadDirectory: string,
  parallel: ExecutionPublicationEvidenceInput,
  cycle: ExecutionPublicationEvidenceInput,
): Promise<ExecutionPublicationLiveEvidence> {
  return withDeadline(
    runEvidence(downloadDirectory, parallel, cycle),
    suiteDeadlineMs,
    "execution publication live evidence suite",
  );
}

async function runEvidence(
  downloadDirectory: string,
  parallel: ExecutionPublicationEvidenceInput,
  cycle: ExecutionPublicationEvidenceInput,
): Promise<ExecutionPublicationLiveEvidence> {
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-execution-publication-evidence",
      downloadDirectory,
    }),
    environmentDeadlineMs,
    "execution publication Temporal environment startup",
  );
  let worker: PublicationWorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startWorker(environment, bundle, "publication-worker-1");
    const workflowId = "execution-publication-parallel-live";
    const handle = await startWorkflow(environment, parallel, workflowId, true);
    const firstRunId = (await handle.describe()).runId;
    const startRequest = { afterRevision: 0 } as const;
    const immediate = await observe(environment, workflowId, parallel, startRequest);
    const { history: preCompletionHistory, nextRunId } = await waitForContinuation(handle);
    const completionHandle = environment.client.workflow.getHandle<BpmnProcessWorkflow>(
      workflowId, nextRunId,
    );
    const start = await requireStartPage(
      environment,
      workflowId,
      parallel,
      immediate,
    );
    const startPair = await readPairedPages(environment, workflowId, parallel);
    const startOccurrences = startPair.occurrences[0]!;
    const historyBeforeQueries = await historyEventCount(completionHandle);
    const repeatedStart = requireAvailable(await observe(
      environment,
      workflowId,
      parallel,
      startRequest,
    ));
    const historyAfterQueries = await historyEventCount(completionHandle);

    const firstCompletion = requireCompletion(parallel, 1);
    const accepted = await withDeadline(completionHandle.startUpdate<
      CommandOutcome, [CompleteUserTaskInstanceStimulus]
    >(
      bpmnCompleteUserTaskUpdateName,
      { args: [firstCompletion], updateId: contentBoundUpdateId(firstCompletion),
        waitForStage: WorkflowUpdateStage.ACCEPTED },
    ), operationDeadlineMs, "parallel first completion acceptance");
    const acceptedOutcome = await withDeadline(
      accepted.result(), operationDeadlineMs, "parallel first completion result",
    );
    assert.equal(acceptedOutcome, CommandOutcome.Committed);
    await waitForContinuation(completionHandle);
    const afterFirstCompletion = requireAvailable(await observe(
      environment,
      workflowId,
      parallel,
      { afterRevision: start.pageThroughRevision },
    ));
    const beforeRecovery = await readPairedPages(environment, workflowId, parallel);

    await stopWorker(worker);
    worker = undefined;
    worker = await startWorker(environment, bundle, "publication-worker-2");
    const recoveredOutcome = await withDeadline(completionHandle.getUpdateHandle(
      contentBoundUpdateId(firstCompletion),
    ).result(), operationDeadlineMs, "parallel accepted result recovery");
    const duplicateResult = await requireCommittedCompletion(environment, workflowId, parallel, 1);
    const afterRecovery = await readPairedPages(environment, workflowId, parallel);
    await requireCommittedCompletion(environment, workflowId, parallel, 2);
    const receipt = (await withDeadline(
      readTestProcessTerminalResult(handle),
      operationDeadlineMs,
      "parallel publication Workflow terminal result",
    )).receipt;
    if (!isCompletedProcessReceipt(receipt)) {
      throw new TypeError("parallel publication Workflow did not complete");
    }

    const terminalSuffix = requireAvailable(await observe(
      environment,
      workflowId,
      parallel,
      { afterRevision: afterFirstCompletion.pageThroughRevision },
    ));
    const parallelPages = await readPairedPages(environment, workflowId, parallel);
    const terminal = combinedExecution(parallelPages);
    const firstTerminalPage = requireAvailable(await observe(
      environment,
      workflowId,
      parallel,
      { afterRevision: 0, limit: 1 },
    ));
    const secondTerminalPage = requireAvailable(await observe(
      environment,
      workflowId,
      parallel,
      { afterRevision: start.pageThroughRevision, limit: 1 },
    ));
    const atHead = requireAvailable(await observe(
      environment,
      workflowId,
      parallel,
      { afterRevision: terminal.headRevision },
    ));
    const insideBatch = await observe(
      environment,
      workflowId,
      parallel,
      { afterRevision: 1 },
    );
    const aheadOfHead = await observe(
      environment,
      workflowId,
      parallel,
      { afterRevision: terminal.headRevision + 1 },
    );
    const history = await fetchHistory(handle);
    const parallelRuns = await linkedRuns(environment, workflowId, firstRunId);

    const cycleEvidence = await runCycleEvidence(
      environment,
      cycle,
      "execution-publication-cycle-live",
    );
    await replayHistories(bundle, [
      ...parallelRuns.map(({ history }) => ({ history, workflowId })),
      {
        history: cycleEvidence.history,
        workflowId: "execution-publication-cycle-live",
      },
    ]);
    const retainedPair = await readPairedPages(environment, workflowId, parallel);
    const retainedAfterReplay = combinedExecution(retainedPair);
    const cycleRetainedAfterReplay = requireAvailable(await observe(
      environment,
      "execution-publication-cycle-live",
      cycle,
      { afterRevision: 0 },
    ));

    return {
      immediateKind: immediate.kind,
      start,
      repeatedStart,
      afterFirstCompletion,
      terminalSuffix,
      terminal,
      firstTerminalPage,
      secondTerminalPage,
      atHead,
      retainedAfterReplay,
      insideBatch,
      aheadOfHead,
      queryHistoryEventCounts: [historyBeforeQueries, historyAfterQueries],
      historyDerivedRevisionMutation: temporalHistoryRevisionMutation(history),
      startStateDifferenceMutation: stateDifferenceTransitionMutation(
        [],
        start.current?.controlTokens ?? [],
      ),
      history,
      parallelRunIds: parallelRuns.map(({ runId }) => runId),
      parallelHistories: parallelRuns.map(({ history }) => history),
      replayedParallelRunIds: parallelRuns.map(({ runId }) => runId),
      preCompletionHistory,
      startOccurrences,
      parallelPages,
      retainedOccurrencesAfterReplay: retainedPair.occurrences,
      firstCompletionRecovery: {
        acceptedRunId: nextRunId, acceptedOutcome, recoveredOutcome, duplicateResult,
        before: beforeRecovery, after: afterRecovery,
      },
      cycle: {
        ...cycleEvidence,
        retainedAfterReplay: cycleRetainedAfterReplay,
      },
    };
  } finally {
    if (worker !== undefined) {
      await stopWorker(worker);
    }
    await withDeadline(
      environment.teardown(),
      operationDeadlineMs,
      "execution publication Temporal environment teardown",
    );
  }
}

async function runCycleEvidence(
  environment: TestWorkflowEnvironment,
  input: ExecutionPublicationEvidenceInput,
  workflowId: string,
): Promise<Omit<ExecutionPublicationCycleEvidence, "retainedAfterReplay">> {
  const handle = await startWorkflow(environment, input, workflowId);
  await requireStartPage(
    environment,
    workflowId,
    input,
    await observe(environment, workflowId, input, { afterRevision: 0 }),
  );
  for (let index = 1; index < input.scenario.stimuli.length; index += 1) {
    await requireCommittedCompletion(environment, workflowId, input, index);
  }
  if (!isCompletedProcessReceipt((await withDeadline(
    readTestProcessTerminalResult(handle),
    operationDeadlineMs,
    "cyclic publication Workflow terminal result",
  )).receipt)) {
    throw new TypeError("cyclic publication Workflow did not complete");
  }
  const terminal = requireAvailable(await observe(
    environment,
    workflowId,
    input,
    { afterRevision: 0 },
  ));
  const transitions = terminal.batches.flatMap(({ transitions }) => transitions);
  const reviewOperationRevisions = transitions.flatMap((record) =>
    record.transition.kind === SemanticTransitionKind.InternalOperation &&
      record.transition.operationId === "operation:Review"
      ? [record.revision]
      : []
  );
  const completionActivations = transitions.flatMap((record) =>
    record.transition.kind === SemanticTransitionKind.ExternalStimulus &&
      record.transition.stimulus.kind === StimulusKind.CompleteUserTaskInstance
      ? [record.transition.stimulus.taskId.activation]
      : []
  );
  return {
    terminal,
    reviewOperationRevisions,
    completionActivations,
    history: await fetchHistory(handle),
  };
}

async function startWorkflow(
  environment: TestWorkflowEnvironment,
  input: ExecutionPublicationEvidenceInput,
  workflowId: string,
  forceRollover = false,
): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
  if (forceRollover) {
    const start = requireStartStimulus(input.scenario);
    requireScenarioAdmission(start, input.semanticProcess);
    const started = await withDeadline(environment.client.workflow.start<BpmnProcessWorkflow>(
      bpmnProcessWorkflowType,
      { taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [start, input.semanticProcess,
          { ...productionBpmnWorkflowInitialHostInput(), eventHistoryEventLimit: 3 }],
      },
    ), operationDeadlineMs, "parallel publication chain start");
    return environment.client.workflow.getHandle<BpmnProcessWorkflow>(
      workflowId, started.firstExecutionRunId,
    );
  }
  return startScenarioWorkflow(
    environment.client.workflow,
    requireStartStimulus(input.scenario),
    input.semanticProcess,
    workflowId,
    operationDeadlineMs,
  );
}

async function requireCommittedCompletion(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  input: ExecutionPublicationEvidenceInput,
  stimulusIndex: number,
): Promise<ProcessCommandResult> {
  const stimulus = requireCompletion(input, stimulusIndex);
  const result = await submitUserTaskCompletionAtWorkflowId(
    environment.client.workflow,
    workflowId,
    requireStartStimulus(input.scenario).instanceId,
    stimulus,
  );
  if (
    result.kind !== ProcessCommandResultKind.Semantic ||
    result.commandId !== stimulus.commandId ||
    result.outcome !== CommandOutcome.Committed
  ) {
    throw new TypeError(`publication completion ${stimulus.commandId} did not commit`);
  }
  return result;
}

function requireCompletion(
  input: ExecutionPublicationEvidenceInput, index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = input.scenario.stimuli[index];
  if (stimulus?.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`publication stimulus ${index} is not a completion`);
  }
  return stimulus;
}

async function requireStartPage(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  input: ExecutionPublicationEvidenceInput,
  immediate: ExecutionPublicationResult,
): Promise<ExecutionPublicationPage> {
  if (immediate.kind === ExecutionPublicationResultKind.Available) {
    return immediate.page;
  }
  if (immediate.kind !== ExecutionPublicationResultKind.NotReady) {
    throw new TypeError(`immediate publication Query returned ${immediate.kind}`);
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await delay(25);
    const result = await observe(
      environment,
      workflowId,
      input,
      { afterRevision: 0 },
    );
    if (result.kind === ExecutionPublicationResultKind.Available) {
      return result.page;
    }
    if (result.kind !== ExecutionPublicationResultKind.NotReady) {
      throw new TypeError(`publication readiness retry returned ${result.kind}`);
    }
  }
  throw new Error("execution publication remained notReady after bounded retry");
}

function observe(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  input: ExecutionPublicationEvidenceInput,
  request: Readonly<{ afterRevision: number; limit?: number }>,
): Promise<ExecutionPublicationResult> {
  const start = requireStartStimulus(input.scenario);
  return observeTemporalExecutionPublication(
    environment.client.workflow as unknown as TemporalExecutionPublicationClient,
    workflowId,
    {
      definition: input.semanticProcess.identity,
      processId: input.semanticProcess.processId,
      processInstanceId: start.instanceId,
    },
    request,
  );
}

function requireAvailable(result: ExecutionPublicationResult): ExecutionPublicationPage {
  if (result.kind !== ExecutionPublicationResultKind.Available) {
    throw new TypeError(`execution publication Query returned ${result.kind}`);
  }
  return result.page;
}

async function readPairedPages(
  environment: TestWorkflowEnvironment, workflowId: string,
  input: ExecutionPublicationEvidenceInput,
): Promise<PairedPublicationPages> {
  const pages: PairedPublicationPages = { execution: [], occurrences: [] };
  let afterRevision = 0;
  for (let index = 0; index < 4; index += 1) {
    const [execution, occurrences] = await Promise.all([
      observe(environment, workflowId, input, { afterRevision }),
      observeTemporalFlowNodeOccurrences(
        environment.client.workflow as unknown as TemporalFlowNodeOccurrencePublicationClient,
        workflowId,
        { definition: input.semanticProcess.identity, processId: input.semanticProcess.processId,
          processInstanceId: requireStartStimulus(input.scenario).instanceId },
        { afterRevision },
      ),
    ]);
    const page = requireAvailable(execution);
    assert.ok(occurrences.kind === FlowNodeOccurrencePublicationResultKind.Available);
    const shape = (value: ExecutionPublicationPage | FlowNodeOccurrencePage) => ({
      definition: value.definition, processId: value.processId,
      processInstanceId: value.processInstanceId, requestedAfterRevision: value.requestedAfterRevision,
      pageThroughRevision: value.pageThroughRevision, headRevision: value.headRevision,
      batches: value.batches.map(({ commandId, fromRevision, throughRevision, transitions }) => ({
        commandId, fromRevision, throughRevision, revisions: transitions.map(({ revision }) => revision),
      })),
    });
    assert.deepEqual(shape(page), shape(occurrences.page));
    pages.execution.push(page);
    pages.occurrences.push(occurrences.page);
    if (page.pageThroughRevision === page.headRevision) return pages;
    assert.ok(page.pageThroughRevision > afterRevision);
    assert.equal(page.current, null);
    assert.equal(occurrences.page.currentOpen, null);
    afterRevision = page.pageThroughRevision;
  }
  throw new Error("parallel publication exceeded its three-command page bound");
}

function combinedExecution(pages: PairedPublicationPages): ExecutionPublicationPage {
  const first = pages.execution[0];
  const last = pages.execution.at(-1);
  assert.ok(first !== undefined && last !== undefined);
  // The retained single-Run oracle compares the complete publication; real pages stay separate above.
  return { ...first, pageThroughRevision: last.pageThroughRevision, current: last.current,
    batches: pages.execution.flatMap(({ batches }) => batches) };
}

async function waitForContinuation(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<Readonly<{ history: TemporalHistory; nextRunId: string }>> {
  const deadline = performance.now() + operationDeadlineMs;
  do {
    const history = await fetchHistory(handle);
    const continuation = historyEvents(history, "workflowExecutionContinuedAsNewEventAttributes");
    if (continuation.length !== 0) {
      assert.equal(continuation.length, 1);
      const nextRunId = continuation[0]!.attributes.newExecutionRunId;
      assert.ok(typeof nextRunId === "string" && nextRunId.length > 0);
      return { history, nextRunId };
    }
    await delay(25);
  } while (performance.now() < deadline);
  throw new Error("parallel publication did not cross the required stable-checkpoint rollover");
}

async function linkedRuns(
  environment: TestWorkflowEnvironment, workflowId: string, firstRunId: string,
): Promise<Array<Readonly<{ runId: string; history: TemporalHistory }>>> {
  const runs: Array<Readonly<{ runId: string; history: TemporalHistory }>> = [];
  let runId = firstRunId;
  for (let ordinal = 0; ordinal < 4; ordinal += 1) {
    assert.ok(!runs.some((run) => run.runId === runId));
    const history = await fetchHistory(
      environment.client.workflow.getHandle<BpmnProcessWorkflow>(workflowId, runId),
    );
    const started = historyEvents(history, "workflowExecutionStartedEventAttributes");
    assert.equal(started.length, 1);
    assert.equal(started[0]!.attributes.continuedExecutionRunId || undefined, runs.at(-1)?.runId);
    runs.push({ runId, history });
    const continuation = historyEvents(history, "workflowExecutionContinuedAsNewEventAttributes");
    if (continuation.length === 0) {
      assert.equal(historyEvents(history, "workflowExecutionCompletedEventAttributes").length, 1);
      return runs;
    }
    assert.equal(continuation.length, 1);
    const nextRunId = continuation[0]!.attributes.newExecutionRunId;
    assert.ok(typeof nextRunId === "string" && nextRunId.length > 0);
    runId = nextRunId;
  }
  throw new Error("parallel publication exceeded its three-command Run bound");
}

/** Deliberately wrong revision account proving that Temporal Event History cannot number semantics. */
export function temporalHistoryRevisionMutation(history: TemporalHistory): number {
  return history.events.length;
}

/** Deliberately incomplete state-difference account that loses consumed and transient positions. */
export function stateDifferenceTransitionMutation(
  before: ReadonlyArray<PublicControlTokenPosition>,
  after: ReadonlyArray<PublicControlTokenPosition>,
): string[] {
  return after.flatMap((candidate) =>
    before.some((prior) => sameTokenPosition(prior, candidate))
      ? []
      : [candidate.sequenceFlowId]
  );
}

function sameTokenPosition(
  left: PublicControlTokenPosition,
  right: PublicControlTokenPosition,
): boolean {
  return left.sequenceFlowId === right.sequenceFlowId &&
    left.owner.processInstanceId === right.owner.processInstanceId &&
    left.owner.definitionScopeId === right.owner.definitionScopeId &&
    left.owner.activation === right.owner.activation &&
    left.multiplicity === right.multiplicity;
}

type PublicationWorkerLease = Readonly<{
  worker: Worker;
  completion: Promise<void>;
  failure(): unknown;
}>;

async function startWorker(
  environment: TestWorkflowEnvironment,
  workflowBundle: WorkflowBundleWithSourceMap,
  identity: string,
): Promise<PublicationWorkerLease> {
  const worker = await withDeadline(
    Worker.create({
      connection: environment.nativeConnection,
      identity,
      taskQueue: bpmnSemanticTaskQueue,
      workflowBundle,
    }),
    operationDeadlineMs,
    `${identity} startup`,
  );
  let failure: unknown;
  const completion = worker.run().catch((error: unknown) => {
    failure = error;
  });
  await delay(0);
  if (failure !== undefined) {
    throw failure;
  }
  return { worker, completion, failure: () => failure };
}

async function stopWorker(lease: PublicationWorkerLease): Promise<void> {
  lease.worker.shutdown();
  await withDeadline(
    lease.completion,
    operationDeadlineMs,
    "execution publication Worker shutdown",
  );
  const failure = lease.failure();
  if (failure !== undefined) {
    throw failure;
  }
}

async function replayHistories(
  workflowBundle: WorkflowBundleWithSourceMap,
  items: ReadonlyArray<Readonly<{ history: TemporalHistory; workflowId: string }>>,
): Promise<void> {
  await withDeadline((async () => {
    let replayed = 0;
    for await (const result of Worker.runReplayHistories(
      { workflowBundle },
      items,
    )) {
      const expected = items[replayed];
      if (
        expected === undefined ||
        result.workflowId !== expected.workflowId ||
        result.error !== undefined
      ) {
        throw result.error ?? new Error("execution publication replay mismatch");
      }
      replayed += 1;
    }
    if (replayed !== items.length) {
      throw new Error("execution publication replay omitted a history");
    }
  })(), operationDeadlineMs, "execution publication exact history replay");
}

async function historyEventCount(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<number> {
  return (await fetchHistory(handle)).events.length;
}

async function fetchHistory(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<TemporalHistory> {
  const history = await withDeadline(
    handle.fetchHistory(),
    operationDeadlineMs,
    "execution publication history fetch",
  );
  if (!Array.isArray(history.events)) {
    throw new TypeError("execution publication history has no events array");
  }
  return history as TemporalHistory;
}
