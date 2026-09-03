/** Live rollover, replacement, retry, concurrency, and ordering evidence for Compensation. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  StateObservation,
} from "@bpmn-lean/semantic-core";

import {
  EffectExecutionSchedule,
  EffectProbeActivityRegistry,
  EffectProbeStore,
  createCachedLocalEnvironment,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  processTerminalReceiptFormatV1,
  readTestProcessTerminalResult,
  requireDurableEffectActivityHistory,
} from "@bpmn-lean/temporal-testkit";

import { historyEvents } from "./temporal-history-facts.ts";
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
import { waitForPublishedWorkflowChainState } from "./workflow-chain-test-support.ts";
import {
  compensationActivityHistory,
  compensationFixture,
  compensationOperationDeadlineMs,
  compensationProgram,
  compensationWorkflowEvidence,
  deferred,
  openCompensationEffectElementIds,
  startCompensationWorkflow,
  submitCompensationCompletion,
  waitForReleaseWithHeartbeat,
} from "./compensation-durability-support.ts";

test("Compensation crosses a pre-schedule rollover and survives replacement plus retry", async () => {
  const program = await compensationProgram("compensation-durability-success");
  const fixture = compensationFixture(program, "success");
  const registry = new EffectProbeActivityRegistry();
  const bStore = new EffectProbeStore();
  const cStore = new EffectProbeStore();
  const aStore = new EffectProbeStore();
  const bRelease = deferred();
  const cRelease = deferred();
  const aRelease = deferred();
  const bFirstFailed = deferred();
  const bRetried = deferred();
  const cStarted = deferred();
  const aStarted = deferred();
  const completed: string[] = [];

  registry.register(fixture.requests.b, async (request) => {
    const firstAttempt = bStore.evidence().invocations === 0;
    if (firstAttempt) await cStarted.promise;
    const result = await bStore.execute(
      request,
      EffectExecutionSchedule.FailAfterMutationOnce,
    ).catch((error: unknown) => {
      if (firstAttempt) bFirstFailed.resolve();
      throw error;
    });
    bRetried.resolve();
    await waitForReleaseWithHeartbeat(bRelease.promise);
    completed.push("B");
    return result;
  });
  registry.register(fixture.requests.c, async (request) => {
    const result = await cStore.execute(
      request,
      EffectExecutionSchedule.PlainSuccess,
    );
    cStarted.resolve();
    await cRelease.promise;
    completed.push("C");
    return result;
  });
  registry.register(fixture.requests.a, async (request) => {
    const result = await aStore.execute(
      request,
      EffectExecutionSchedule.PlainSuccess,
    );
    aStarted.resolve();
    await aRelease.promise;
    completed.push("A");
    return result;
  });

  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-compensation-durability-success",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Compensation durability Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "compensation-durability-before-replacement",
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

    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "compensation-durability-after-replacement",
      registry.activities,
    );
    await submitCompensationCompletion(
      firstHandle,
      environment.client.workflow,
      fixture.completions.insurance,
      fixture.openBefore.insurance,
    );

    await withDeadline(
      Promise.all([bFirstFailed.promise, cStarted.promise]),
      compensationOperationDeadlineMs,
      "overlapping first B/C Compensation Activity attempts",
    );
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
    aStore.requireEmpty();
    assert.deepEqual(fixture.requests.b.arguments, [{
      name: "DataInput_TravelDetails",
      value: { kind: VariableValueKind.String, value: "frozen itinerary" },
    }]);

    cRelease.resolve();
    const afterC = await waitForPublishedWorkflowChainState(
      environment,
      firstHandle.workflowId,
      program,
      fixture.start.instanceId,
      (state) =>
        openCompensationEffectElementIds(state).join(",") ===
          "Task_UndoGroundTravel",
    );
    assert.deepEqual(
      openCompensationEffectElementIds(afterC),
      ["Task_UndoGroundTravel"],
    );
    aStore.requireEmpty();

    await withDeadline(
      bRetried.promise,
      compensationOperationDeadlineMs,
      "B Compensation Activity retry",
    );
    assert.deepEqual(bStore.evidence(), {
      invocations: 2,
      mutations: 1,
      keys: [fixture.requests.b.idempotencyKey],
    });
    bRelease.resolve();
    await withDeadline(
      aStarted.promise,
      compensationOperationDeadlineMs,
      "dependent A Compensation Activity start",
    );
    assert.deepEqual(completed, ["C", "B"]);
    assert.deepEqual(aStore.evidence(), {
      invocations: 1,
      mutations: 1,
      keys: [fixture.requests.a.idempotencyKey],
    });
    aRelease.resolve();

    const terminal = await withDeadline(
      readTestProcessTerminalResult(firstHandle),
      compensationOperationDeadlineMs,
      "Compensation durability terminal result",
    );
    assert.equal(isCompletedProcessReceipt(terminal.receipt), true);
    assert.deepEqual(terminal.receipt, {
      format: processTerminalReceiptFormatV1,
      definition: program.identity,
      processId: program.processId,
      processInstanceId: fixture.start.instanceId,
      finalState: fixture.expectedFinalState,
    });
    assert.deepEqual(completed, ["C", "B", "A"]);

    const evidence = await compensationWorkflowEvidence(
      environment,
      firstHandle.workflowId,
    );
    assert.equal(evidence.runs.length, 6);
    const firstActivityRun = evidence.histories.findIndex(
      (history) => historyEvents(
        history,
        "activityTaskScheduledEventAttributes",
      ).length > 0,
    );
    assert.ok(firstActivityRun > 0);
    const predecessorHistory = evidence.histories[firstActivityRun - 1];
    const predecessorTrace = evidence.traces[firstActivityRun - 1];
    assert.ok(predecessorHistory !== undefined && predecessorTrace !== undefined);
    assert.equal(
      historyEvents(
        predecessorHistory,
        "workflowExecutionContinuedAsNewEventAttributes",
      ).length,
      1,
    );
    assert.equal(
      evidence.histories.slice(0, firstActivityRun).flatMap((history) =>
        historyEvents(history, "activityTaskScheduledEventAttributes")
      ).length,
      0,
    );
    const frontier = lastState(predecessorTrace);
    assert.deepEqual(openCompensationEffectElementIds(frontier), [
      "Task_UndoGroundTravel",
      "Task_UndoInsurance",
    ]);
    requireDurableEffectActivityHistory(
      compensationActivityHistory(evidence.histories, fixture.requests.b),
      fixture.requests.b,
      2,
      undefined,
      { heartbeatTimeoutMs: 1_000 },
    );
    requireDurableEffectActivityHistory(
      compensationActivityHistory(evidence.histories, fixture.requests.c),
      fixture.requests.c,
      1,
      undefined,
      { heartbeatTimeoutMs: 1_000 },
    );
    requireDurableEffectActivityHistory(
      compensationActivityHistory(evidence.histories, fixture.requests.a),
      fixture.requests.a,
      1,
      undefined,
      { heartbeatTimeoutMs: 1_000 },
    );
    for (const item of evidence.runs) {
      await replayBpmnHistory(bundle, item.history, firstHandle.workflowId);
    }
  } finally {
    bRelease.resolve();
    cRelease.resolve();
    aRelease.resolve();
    for (const request of Object.values(fixture.requests)) {
      registry.unregister(request.idempotencyKey);
    }
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

function lastState(trace: ReadonlyArray<CanonicalObservation>): StateObservation {
  const state = trace.findLast(
    (observation) => observation.kind === CanonicalObservationKind.State,
  );
  assert.ok(state?.kind === CanonicalObservationKind.State);
  return state;
}
