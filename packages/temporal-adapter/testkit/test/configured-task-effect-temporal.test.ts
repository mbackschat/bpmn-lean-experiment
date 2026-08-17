/** Live evidence that the configured Task source reuses existing effect hosting. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import type {
  ScenarioResult,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type {
  WorkflowBundleWithSourceMap,
} from "@temporalio/worker";
import {
  BpmnProcessStartResultKind,
  EffectExecutionSchedule,
  EffectProbeActivityRegistry,
  EffectProbeStore,
  ProcessCommandResultKind,
  bpmnSemanticTaskQueue,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  readBpmnProcessTrace,
  requireDurableEffectActivityHistory,
  runEffectBypassMutation,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  assertConfiguredEffectOccurrenceRefusal,
  loadConfiguredTaskEffectFixture,
} from "./configured-task-effect-fixture.ts";
import type {
  ConfiguredTaskEffectFixture,
} from "./configured-task-effect-fixture.ts";
import {
  acceptedCompletionOrder,
  historyEvents,
} from "./temporal-history-facts.ts";
import {
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  replayBpmnHistory,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";

const ordinaryWorkflowId = "configured-task-effect-worker-replacement";
const bypassWorkflowId = "configured-task-effect-pass-through-mutation";
const temporalIdentity = "bpmn-lean-configured-task-effect";
const operationDeadlineMs = 10_000;
// Keep the first result unacknowledged beyond the existing 2 s Activity start-to-close policy so
// the replacement Worker must reconcile the same transport key on attempt two.
const workerLossActivityDelayMs = 2_500;

test("configured Task source durably reaches the existing effect host", async () => {
  const fixture = await loadConfiguredTaskEffectFixture();
  assertConfiguredEffectOccurrenceRefusal(fixture);
  const expectedWaiting = expectedEffectWait(fixture.expected);
  const expectedTerminal = expectedTerminalState(fixture.expected);
  const bundle = await loadBpmnWorkflowBundle();
  const registry = new EffectProbeActivityRegistry();
  const store = new EffectProbeStore();
  let firstInvocation = true;
  let resolveFirstInvocation: (() => void) | undefined;
  const firstInvocationStarted = new Promise<void>((resolve) => {
    resolveFirstInvocation = resolve;
  });
  registry.register(fixture.effectRequest, async (request) => {
    const result = await store.execute(
      request,
      EffectExecutionSchedule.PlainSuccess,
    );
    if (firstInvocation) {
      firstInvocation = false;
      resolveFirstInvocation?.();
      await delay(workerLossActivityDelayMs);
    }
    return result;
  });
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: temporalIdentity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "configured Task Temporal environment startup",
  );
  let worker: ConfiguredTaskWorkerLease | undefined;

  try {
    worker = await startConfiguredTaskWorker(
      environment,
      bundle,
      registry,
      temporalIdentity,
    );
    const started = await withDeadline(
      startBpmnProcess(
        environment.client.workflow,
        fixture.start,
        fixture.semanticProcess,
        { taskQueue: bpmnSemanticTaskQueue },
      ),
      operationDeadlineMs,
      "configured Task Workflow start",
    );
    assert.equal(started.kind, BpmnProcessStartResultKind.Started);
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      throw new TypeError("configured Task Workflow was not admitted");
    }
    const handle = getTestProcessHandle(
      environment.client.workflow,
      started.processInstanceId,
    );
    await withDeadline(
      firstInvocationStarted,
      operationDeadlineMs,
      "configured Task first Activity invocation",
    );

    assert.deepEqual(
      await readBpmnProcessTrace(
        environment.client.workflow,
        fixture.start.instanceId,
      ),
      fixture.expected.trace.slice(0, 3),
    );
    assert.deepEqual(expectedWaiting.openEffects, [
      {
        id: fixture.effectCompletion.effectId,
        descriptor: {
          protocol: fixture.effectRequest.protocol,
          operation: fixture.effectRequest.operation,
        },
        arguments: [],
      },
    ]);
    assert.deepEqual(await waitForOpenUserTaskIds(handle, []), []);

    await stopConfiguredTaskWorker(worker);
    worker = undefined;
    worker = await startConfiguredTaskWorker(
      environment,
      bundle,
      registry,
      `${temporalIdentity}-replacement`,
    );
    const openTasks = await waitForOpenUserTaskIds(
      handle,
      [fixture.userCompletion.taskId.elementId],
    );
    assert.deepEqual(openTasks.map(({ id }) => id), [
      fixture.userCompletion.taskId,
    ]);
    assert.deepEqual(
      await readBpmnProcessTrace(
        environment.client.workflow,
        fixture.start.instanceId,
      ),
      fixture.expected.trace.slice(0, 5),
    );
    assert.deepEqual(
      await submitUserTaskCompletion(
        environment.client.workflow,
        fixture.start.instanceId,
        fixture.userCompletion,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: fixture.userCompletion.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    const receipt = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "configured Task completed receipt",
    );
    assert.equal(isCompletedProcessReceipt(receipt), true);
    if (!isCompletedProcessReceipt(receipt)) {
      throw new TypeError("configured Task Workflow returned no receipt");
    }
    assert.deepEqual(receipt.finalState, expectedTerminal);
    assert.deepEqual(
      await readBpmnProcessTrace(
        environment.client.workflow,
        fixture.start.instanceId,
      ),
      fixture.expected.trace,
    );
    assert.deepEqual(store.evidence(), {
      invocations: 2,
      mutations: 1,
      keys: [fixture.effectRequest.idempotencyKey],
    });

    const rawHistory = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "configured Task completed history",
    );
    const history = rawHistory as TemporalHistory;
    requireDurableEffectActivityHistory(
      history,
      fixture.effectRequest,
      2,
    );
    assertExactConfiguredTaskHistory(
      history,
      fixture.userCompletion.commandId,
    );
    await stopConfiguredTaskWorker(worker);
    worker = undefined;
    await withDeadline(
      replayBpmnHistory(
        bundle,
        rawHistory,
        `${ordinaryWorkflowId}-replay`,
      ),
      10_000,
      "configured Task Worker-replacement replay",
    );

    await assertPublicEffectBypassDiscriminator(environment, fixture);
  } finally {
    try {
      if (worker !== undefined) {
        await stopConfiguredTaskWorker(worker);
      }
    } finally {
      registry.unregister(fixture.effectRequest.idempotencyKey);
      await withDeadline(
        environment.teardown(),
        operationDeadlineMs,
        "configured Task Temporal environment teardown",
      );
    }
  }
});

async function assertPublicEffectBypassDiscriminator(
  environment: TestWorkflowEnvironment,
  fixture: ConfiguredTaskEffectFixture,
): Promise<void> {
  const execution = await withDeadline(
    runEffectBypassMutation(
      environment,
      fixture.scenario,
      fixture.semanticProcess,
      bypassWorkflowId,
      async (handle, completion) => {
        const openTasks = await waitForOpenUserTaskIds(
          handle,
          [completion.taskId.elementId],
        );
        assert.deepEqual(openTasks.map(({ id }) => id), [completion.taskId]);
      },
    ),
    15_000,
    "configured Task pass-through mutation",
  );

  assert.deepEqual(execution.result, fixture.expected);
  assert.equal(isCompletedProcessReceipt(execution.receipt), true);
  assert.deepEqual(
    acceptedCompletionOrder(execution.history),
    [fixture.userCompletion.commandId],
  );
  assert.equal(
    historyEvents(
      execution.history,
      "activityTaskScheduledEventAttributes",
    ).length,
    0,
  );
  assert.throws(
    () =>
      requireDurableEffectActivityHistory(
        execution.history,
        fixture.effectRequest,
        1,
      ),
    /scheduled\/attempt\/completed effect Activity shape/u,
  );
  assertNoNewHostMechanism(execution.history);
}

type ConfiguredTaskWorkerLease = Readonly<{
  worker: Worker;
  completion: Promise<void>;
  failure(): unknown;
}>;

async function startConfiguredTaskWorker(
  environment: TestWorkflowEnvironment,
  bundle: WorkflowBundleWithSourceMap,
  registry: EffectProbeActivityRegistry,
  identity: string,
): Promise<ConfiguredTaskWorkerLease> {
  const worker = await withDeadline(
    Worker.create({
      connection: environment.nativeConnection,
      identity,
      taskQueue: bpmnSemanticTaskQueue,
      workflowBundle: bundle,
      activities: registry.activities,
    }),
    operationDeadlineMs,
    "configured Task Worker startup",
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

async function stopConfiguredTaskWorker(
  lease: ConfiguredTaskWorkerLease,
): Promise<void> {
  lease.worker.shutdown();
  await withDeadline(
    lease.completion,
    operationDeadlineMs,
    "configured Task Worker shutdown",
  );
  const failure = lease.failure();
  if (failure !== undefined) {
    throw failure;
  }
}

function assertExactConfiguredTaskHistory(
  history: TemporalHistory,
  userTaskCommandId: string,
): void {
  assert.deepEqual(acceptedCompletionOrder(history), [userTaskCommandId]);
  for (const [attributesName, expectedCount] of [
    ["workflowExecutionStartedEventAttributes", 1],
    ["workflowExecutionCompletedEventAttributes", 1],
    ["workflowExecutionFailedEventAttributes", 0],
    ["activityTaskScheduledEventAttributes", 1],
    ["activityTaskStartedEventAttributes", 1],
    ["activityTaskCompletedEventAttributes", 1],
    ["activityTaskFailedEventAttributes", 0],
    ["workflowExecutionUpdateAcceptedEventAttributes", 1],
    ["workflowExecutionUpdateCompletedEventAttributes", 1],
  ] as const) {
    assert.equal(
      historyEvents(history, attributesName).length,
      expectedCount,
      attributesName,
    );
  }
  assertNoNewHostMechanism(history);
}

function assertNoNewHostMechanism(history: TemporalHistory): void {
  for (const attributesName of [
    "timerStartedEventAttributes",
    "timerFiredEventAttributes",
    "workflowExecutionSignaledEventAttributes",
    "startChildWorkflowExecutionInitiatedEventAttributes",
    "childWorkflowExecutionStartedEventAttributes",
    "childWorkflowExecutionCompletedEventAttributes",
    "workflowExecutionCancelRequestedEventAttributes",
    "workflowExecutionCanceledEventAttributes",
    "requestCancelExternalWorkflowExecutionInitiatedEventAttributes",
  ]) {
    assert.equal(
      historyEvents(history, attributesName).length,
      0,
      attributesName,
    );
  }
}

function expectedEffectWait(expected: ScenarioResult): StateObservation {
  const waiting = expected.trace.find(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Running &&
      observation.openEffects.length === 1,
  );
  assert.ok(waiting !== undefined, "configured core has no effect wait");
  assert.deepEqual(waiting.openUserTasks, []);
  return waiting;
}

function expectedTerminalState(expected: ScenarioResult): StateObservation {
  const terminal = expected.trace.findLast(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  assert.ok(terminal !== undefined, "configured core has no terminal state");
  return terminal;
}
