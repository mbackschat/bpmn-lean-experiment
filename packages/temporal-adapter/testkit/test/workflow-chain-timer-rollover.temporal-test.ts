/** Forced chain evidence for the registered BPMN/CIB Intermediate Catch Timer. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  StimulusKind,
  advanceScenario,
  initialState,
  projectOpenTimers,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  Scenario,
  StateObservation,
} from "@bpmn-lean/semantic-core";

import {
  BpmnWorkflowHostInputKind,
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
  requireDurableTimerHistory,
  timerFiringStimulus,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

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
  "../../../../scenarios/intermediate-catch-timer/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/intermediate-catch-timer/process.bpmn",
  import.meta.url,
);
const operationDeadlineMs = 20_000;

test("an open Intermediate Catch Timer rolls before arming and fires once", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  assert.equal(
    semanticProcess.identity.semanticProfile,
    "cibseven-2.2.0-intermediate-catch-timer-draft",
  );
  const originalStart = scenario.stimuli[0];
  assert.ok(originalStart?.kind === StimulusKind.StartProcess);
  const start = {
    ...originalStart,
    commandId: "start-timer-rollover",
    instanceId: `${originalStart.instanceId}-rollover`,
  } as const;
  const started = advanceScenario(semanticProcess, initialState, start);
  assert.equal(started.kind, "committed");
  if (started.kind !== "committed") {
    assert.fail("Timer start did not reach its committed wait");
  }
  const timer = projectOpenTimers(started.state)[0];
  assert.ok(timer !== undefined);
  const firing = timerFiringStimulus(timer);
  const expected = runScenario(
    { ...scenario, stimuli: [start, firing] },
    semanticProcess,
  );
  const workflowId = processWorkflowId(start.instanceId);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-timer-rollover",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Timer-rollover Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-chain-timer-rollover",
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
    assert.equal(historyEvents(firstHistory, "timerStartedEventAttributes").length, 0);
    assert.equal(historyEvents(firstHistory, "timerFiredEventAttributes").length, 0);

    const carriedWait = await waitForPublishedWorkflowChainState(
      environment,
      workflowId,
      semanticProcess,
      start.instanceId,
      (state) => state.openTimers.length === 1,
    );
    assert.deepEqual(carriedWait.openTimers, [timer]);
    assert.equal(carriedWait.logicalTimeMs, 0);

    const terminal = await withDeadline(
      readTestProcessTerminalResult(firstHandle),
      operationDeadlineMs,
      "Timer-rollover terminal result",
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
    requireDurableTimerHistory(histories[1]!, 1_000);
    assert.equal(
      histories.reduce(
        (count, history) => count + historyEvents(
          history,
          "timerStartedEventAttributes",
        ).length,
        0,
      ),
      1,
    );
    assert.equal(
      histories.reduce(
        (count, history) => count + historyEvents(
          history,
          "timerFiredEventAttributes",
        ).length,
        0,
      ),
      1,
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
      histories.reduce(
        (count, history) => count + historyEvents(
          history,
          "activityTaskScheduledEventAttributes",
        ).length,
        0,
      ),
      0,
    );
    assert.equal(
      trace.filter(
        (observation) =>
          observation.kind === CanonicalObservationKind.Command &&
          observation.commandId === firing.commandId &&
          observation.outcome === CommandOutcome.Committed,
      ).length,
      1,
    );
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});
