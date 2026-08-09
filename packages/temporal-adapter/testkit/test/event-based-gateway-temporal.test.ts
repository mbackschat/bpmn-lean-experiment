/** Durable refinement witnesses for one operation-addressed Message/PT1S Event-Based Gateway race. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, describe, test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  MessageChannelKind,
  SemanticOperationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import { ApplicationFailure } from "@temporalio/workflow";
import { Worker } from "@temporalio/worker";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  bpmnDeliverMessageSignalName,
  bpmnEventRaceOrderingUnavailableFailureType,
  bpmnSemanticTaskQueue,
  createCachedLocalEnvironment,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  startBpmnProcess,
  submitMessageDelivery,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  historyEvents,
} from "./temporal-history-facts.ts";
import {
  assertNoNonSignalMessageHostEvents,
  fetchMessageHistory,
  waitForMessageSignalCount,
  waitForMessageState,
} from "./message-temporal-test-support.ts";
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

const fixtureUrl = new URL(
  "../../../../scenarios/event-based-gateway-message-timer/process.bpmn",
  import.meta.url,
);
const operationDeadlineMs = 12_000;
const workerIdentity = "bpmn-lean-event-race-probe";
const mutationTaskQueue = "bpmn-event-race-barrier-removal";

type Suite = Readonly<{
  environment: TestWorkflowEnvironment;
  bundle: WorkflowBundleWithSourceMap;
  program: SemanticProcessProgram;
}>;

type Fixture = Readonly<{
  start: StartProcessStimulus;
  delivery: DeliverMessageStimulus;
  wrongDelivery: DeliverMessageStimulus;
}>;

describe("Event-Based Gateway Temporal readiness", { concurrency: false }, () => {
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
      "Event race Temporal environment startup",
    );
    const bundle = await loadBpmnWorkflowBundle();
    const program = await compileEventRaceProgram();
    suite = { environment, bundle, program };
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
        "Event race Temporal environment teardown",
      );
    }
  });

  test("Message victory and Timer cancellation survive Worker replacement", async () => {
    const fixture = eventRaceFixture(
      requiredSuite().program,
      "message-worker-replacement",
    );
    const handle = await startFixture(fixture);
    await waitForArmedRace(handle);
    await suspendWorker();
    const workerDownDelivery = submitMessageDelivery(
      requiredSuite().environment.client.workflow,
      fixture.start.instanceId,
      fixture.delivery,
    );
    try {
      await waitForMessageSignalCount(handle, 1);
    } finally {
      await resumeWorker();
    }
    assert.deepEqual(
      await workerDownDelivery,
      semanticResult(fixture.delivery.commandId),
    );
    await waitForWinnerState(handle, "MessageTask");
    await completeTask(fixture.start.instanceId, "MessageTask");
    assert.equal(isCompletedProcessReceipt(await handle.result()), true);
    const history = await fetchMessageHistory(handle);
    assertEventRaceHistory(history, { started: 1, fired: 0, canceled: 1 });
    assert.equal(signalCount(history), 1);
    retain(handle, history);
  });

  test("Timer victory survives Worker absence and withdraws Message ingress", async () => {
    const fixture = eventRaceFixture(
      requiredSuite().program,
      "timer-worker-replacement",
    );
    const handle = await startFixture(fixture);
    await waitForArmedRace(handle);
    await suspendWorker();
    await delay(1_100);
    await resumeWorker();
    await waitForWinnerState(handle, "TimerTask");
    assert.deepEqual(
      await submitMessageDelivery(
        requiredSuite().environment.client.workflow,
        fixture.start.instanceId,
        fixture.delivery,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: fixture.delivery.commandId,
        outcome: CommandOutcome.Rejected,
      },
    );
    await completeTask(fixture.start.instanceId, "TimerTask");
    assert.equal(isCompletedProcessReceipt(await handle.result()), true);
    const history = await fetchMessageHistory(handle);
    assertEventRaceHistory(history, { started: 1, fired: 1, canceled: 0 });
    assert.equal(signalCount(history), 1);
    retain(handle, history);
  });

  test("a separately activated wrong Message preserves the original Timer", async () => {
    const fixture = eventRaceFixture(
      requiredSuite().program,
      "wrong-message-continuity",
    );
    const handle = await startFixture(fixture);
    const armed = await waitForArmedRace(handle);
    assert.deepEqual(
      await submitMessageDelivery(
        requiredSuite().environment.client.workflow,
        fixture.start.instanceId,
        fixture.wrongDelivery,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: fixture.wrongDelivery.commandId,
        outcome: CommandOutcome.Rejected,
      },
    );
    assert.deepEqual(await waitForArmedRace(handle), armed);
    assert.deepEqual(
      await submitMessageDelivery(
        requiredSuite().environment.client.workflow,
        fixture.start.instanceId,
        fixture.wrongDelivery,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: fixture.wrongDelivery.commandId,
        outcome: CommandOutcome.Rejected,
      },
    );
    assert.deepEqual(await waitForArmedRace(handle), armed);
    await waitForWinnerState(handle, "TimerTask");
    assert.deepEqual(
      await submitMessageDelivery(
        requiredSuite().environment.client.workflow,
        fixture.start.instanceId,
        fixture.delivery,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: fixture.delivery.commandId,
        outcome: CommandOutcome.Rejected,
      },
    );
    await completeTask(fixture.start.instanceId, "TimerTask");
    await handle.result();
    const history = await fetchMessageHistory(handle);
    assertEventRaceHistory(history, { started: 1, fired: 1, canceled: 0 });
    assert.equal(signalCount(history), 3);
    retain(handle, history);
  });

  test("coalesced Message and Timer readiness fails before semantic advancement", async () => {
    const fixture = eventRaceFixture(
      requiredSuite().program,
      "coalesced-ordering-failure",
    );
    const handle = await startFixture(fixture);
    await waitForArmedRace(handle);
    await suspendWorker();
    await delay(1_100);
    await handle.signal(bpmnDeliverMessageSignalName, fixture.delivery);
    await resumeWorker();
    await assert.rejects(
      withDeadline(
        handle.result(),
        operationDeadlineMs,
        "coalesced event race failure",
      ),
      (error: unknown) => hasApplicationFailureType(
        error,
        bpmnEventRaceOrderingUnavailableFailureType,
      ),
    );
    const history = await fetchMessageHistory(handle);
    assertEventRaceHistory(history, { started: 1, fired: 1, canceled: 0 });
    assert.equal(signalCount(history), 1);
    retain(handle, history);
  });

  test("barrier-removal mutation misses the coalesced readiness batch", async () => {
    const fixture = eventRaceFixture(
      requiredSuite().program,
      "barrier-removal-mutation",
    );
    const current = requiredSuite();
    const workflowsPath = fileURLToPath(new URL(
      "../dist/event-race-barrier-removal-workflows.js",
      import.meta.url,
    ));
    let mutationWorker: MutationWorker | undefined = await startMutationWorker(
      current.environment,
      workflowsPath,
    );
    const workflowId = processWorkflowId(fixture.start.instanceId);
    try {
      const handle = await current.environment.client.workflow.start<
        BpmnProcessWorkflow
      >("runBpmnProcessEventRaceBarrierRemovalMutation", {
        taskQueue: mutationTaskQueue,
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [fixture.start, current.program],
      });
      await waitForArmedRace(handle);
      await stopMutationWorker(mutationWorker);
      mutationWorker = undefined;
      await delay(1_100);
      await handle.signal(bpmnDeliverMessageSignalName, fixture.delivery);
      mutationWorker = await startMutationWorker(
        current.environment,
        workflowsPath,
      );
      await waitForWinnerState(handle, "MessageTask");
      await completeTask(fixture.start.instanceId, "MessageTask");
      assert.equal(isCompletedProcessReceipt(await handle.result()), true);
      const history = await fetchMessageHistory(handle);
      assertEventRaceHistory(history, { started: 1, fired: 1, canceled: 0 });
      assert.equal(signalCount(history), 1);
    } finally {
      if (mutationWorker !== undefined) {
        await stopMutationWorker(mutationWorker);
      }
    }
  });

  async function startFixture(
    fixture: Fixture,
  ): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
    const current = requiredSuite();
    const started = await startBpmnProcess(
      current.environment.client.workflow,
      fixture.start,
      current.program,
      { taskQueue: bpmnSemanticTaskQueue },
    );
    assert.equal(started.kind, BpmnProcessStartResultKind.Started);
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      throw new Error("Event race start was rejected");
    }
    return started.handle;
  }

  async function completeTask(
    instanceId: string,
    elementId: "MessageTask" | "TimerTask",
  ): Promise<void> {
    const completion: CompleteUserTaskInstanceStimulus = {
      kind: StimulusKind.CompleteUserTaskInstance,
      commandId: `complete-${instanceId}-${elementId}`,
      taskId: { processInstanceId: instanceId, elementId, activation: 1 },
      submittedValues: [],
    };
    assert.deepEqual(
      await submitUserTaskCompletion(
        requiredSuite().environment.client.workflow,
        instanceId,
        completion,
      ),
      semanticResult(completion.commandId),
    );
  }

  async function suspendWorker(): Promise<void> {
    const current = worker;
    worker = undefined;
    if (current !== undefined) {
      await stopBpmnTestWorker(current);
    }
  }

  async function resumeWorker(): Promise<void> {
    if (worker !== undefined) {
      return;
    }
    const current = requiredSuite();
    worker = await startBpmnTestWorker(
      current.environment,
      current.bundle,
      workerIdentity,
    );
  }

  function retain(
    handle: WorkflowHandle,
    history: TemporalHistory,
  ): void {
    retained.push({ history, workflowId: handle.workflowId });
  }

  function requiredSuite(): Suite {
    if (suite === undefined) {
      throw new Error("Event race suite has not started");
    }
    return suite;
  }
});

async function compileEventRaceProgram(): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(fixtureUrl),
    sourceId: "event-race-temporal",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: "bpmn-2.0.2-event-based-gateway-message-timer-draft",
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Event race fixture was rejected");
  }
  return compilation.semanticProcess;
}

function eventRaceFixture(
  program: SemanticProcessProgram,
  suffix: string,
): Fixture {
  const race = program.operations.find(
    (operation) => operation.kind === SemanticOperationKind.AwaitEventRace,
  );
  assert.ok(race?.kind === SemanticOperationKind.AwaitEventRace);
  const instanceId = `EventRace_${suffix}`;
  const delivery: DeliverMessageStimulus = {
    kind: StimulusKind.DeliverMessage,
    commandId: `deliver-${suffix}`,
    subscriptionId: {
      processInstanceId: instanceId,
      elementId: race.message.elementId,
      activation: 1,
    },
    channel: race.message.channel,
  };
  assert.equal(race.message.channel.kind, MessageChannelKind.OperationMessage);
  return {
    start: {
      kind: StimulusKind.StartProcess,
      commandId: `start-${suffix}`,
      processId: program.processId,
      instanceId,
      initialVariables: [],
    },
    delivery,
    wrongDelivery: {
      ...delivery,
      commandId: `deliver-wrong-${suffix}`,
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId: "WrongInterface",
        interfaceOperationId: race.message.channel.interfaceOperationId,
        messageId: race.message.channel.messageId,
      },
    },
  };
}

async function waitForArmedRace(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<StateObservation> {
  return waitForMessageState(
    handle,
    (state) =>
      state.openMessageSubscriptions.length === 1 &&
      state.openTimers.length === 1 &&
      state.openTimers[0]?.deadlineMs === 1_000,
  );
}

async function waitForWinnerState(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  elementId: "MessageTask" | "TimerTask",
): Promise<void> {
  const state = await waitForMessageState(
    handle,
    (candidate) =>
      candidate.openUserTasks.length === 1 &&
      candidate.openUserTasks[0]?.id.elementId === elementId &&
      candidate.openMessageSubscriptions.length === 0 &&
      candidate.openTimers.length === 0,
  );
  assert.deepEqual(state.openMessageSubscriptions, []);
  assert.deepEqual(state.openTimers, []);
}

function semanticResult(commandId: string) {
  return {
    kind: ProcessCommandResultKind.Semantic,
    commandId,
    outcome: CommandOutcome.Committed,
  } as const;
}

function assertEventRaceHistory(
  history: TemporalHistory,
  expected: Readonly<{ started: number; fired: number; canceled: number }>,
): void {
  assert.equal(historyEvents(history, "timerStartedEventAttributes").length, expected.started);
  assert.equal(historyEvents(history, "timerFiredEventAttributes").length, expected.fired);
  assert.equal(historyEvents(history, "timerCanceledEventAttributes").length, expected.canceled);
  assertNoNonSignalMessageHostEvents(withoutTimerLifecycleEvents(history));
}

function withoutTimerLifecycleEvents(history: TemporalHistory): TemporalHistory {
  return {
    events: history.events.filter((event) => !isTimerLifecycleEvent(event)),
  };
}

function isTimerLifecycleEvent(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const event = value as Readonly<Record<string, unknown>>;
  return [
    "timerStartedEventAttributes",
    "timerFiredEventAttributes",
    "timerCanceledEventAttributes",
  ].some((attributesName) => {
    const attributes = event[attributesName];
    return attributes !== null &&
      typeof attributes === "object" &&
      !Array.isArray(attributes) &&
      Object.keys(attributes).length > 0;
  });
}

function signalCount(history: TemporalHistory): number {
  return historyEvents(history, "workflowExecutionSignaledEventAttributes").length;
}

function hasApplicationFailureType(error: unknown, type: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof ApplicationFailure && current.type === type) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

type MutationWorker = Readonly<{
  worker: Worker;
  completion: Promise<void>;
}>;

async function startMutationWorker(
  environment: TestWorkflowEnvironment,
  workflowsPath: string,
): Promise<MutationWorker> {
  const worker = await Worker.create({
    connection: environment.nativeConnection,
    identity: `${workerIdentity}-mutation`,
    taskQueue: mutationTaskQueue,
    workflowsPath,
  });
  return { worker, completion: worker.run() };
}

async function stopMutationWorker(lease: MutationWorker): Promise<void> {
  lease.worker.shutdown();
  await withDeadline(
    lease.completion,
    operationDeadlineMs,
    "Event race mutation Worker shutdown",
  );
}
