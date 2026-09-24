import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind, CommandOutcome, ProcessStatus,
  REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID, StimulusKind,
  MessageChannelKind, ScenarioStepKind, advanceScenario, compareCanonicalStrings, deployProcess, initialState,
} from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, CompleteUserTaskInstanceStimulus, DeliverMessageStimulus, OpenUserTask, SemanticProcessProgram, StartProcessStimulus, StateObservation, Stimulus } from "@bpmn-lean/semantic-core";
import { defaultPayloadConverter, isGrpcServiceError } from "@temporalio/client";
import proto from "@temporalio/proto";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  ProcessCommandResultKind, bpmnProcessWorkflowType, bpmnSemanticTaskQueue, bpmnTraceQueryName,
  createCachedLocalEnvironment, loadBpmnWorkflowBundle, processWorkflowId,
  productionBpmnWorkflowInitialHostInput, readTestProcessTerminalResult, submitUserTaskCompletion,
  bpmnCompleteUserTaskUpdateName, bpmnDeliverMessageSignalName, contentBoundUpdateId,
  submitMessageDelivery, timerFiringStimulus,
  startBpmnProcess, BpmnProcessStartResultKind,
} from "@bpmn-lean/temporal-testkit";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

test("recurring subscriptions survive continuation, Worker replacement, retry recovery, and host completion", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("../../../bpmn-source/test/fixtures/repeatable-event-subscriptions/boundary-timer.bpmn", import.meta.url)),
    sourceId: "subscription-live", expectedSha256: undefined, sourceOverlay: null,
    semanticProfile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) throw new Error("subscription fixture refused");
  const program = compilation.semanticProcess;
  const start = {
    kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId: "subscription-live", initialVariables: [],
  } as const;
  const workflowId = processWorkflowId(start.instanceId);
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "subscription-live", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "subscription Temporal startup");
  let worker: WorkerLease | undefined;
  try {
    worker = await startBpmnTestWorker(environment, bundle, "subscription-live-first");
    // ESL-HANDOFF-01 requires rollover between firings, so this witness supplies lower-only host limits.
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      workflowId, taskQueue: bpmnSemanticTaskQueue, workflowIdReusePolicy: "REJECT_DUPLICATE",
      args: [start, program, { ...productionBpmnWorkflowInitialHostInput(), eventHistoryEventLimit: 4 }],
    });
    const published = (predicate: (value: StateObservation) => boolean) =>
      waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId, predicate);
    const first = await published((state) => handlers(state).length >= 1);
    const firstHandler = handlers(first)[0]!;
    assert.ok(first.openUserTasks.some(({ id }) => id.elementId === "UserTask_Sibling"));
    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, "subscription-live-replacement");
    const repeated = await published((state) => handlers(state).length >= 2);
    assert.ok(handlers(repeated).some(({ id }) => id.activation === firstHandler.id.activation));
    assert.ok(repeated.openUserTasks.some(({ id }) => id.elementId === "UserTask_Sibling"));
    const host = repeated.openUserTasks.find(({ id }) => id.elementId === "UserTask_Sibling");
    assert.ok(host);
    const hostCompletion = complete(host);
    const submit = async (stimulus: CompleteUserTaskInstanceStimulus) => {
      assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stimulus), {
        kind: ProcessCommandResultKind.Semantic, commandId: stimulus.commandId, outcome: CommandOutcome.Committed,
      });
    };
    await submit(hostCompletion);
    const withdrawn = await published((state) => state.openTimers.length === 0);
    assert.ok(handlers(withdrawn).length >= 2);
    await submit(hostCompletion);
    await delay(1_100);
    assert.deepEqual(await published((state) => state.openTimers.length === 0), withdrawn);
    for (const task of handlers(withdrawn)) await submit(complete(task));
    const trigger = withdrawn.openUserTasks.find(({ id }) => id.elementId === "UserTask_Trigger");
    assert.ok(trigger);
    await submit(complete(trigger));
    const outside = await published((state) => state.openUserTasks.some(({ id }) => id.elementId === "UserTask_Outer"));
    const audit = outside.openUserTasks.find(({ id }) => id.elementId === "IndependentAudit");
    const outer = outside.openUserTasks.find(({ id }) => id.elementId === "UserTask_Outer");
    assert.ok(audit && outer);
    await submit(complete(outer));
    await submit(complete(audit));
    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "subscription terminal receipt");
    assert.equal(terminal.receipt.finalState.status, ProcessStatus.Completed);
    const runs = await workflowChainRuns(environment, workflowId);
    assert.ok(runs.length >= 3);
    const traces: CanonicalObservation[] = [];
    const histories: NativeHistory[] = [];
    for (const run of runs) {
      const selected = environment.client.workflow.getHandle(workflowId, run.runId);
      traces.push(...await selected.query<CanonicalObservation[]>(bpmnTraceQueryName));
      const history = await selected.fetchHistory();
      histories.push(history);
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assertNativeTimerAccounting(histories, 2);
    assert.throws(() => assertNativeTimerAccounting(histories.map((history) => ({
      ...history, events: (history.events ?? []).filter((event) =>
        event.timerStartedEventAttributes == null && event.timerFiredEventAttributes == null && event.timerCanceledEventAttributes == null),
    })), 2), assert.AssertionError);
    const hostResults = traces.filter((entry) => entry.kind === CanonicalObservationKind.Command && entry.commandId === hostCompletion.commandId);
    assert.equal(hostResults.length, 1);
    await verifyNestedCancellation(environment, program, bundle);
    const lifecycle = {
      async suspend() {
        assert.ok(worker);
        await stopBpmnTestWorker(worker);
        worker = undefined;
      },
      async resume(identity: string) {
        worker = await startBpmnTestWorker(environment, bundle, identity);
      },
    };
    await verifyMixedActivation(environment, program, bundle, lifecycle);
    await verifyRepeatedMessages(environment, bundle, lifecycle);
  } finally {
    try {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
    } finally {
      await environment.teardown();
    }
  }
});

async function verifyNestedCancellation(
  environment: TestWorkflowEnvironment,
  program: SemanticProcessProgram,
  bundle: Awaited<ReturnType<typeof loadBpmnWorkflowBundle>>,
): Promise<void> {
  const start = {
    kind: StimulusKind.StartProcess, commandId: "nested-start", processId: program.processId,
    instanceId: "subscription-nested-cancellation", initialVariables: [],
  } as const;
  const workflowId = processWorkflowId(start.instanceId);
  assert.deepEqual(await startBpmnProcess(environment.client.workflow, start, program, { taskQueue: bpmnSemanticTaskQueue }), {
    kind: BpmnProcessStartResultKind.Started, processInstanceId: start.instanceId,
  });
  const handle = environment.client.workflow.getHandle(workflowId);
  const published = (predicate: (value: StateObservation) => boolean) =>
    waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId, predicate);
  const active = await published((state) => handlers(state).length >= 2);
  const outside = active.openUserTasks.find(({ id }) => id.elementId === "IndependentAudit");
  const trigger = active.openUserTasks.find(({ id }) => id.elementId === "UserTask_Trigger");
  assert.ok(outside && trigger);
  const submit = async (task: OpenUserTask) => {
    const stimulus = complete(task);
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stimulus), {
      kind: ProcessCommandResultKind.Semantic, commandId: stimulus.commandId, outcome: CommandOutcome.Committed,
    });
  };
  await submit(trigger);
  const cancelled = await published((state) => state.openTimers.length === 0 &&
    state.openUserTasks.some(({ id }) => id.elementId === "UserTask_Outer"));
  assert.deepEqual(cancelled.openUserTasks.map(({ id }) => id.elementId), ["IndependentAudit", "UserTask_Outer"]);
  assert.deepEqual(cancelled.openUserTasks.find(({ id }) => id.elementId === "IndependentAudit"), outside);
  await delay(1_100);
  assert.deepEqual(await published((state) => state.openTimers.length === 0), cancelled);
  await submit(cancelled.openUserTasks.find(({ id }) => id.elementId === "UserTask_Outer")!);
  await submit(outside);
  const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "nested subscription terminal receipt");
  assert.equal(terminal.receipt.finalState.status, ProcessStatus.Completed);
  const history = await handle.fetchHistory();
  assertNativeTimerAccounting([history], 2);
  assert.ok((history.events ?? []).some(({ timerCanceledEventAttributes }) => timerCanceledEventAttributes != null));
  assert.equal((history.events ?? []).some(({ workflowExecutionCanceledEventAttributes }) => workflowExecutionCanceledEventAttributes != null), false);
  await replayBpmnHistory(bundle, history, workflowId);
}

type NativeHistory = Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>;

function assertNativeTimerAccounting(histories: ReadonlyArray<NativeHistory>, minimumFirings: number): void {
  let fired = 0;
  for (const history of histories) {
    const pending = new Map<string, string>();
    for (const event of history.events ?? []) {
      const start = event.timerStartedEventAttributes;
      if (start != null) {
        assert.ok(start.timerId);
        const eventId = String(event.eventId);
        assert.equal(pending.has(eventId), false);
        pending.set(eventId, start.timerId);
      }
      const disposition = event.timerFiredEventAttributes ?? event.timerCanceledEventAttributes;
      if (disposition != null) {
        const startId = String(disposition.startedEventId);
        assert.equal(pending.get(startId), disposition.timerId);
        assert.equal(pending.delete(startId), true);
        if (event.timerFiredEventAttributes != null) fired += 1;
      }
    }
    assert.equal(pending.size, 0);
  }
  assert.ok(fired >= minimumFirings, "semantic firing evidence requires actual native Timer firings");
}

function handlers(state: StateObservation): ReadonlyArray<OpenUserTask> {
  return state.openUserTasks.filter(({ id }) => id.elementId === "HandleReminder");
}

function complete(task: OpenUserTask): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${task.id.elementId}-${String(task.id.activation)}`,
    taskId: task.id, submittedValues: [],
  };
}

type WorkerLifecycle = Readonly<{
  suspend: () => Promise<void>;
  resume: (identity: string) => Promise<void>;
}>;

async function verifyMixedActivation(
  environment: TestWorkflowEnvironment,
  program: SemanticProcessProgram,
  bundle: Awaited<ReturnType<typeof loadBpmnWorkflowBundle>>,
  lifecycle: WorkerLifecycle,
): Promise<void> {
  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess, commandId: "mixed-start", processId: program.processId,
    instanceId: "subscription-mixed-activation", initialVariables: [],
  };
  const workflowId = processWorkflowId(start.instanceId);
  const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
    workflowId, taskQueue: bpmnSemanticTaskQueue, workflowIdReusePolicy: "REJECT_DUPLICATE",
    args: [start, program, productionBpmnWorkflowInitialHostInput()],
  });
  const published = (predicate: (state: StateObservation) => boolean) =>
    waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId, predicate);
  const active = await published((state) => state.openTimers.length === 1);
  const host = active.openUserTasks.find(({ id }) => id.elementId === "UserTask_Sibling");
  assert.ok(host);
  const completion = complete(host);
  const message: DeliverMessageStimulus = {
    kind: StimulusKind.DeliverMessage, commandId: "mixed-unrelated-message",
    subscriptionId: { processInstanceId: start.instanceId, elementId: "Unrelated", activation: 1 },
    channel: { kind: MessageChannelKind.DirectMessage, messageId: "Unrelated" },
  };
  await lifecycle.suspend();
  // ESL-ORDER-01 compares the actual recorded activation; service acceptance alone claims no batch.
  await environment.client.connection.withDeadline(Date.now() + 15_000, async () => {
    await handle.signal(bpmnDeliverMessageSignalName, message);
    const updateId = contentBoundUpdateId(completion);
    const accepted = handle.startUpdate(bpmnCompleteUserTaskUpdateName, {
      args: [completion], updateId, waitForStage: "ACCEPTED",
    }).then((value) => ({ value }), (error: unknown) => ({ error }));
    const stage = proto.temporal.api.enums.v1.UpdateWorkflowExecutionLifecycleStage;
    for (;;) {
      try {
        const admitted = await environment.client.workflowService.pollWorkflowExecutionUpdate({
          namespace: "default",
          updateRef: { workflowExecution: { workflowId, runId: handle.firstExecutionRunId }, updateId },
          waitPolicy: { lifecycleStage: stage.UPDATE_WORKFLOW_EXECUTION_LIFECYCLE_STAGE_ADMITTED },
        });
        assert.equal(admitted.stage, stage.UPDATE_WORKFLOW_EXECUTION_LIFECYCLE_STAGE_ADMITTED);
        break;
      } catch (error: unknown) {
        if (!isGrpcServiceError(error) || error.code !== 5) throw error;
        await delay(10);
      }
    }
    await delay(1_100);
    const stoppedHistory = await handle.fetchHistory();
    assert.ok((stoppedHistory.events ?? []).some((event) => event.timerFiredEventAttributes != null));
    await lifecycle.resume("subscription-mixed-replacement");
    const result = await accepted;
    if ("error" in result) throw result.error;
    assert.equal(await result.value.result(), CommandOutcome.Committed);
  });
  assert.deepEqual(await submitMessageDelivery(environment.client.workflow, start.instanceId, message), {
    kind: ProcessCommandResultKind.Semantic, commandId: message.commandId, outcome: CommandOutcome.Rejected,
  });
  const tail: Stimulus[] = [];
  let state = await published((value) => value.openTimers.length === 0);
  for (const task of handlers(state)) {
    const stimulus = complete(task);
    tail.push(stimulus);
    assertCommitted(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stimulus), stimulus.commandId);
  }
  const trigger = state.openUserTasks.find(({ id }) => id.elementId === "UserTask_Trigger");
  assert.ok(trigger);
  tail.push(complete(trigger));
  assertCommitted(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, complete(trigger)), complete(trigger).commandId);
  state = await published((value) => value.openUserTasks.some(({ id }) => id.elementId === "UserTask_Outer"));
  for (const task of state.openUserTasks) {
    const stimulus = complete(task);
    tail.push(stimulus);
    assertCommitted(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stimulus), stimulus.commandId);
  }
  assert.equal((await readTestProcessTerminalResult(handle)).receipt.finalState.status, ProcessStatus.Completed);
  const history = await handle.fetchHistory();
  assertNativeTimerAccounting([history], 1);
  assertSignalBatchFlag(history);
  assertMissingTaskDispositionRejected(history);
  assert.throws(() => assertSignalBatchFlag({ ...history, events: (history.events ?? []).map((event) => {
    const completed = event.workflowTaskCompletedEventAttributes;
    return completed == null ? event : { ...event, workflowTaskCompletedEventAttributes: {
      ...completed, sdkMetadata: { ...completed.sdkMetadata,
        langUsedFlags: (completed.sdkMetadata?.langUsedFlags ?? []).filter((flag) => flag !== 2),
      },
    } };
  }) }), assert.AssertionError);
  const ordered = mixedHistoryOrder(history, start.instanceId, completion, message);
  assertCoreTrace(program, [start, ...ordered, ...tail], await handle.query<CanonicalObservation[]>(bpmnTraceQueryName));
  const updates = (history.events ?? []).filter((event) => event.workflowExecutionUpdateAcceptedEventAttributes != null);
  assert.equal(updates.length, 1 + tail.length);
  assert.equal((history.events ?? []).filter((event) => event.workflowExecutionUpdateCompletedEventAttributes != null).length, updates.length);
  await replayBpmnHistory(bundle, history, workflowId);
}

async function verifyRepeatedMessages(
  environment: TestWorkflowEnvironment,
  bundle: Awaited<ReturnType<typeof loadBpmnWorkflowBundle>>,
  lifecycle: WorkerLifecycle,
): Promise<void> {
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("../../../bpmn-source/test/fixtures/repeatable-event-subscriptions/boundary-message.bpmn", import.meta.url)),
    sourceId: "subscription-message-live", expectedSha256: undefined, sourceOverlay: null,
    semanticProfile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Message fixture refused");
  const program = compiled.semanticProcess;
  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess, commandId: "message-start", processId: program.processId,
    instanceId: "subscription-message-live", initialVariables: [],
  };
  const workflowId = processWorkflowId(start.instanceId);
  const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
    workflowId, taskQueue: bpmnSemanticTaskQueue, workflowIdReusePolicy: "REJECT_DUPLICATE",
    args: [start, program, { ...productionBpmnWorkflowInitialHostInput(), eventHistoryEventLimit: 4 }],
  });
  const published = (predicate: (state: StateObservation) => boolean) =>
    waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId, predicate);
  const active = await published((state) => state.openMessageSubscriptions.length === 1);
  const subscription = active.openMessageSubscriptions[0]!;
  const first: DeliverMessageStimulus = {
    kind: StimulusKind.DeliverMessage, commandId: "reminder-1",
    subscriptionId: subscription.id, channel: subscription.channel,
  };
  const second = { ...first, commandId: "reminder-2" };
  const schedule: Stimulus[] = [start, first, second];
  assertCommitted(await submitMessageDelivery(environment.client.workflow, start.instanceId, first), first.commandId);
  const once = await published((state) => handlers(state).length === 1);
  assert.deepEqual(once.openMessageSubscriptions, active.openMessageSubscriptions);
  await lifecycle.suspend();
  await environment.client.connection.withDeadline(Date.now() + 10_000, () => handle.signal(bpmnDeliverMessageSignalName, second));
  await lifecycle.resume("subscription-message-replacement");
  assertCommitted(await submitMessageDelivery(environment.client.workflow, start.instanceId, second), second.commandId);
  const twice = await published((state) => handlers(state).length === 2);
  assert.deepEqual(twice.openMessageSubscriptions, active.openMessageSubscriptions);
  assertCommitted(await submitMessageDelivery(environment.client.workflow, start.instanceId, first), first.commandId);
  assert.deepEqual(await published((state) => handlers(state).length === 2), twice);
  const host = twice.openUserTasks.find(({ id }) => id.elementId === "UserTask_Sibling");
  assert.ok(host);
  const completion = complete(host);
  schedule.push(completion);
  assertCommitted(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, completion), completion.commandId);
  const withdrawn = await published((state) => state.openMessageSubscriptions.length === 0);
  assert.deepEqual(handlers(withdrawn), handlers(twice));
  const stale = { ...first, commandId: "reminder-stale" };
  schedule.push(stale);
  assert.deepEqual(await submitMessageDelivery(environment.client.workflow, start.instanceId, stale), {
    kind: ProcessCommandResultKind.Semantic, commandId: stale.commandId, outcome: CommandOutcome.Rejected,
  });
  assert.deepEqual(await published((state) => state.openMessageSubscriptions.length === 0), withdrawn);
  for (const task of handlers(withdrawn)) {
    const stimulus = complete(task);
    schedule.push(stimulus);
    assertCommitted(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stimulus), stimulus.commandId);
  }
  const trigger = withdrawn.openUserTasks.find(({ id }) => id.elementId === "UserTask_Trigger");
  assert.ok(trigger);
  schedule.push(complete(trigger));
  assertCommitted(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, complete(trigger)), complete(trigger).commandId);
  const outside = await published((state) => state.openUserTasks.some(({ id }) => id.elementId === "UserTask_Outer"));
  for (const task of outside.openUserTasks) {
    const stimulus = complete(task);
    schedule.push(stimulus);
    assertCommitted(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stimulus), stimulus.commandId);
  }
  assert.equal((await readTestProcessTerminalResult(handle)).receipt.finalState.status, ProcessStatus.Completed);
  const runs = await workflowChainRuns(environment, workflowId);
  assert.ok(runs.length >= 3);
  const trace: CanonicalObservation[] = [];
  for (const run of runs) {
    const selected = environment.client.workflow.getHandle(workflowId, run.runId);
    trace.push(...await selected.query<CanonicalObservation[]>(bpmnTraceQueryName));
    const history = await selected.fetchHistory();
    if ((history.events ?? []).some((event) => event.workflowExecutionSignaledEventAttributes != null)) {
      assertSignalBatchFlag(history);
      assertMissingTaskDispositionRejected(history);
    }
    assert.equal((history.events ?? []).some((event) => event.timerStartedEventAttributes != null), false);
    await replayBpmnHistory(bundle, history, workflowId);
  }
  assertCoreTrace(program, schedule, trace);
  for (const delivery of [first, second]) {
    assert.equal(trace.filter((entry) => entry.kind === CanonicalObservationKind.Command && entry.commandId === delivery.commandId).length, 1);
  }
}

function assertCommitted(result: unknown, commandId: string): void {
  assert.deepEqual(result, { kind: ProcessCommandResultKind.Semantic, commandId, outcome: CommandOutcome.Committed });
}

function assertCoreTrace(program: SemanticProcessProgram, schedule: ReadonlyArray<Stimulus>, actual: ReadonlyArray<CanonicalObservation>): void {
  const start = schedule[0];
  assert.ok(start && start.kind === StimulusKind.StartProcess);
  const deployment = deployProcess(start, program);
  assert.equal(deployment.outcome, CommandOutcome.Committed);
  const expected: CanonicalObservation[] = [deployment.observation];
  let state = initialState;
  for (const stimulus of schedule) {
    const step = advanceScenario(program, state, stimulus);
    assert.notEqual(step.kind, ScenarioStepKind.HarnessFailure);
    if (step.kind === ScenarioStepKind.HarnessFailure) throw new Error("Expected core schedule failed");
    expected.push(...step.observations);
    state = step.state;
  }
  assert.deepEqual(actual, expected);
}

function assertSignalBatchFlag(history: NativeHistory): void {
  const events = history.events ?? [];
  const signals = events.filter((event) => event.workflowExecutionSignaledEventAttributes != null);
  assert.ok(signals.length > 0);
  for (const signal of signals) {
    const { completed } = successfulActivationAfter(history, Number(signal.eventId));
    assert.ok(events.some((event) => Number(event.eventId) <= Number(completed.eventId) &&
      event.workflowTaskCompletedEventAttributes?.sdkMetadata?.langUsedFlags?.includes(2)),
    "Signal activation requires recorded ProcessWorkflowActivationJobsAsSingleBatch flag 2");
  }
}

function successfulActivationAfter(history: NativeHistory, eventId: number) {
  const events = history.events ?? [];
  const attempts = events.filter((event) => event.workflowTaskStartedEventAttributes != null && Number(event.eventId) > eventId);
  for (const [index, started] of attempts.entries()) {
    const startId = Number(started.eventId);
    const dispositions = events.filter((event) => [
      event.workflowTaskCompletedEventAttributes,
      event.workflowTaskFailedEventAttributes,
      event.workflowTaskTimedOutEventAttributes,
    ].some((attributes) => attributes != null && Number(attributes.startedEventId) === startId));
    assert.equal(dispositions.length, 1, `task ${startId} after ingress ${eventId} requires exactly one disposition`);
    const disposition = dispositions[0]!;
    assert.ok(Number(disposition.eventId) > startId);
    const next = attempts[index + 1];
    if (next !== undefined) assert.ok(Number(disposition.eventId) < Number(next.eventId));
    if (disposition.workflowTaskCompletedEventAttributes != null) return { started, completed: disposition };
    // The pinned proto names cause 1 UNHANDLED_COMMAND; failed/timed-out attempts do not commit SDK flags.
    assert.ok(disposition.workflowTaskFailedEventAttributes != null || disposition.workflowTaskTimedOutEventAttributes != null);
  }
  assert.fail(`durable ingress ${eventId} has no successfully completed Workflow Task`);
}

function assertMissingTaskDispositionRejected(history: NativeHistory): void {
  const events = history.events ?? [];
  const signal = events.find((event) => event.workflowExecutionSignaledEventAttributes != null);
  assert.ok(signal);
  const started = events.find((event) => event.workflowTaskStartedEventAttributes != null && Number(event.eventId) > Number(signal.eventId));
  assert.ok(started);
  const startId = Number(started.eventId);
  const mutation = { ...history, events: events.filter((event) => ![
    event.workflowTaskCompletedEventAttributes,
    event.workflowTaskFailedEventAttributes,
    event.workflowTaskTimedOutEventAttributes,
  ].some((attributes) => attributes != null && Number(attributes.startedEventId) === startId)) };
  assert.ok(mutation.events.length < events.length);
  assert.throws(() => assertSignalBatchFlag(mutation), /requires exactly one disposition/u);
}

function mixedHistoryOrder(history: NativeHistory, instanceId: string,
  completion: CompleteUserTaskInstanceStimulus, message: DeliverMessageStimulus): Stimulus[] {
  const events = history.events ?? [];
  const ordered: Array<{ activation: number; priority: number; stimulus: Stimulus }> = [];
  const activationAfter = (eventId: number) => Number(successfulActivationAfter(history, eventId).started.eventId);
  let timerActivation = 0;
  for (const event of events) {
    if (event.timerFiredEventAttributes != null) {
      timerActivation += 1;
      ordered.push({ activation: activationAfter(Number(event.eventId)), priority: 2, stimulus: timerFiringStimulus({
        id: { processInstanceId: instanceId, elementId: "Reminder", activation: timerActivation },
        deadlineMs: timerActivation * 1_000,
      }) });
    }
    const signal = event.workflowExecutionSignaledEventAttributes;
    if (signal != null) {
      assert.equal(signal.signalName, bpmnDeliverMessageSignalName);
      const payload = signal.input?.payloads?.[0];
      assert.ok(payload);
      assert.deepEqual(defaultPayloadConverter.fromPayload(payload), message);
      // Exact retry Signals after replacement recover the same command without another contender.
      if (!ordered.some(({ stimulus }) => stimulus.commandId === message.commandId)) {
        ordered.push({ activation: activationAfter(Number(event.eventId)), priority: 1, stimulus: message });
      }
    }
    const accepted = event.workflowExecutionUpdateAcceptedEventAttributes;
    if (accepted?.acceptedRequest?.meta?.updateId === contentBoundUpdateId(completion)) {
      ordered.push({ activation: activationAfter(Number(accepted.acceptedRequestSequencingEventId)), priority: 0, stimulus: completion });
    }
  }
  assert.equal(ordered.filter(({ stimulus }) => stimulus.commandId === completion.commandId).length, 1);
  assert.equal(ordered.filter(({ stimulus }) => stimulus.commandId === message.commandId).length, 1);
  return ordered.sort((left, right) => left.activation - right.activation || left.priority - right.priority ||
    compareCanonicalStrings(left.stimulus.commandId, right.stimulus.commandId)).map(({ stimulus }) => stimulus);
}
