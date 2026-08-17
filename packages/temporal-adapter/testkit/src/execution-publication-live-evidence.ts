/** Live retention, pagination, Worker-replacement, and replay evidence for execution publication. */
import { setTimeout as delay } from "node:timers/promises";

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
  submitUserTaskCompletionAtWorkflowId,
} from "@bpmn-lean/temporal-client";
import type {
  TemporalExecutionPublicationClient,
} from "@bpmn-lean/temporal-client";
import {
  ExecutionPublicationResultKind,
  ProcessCommandResultKind,
  bpmnSemanticTaskQueue,
  isCompletedProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  ExecutionPublicationPage,
  ExecutionPublicationResult,
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
  cycle: ExecutionPublicationCycleEvidence;
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
    const handle = await startWorkflow(environment, parallel, workflowId);
    const startRequest = { afterRevision: 0 } as const;
    const immediate = await observe(environment, workflowId, parallel, startRequest);
    const start = await requireStartPage(
      environment,
      workflowId,
      parallel,
      immediate,
    );
    const historyBeforeQueries = await historyEventCount(handle);
    const repeatedStart = requireAvailable(await observe(
      environment,
      workflowId,
      parallel,
      startRequest,
    ));
    const historyAfterQueries = await historyEventCount(handle);

    await requireCommittedCompletion(environment, workflowId, parallel, 1);
    const afterFirstCompletion = requireAvailable(await observe(
      environment,
      workflowId,
      parallel,
      { afterRevision: start.pageThroughRevision },
    ));

    await stopWorker(worker);
    worker = undefined;
    worker = await startWorker(environment, bundle, "publication-worker-2");
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
    const terminal = requireAvailable(await observe(
      environment,
      workflowId,
      parallel,
      { afterRevision: 0 },
    ));
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

    const cycleEvidence = await runCycleEvidence(
      environment,
      cycle,
      "execution-publication-cycle-live",
    );
    await replayHistories(bundle, [
      { history, workflowId },
      {
        history: cycleEvidence.history,
        workflowId: "execution-publication-cycle-live",
      },
    ]);
    const retainedAfterReplay = requireAvailable(await observe(
      environment,
      workflowId,
      parallel,
      { afterRevision: 0 },
    ));
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
): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
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
): Promise<void> {
  const stimulus = input.scenario.stimuli[stimulusIndex];
  if (stimulus?.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`publication stimulus ${stimulusIndex} is not a completion`);
  }
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
