/** Live retention, lifecycle, replacement, and replay evidence for flow-node occurrence publication. */
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";

import {
  CommandOutcome,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import {
  observeTemporalExecutionPublication,
  submitMessageDeliveryAtWorkflowId,
  submitUserTaskCompletionAtWorkflowId,
} from "@bpmn-lean/temporal-client";
import {
  observeTemporalFlowNodeOccurrences,
} from "@bpmn-lean/temporal-client/flow-node-occurrence-publication";
import type {
  TemporalExecutionPublicationClient,
} from "@bpmn-lean/temporal-client";
import type {
  TemporalFlowNodeOccurrencePublicationClient,
} from "@bpmn-lean/temporal-client/flow-node-occurrence-publication";
import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  ProcessCommandResultKind,
  bpmnOpenUserTasksQueryName,
  bpmnSemanticTaskQueue,
  isCompletedProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  ExecutionPublicationPage,
  FlowNodeOccurrencePage,
  FlowNodeOccurrencePublicationResult,
  ProcessCommandResult,
} from "@bpmn-lean/temporal-protocol";
import { loadBpmnWorkflowBundle } from "@bpmn-lean/temporal-worker";

import { withDeadline } from "./contracts.js";
import type { TemporalHistory } from "./contracts.js";
import { createCachedLocalEnvironment } from "./ephemeral-server.js";
import { readTestProcessTerminalResult } from "./private-process-handle.js";
import { requireStartStimulus } from "./runner-support.js";
import { startScenarioWorkflow } from "./runner-workflow-start.js";

const operationDeadlineMs = 10_000;
const environmentDeadlineMs = 40_000;
const suiteDeadlineMs = 55_000;

export type FlowNodeOccurrenceEvidenceInput = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
}>;

export type FlowNodeOccurrencePrimaryEvidence = Readonly<{
  start: FlowNodeOccurrencePage;
  repeatedStart: FlowNodeOccurrencePage;
  terminal: FlowNodeOccurrencePage;
  terminalBeforeDuplicate: FlowNodeOccurrencePage;
  firstPage: FlowNodeOccurrencePage;
  secondPage: FlowNodeOccurrencePage;
  retainedAfterReplay: FlowNodeOccurrencePage;
  insideBatch: FlowNodeOccurrencePublicationResult;
  aheadOfHead: FlowNodeOccurrencePublicationResult;
  executionTerminal: ExecutionPublicationPage;
  duplicateResult: ProcessCommandResult;
  queryHistoryEventCounts: readonly [before: number, after: number];
  workerIdentities: readonly [first: string, replacement: string];
}>;

export type FlowNodeOccurrenceLiveEvidence = Readonly<{
  primary: FlowNodeOccurrencePrimaryEvidence;
  eventRace: FlowNodeOccurrencePage;
  callActivity: FlowNodeOccurrencePage;
  boundary: FlowNodeOccurrencePage;
}>;

/** Runs all four approved witnesses against one production bundle and one real Temporal service. */
export function runFlowNodeOccurrenceLiveEvidence(
  downloadDirectory: string,
  primary: FlowNodeOccurrenceEvidenceInput,
  eventRace: FlowNodeOccurrenceEvidenceInput,
  callActivity: FlowNodeOccurrenceEvidenceInput,
  boundary: FlowNodeOccurrenceEvidenceInput,
): Promise<FlowNodeOccurrenceLiveEvidence> {
  return withDeadline(
    runEvidence(downloadDirectory, primary, eventRace, callActivity, boundary),
    suiteDeadlineMs,
    "flow-node occurrence live evidence suite",
  );
}

async function runEvidence(
  downloadDirectory: string,
  primary: FlowNodeOccurrenceEvidenceInput,
  eventRace: FlowNodeOccurrenceEvidenceInput,
  callActivity: FlowNodeOccurrenceEvidenceInput,
  boundary: FlowNodeOccurrenceEvidenceInput,
): Promise<FlowNodeOccurrenceLiveEvidence> {
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-flow-node-occurrence-evidence",
      downloadDirectory,
    }),
    environmentDeadlineMs,
    "flow-node occurrence Temporal environment startup",
  );
  let worker: PublicationWorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startWorker(environment, bundle, "occurrence-worker-1");
    const primaryEvidence = await runPrimary(
      environment,
      bundle,
      worker,
      primary,
      (candidate) => { worker = candidate; },
    );
    const eventRacePage = await runScenario(
      environment,
      eventRace,
      "flow-node-occurrence-event-race",
    );
    const callActivityPage = await runScenario(
      environment,
      callActivity,
      "flow-node-occurrence-call-activity",
    );
    const boundaryPage = await runScenario(
      environment,
      boundary,
      "flow-node-occurrence-boundary",
    );
    return {
      primary: primaryEvidence,
      eventRace: eventRacePage,
      callActivity: callActivityPage,
      boundary: boundaryPage,
    };
  } finally {
    if (worker !== undefined) await stopWorker(worker);
    await withDeadline(
      environment.teardown(),
      operationDeadlineMs,
      "flow-node occurrence Temporal environment teardown",
    );
  }
}

async function runPrimary(
  environment: TestWorkflowEnvironment,
  bundle: WorkflowBundleWithSourceMap,
  firstWorker: PublicationWorkerLease,
  input: FlowNodeOccurrenceEvidenceInput,
  setWorker: (worker: PublicationWorkerLease | undefined) => void,
): Promise<FlowNodeOccurrencePrimaryEvidence> {
  const workflowId = "flow-node-occurrence-primary";
  const handle = await startWorkflow(environment, input, workflowId);
  const immediate = await observeOccurrences(environment, workflowId, input, {
    afterRevision: 0,
  });
  const start = await requireReadyPage(environment, workflowId, input, immediate);
  const historyBeforeQuery = (await fetchHistory(handle)).events.length;
  const repeatedStart = requireAvailable(await observeOccurrences(
    environment,
    workflowId,
    input,
    { afterRevision: 0 },
  ));
  const historyAfterQuery = (await fetchHistory(handle)).events.length;

  setWorker(undefined);
  await stopWorker(firstWorker);
  await delay(25);
  const replacement = await startWorker(
    environment,
    bundle,
    "occurrence-worker-2",
  );
  setWorker(replacement);
  const completion = requireCompletion(input.scenario, 1);
  const completionResult = await submitCompletion(
    environment,
    workflowId,
    input,
    completion,
  );
  if (!isCompletedProcessReceipt((await withDeadline(
    readTestProcessTerminalResult(handle),
    operationDeadlineMs,
    "flow-node occurrence primary Workflow terminal result",
  )).receipt)) {
    throw new TypeError("flow-node occurrence primary Workflow did not complete");
  }
  const terminalBeforeDuplicate = requireAvailable(await observeOccurrences(
    environment,
    workflowId,
    input,
    { afterRevision: 0 },
  ));
  const duplicateResult = await submitCompletion(
    environment,
    workflowId,
    input,
    completion,
  );
  const terminal = requireAvailable(await observeOccurrences(
    environment,
    workflowId,
    input,
    { afterRevision: 0 },
  ));
  if (!isDeepStrictEqual(completionResult, duplicateResult)) {
    throw new TypeError("duplicate completion did not recover its exact result");
  }

  const firstPage = requireAvailable(await observeOccurrences(
    environment,
    workflowId,
    input,
    { afterRevision: 0, limit: 1 },
  ));
  const secondPage = requireAvailable(await observeOccurrences(
    environment,
    workflowId,
    input,
    { afterRevision: start.pageThroughRevision, limit: 1 },
  ));
  const insideBatch = await observeOccurrences(environment, workflowId, input, {
    afterRevision: requireFirstBatch(start).fromRevision + 1,
  });
  const aheadOfHead = await observeOccurrences(environment, workflowId, input, {
    afterRevision: terminal.headRevision + 1,
  });
  const executionTerminal = await requireExecutionPage(
    environment,
    workflowId,
    input,
  );
  const history = await fetchHistory(handle);
  await replayHistory(bundle, history, workflowId);
  const retainedAfterReplay = requireAvailable(await observeOccurrences(
    environment,
    workflowId,
    input,
    { afterRevision: 0 },
  ));

  return {
    start,
    repeatedStart,
    terminal,
    terminalBeforeDuplicate,
    firstPage,
    secondPage,
    retainedAfterReplay,
    insideBatch,
    aheadOfHead,
    executionTerminal,
    duplicateResult,
    queryHistoryEventCounts: [historyBeforeQuery, historyAfterQuery],
    workerIdentities: [firstWorker.identity, replacement.identity],
  };
}

async function runScenario(
  environment: TestWorkflowEnvironment,
  input: FlowNodeOccurrenceEvidenceInput,
  workflowId: string,
): Promise<FlowNodeOccurrencePage> {
  const start = requireStartStimulus(input.scenario);
  const handle = await startWorkflow(environment, input, workflowId);
  await requireReadyPage(
    environment,
    workflowId,
    input,
    await observeOccurrences(environment, workflowId, input, { afterRevision: 0 }),
  );
  for (const stimulus of input.scenario.stimuli.slice(1)) {
    switch (stimulus.kind) {
      case StimulusKind.DeliverMessage:
      case StimulusKind.DeliverPayloadMessage:
        requireCommitted(await withDeadline(
          submitMessageDeliveryAtWorkflowId(
            environment.client.workflow,
            workflowId,
            start.instanceId,
            stimulus,
          ),
          operationDeadlineMs,
          `flow-node occurrence Message ${stimulus.commandId}`,
        ), stimulus.commandId);
        break;
      case StimulusKind.CompleteUserTaskInstance:
        await waitForOpenUserTask(handle, stimulus);
        await submitCompletion(environment, workflowId, input, stimulus);
        break;
      case StimulusKind.FireTimer:
        break;
      default:
        throw new TypeError(`unsupported occurrence evidence stimulus ${stimulus.kind}`);
    }
  }
  if (!isCompletedProcessReceipt((await withDeadline(
    readTestProcessTerminalResult(handle),
    operationDeadlineMs,
    `flow-node occurrence Workflow ${workflowId} terminal result`,
  )).receipt)) {
    throw new TypeError(`flow-node occurrence Workflow ${workflowId} did not complete`);
  }
  return requireAvailable(await observeOccurrences(
    environment,
    workflowId,
    input,
    { afterRevision: 0 },
  ));
}

async function submitCompletion(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  input: FlowNodeOccurrenceEvidenceInput,
  completion: CompleteUserTaskInstanceStimulus,
): Promise<ProcessCommandResult> {
  const result = await withDeadline(
    submitUserTaskCompletionAtWorkflowId(
      environment.client.workflow,
      workflowId,
      requireStartStimulus(input.scenario).instanceId,
      completion,
    ),
    operationDeadlineMs,
    `flow-node occurrence completion ${completion.commandId}`,
  );
  requireCommitted(result, completion.commandId);
  return result;
}

function requireCommitted(result: ProcessCommandResult, commandId: string): void {
  if (
    result.kind !== ProcessCommandResultKind.Semantic ||
    result.commandId !== commandId ||
    result.outcome !== CommandOutcome.Committed
  ) {
    throw new TypeError(`flow-node occurrence command ${commandId} did not commit`);
  }
}

async function waitForOpenUserTask(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  completion: CompleteUserTaskInstanceStimulus,
): Promise<void> {
  let latestError: unknown;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const tasks = await withDeadline(
        handle.query<readonly OpenUserTask[]>(bpmnOpenUserTasksQueryName),
        1_000,
        "flow-node occurrence open-task Query",
      );
      if (tasks.some(({ id }) =>
        id.processInstanceId === completion.taskId.processInstanceId &&
        id.elementId === completion.taskId.elementId &&
        id.activation === completion.taskId.activation
      )) return;
    } catch (error: unknown) {
      latestError = error;
    }
    await delay(25);
  }
  throw latestError instanceof Error
    ? latestError
    : new Error(`User Task ${completion.taskId.elementId} did not open`);
}

async function requireReadyPage(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  input: FlowNodeOccurrenceEvidenceInput,
  immediate: FlowNodeOccurrencePublicationResult,
): Promise<FlowNodeOccurrencePage> {
  if (immediate.kind === FlowNodeOccurrencePublicationResultKind.Available) {
    return immediate.page;
  }
  if (immediate.kind !== FlowNodeOccurrencePublicationResultKind.NotReady) {
    throw new TypeError(`immediate occurrence Query returned ${immediate.kind}`);
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await delay(25);
    const result = await observeOccurrences(
      environment,
      workflowId,
      input,
      { afterRevision: 0 },
    );
    if (result.kind === FlowNodeOccurrencePublicationResultKind.Available) {
      return result.page;
    }
    if (result.kind !== FlowNodeOccurrencePublicationResultKind.NotReady) {
      throw new TypeError(`occurrence readiness returned ${result.kind}`);
    }
  }
  throw new Error("flow-node occurrence publication remained notReady");
}

function observeOccurrences(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  input: FlowNodeOccurrenceEvidenceInput,
  request: Readonly<{ afterRevision: number; limit?: number }>,
): Promise<FlowNodeOccurrencePublicationResult> {
  const start = requireStartStimulus(input.scenario);
  return observeTemporalFlowNodeOccurrences(
    environment.client.workflow as unknown as TemporalFlowNodeOccurrencePublicationClient,
    workflowId,
    {
      definition: input.semanticProcess.identity,
      processId: input.semanticProcess.processId,
      processInstanceId: start.instanceId,
    },
    request,
  );
}

async function requireExecutionPage(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  input: FlowNodeOccurrenceEvidenceInput,
): Promise<ExecutionPublicationPage> {
  const start = requireStartStimulus(input.scenario);
  const result = await observeTemporalExecutionPublication(
    environment.client.workflow as unknown as TemporalExecutionPublicationClient,
    workflowId,
    {
      definition: input.semanticProcess.identity,
      processId: input.semanticProcess.processId,
      processInstanceId: start.instanceId,
    },
    { afterRevision: 0 },
  );
  if (result.kind !== ExecutionPublicationResultKind.Available) {
    throw new TypeError(`execution publication Query returned ${result.kind}`);
  }
  return result.page;
}

function requireAvailable(
  result: FlowNodeOccurrencePublicationResult,
): FlowNodeOccurrencePage {
  if (result.kind !== FlowNodeOccurrencePublicationResultKind.Available) {
    throw new TypeError(`flow-node occurrence Query returned ${result.kind}`);
  }
  return result.page;
}

function requireFirstBatch(page: FlowNodeOccurrencePage) {
  const batch = page.batches[0];
  if (batch === undefined) throw new TypeError("occurrence page has no first batch");
  return batch;
}

function requireCompletion(
  scenario: Scenario,
  index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = scenario.stimuli[index];
  if (stimulus?.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`occurrence stimulus ${index} is not a User Task completion`);
  }
  return stimulus;
}

function startWorkflow(
  environment: TestWorkflowEnvironment,
  input: FlowNodeOccurrenceEvidenceInput,
  workflowId: string,
): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
  return startScenarioWorkflow(
    environment.client.workflow,
    requireStartStimulus(input.scenario),
    input.semanticProcess,
    workflowId,
    operationDeadlineMs,
  );
}

type PublicationWorkerLease = Readonly<{
  identity: string;
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
  if (failure !== undefined) throw failure;
  return { identity, worker, completion, failure: () => failure };
}

async function stopWorker(lease: PublicationWorkerLease): Promise<void> {
  lease.worker.shutdown();
  await withDeadline(
    lease.completion,
    operationDeadlineMs,
    "flow-node occurrence Worker shutdown",
  );
  const failure = lease.failure();
  if (failure !== undefined) throw failure;
}

async function replayHistory(
  workflowBundle: WorkflowBundleWithSourceMap,
  history: TemporalHistory,
  workflowId: string,
): Promise<void> {
  await withDeadline((async () => {
    let replayed = 0;
    for await (const result of Worker.runReplayHistories(
      { workflowBundle },
      [{ history, workflowId }],
    )) {
      if (result.workflowId !== workflowId || result.error !== undefined) {
        throw result.error ?? new Error("flow-node occurrence replay mismatch");
      }
      replayed += 1;
    }
    if (replayed !== 1) throw new Error("flow-node occurrence replay omitted history");
  })(), operationDeadlineMs, "flow-node occurrence exact history replay");
}

async function fetchHistory(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<TemporalHistory> {
  const history = await withDeadline(
    handle.fetchHistory(),
    operationDeadlineMs,
    "flow-node occurrence history fetch",
  );
  if (!Array.isArray(history.events)) {
    throw new TypeError("flow-node occurrence history has no events array");
  }
  return history as TemporalHistory;
}
