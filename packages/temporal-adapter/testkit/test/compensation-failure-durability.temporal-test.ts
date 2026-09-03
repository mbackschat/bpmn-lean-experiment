/** Live fail-fast and cancellation-drain evidence for concurrent Compensation. */
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { Context } from "@temporalio/activity";

import { ProcessStatus } from "@bpmn-lean/semantic-core";

import {
  EffectExecutionSchedule,
  EffectProbeActivityRegistry,
  EffectProbeStore,
  createCachedLocalEnvironment,
  isFailedProcessReceipt,
  loadBpmnWorkflowBundle,
  readTestProcessTerminalResult,
  requireDurableEffectActivityHistory,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

import {
  historyEvents,
  temporalInt64ToBigInt,
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
import { waitForPublishedWorkflowChainState } from "./workflow-chain-test-support.ts";
import {
  compensationActivityHistory,
  compensationFailureResult,
  compensationFixture,
  compensationOperationDeadlineMs,
  compensationProgram,
  compensationWorkflowEvidence,
  deferred,
  startCompensationWorkflow,
  submitCompensationCompletion,
} from "./compensation-durability-support.ts";

test("Compensation failure cancels a live sibling and drains it before terminal completion", async () => {
  const program = await compensationProgram("compensation-durability-failure");
  const fixture = compensationFixture(program, "failure");
  const registry = new EffectProbeActivityRegistry();
  const bStore = new EffectProbeStore();
  const cStore = new EffectProbeStore();
  const aStore = new EffectProbeStore();
  const bStarted = deferred();
  const cStarted = deferred();
  const cRelease = deferred();
  const bCancellationObserved = deferred();
  const bCancellationRelease = deferred();
  const bEmergencyRelease = deferred();

  registry.register(fixture.requests.b, async (request) => {
    const result = await bStore.execute(
      request,
      EffectExecutionSchedule.PlainSuccess,
    );
    bStarted.resolve();
    const context = Context.current();
    let heartbeatActive = true;
    const heartbeatTask = (async () => {
      while (heartbeatActive) {
        context.heartbeat();
        await delay(25);
      }
    })();
    try {
      const outcome = await Promise.race([
        context.cancelled,
        bEmergencyRelease.promise.then(() => "emergency" as const),
        heartbeatTask.then(() => "heartbeat-stopped" as const),
      ]);
      assert.equal(outcome, "emergency");
      return result;
    } catch (error: unknown) {
      heartbeatActive = false;
      await heartbeatTask.catch(() => undefined);
      bCancellationObserved.resolve();
      await bCancellationRelease.promise;
      throw error;
    } finally {
      heartbeatActive = false;
      await heartbeatTask.catch(() => undefined);
    }
  });
  registry.register(fixture.requests.c, async (request) => {
    await cStore.execute(request, EffectExecutionSchedule.PlainSuccess);
    cStarted.resolve();
    await cRelease.promise;
    return compensationFailureResult;
  });
  registry.register(fixture.requests.a, async (request) =>
    aStore.execute(request, EffectExecutionSchedule.PlainSuccess)
  );

  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-compensation-durability-failure",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Compensation failure-durability Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "compensation-durability-failure",
      registry.activities,
    );
    const firstHandle = await startCompensationWorkflow(
      environment.client.workflow,
      fixture,
    );
    await submitCompensationCompletion(
      firstHandle,
      environment.client.workflow,
      fixture.completions.reserveHotel,
      fixture.openBefore.reserveHotel,
    );
    await submitCompensationCompletion(
      firstHandle,
      environment.client.workflow,
      fixture.completions.groundTravel,
      fixture.openBefore.groundTravel,
    );
    await submitCompensationCompletion(
      firstHandle,
      environment.client.workflow,
      fixture.completions.insurance,
      fixture.openBefore.insurance,
    );
    await withDeadline(
      Promise.all([bStarted.promise, cStarted.promise]),
      compensationOperationDeadlineMs,
      "concurrent B/C Compensation Activity start",
    );

    let terminalSettled = false;
    const terminalOutcomePromise = readTestProcessTerminalResult(firstHandle).then(
      (terminal) => {
        terminalSettled = true;
        return { kind: "result", terminal } as const;
      },
      (error: unknown) => {
        terminalSettled = true;
        return { kind: "failure", error } as const;
      },
    );
    cRelease.resolve();
    const failedPublication = await waitForPublishedWorkflowChainState(
      environment,
      firstHandle.workflowId,
      program,
      fixture.start.instanceId,
      (state) => state.status === ProcessStatus.Failed,
    );
    assert.deepEqual(failedPublication, fixture.expectedFailedState);
    await withDeadline(
      bCancellationObserved.promise,
      compensationOperationDeadlineMs,
      "live sibling Compensation Activity cancellation",
    );
    await Promise.resolve();
    assert.equal(terminalSettled, false);

    bCancellationRelease.resolve();
    const terminalOutcome = await withDeadline(
      terminalOutcomePromise,
      compensationOperationDeadlineMs,
      "Compensation failure terminal result after cancellation drain",
    );
    if (terminalOutcome.kind === "failure") throw terminalOutcome.error;
    const terminal = terminalOutcome.terminal;
    assert.ok(isFailedProcessReceipt(terminal.receipt));
    assert.deepEqual(terminal.receipt.finalState, fixture.expectedFailedState);
    aStore.requireEmpty();

    const evidence = await compensationWorkflowEvidence(
      environment,
      firstHandle.workflowId,
    );
    const cHistory = compensationActivityHistory(
      evidence.histories,
      fixture.requests.c,
    );
    requireDurableEffectActivityHistory(
      cHistory,
      fixture.requests.c,
      1,
      compensationFailureResult,
      { heartbeatTimeoutMs: 1_000 },
    );
    const bHistory = compensationActivityHistory(
      evidence.histories,
      fixture.requests.b,
    );
    assertActivityHistoryShape(bHistory, {
      scheduled: 1,
      started: 1,
      cancelRequested: 1,
      canceled: 1,
    });
    assert.deepEqual(bStore.evidence(), {
      invocations: 1,
      mutations: 1,
      keys: [fixture.requests.b.idempotencyKey],
    });
    assert.deepEqual(cStore.evidence(), {
      invocations: 1,
      mutations: 1,
      keys: [fixture.requests.c.idempotencyKey],
    });

    const cCompleted = onlyHistoryEvent(
      cHistory,
      "activityTaskCompletedEventAttributes",
    );
    const bCancelRequested = onlyHistoryEvent(
      bHistory,
      "activityTaskCancelRequestedEventAttributes",
    );
    const bCanceled = onlyHistoryEvent(
      bHistory,
      "activityTaskCanceledEventAttributes",
    );
    const workflowCompleted = onlyHistoryEventAcrossRuns(
      evidence.histories,
      "workflowExecutionCompletedEventAttributes",
    );
    assertHistoryEventBefore(evidence.histories, cCompleted, bCancelRequested);
    assertHistoryEventBefore(evidence.histories, bCancelRequested, bCanceled);
    assertHistoryEventBefore(evidence.histories, bCanceled, workflowCompleted);

    for (const item of evidence.runs) {
      await replayBpmnHistory(bundle, item.history, firstHandle.workflowId);
    }
  } finally {
    cRelease.resolve();
    bCancellationRelease.resolve();
    bEmergencyRelease.resolve();
    for (const request of Object.values(fixture.requests)) {
      registry.unregister(request.idempotencyKey);
    }
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

function assertActivityHistoryShape(
  history: TemporalHistory,
  expected: Readonly<{
    scheduled: number;
    started: number;
    cancelRequested: number;
    canceled: number;
  }>,
): void {
  assert.equal(
    historyEvents(history, "activityTaskScheduledEventAttributes").length,
    expected.scheduled,
  );
  assert.equal(
    historyEvents(history, "activityTaskStartedEventAttributes").length,
    expected.started,
  );
  assert.equal(
    historyEvents(history, "activityTaskCancelRequestedEventAttributes").length,
    expected.cancelRequested,
  );
  assert.equal(
    historyEvents(history, "activityTaskCanceledEventAttributes").length,
    expected.canceled,
  );
  for (const attributesName of [
    "activityTaskCompletedEventAttributes",
    "activityTaskFailedEventAttributes",
    "activityTaskTimedOutEventAttributes",
  ]) {
    assert.equal(historyEvents(history, attributesName).length, 0);
  }
}

function onlyHistoryEvent(
  history: TemporalHistory,
  attributesName: string,
): Readonly<Record<string, unknown>> {
  const events = historyEvents(history, attributesName);
  assert.equal(events.length, 1);
  const event = events[0];
  assert.ok(event !== undefined);
  return event;
}

function onlyHistoryEventAcrossRuns(
  histories: ReadonlyArray<TemporalHistory>,
  attributesName: string,
): Readonly<Record<string, unknown>> {
  const events = histories.flatMap((history) =>
    historyEvents(history, attributesName)
  );
  assert.equal(events.length, 1);
  const event = events[0];
  assert.ok(event !== undefined);
  return event;
}

function assertHistoryEventBefore(
  histories: ReadonlyArray<TemporalHistory>,
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): void {
  const leftPosition = historyEventPosition(histories, left);
  const rightPosition = historyEventPosition(histories, right);
  assert.equal(
    leftPosition.run < rightPosition.run ||
      (leftPosition.run === rightPosition.run &&
        leftPosition.eventId < rightPosition.eventId),
    true,
  );
}

function historyEventPosition(
  histories: ReadonlyArray<TemporalHistory>,
  target: Readonly<Record<string, unknown>>,
): Readonly<{ run: number; eventId: bigint }> {
  const run = histories.findIndex(({ events }) => events.includes(target));
  assert.ok(run >= 0);
  return { run, eventId: temporalInt64ToBigInt(target["eventId"]) };
}
