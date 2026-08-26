/** Real-service capacity guard for maximal parallel Multi-Instance topologies. */
import assert from "node:assert/strict";
import test from "node:test";

import { CommandOutcome } from "@bpmn-lean/semantic-core";
import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  bpmnSemanticTaskQueue,
  canonicalWorkflowChainJson,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  readTestProcessTerminalResult,
  startBpmnProcess,
  submitUserTaskCompletion,
  temporalCliVersion,
  workflowChainCanonicalUtf8ByteLength,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";
import {
  ParallelMultiInstanceCapacityTopology,
  ParallelMultiInstanceHistoryEventFamily,
  retainedParallelMultiInstanceServiceHistoryMeasurement,
  requireParallelMultiInstanceHistoryCapacity,
  requireParallelMultiInstanceServiceHistoryCapacity,
  workflowChainHistoryEventEnvelopeBytes,
} from "@bpmn-lean/temporal-workflow";
import type {
  ParallelMultiInstanceHistoryEventFamilyCounts,
  ParallelMultiInstanceServiceHistoryCheckpoint,
  ParallelMultiInstanceServiceHistoryMeasurement,
  ParallelMultiInstanceServiceTopologyMeasurement,
} from "@bpmn-lean/temporal-workflow";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import {
  createParallelMultiInstanceServiceCapacityFixture,
} from "./parallel-multi-instance-history-capacity-temporal-fixture.ts";
import type {
  ParallelMultiInstanceServiceCapacityExecution,
  ParallelMultiInstanceServiceCapacityFixture,
} from "./parallel-multi-instance-history-capacity-temporal-fixture.ts";
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
import {
  waitForPublishedWorkflowChainState,
  workflowChainRuns,
} from "./workflow-chain-test-support.ts";

const operationDeadlineMs = 20_000;

test("measures maximal parallel Multi-Instance topologies on the pinned Temporal service", async () => {
  const fixture = await createParallelMultiInstanceServiceCapacityFixture();
  requireParallelMultiInstanceHistoryCapacity(fixture.serializer);
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-parallel-multi-instance-history-capacity",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "parallel Multi-Instance capacity Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "parallel-multi-instance-history-capacity",
    );
    const topologies: ParallelMultiInstanceServiceTopologyMeasurement[] = [];
    for (const topology of Object.values(ParallelMultiInstanceCapacityTopology)) {
      topologies.push(await measureTopology(environment, bundle, fixture, topology));
    }
    const measurement: ParallelMultiInstanceServiceHistoryMeasurement = {
      state: "measured",
      environment: {
        temporalCliVersion,
        temporalServerVersion: "1.31.2",
        temporalSdkVersion: "1.21.0",
      },
      separator: {
        selectedMaximumItems: fixture.serializer.selectedMaximumItems,
        maximumItemUtf8Bytes: fixture.serializer.maximumItemUtf8Bytes,
        maximumCanonicalCollectionUtf8Bytes:
          fixture.serializer.maximumCanonicalCollectionUtf8Bytes,
        canonicalMaximumCollectionBytes:
          fixture.serializer.canonicalMaximumCollectionBytes,
        exactLimitAdmitted: true,
        limitPlusOneRefusedWithoutMutation: true,
      },
      topologies,
    };

    console.log(
      `PARALLEL_MULTI_INSTANCE_SERVICE_HISTORY_MEASUREMENT=${canonicalWorkflowChainJson(measurement)}`,
    );
    requireParallelMultiInstanceServiceHistoryCapacity(measurement);
    assert.deepEqual(
      deterministicCapacityFacts(measurement),
      deterministicCapacityFacts(retainedParallelMultiInstanceServiceHistoryMeasurement),
    );
    requireParallelMultiInstanceServiceHistoryCapacity();
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
  bundle: WorkflowBundleWithSourceMap,
  fixture: ParallelMultiInstanceServiceCapacityFixture,
  topology: ParallelMultiInstanceCapacityTopology,
): Promise<ParallelMultiInstanceServiceTopologyMeasurement> {
  const execution = fixture.execution(topology);
  const started = await startBpmnProcess(
    environment.client.workflow,
    execution.start,
    fixture.program,
    { taskQueue: bpmnSemanticTaskQueue },
  );
  assert.equal(started.kind, BpmnProcessStartResultKind.Started);
  if (started.kind !== BpmnProcessStartResultKind.Started) {
    throw new TypeError("parallel capacity Workflow start was rejected");
  }
  const handle = getTestProcessHandle(
    environment.client.workflow,
    execution.start.instanceId,
  );
  await waitForOpenUserTaskIds(
    handle,
    Array.from({ length: 16 }, () => "UserTask_Review"),
  );
  const checkpoints: ParallelMultiInstanceServiceHistoryCheckpoint[] = [];
  await captureCheckpoint(handle, checkpoints, "open", {
    start: execution.start,
    program: fixture.program,
  });

  switch (topology) {
    case ParallelMultiInstanceCapacityTopology.Natural:
      await completeNatural(environment, handle, checkpoints, execution);
      break;
    case ParallelMultiInstanceCapacityTopology.TimerInterruption:
      await completeInterrupted(environment, handle, checkpoints, execution, fixture);
      break;
    case ParallelMultiInstanceCapacityTopology.EarlyCompletion:
      await completeEarly(environment, execution);
      break;
  }

  const terminal = await withDeadline(
    readTestProcessTerminalResult(handle),
    operationDeadlineMs,
    `${topology} parallel capacity terminal result`,
  );
  await captureCheckpoint(handle, checkpoints, "terminal", { terminal });
  const workflowId = processWorkflowId(execution.start.instanceId);
  const chain = await workflowChainRuns(environment, workflowId);
  assert.equal(chain.length, 1, `${topology} capacity Run chain`);
  const chainRun = chain[0];
  assert.ok(chainRun !== undefined);
  const exactHandle = environment.client.workflow.getHandle(workflowId, chainRun.runId);
  const rawHistory = await exactHandle.fetchHistory();
  const history = rawHistory as TemporalHistory;
  await replayBpmnHistory(bundle, rawHistory, workflowId);
  const description = await exactHandle.describe();
  const finalHistorySize = requireHistorySize(description.historySize);
  const finalEventCount = history.events.length;
  const last = checkpoints.at(-1);
  assert.ok(last !== undefined);
  assert.equal(last.historyLength, finalEventCount);
  assert.equal(last.historySize, finalHistorySize);
  const maximumActivationEvents = Math.max(
    ...checkpoints.map((checkpoint, index) =>
      checkpoint.historyLength - (checkpoints[index - 1]?.historyLength ?? 0)
    ),
  );
  const maximumActivationCanonicalPayloadBytes = Math.max(
    ...checkpoints.map(({ canonicalActivationPayloadBytes }) =>
      canonicalActivationPayloadBytes
    ),
  );
  return {
    topology,
    itemCount: 16,
    activeChildrenAtDecision:
      topology === ParallelMultiInstanceCapacityTopology.Natural ? 0 : 15,
    runs: [{
      runOrdinal: 1,
      checkpoints,
      finalEventCount,
      finalHistorySize,
      conservativeFinalHistoryEnvelopeBytes:
        finalEventCount * workflowChainHistoryEventEnvelopeBytes +
        maximumActivationCanonicalPayloadBytes,
      maximumActivationEvents,
      maximumActivationCanonicalPayloadBytes,
      eventFamilies: eventFamilyCounts(history),
    }],
  };
}

async function completeNatural(
  environment: TestWorkflowEnvironment,
  handle: ReturnType<typeof getTestProcessHandle>,
  checkpoints: ParallelMultiInstanceServiceHistoryCheckpoint[],
  execution: ParallelMultiInstanceServiceCapacityExecution,
): Promise<void> {
  const reverse = [...execution.completions].reverse();
  for (const [index, completion] of reverse.entries()) {
    const result = await submitUserTaskCompletion(
      environment.client.workflow,
      execution.start.instanceId,
      completion,
    );
    requireCommitted(result, completion.commandId);
    if (index < reverse.length - 1) {
      await captureCheckpoint(handle, checkpoints, `complete-${String(index + 1)}`, {
        completion,
        result,
      });
    }
  }
}

async function completeEarly(
  environment: TestWorkflowEnvironment,
  execution: ParallelMultiInstanceServiceCapacityExecution,
): Promise<void> {
  const completion = execution.completions.at(-1);
  assert.ok(completion !== undefined);
  const result = await submitUserTaskCompletion(
    environment.client.workflow,
    execution.start.instanceId,
    completion,
  );
  requireCommitted(result, completion.commandId);
}

async function completeInterrupted(
  environment: TestWorkflowEnvironment,
  handle: ReturnType<typeof getTestProcessHandle>,
  checkpoints: ParallelMultiInstanceServiceHistoryCheckpoint[],
  execution: ParallelMultiInstanceServiceCapacityExecution,
  fixture: ParallelMultiInstanceServiceCapacityFixture,
): Promise<void> {
  const first = execution.completions.at(-1);
  assert.ok(first !== undefined);
  const firstResult = await submitUserTaskCompletion(
    environment.client.workflow,
    execution.start.instanceId,
    first,
  );
  requireCommitted(firstResult, first.commandId);
  await captureCheckpoint(handle, checkpoints, "one-completed", {
    completion: first,
    result: firstResult,
  });
  await waitForOpenUserTaskIds(handle, ["UserTask_Escalation"]);
  const interruptedState = await waitForPublishedWorkflowChainState(
    environment,
    processWorkflowId(execution.start.instanceId),
    fixture.program,
    execution.start.instanceId,
    (state) =>
      state.openUserTasks.length === 1 &&
      state.openUserTasks[0]?.id.elementId === "UserTask_Escalation",
  );
  assert.equal(interruptedState.openMultiInstances?.length ?? 0, 0);
  await captureCheckpoint(handle, checkpoints, "timer-fired", {
    state: interruptedState,
  });
  const stale = execution.completions.at(-2);
  assert.ok(stale !== undefined);
  const staleResult = await submitUserTaskCompletion(
    environment.client.workflow,
    execution.start.instanceId,
    stale,
  );
  assert.deepEqual(staleResult, {
    kind: ProcessCommandResultKind.Semantic,
    commandId: stale.commandId,
    outcome: CommandOutcome.Rejected,
  });
  await captureCheckpoint(handle, checkpoints, "stale-refused", {
    completion: stale,
    result: staleResult,
  });
  const escalationResult = await submitUserTaskCompletion(
    environment.client.workflow,
    execution.start.instanceId,
    execution.escalationCompletion,
  );
  requireCommitted(escalationResult, execution.escalationCompletion.commandId);
}

async function captureCheckpoint(
  handle: ReturnType<typeof getTestProcessHandle>,
  checkpoints: ParallelMultiInstanceServiceHistoryCheckpoint[],
  label: string,
  activationPayload: unknown,
): Promise<void> {
  const description = await handle.describe();
  const checkpoint = {
    label,
    historyLength: description.historyLength,
    historySize: requireHistorySize(description.historySize),
    canonicalActivationPayloadBytes:
      workflowChainCanonicalUtf8ByteLength(activationPayload),
  };
  const previous = checkpoints.at(-1);
  assert.ok(
    previous === undefined || checkpoint.historyLength > previous.historyLength,
    `${label} did not advance Event History`,
  );
  checkpoints.push(checkpoint);
}

function requireCommitted(
  result: Awaited<ReturnType<typeof submitUserTaskCompletion>>,
  commandId: string,
): void {
  assert.deepEqual(result, {
    kind: ProcessCommandResultKind.Semantic,
    commandId,
    outcome: CommandOutcome.Committed,
  });
}

function eventFamilyCounts(
  history: TemporalHistory,
): ParallelMultiInstanceHistoryEventFamilyCounts {
  return {
    [ParallelMultiInstanceHistoryEventFamily.WorkflowExecutionStarted]:
      count(history, "workflowExecutionStartedEventAttributes"),
    [ParallelMultiInstanceHistoryEventFamily.WorkflowTask]:
      count(history, "workflowTaskScheduledEventAttributes") +
      count(history, "workflowTaskStartedEventAttributes") +
      count(history, "workflowTaskCompletedEventAttributes"),
    [ParallelMultiInstanceHistoryEventFamily.PatchMarker]:
      count(history, "markerRecordedEventAttributes"),
    [ParallelMultiInstanceHistoryEventFamily.SearchAttributeUpsert]:
      count(history, "upsertWorkflowSearchAttributesEventAttributes"),
    [ParallelMultiInstanceHistoryEventFamily.UpdateAccepted]:
      count(history, "workflowExecutionUpdateAcceptedEventAttributes"),
    [ParallelMultiInstanceHistoryEventFamily.UpdateCompleted]:
      count(history, "workflowExecutionUpdateCompletedEventAttributes"),
    [ParallelMultiInstanceHistoryEventFamily.TimerStarted]:
      count(history, "timerStartedEventAttributes"),
    [ParallelMultiInstanceHistoryEventFamily.TimerCanceled]:
      count(history, "timerCanceledEventAttributes"),
    [ParallelMultiInstanceHistoryEventFamily.TimerFired]:
      count(history, "timerFiredEventAttributes"),
    [ParallelMultiInstanceHistoryEventFamily.ContinuedAsNew]:
      count(history, "workflowExecutionContinuedAsNewEventAttributes"),
    [ParallelMultiInstanceHistoryEventFamily.TerminalCompleted]:
      count(history, "workflowExecutionCompletedEventAttributes"),
  };
}

function count(history: TemporalHistory, attributesName: string): number {
  return historyEvents(history, attributesName).length;
}

function requireHistorySize(value: number | undefined): number {
  assert.equal(typeof value, "number");
  if (typeof value !== "number") {
    throw new TypeError("Temporal service did not publish History size");
  }
  return value;
}

function deterministicCapacityFacts(value: unknown): unknown {
  const serialized = JSON.stringify(value, (key, candidate) =>
    key === "historySize" || key === "finalHistorySize" ? undefined : candidate
  );
  assert.ok(serialized !== undefined);
  return JSON.parse(serialized) as unknown;
}
