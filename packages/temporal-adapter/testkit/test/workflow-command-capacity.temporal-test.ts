import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  MessageChannelKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  Scenario,
} from "@bpmn-lean/semantic-core";
import { ApplicationFailure } from "@temporalio/workflow";
import {
  BpmnProcessStartResultKind,
  ExecutionPublicationResultKind,
  WorkflowChainBudgetKind,
  bpmnCompleteUserTaskUpdateName,
  bpmnDeliverMessageSignalName,
  bpmnExecutionPublicationQueryName,
  bpmnSemanticTaskQueue,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  requireExecutionPublicationTransportResult,
  startBpmnProcess,
  submitUserTaskCompletion,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  compileExecutionInput,
  loadJson,
  requiredAt,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import { historyEvents } from "./temporal-history-facts.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/user-task-cycle/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/user-task-cycle/process.bpmn",
  import.meta.url,
);
const operationDeadlineMs = 20_000;
const stimulusLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.SemanticStimulusBytes,
);
const queueEntryLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.SemanticInputQueueEntries,
);

test("Workflow consumer rejects an oversized Update and fails closed on an oversized Signal", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const start = requiredAt(scenario.stimuli, 0, "cycle stimuli");
  if (start.kind !== StimulusKind.StartProcess) {
    assert.fail("cycle scenario has no Process start");
  }
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-command-capacity",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Workflow command-capacity Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-command-capacity",
    );
    const started = await startBpmnProcess(
      environment.client.workflow,
      start,
      semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    );
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      assert.fail(`capacity Workflow start was rejected: ${started.failure.code}`);
    }
    const handle = getTestProcessHandle(
      environment.client.workflow,
      started.processInstanceId,
    );
    await waitForOpenUserTaskIds(handle, ["Review"]);
    const revisionBefore = await executionHead(handle, semanticProcess, start.instanceId);

    const oversizedUpdate = sizedCompletion(start.instanceId, 1, stimulusLimit + 1);
    await assert.rejects(
      handle.executeUpdate(
        bpmnCompleteUserTaskUpdateName,
        { args: [oversizedUpdate], updateId: "oversized-capacity-update" },
      ),
      (error: unknown) => {
        assertCapacityFailure(
          error,
          WorkflowChainBudgetKind.SemanticStimulusBytes,
          stimulusLimit + 1,
          start.instanceId,
          revisionBefore,
        );
        return true;
      },
    );
    assert.equal(
      await executionHead(handle, semanticProcess, start.instanceId),
      revisionBefore,
    );

    const exactUpdate = completion(start.instanceId, 1, "advance-cycle");
    assert.deepEqual(
      await submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        exactUpdate,
      ),
      {
        kind: "semantic",
        commandId: exactUpdate.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    await waitForOpenUserTaskIds(handle, ["Review"]);
    const committedRevision = await executionHead(
      handle,
      semanticProcess,
      start.instanceId,
    );
    assert.ok(committedRevision > revisionBefore);

    const oversizedSignal = sizedMessage(start.instanceId, stimulusLimit + 1);
    await handle.signal(bpmnDeliverMessageSignalName, oversizedSignal);
    await assert.rejects(
      withDeadline(
        handle.result(),
        operationDeadlineMs,
        "oversized Signal capacity failure",
      ),
      (error: unknown) => {
        assertCapacityFailure(
          error,
          WorkflowChainBudgetKind.SemanticStimulusBytes,
          stimulusLimit + 1,
          start.instanceId,
          committedRevision,
        );
        return true;
      },
    );
    assert.equal(
      await executionHead(handle, semanticProcess, start.instanceId),
      committedRevision,
    );

    const history = await handle.fetchHistory();
    assert.equal(
      historyEvents(
        history as TemporalHistory,
        "workflowExecutionFailedEventAttributes",
      ).length,
      1,
    );
    await replayBpmnHistory(
      bundle,
      history,
      processWorkflowId(start.instanceId),
    );
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

test("a sixty-fifth accepted Signal fails the Run before any queued input is exposed", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const originalStart = requiredAt(scenario.stimuli, 0, "cycle stimuli");
  if (originalStart.kind !== StimulusKind.StartProcess) {
    assert.fail("cycle scenario has no Process start");
  }
  const start = {
    ...originalStart,
    commandId: "queue-capacity-start",
    instanceId: `${originalStart.instanceId}-queue-capacity`,
  };
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-queue-capacity",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Workflow queue-capacity Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-queue-capacity",
    );
    const started = await startBpmnProcess(
      environment.client.workflow,
      start,
      semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    );
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      assert.fail(`queue-capacity Workflow start was rejected: ${started.failure.code}`);
    }
    const handle = getTestProcessHandle(
      environment.client.workflow,
      started.processInstanceId,
    );
    await waitForOpenUserTaskIds(handle, ["Review"]);
    const committedRevision = await executionHead(
      handle,
      semanticProcess,
      start.instanceId,
    );
    await stopBpmnTestWorker(worker);
    worker = undefined;

    const deliveries = Array.from({ length: queueEntryLimit + 1 }, (_, index) => ({
      ...message(start.instanceId, `queued-message-${index + 1}`),
      subscriptionId: {
        processInstanceId: start.instanceId,
        elementId: "Catch_1",
        activation: index + 1,
      },
    }));
    for (const delivery of deliveries) {
      await handle.signal(bpmnDeliverMessageSignalName, delivery);
    }

    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-queue-capacity-replacement",
    );
    await assert.rejects(
      withDeadline(
        handle.result(),
        operationDeadlineMs,
        "semantic queue capacity failure",
      ),
      (error: unknown) => {
        const failure = applicationFailure(error);
        assert.equal(failure.type, bpmnWorkflowChainCapacityExhaustedFailureType);
        assert.equal(failure.nonRetryable, true);
        assert.deepEqual(failure.details, [{
          budget: WorkflowChainBudgetKind.SemanticInputQueueEntries,
          configuredBound: queueEntryLimit,
          observedValue: queueEntryLimit + 1,
          processInstanceId: start.instanceId,
          publicRevision: committedRevision,
          runOrdinal: 1,
        }]);
        assertNoPrivateCapacityData(failure.details);
        return true;
      },
    );
    assert.equal(
      await executionHead(handle, semanticProcess, start.instanceId),
      committedRevision,
    );
    const history = await handle.fetchHistory();
    await replayBpmnHistory(
      bundle,
      history,
      processWorkflowId(start.instanceId),
    );
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

async function executionHead(
  handle: ReturnType<typeof getTestProcessHandle>,
  program: Awaited<ReturnType<typeof compileExecutionInput>>["semanticProcess"],
  processInstanceId: string,
): Promise<number> {
  const request = { afterRevision: 0 } as const;
  const raw = await withDeadline(
    handle.query(bpmnExecutionPublicationQueryName, request),
    operationDeadlineMs,
    "command-capacity execution publication Query",
  );
  const result = requireExecutionPublicationTransportResult(raw, {
    definition: program.identity,
    processId: program.processId,
    processInstanceId,
    afterRevision: 0,
  });
  assert.equal(result.kind, ExecutionPublicationResultKind.Available);
  if (result.kind !== ExecutionPublicationResultKind.Available) {
    assert.fail("command-capacity execution publication is unavailable");
  }
  return result.page.headRevision;
}

function sizedCompletion(
  processInstanceId: string,
  activation: number,
  targetBytes: number,
): CompleteUserTaskInstanceStimulus {
  const base = completion(processInstanceId, activation, "");
  const stimulus = completion(
    processInstanceId,
    activation,
    "x".repeat(targetBytes - workflowChainCanonicalUtf8ByteLength(base)),
  );
  assert.equal(workflowChainCanonicalUtf8ByteLength(stimulus), targetBytes);
  return stimulus;
}

function completion(
  processInstanceId: string,
  activation: number,
  commandId: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: {
      processInstanceId,
      elementId: "Review",
      activation,
    },
    submittedValues: [{
      name: "route",
      value: { kind: VariableValueKind.String, value: "repeat" },
    }],
  };
}

function sizedMessage(
  processInstanceId: string,
  targetBytes: number,
): DeliverMessageStimulus {
  const base = message(processInstanceId, "");
  const stimulus = message(
    processInstanceId,
    "x".repeat(targetBytes - workflowChainCanonicalUtf8ByteLength(base)),
  );
  assert.equal(workflowChainCanonicalUtf8ByteLength(stimulus), targetBytes);
  return stimulus;
}

function message(
  processInstanceId: string,
  commandId: string,
): DeliverMessageStimulus {
  return {
    kind: StimulusKind.DeliverMessage,
    commandId,
    subscriptionId: {
      processInstanceId,
      elementId: "Catch_1",
      activation: 1,
    },
    channel: {
      kind: MessageChannelKind.OperationMessage,
      interfaceId: "Interface_1",
      interfaceOperationId: "Operation_1",
      messageId: "Message_1",
    },
  };
}

function assertCapacityFailure(
  error: unknown,
  budget: WorkflowChainBudgetKind,
  observedValue: number,
  processInstanceId: string,
  publicRevision: number,
): void {
  const failure = applicationFailure(error);
  assert.equal(failure.type, bpmnWorkflowChainCapacityExhaustedFailureType);
  assert.equal(failure.nonRetryable, true);
  assert.deepEqual(failure.details, [{
    budget,
    configuredBound: stimulusLimit,
    observedValue,
    processInstanceId,
    publicRevision,
    runOrdinal: 1,
  }]);
  assertNoPrivateCapacityData(failure.details);
}

function applicationFailure(error: unknown): ApplicationFailure {
  let current = error;
  while (current instanceof Error) {
    if (current instanceof ApplicationFailure) {
      return current;
    }
    current = current.cause;
  }
  throw new TypeError("Workflow failure has no ApplicationFailure cause");
}

function assertNoPrivateCapacityData(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoPrivateCapacityData(item);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    assert.equal(
      ["runId", "firstExecutionRunId", "program", "state", "command"].includes(key),
      false,
      `capacity data exposed ${key}`,
    );
    assertNoPrivateCapacityData(item);
  }
}
