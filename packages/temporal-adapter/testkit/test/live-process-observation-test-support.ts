/**
 * Paged publication reads, command assertions and per-Run replay for focused witnesses that drive one Process
 * through a real Temporal service across Continue-As-New.
 *
 * Publication reads follow the public pages to the head and name no Run, so they observe the stitched chain as a
 * consumer would. Only `replayWorkflowChain` addresses individual Runs, because its purpose is to inspect each
 * retained history.
 */
import assert from "node:assert/strict";

import {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  SemanticProcessProgram,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  ProcessCommandResultKind,
  bpmnTraceQueryName,
  observeTemporalExecutionPublication,
  observeTemporalFlowNodeOccurrences,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  CommittedTransitionBatch,
  CurrentCommittedExecution,
  FlowNodeOccurrenceBatch,
  OpenFlowNodeOccurrence,
  TemporalExecutionPublicationClient,
  TemporalFlowNodeOccurrencePublicationClient,
} from "@bpmn-lean/temporal-testkit";

import { withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory } from "./temporal-worker-test-support.ts";
import {
  waitForPublishedWorkflowChainState,
  workflowChainRuns,
} from "./workflow-chain-test-support.ts";

const operationDeadlineMs = 20_000;
const publicationPageBound = 16;

export type StartedScenario = Readonly<{
  handle: WorkflowHandle;
  workflowId: string;
  instanceId: string;
}>;

export type OccurrenceSnapshot = DeepReadonly<{
  headRevision: number;
  batches: FlowNodeOccurrenceBatch[];
  currentOpen: OpenFlowNodeOccurrence[];
}>;

export type ExecutionSnapshot = DeepReadonly<{
  headRevision: number;
  batches: CommittedTransitionBatch[];
  current: CurrentCommittedExecution;
}>;

/** What the retained Event Histories of one Workflow chain showed, after every Run replayed without error. */
export type ReplayedChain = DeepReadonly<{
  runCount: number;
  rolloverCount: number;
  /** The committed observations each Run retained, oldest Run first. */
  runTraces: CanonicalObservation[][];
  /** All Runs concatenated: the chain's whole committed trace. */
  trace: CanonicalObservation[];
}>;

export function publishedState(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  program: SemanticProcessProgram,
  taskCount: number,
): Promise<StateObservation> {
  return publishedStateWhere(environment, started, program,
    (state) => state.openUserTasks.length === taskCount);
}

export function publishedStateWhere(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  program: SemanticProcessProgram,
  predicate: (state: StateObservation) => boolean,
): Promise<StateObservation> {
  return waitForPublishedWorkflowChainState(environment, started.workflowId, program,
    started.instanceId, predicate);
}

export async function assertCompletion(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  completion: CompleteUserTaskInstanceStimulus,
  outcome: CommandOutcome,
): Promise<void> {
  assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow,
    started.instanceId, completion), {
    kind: ProcessCommandResultKind.Semantic,
    commandId: completion.commandId,
    outcome,
  });
}

export async function occurrences(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  program: SemanticProcessProgram,
): Promise<OccurrenceSnapshot> {
  const batches: FlowNodeOccurrenceBatch[] = [];
  let afterRevision = 0;
  for (let pageIndex = 0; pageIndex < publicationPageBound; pageIndex += 1) {
    const result = await observeTemporalFlowNodeOccurrences(
      environment.client.workflow as unknown as TemporalFlowNodeOccurrencePublicationClient,
      started.workflowId,
      { definition: program.identity, processId: program.processId, processInstanceId: started.instanceId },
      { afterRevision },
    );
    assert.ok(result.kind === FlowNodeOccurrencePublicationResultKind.Available);
    batches.push(...result.page.batches);
    if (result.page.currentOpen !== null) {
      return { headRevision: result.page.headRevision, batches, currentOpen: result.page.currentOpen };
    }
    assert.ok(result.page.pageThroughRevision > afterRevision);
    afterRevision = result.page.pageThroughRevision;
  }
  assert.fail("occurrence publication exceeded its bounded page count");
}

/** Execution publication from revision zero to the head, every committed batch plus the current execution. */
export async function executionPublication(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  program: SemanticProcessProgram,
): Promise<ExecutionSnapshot> {
  const batches: CommittedTransitionBatch[] = [];
  let afterRevision = 0;
  for (let pageIndex = 0; pageIndex < publicationPageBound; pageIndex += 1) {
    const result = await observeTemporalExecutionPublication(
      environment.client.workflow as unknown as TemporalExecutionPublicationClient,
      started.workflowId,
      { definition: program.identity, processId: program.processId, processInstanceId: started.instanceId },
      { afterRevision },
    );
    assert.ok(result.kind === ExecutionPublicationResultKind.Available);
    batches.push(...result.page.batches);
    if (result.page.current !== null) {
      return { headRevision: result.page.headRevision, batches, current: result.page.current };
    }
    assert.ok(result.page.pageThroughRevision > afterRevision);
    afterRevision = result.page.pageThroughRevision;
  }
  assert.fail("execution publication exceeded its bounded page count");
}

/**
 * Replays every Run of the chain against the bundle and returns the stitched retained trace.
 *
 * The histories hold no Activity, Timer, Signal or child Workflow: a User Task journey is Update-driven, so any of
 * them would be a hidden orchestration fact leaking into the semantic account.
 */
export async function replayWorkflowChain(
  environment: TestWorkflowEnvironment,
  bundle: WorkflowBundleWithSourceMap,
  workflowId: string,
): Promise<ReplayedChain> {
  const runs = await workflowChainRuns(environment, workflowId);
  const runTraces: CanonicalObservation[][] = [];
  let rolloverCount = 0;
  for (const run of runs) {
    const handle = environment.client.workflow.getHandle<BpmnProcessWorkflow>(workflowId, run.runId);
    runTraces.push([...await withDeadline(
      handle.query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName),
      operationDeadlineMs, "retained trace",
    )]);
    const history = await withDeadline(handle.fetchHistory(), operationDeadlineMs, "retained history");
    assert.ok(history.events !== undefined && history.events !== null);
    for (const event of history.events) {
      assert.equal(event.activityTaskScheduledEventAttributes ?? null, null);
      assert.equal(event.timerStartedEventAttributes ?? null, null);
      assert.equal(event.workflowExecutionSignaledEventAttributes ?? null, null);
      assert.equal(event.startChildWorkflowExecutionInitiatedEventAttributes ?? null, null);
      if (event.workflowExecutionContinuedAsNewEventAttributes != null) {
        rolloverCount += 1;
      }
    }
    await replayBpmnHistory(bundle, history, workflowId);
  }
  return { runCount: runs.length, rolloverCount, runTraces, trace: runTraces.flat() };
}
