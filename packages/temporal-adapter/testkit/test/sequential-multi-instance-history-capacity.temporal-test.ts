/** Real-service whole-topology measurement for the private SMI host-capacity probe. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CommandOutcome } from "@bpmn-lean/semantic-core";
import type { CompleteUserTaskInstanceStimulus } from "@bpmn-lean/semantic-core";
import { contentBoundUpdateId } from "@bpmn-lean/temporal-protocol";
import {
  bpmnSemanticTaskQueue,
  canonicalWorkflowChainJson,
  createCachedLocalEnvironment,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import { DefaultLogger, bundleWorkflowCode } from "@temporalio/worker";

import {
  SequentialMultiInstanceHistoryEventFamily,
  SequentialMultiInstanceHistoryRunRole,
  SequentialMultiInstanceHistoryTopology,
  requireSequentialMultiInstanceHistoryCapacity,
  retainedSequentialMultiInstanceHistoryMeasurement,
  workflowChainHistoryEventEnvelopeBytes,
} from "@bpmn-lean/temporal-workflow";
import type {
  SequentialMultiInstanceHistoryEventFamilyCounts,
  SequentialMultiInstanceMeasuredHistory,
  SequentialMultiInstanceRunHistoryMeasurement,
  SequentialMultiInstanceTopologyHistoryMeasurement,
} from "@bpmn-lean/temporal-workflow";
import { historyEvents } from "./temporal-history-facts.ts";
import {
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  startBpmnTestWorker,
  stopBpmnTestWorker,
  replayBpmnHistory,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { workflowChainRuns } from "./workflow-chain-test-support.ts";
import {
  SequentialMultiInstanceCapacityProbeTopology,
  sequentialMultiInstanceCapacityProbeReadinessQueryName,
  sequentialMultiInstanceCapacityProbeUpdateName,
  sequentialMultiInstanceCapacityProbeWorkflowType,
} from "./sequential-multi-instance-history-capacity-workflows.ts";
import type {
  SequentialMultiInstanceCapacityProbeReadiness,
  SequentialMultiInstanceCapacityProbeResult,
  SequentialMultiInstanceCapacityProbeRun,
} from "./sequential-multi-instance-history-capacity-workflows.ts";
import {
  createSequentialMultiInstanceCapacityProbeFixture,
} from "./sequential-multi-instance-history-capacity-fixture.ts";
import type {
  SequentialMultiInstanceCapacityProbeFixture,
} from "./sequential-multi-instance-history-capacity-fixture.ts";

const workflowsPath = fileURLToPath(new URL(
  "./sequential-multi-instance-history-capacity-workflows.ts",
  import.meta.url,
));
const operationDeadlineMs = 20_000;

test("measures the complete natural and maximally interrupted SMI host topologies", async () => {
  const fixture = await createSequentialMultiInstanceCapacityProbeFixture();
  const bundle = await bundleWorkflowCode({
    workflowsPath,
    logger: new DefaultLogger("ERROR"),
  });
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-smi-history-capacity",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "SMI history-capacity Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "sequential-multi-instance-history-capacity",
    );
    const natural = await measureTopology(
      environment,
      bundle,
      fixture,
      SequentialMultiInstanceCapacityProbeTopology.Natural,
    );
    const interrupted = await measureTopology(
      environment,
      bundle,
      fixture,
      SequentialMultiInstanceCapacityProbeTopology.Interrupted,
    );
    const measurement: SequentialMultiInstanceMeasuredHistory = {
      state: "measured",
      environment: {
        temporalCliVersion: "v1.8.1",
        temporalServerVersion: "1.31.2",
        temporalSdkVersion: "1.21.0",
      },
      separator: fixture.separator,
      natural,
      interrupted,
    };

    requireSequentialMultiInstanceHistoryCapacity(measurement);
    assert.deepEqual(measurement, retainedSequentialMultiInstanceHistoryMeasurement);
    console.log(
      `SMI_HISTORY_MEASUREMENT=${canonicalWorkflowChainJson(measurement)}`,
    );
    requireSequentialMultiInstanceHistoryCapacity();
  } finally {
    try {
      if (worker !== undefined) {
        await stopBpmnTestWorker(worker);
      }
    } finally {
      await environment.teardown();
    }
  }
});

async function measureTopology(
  environment: TestWorkflowEnvironment,
  bundle: Awaited<ReturnType<typeof bundleWorkflowCode>>,
  fixture: SequentialMultiInstanceCapacityProbeFixture,
  topology: SequentialMultiInstanceCapacityProbeTopology,
): Promise<SequentialMultiInstanceTopologyHistoryMeasurement> {
  const topologyFixture = topology ===
      SequentialMultiInstanceCapacityProbeTopology.Natural
    ? fixture.natural
    : fixture.interrupted;
  const workflowId = `smi-history-capacity-${topology}`;
  const firstHandle = await environment.client.workflow.start(
    sequentialMultiInstanceCapacityProbeWorkflowType,
    {
      args: [{
        topology,
        runOrdinal: 1,
        staticPayload: topologyFixture.staticPayload,
        priorRuns: [],
      }],
      taskQueue: bpmnSemanticTaskQueue,
      workflowId,
      workflowIdReusePolicy: "REJECT_DUPLICATE",
    },
  );
  await waitForReadiness(environment, workflowId, 2);
  const completedItemsBeforeTimerResolution = topology ===
      SequentialMultiInstanceCapacityProbeTopology.Natural
    ? 16
    : 15;
  for (let index = 0; index < completedItemsBeforeTimerResolution; index += 1) {
    const update = topologyFixture.updates[index];
    assert.ok(update !== undefined);
    await executeCapacityUpdate(environment, workflowId, topology, update, index,
      topologyFixture.staticPayload.terminal.entries);
  }
  if (topology === SequentialMultiInstanceCapacityProbeTopology.Interrupted) {
    await waitForReadiness(environment, workflowId, 3);
    const escalation = topologyFixture.updates[15];
    assert.ok(escalation !== undefined);
    await executeCapacityUpdate(environment, workflowId, topology, escalation, 15,
      topologyFixture.staticPayload.terminal.entries);
  }
  const result = await withDeadline(
    firstHandle.result() as Promise<SequentialMultiInstanceCapacityProbeResult>,
    operationDeadlineMs,
    `${topology} SMI capacity terminal result`,
  );
  assert.equal(result.topology, topology);
  assert.deepEqual(result.terminal, topologyFixture.staticPayload.terminal);

  const chain = await workflowChainRuns(environment, workflowId);
  assert.equal(chain.length, topology ===
    SequentialMultiInstanceCapacityProbeTopology.Natural ? 2 : 3);
  assert.equal(result.runs.length, chain.length);
  const runs: SequentialMultiInstanceRunHistoryMeasurement[] = [];
  for (const [index, run] of chain.entries()) {
    const rawHistory = await environment.client.workflow
      .getHandle(workflowId, run.runId)
      .fetchHistory();
    const history = rawHistory as TemporalHistory;
    const summary = result.runs[index];
    assert.ok(summary !== undefined);
    assertAcceptedUpdateIds(
      history,
      updatesForRun(topologyFixture.updates, topology, summary.runOrdinal),
    );
    await replayBpmnHistory(bundle, rawHistory, workflowId);
    runs.push(closeRunMeasurement(topology, summary, history));
  }
  return {
    topology: topology === SequentialMultiInstanceCapacityProbeTopology.Natural
      ? SequentialMultiInstanceHistoryTopology.Natural
      : SequentialMultiInstanceHistoryTopology.Interrupted,
    completedItemsBeforeTimerResolution,
    terminalOutcome: CommandOutcome.Committed,
    runs,
  };
}

function closeRunMeasurement(
  topology: SequentialMultiInstanceCapacityProbeTopology,
  summary: SequentialMultiInstanceCapacityProbeRun,
  history: TemporalHistory,
): SequentialMultiInstanceRunHistoryMeasurement {
  const last = summary.stableCheckpoints.at(-1);
  assert.ok(last !== undefined);
  const finalEventCount = history.events.length;
  const eventsNotIncludedAtCheckpoint = finalEventCount - last.historyLength;
  assert.ok(eventsNotIncludedAtCheckpoint > 0);
  const closingActivationEvents = lastActivationInputEvents(summary) +
    eventsNotIncludedAtCheckpoint;
  const role = runRole(topology, summary.runOrdinal);
  const eventFamilies = familyCounts(history);
  requireNoExcludedHistoryFamilies(history, `${topology} Run ${summary.runOrdinal}`);
  return {
    runOrdinal: summary.runOrdinal,
    role,
    stableCheckpoints: summary.stableCheckpoints,
    finalBoundary: {
      eventsNotIncludedAtCheckpoint,
      canonicalPayloadBytes: summary.closingCanonicalPayloadBytes,
      // This is the same conservative per-Event envelope used by the generic reserve owner.
      conservativeEnvelopeBytes:
        eventsNotIncludedAtCheckpoint * workflowChainHistoryEventEnvelopeBytes,
    },
    finalEventCount,
    conservativeFinalHistorySize: last.historySize +
      summary.closingCanonicalPayloadBytes +
      eventsNotIncludedAtCheckpoint * workflowChainHistoryEventEnvelopeBytes,
    largestActivationEvents: Math.max(
      summary.largestActivationEvents,
      closingActivationEvents,
    ),
    largestActivationCanonicalPayloadBytes:
      summary.largestActivationCanonicalPayloadBytes,
    eventFamilies,
  };
}

function lastActivationInputEvents(
  summary: SequentialMultiInstanceCapacityProbeRun,
): number {
  const last = summary.stableCheckpoints.at(-1);
  assert.ok(last !== undefined);
  for (let index = summary.stableCheckpoints.length - 2; index >= 0; index -= 1) {
    const checkpoint = summary.stableCheckpoints[index];
    assert.ok(checkpoint !== undefined);
    if (checkpoint.historyLength < last.historyLength) {
      return last.historyLength - checkpoint.historyLength;
    }
  }
  return last.historyLength;
}

async function executeCapacityUpdate(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  topology: SequentialMultiInstanceCapacityProbeTopology,
  update: CompleteUserTaskInstanceStimulus,
  index: number,
  entries: readonly { commandId: string }[],
): Promise<void> {
  const recovery = await withDeadline(
    environment.client.workflow.getHandle(workflowId).executeUpdate(
      sequentialMultiInstanceCapacityProbeUpdateName,
      {
        args: [update],
        updateId: contentBoundUpdateId(update),
      },
    ),
    operationDeadlineMs,
    `${topology} SMI capacity Update ${index}`,
  );
  assert.deepEqual(
    recovery,
    entries.find(({ commandId }) => commandId === update.commandId),
  );
}

function updatesForRun(
  updates: readonly CompleteUserTaskInstanceStimulus[],
  topology: SequentialMultiInstanceCapacityProbeTopology,
  runOrdinal: number,
): readonly CompleteUserTaskInstanceStimulus[] {
  if (runOrdinal === 1) {
    return [];
  }
  if (runOrdinal === 2) {
    return topology === SequentialMultiInstanceCapacityProbeTopology.Natural
      ? updates
      : updates.slice(0, 15);
  }
  return updates.slice(15, 16);
}

function assertAcceptedUpdateIds(
  history: TemporalHistory,
  expected: readonly CompleteUserTaskInstanceStimulus[],
): void {
  const accepted = historyEvents(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  );
  assert.deepEqual(
    accepted.map((event) =>
      historyRecord(
        event.workflowExecutionUpdateAcceptedEventAttributes,
        "accepted Update attributes",
      ).protocolInstanceId
    ),
    expected.map(contentBoundUpdateId),
  );
}

function historyRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} is not a record`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function runRole(
  topology: SequentialMultiInstanceCapacityProbeTopology,
  runOrdinal: number,
): SequentialMultiInstanceHistoryRunRole {
  switch (runOrdinal) {
    case 1:
      return SequentialMultiInstanceHistoryRunRole.PreArming;
    case 2:
      return SequentialMultiInstanceHistoryRunRole.Armed;
    case 3:
      if (topology !== SequentialMultiInstanceCapacityProbeTopology.Interrupted) {
        throw new TypeError("natural SMI capacity topology has an unexpected Run 3");
      }
      return SequentialMultiInstanceHistoryRunRole.Escalation;
    default:
      throw new TypeError(`unexpected SMI capacity Run ${runOrdinal}`);
  }
}

function familyCounts(
  history: TemporalHistory,
): SequentialMultiInstanceHistoryEventFamilyCounts {
  return {
    [SequentialMultiInstanceHistoryEventFamily.WorkflowTask]:
      count(history, "workflowTaskScheduledEventAttributes") +
      count(history, "workflowTaskStartedEventAttributes") +
      count(history, "workflowTaskCompletedEventAttributes"),
    [SequentialMultiInstanceHistoryEventFamily.UpdateAccepted]:
      count(history, "workflowExecutionUpdateAcceptedEventAttributes"),
    [SequentialMultiInstanceHistoryEventFamily.UpdateCompleted]:
      count(history, "workflowExecutionUpdateCompletedEventAttributes"),
    [SequentialMultiInstanceHistoryEventFamily.TimerStarted]:
      count(history, "timerStartedEventAttributes"),
    [SequentialMultiInstanceHistoryEventFamily.TimerCanceled]:
      count(history, "timerCanceledEventAttributes"),
    [SequentialMultiInstanceHistoryEventFamily.TimerFired]:
      count(history, "timerFiredEventAttributes"),
    [SequentialMultiInstanceHistoryEventFamily.ContinuedAsNew]:
      count(history, "workflowExecutionContinuedAsNewEventAttributes"),
    [SequentialMultiInstanceHistoryEventFamily.TerminalCompleted]:
      count(history, "workflowExecutionCompletedEventAttributes"),
  };
}

function count(history: TemporalHistory, attributesName: string): number {
  return historyEvents(history, attributesName).length;
}

function requireNoExcludedHistoryFamilies(
  history: TemporalHistory,
  label: string,
): void {
  for (const family of [
    "workflowExecutionSignaledEventAttributes",
    "activityTaskScheduledEventAttributes",
    "startChildWorkflowExecutionInitiatedEventAttributes",
    "workflowExecutionCancelRequestedEventAttributes",
    "workflowExecutionCanceledEventAttributes",
    "requestCancelExternalWorkflowExecutionInitiatedEventAttributes",
  ]) {
    assert.equal(count(history, family), 0, `${label} unexpectedly used ${family}`);
  }
}

async function waitForReadiness(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  runOrdinal: number,
): Promise<SequentialMultiInstanceCapacityProbeReadiness> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const readiness = await environment.client.workflow
        .getHandle(workflowId)
        .query<SequentialMultiInstanceCapacityProbeReadiness>(
          sequentialMultiInstanceCapacityProbeReadinessQueryName,
        );
      if (readiness.runOrdinal === runOrdinal) {
        return readiness;
      }
    } catch (error: unknown) {
      lastError = error;
    }
    await delay(25);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`SMI capacity Workflow did not reach Run ${runOrdinal}`);
}
