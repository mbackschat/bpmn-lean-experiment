/** Durable Worker-replacement, rollover, coalescing, and replay evidence for Activity boundary Message. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  CommandOutcome,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import type {
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import { ApplicationFailure } from "@temporalio/workflow";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import {
  BpmnWorkflowHostInputKind,
  ProcessCommandResultKind,
  WorkflowChainBudgetKind,
  bpmnDeliverMessageSignalName,
  bpmnMessageBoundedActivitySchedulerUnavailableFailureType,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  bpmnWorkflowContinuationV1,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  readTestProcessTerminalResult,
  submitMessageDelivery,
  submitUserTaskCompletion,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  activityBoundaryMessageFixture,
  compileActivityBoundaryMessageProgram,
} from "./activity-boundary-message-temporal-support.ts";
import type {
  ActivityBoundaryMessageFixture,
} from "./activity-boundary-message-temporal-support.ts";
import {
  assertExactMessageSignals,
  assertNoNonSignalMessageHostEvents,
  waitForMessageSignalCount,
  waitForMessageState,
} from "./message-temporal-test-support.ts";
import {
  historyEvents,
} from "./temporal-history-facts.ts";
import {
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import {
  waitForPublishedWorkflowChainState,
  waitForWorkflowChainRunCount,
  workflowChainRuns,
} from "./workflow-chain-test-support.ts";

const operationDeadlineMs = 20_000;
const workerIdentity = "bpmn-lean-activity-boundary-message";

type Suite = Readonly<{
  environment: TestWorkflowEnvironment;
  bundle: WorkflowBundleWithSourceMap;
  program: Awaited<ReturnType<typeof compileActivityBoundaryMessageProgram>>;
}>;

describe("Activity boundary Message Temporal refinement", { concurrency: false }, () => {
  let suite: Suite | undefined;
  let worker: WorkerLease | undefined;
  const retained: Array<Readonly<{
    history: TemporalHistory;
    workflowId: string;
  }>> = [];

  before(async () => {
    const environment = await withDeadline(
      createCachedLocalEnvironment({
        identity: workerIdentity,
        downloadDirectory: temporalCacheDirectory,
      }),
      40_000,
      "Activity boundary Message Temporal environment startup",
    );
    const bundle = await loadBpmnWorkflowBundle();
    suite = {
      environment,
      bundle,
      program: await compileActivityBoundaryMessageProgram(
        "activity-boundary-message-temporal-refinement",
      ),
    };
    worker = await startBpmnTestWorker(environment, bundle, workerIdentity);
  });

  after(async () => {
    const current = suite;
    if (current === undefined) {
      return;
    }
    try {
      await suspendWorker();
      for (const item of retained) {
        await replayBpmnHistory(
          current.bundle,
          item.history as Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>,
          item.workflowId,
        );
      }
    } finally {
      await withDeadline(
        current.environment.teardown(),
        operationDeadlineMs,
        "Activity boundary Message Temporal environment teardown",
      );
    }
  });

  test("Message victory crosses Continue-As-New and survives Worker replacement", async () => {
    const fixture = activityBoundaryMessageFixture(
      requiredSuite().program,
      "message-victory",
    );
    const execution = await startRolledFixture(fixture);
    await suspendWorker();
    const deliveryResult = submitMessageDelivery(
      requiredSuite().environment.client.workflow,
      fixture.start.instanceId,
      fixture.delivery,
    );
    try {
      await waitForMessageSignalCount(execution.currentHandle, 1);
    } finally {
      await resumeWorker("message-victory-replacement");
    }
    assert.deepEqual(await deliveryResult, semanticResult(
      fixture.delivery.commandId,
      CommandOutcome.Committed,
    ));

    const winner = await waitForPublishedState(
      fixture,
      (state) => state.openUserTasks.some(
        ({ id }) => id.elementId === fixture.boundaryFollowOn.taskId.elementId,
      ),
    );
    assertWinnerState(winner, fixture.boundaryFollowOn.taskId.elementId);
    assert.deepEqual(
      await submitUserTaskCompletion(
        requiredSuite().environment.client.workflow,
        fixture.start.instanceId,
        fixture.boundaryFollowOn,
      ),
      semanticResult(fixture.boundaryFollowOn.commandId, CommandOutcome.Committed),
    );
    assert.equal(
      isCompletedProcessReceipt(
        (await readTestProcessTerminalResult(execution.firstHandle)).receipt,
      ),
      true,
    );
    await retainWorkflowChain(fixture, [fixture.wrongDelivery, fixture.delivery]);
  });

  test("task victory withdraws Message ingress across Worker replacement", async () => {
    const fixture = activityBoundaryMessageFixture(
      requiredSuite().program,
      "task-victory",
    );
    const execution = await startRolledFixture(fixture);
    await suspendWorker();
    const completionResult = submitUserTaskCompletion(
      requiredSuite().environment.client.workflow,
      fixture.start.instanceId,
      fixture.completion,
    );
    await resumeWorker("task-victory-replacement");
    assert.deepEqual(await completionResult, semanticResult(
      fixture.completion.commandId,
      CommandOutcome.Committed,
    ));

    const winner = await waitForPublishedState(
      fixture,
      (state) => state.openUserTasks.some(
        ({ id }) => id.elementId === fixture.normalFollowOn.taskId.elementId,
      ),
    );
    assertWinnerState(winner, fixture.normalFollowOn.taskId.elementId);
    assert.deepEqual(
      await submitMessageDelivery(
        requiredSuite().environment.client.workflow,
        fixture.start.instanceId,
        fixture.staleDelivery,
      ),
      semanticResult(fixture.staleDelivery.commandId, CommandOutcome.Rejected),
    );
    assert.deepEqual(
      await waitForPublishedState(
        fixture,
        (state) => state.openUserTasks.some(
          ({ id }) => id.elementId === fixture.normalFollowOn.taskId.elementId,
        ),
      ),
      winner,
    );
    assert.deepEqual(
      await submitUserTaskCompletion(
        requiredSuite().environment.client.workflow,
        fixture.start.instanceId,
        fixture.normalFollowOn,
      ),
      semanticResult(fixture.normalFollowOn.commandId, CommandOutcome.Committed),
    );
    assert.equal(
      isCompletedProcessReceipt(
        (await readTestProcessTerminalResult(execution.firstHandle)).receipt,
      ),
      true,
    );
    await retainWorkflowChain(
      fixture,
      [fixture.wrongDelivery, fixture.staleDelivery],
    );
  });

  test("coalesced Signal and Update settle and fail under the bounded identity", async () => {
    const fixture = activityBoundaryMessageFixture(
      requiredSuite().program,
      "coalesced-failure",
    );
    const execution = await startRolledFixture(fixture);
    await suspendWorker();
    const completionResult = submitUserTaskCompletion(
      requiredSuite().environment.client.workflow,
      fixture.start.instanceId,
      fixture.completion,
    );
    const deliveryResult = submitMessageDelivery(
      requiredSuite().environment.client.workflow,
      fixture.start.instanceId,
      fixture.delivery,
    );
    try {
      await waitForMessageSignalCount(execution.currentHandle, 1);
    } finally {
      await resumeWorker("coalesced-replacement");
    }
    const settlements = await withDeadline(
      Promise.allSettled([completionResult, deliveryResult]),
      operationDeadlineMs,
      "coalesced Activity boundary Message client settlement",
    );
    assert.equal(settlements.length, 2);
    await assert.rejects(
      withDeadline(
        execution.firstHandle.result(),
        operationDeadlineMs,
        "coalesced Activity boundary Message failure",
      ),
      (error: unknown) => hasApplicationFailureType(
        error,
        bpmnMessageBoundedActivitySchedulerUnavailableFailureType,
      ),
    );

    const histories = await retainWorkflowChain(
      fixture,
      [fixture.wrongDelivery, fixture.delivery],
    );
    const failed = histories.flatMap((history) => historyEvents(
      history,
      "workflowExecutionFailedEventAttributes",
    ));
    assert.equal(failed.length, 1);
    assert.equal(
      applicationFailureTypeFromFailedEvent(failed[0]),
      bpmnMessageBoundedActivitySchedulerUnavailableFailureType,
    );
  });

  async function startRolledFixture(
    fixture: ActivityBoundaryMessageFixture,
  ): Promise<Readonly<{
    firstHandle: WorkflowHandle<BpmnProcessWorkflow>;
    currentHandle: WorkflowHandle<BpmnProcessWorkflow>;
  }>> {
    const current = requiredSuite();
    const workflowId = processWorkflowId(fixture.start.instanceId);
    const firstHandle = await current.environment.client.workflow.start<
      BpmnProcessWorkflow
    >(bpmnProcessWorkflowType, {
      args: [
        fixture.start,
        current.program,
        {
          protocol: bpmnWorkflowContinuationV1,
          kind: BpmnWorkflowHostInputKind.Initial,
          eventHistoryEventLimit: 4,
          eventHistoryByteLimit: workflowChainProductionLimit(
            WorkflowChainBudgetKind.EventHistoryBytes,
          ),
        },
      ],
      taskQueue: bpmnSemanticTaskQueue,
      workflowId,
      workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    const original = await waitForArmedState(currentHandle(fixture), fixture);
    assert.deepEqual(
      await submitMessageDelivery(
        current.environment.client.workflow,
        fixture.start.instanceId,
        fixture.wrongDelivery,
      ),
      semanticResult(fixture.wrongDelivery.commandId, CommandOutcome.Rejected),
    );
    await waitForWorkflowChainRunCount(current.environment, workflowId, 2);
    const successorHandle = currentHandle(fixture);
    assert.deepEqual(
      await waitForPublishedState(
        fixture,
        (state) =>
          state.openUserTasks.length === 1 &&
          state.openMessageSubscriptions.length === 1,
      ),
      original,
    );
    assert.equal(
      (await workflowChainRuns(current.environment, workflowId)).length,
      2,
    );
    return { firstHandle, currentHandle: successorHandle };
  }

  async function waitForArmedState(
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    fixture: ActivityBoundaryMessageFixture,
  ): Promise<StateObservation> {
    const state = await waitForMessageState(
      handle,
      (candidate) =>
        candidate.openUserTasks.length === 1 &&
        candidate.openMessageSubscriptions.length === 1,
    );
    assert.equal(state.status, ProcessStatus.Running);
    assert.deepEqual(
      state.openUserTasks.map(({ id }) => id),
      [fixture.completion.taskId],
    );
    assert.deepEqual(
      state.openMessageSubscriptions,
      [{ id: fixture.delivery.subscriptionId, channel: fixture.delivery.channel }],
    );
    return state;
  }

  async function waitForPublishedState(
    fixture: ActivityBoundaryMessageFixture,
    predicate: (state: StateObservation) => boolean,
  ): Promise<StateObservation> {
    const current = requiredSuite();
    return waitForPublishedWorkflowChainState(
      current.environment,
      processWorkflowId(fixture.start.instanceId),
      current.program,
      fixture.start.instanceId,
      predicate,
    );
  }

  async function retainWorkflowChain(
    fixture: ActivityBoundaryMessageFixture,
    expectedSignals: ReadonlyArray<
      ActivityBoundaryMessageFixture["delivery"]
    >,
  ): Promise<ReadonlyArray<TemporalHistory>> {
    const current = requiredSuite();
    const workflowId = processWorkflowId(fixture.start.instanceId);
    const runs = await workflowChainRuns(current.environment, workflowId);
    assert.ok(runs.length >= 2);
    const histories: TemporalHistory[] = [];
    for (const run of runs) {
      const handle = current.environment.client.workflow.getHandle<
        BpmnProcessWorkflow
      >(workflowId, run.runId);
      const history = await handle.fetchHistory() as TemporalHistory;
      histories.push(history);
      retained.push({ history, workflowId });
    }
    const combined = {
      events: histories.flatMap(({ events }) => [...events]),
    } satisfies TemporalHistory;
    assertExactMessageSignals(combined, expectedSignals);
    assertNoNonSignalMessageHostEvents(combined);
    return histories;
  }

  async function suspendWorker(): Promise<void> {
    const current = worker;
    worker = undefined;
    if (current !== undefined) {
      await stopBpmnTestWorker(current);
    }
  }

  async function resumeWorker(identity: string): Promise<void> {
    const current = requiredSuite();
    assert.equal(worker, undefined);
    worker = await startBpmnTestWorker(
      current.environment,
      current.bundle,
      identity,
    );
  }

  function currentHandle(
    fixture: ActivityBoundaryMessageFixture,
  ): WorkflowHandle<BpmnProcessWorkflow> {
    return getTestProcessHandle(
      requiredSuite().environment.client.workflow,
      fixture.start.instanceId,
    );
  }

  function requiredSuite(): Suite {
    if (suite === undefined) {
      throw new TypeError("Activity boundary Message suite is not initialized");
    }
    return suite;
  }
});

function semanticResult(commandId: string, outcome: CommandOutcome) {
  return {
    kind: ProcessCommandResultKind.Semantic,
    commandId,
    outcome,
  } as const;
}

function assertWinnerState(state: StateObservation, elementId: string): void {
  assert.equal(state.status, ProcessStatus.Running);
  assert.deepEqual(
    state.openUserTasks.map(({ id }) => id.elementId),
    [elementId],
  );
  assert.deepEqual(state.openMessageSubscriptions, []);
}

function hasApplicationFailureType(error: unknown, type: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof ApplicationFailure && current.type === type) {
      return current.nonRetryable === true;
    }
    current = current.cause;
  }
  return false;
}

function applicationFailureTypeFromFailedEvent(event: unknown): string {
  const attributes = requireRecord(
    requireRecord(event, "failed event")
      .workflowExecutionFailedEventAttributes,
    "failed event attributes",
  );
  const failure = requireRecord(attributes.failure, "failed event failure");
  const information = requireRecord(
    failure.applicationFailureInfo,
    "application failure info",
  );
  return requireString(information.type, "application failure type");
}

function requireRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} is not a record`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} is not a string`);
  }
  return value;
}
