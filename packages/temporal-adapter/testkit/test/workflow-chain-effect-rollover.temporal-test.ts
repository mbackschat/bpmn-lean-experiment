/** Forced chain evidence for the registered BPMN/CIB Service Task effect. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  StimulusKind,
  advanceScenario,
  initialState,
  projectOpenEffects,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  Scenario,
  StateObservation,
} from "@bpmn-lean/semantic-core";

import {
  BpmnWorkflowHostInputKind,
  EffectExecutionSchedule,
  EffectProbeActivityRegistry,
  EffectProbeStore,
  WorkflowChainBudgetKind,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  bpmnWorkflowContinuationV1,
  createCachedLocalEnvironment,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  readTestProcessTerminalResult,
  requireDurableEffectActivityHistory,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  serviceTaskEffectRequest,
} from "./service-task-effect-fixture.ts";
import {
  compileExecutionInput,
  loadJson,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import { historyEvents } from "./temporal-history-facts.ts";
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

const scenarioUrl = new URL(
  "../../../../scenarios/service-task-effect/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/service-task-effect/process.bpmn",
  import.meta.url,
);
const operationDeadlineMs = 20_000;

test("an open Service Task effect rolls before scheduling and completes once", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  assert.equal(
    semanticProcess.identity.semanticProfile,
    "cibseven-2.2.0-service-task-effect-draft",
  );
  const start = scenario.stimuli[0];
  assert.ok(start?.kind === StimulusKind.StartProcess);
  const started = advanceScenario(semanticProcess, initialState, start);
  assert.equal(started.kind, "committed");
  if (started.kind !== "committed") {
    assert.fail("Service Task start did not reach its committed effect wait");
  }
  const effect = projectOpenEffects(started.state)[0];
  assert.ok(effect !== undefined);
  const completion = scenario.stimuli[1];
  assert.ok(completion?.kind === StimulusKind.CompleteEffect);
  assert.deepEqual(completion.effectId, effect.id);
  const expected = runScenario(scenario, semanticProcess);
  const request = serviceTaskEffectRequest({ scenario, semanticProcess });
  const workflowId = processWorkflowId(start.instanceId);
  const registry = new EffectProbeActivityRegistry();
  const store = new EffectProbeStore();
  store.requireEmpty();
  let releaseActivity: (() => void) | undefined;
  let markActivityStarted: (() => void) | undefined;
  const activityRelease = new Promise<void>((resolve) => {
    releaseActivity = resolve;
  });
  const activityStarted = new Promise<void>((resolve) => {
    markActivityStarted = resolve;
  });
  registry.register(request, async (actualRequest) => {
    const result = await store.execute(
      actualRequest,
      EffectExecutionSchedule.PlainSuccess,
    );
    markActivityStarted?.();
    await activityRelease;
    return result;
  });
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-effect-rollover",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "effect-rollover Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-chain-effect-rollover",
      registry.activities,
    );
    const firstHandle = await environment.client.workflow.start(
      bpmnProcessWorkflowType,
      {
        args: [
          start,
          semanticProcess,
          {
            protocol: bpmnWorkflowContinuationV1,
            kind: BpmnWorkflowHostInputKind.Initial,
            eventHistoryEventLimit: 3,
            eventHistoryByteLimit: workflowChainProductionLimit(
              WorkflowChainBudgetKind.EventHistoryBytes,
            ),
          },
        ],
        taskQueue: bpmnSemanticTaskQueue,
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      },
    );
    await waitForWorkflowChainRunCount(environment, workflowId, 2);
    const boundaryRuns = await workflowChainRuns(environment, workflowId);
    assert.equal(boundaryRuns.length, 2);
    const firstRun = boundaryRuns[0];
    assert.ok(firstRun !== undefined);
    const firstHistory = await environment.client.workflow
      .getHandle(workflowId, firstRun.runId)
      .fetchHistory() as TemporalHistory;
    assert.equal(
      historyEvents(firstHistory, "workflowExecutionContinuedAsNewEventAttributes").length,
      1,
    );
    requireNoActivityHistory(firstHistory);

    await withDeadline(
      activityStarted,
      operationDeadlineMs,
      "effect-rollover Activity start",
    );
    const carriedWait = await waitForPublishedWorkflowChainState(
      environment,
      workflowId,
      semanticProcess,
      start.instanceId,
      (state) => state.openEffects.length === 1,
    );
    assert.deepEqual(carriedWait.openEffects, [effect]);
    assert.equal(carriedWait.logicalTimeMs, 0);
    assert.deepEqual(store.evidence(), {
      invocations: 1,
      mutations: 1,
      keys: [request.idempotencyKey],
    });
    releaseActivity?.();

    const terminal = await withDeadline(
      readTestProcessTerminalResult(firstHandle),
      operationDeadlineMs,
      "effect-rollover terminal result",
    );
    assert.equal(isCompletedProcessReceipt(terminal.receipt), true);
    const expectedFinalState = expected.trace.at(-1);
    assert.equal(expectedFinalState?.kind, CanonicalObservationKind.State);
    assert.deepEqual(
      terminal.receipt.finalState,
      expectedFinalState as StateObservation,
    );
    assert.deepEqual(terminal.recoveryEntries, []);
    assert.deepEqual(terminal.legacyMessageDeliveryRecords, []);

    const runs = await workflowChainRuns(environment, workflowId);
    assert.equal(runs.length, 2);
    const histories: TemporalHistory[] = [];
    const trace: CanonicalObservation[] = [];
    for (const run of runs) {
      const runHandle = environment.client.workflow.getHandle<BpmnProcessWorkflow>(
        workflowId,
        run.runId,
      );
      const history = await runHandle.fetchHistory();
      histories.push(history as TemporalHistory);
      trace.push(...await runHandle.query<ReadonlyArray<CanonicalObservation>>(
        bpmnTraceQueryName,
      ));
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.deepEqual(trace, expected.trace);
    requireNoActivityHistory(histories[0]!);
    requireDurableEffectActivityHistory(histories[1]!, request, 1);
    for (const field of [
      "activityTaskScheduledEventAttributes",
      "activityTaskStartedEventAttributes",
      "activityTaskCompletedEventAttributes",
    ] as const) {
      assert.equal(totalHistoryEvents(histories, field), 1);
    }
    for (const field of [
      "activityTaskFailedEventAttributes",
      "activityTaskTimedOutEventAttributes",
      "activityTaskCanceledEventAttributes",
    ] as const) {
      assert.equal(totalHistoryEvents(histories, field), 0);
    }
    assert.equal(
      histories.reduce(
        (count, history) => count + historyEvents(
          history,
          "timerStartedEventAttributes",
        ).length,
        0,
      ),
      0,
    );
    assert.equal(
      histories.reduce(
        (count, history) => count + historyEvents(
          history,
          "workflowExecutionSignaledEventAttributes",
        ).length,
        0,
      ),
      0,
    );
    assert.equal(
      trace.filter(
        (observation) =>
          observation.kind === CanonicalObservationKind.Command &&
          observation.commandId === completion.commandId &&
          observation.outcome === CommandOutcome.Committed,
      ).length,
      1,
    );
  } finally {
    releaseActivity?.();
    registry.unregister(request.idempotencyKey);
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

function requireNoActivityHistory(history: TemporalHistory): void {
  for (const field of [
    "activityTaskScheduledEventAttributes",
    "activityTaskStartedEventAttributes",
    "activityTaskCompletedEventAttributes",
    "activityTaskFailedEventAttributes",
    "activityTaskTimedOutEventAttributes",
  ] as const) {
    assert.equal(historyEvents(history, field).length, 0);
  }
}

function totalHistoryEvents(
  histories: ReadonlyArray<TemporalHistory>,
  field: Parameters<typeof historyEvents>[1],
): number {
  return histories.reduce(
    (count, history) => count + historyEvents(history, field).length,
    0,
  );
}
