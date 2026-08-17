import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  Scenario,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessStartResultKind,
  WorkflowChainBudgetKind,
  createCachedLocalEnvironment,
  createCommandPublicationState,
  getTestProcessHandle,
  integrateCommandPublication,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  measureWorkflowRunRetention,
  processWorkflowId,
  readTestProcessTerminalResult,
  recordCommandPublicationOutcome,
  startBpmnProcess,
  submitUserTaskCompletion,
  workflowChainProductionLimit,
  workflowRunRetentionCandidateReserveBytes,
  bpmnSemanticTaskQueue,
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
const retainedLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.RetainedRunTraceAndPublicationBytes,
);

test("Run-local trace growth rolls over before 2 MiB without changing semantic state", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const originalStart = requiredAt(scenario.stimuli, 0, "cycle stimuli");
  if (originalStart.kind !== StimulusKind.StartProcess) {
    assert.fail("cycle scenario has no Process start");
  }
  const start = {
    ...originalStart,
    commandId: "retained-run-start",
    instanceId: `${originalStart.instanceId}-retained-run`,
    initialVariables: [{
      name: "retainedPayload",
      value: {
        kind: VariableValueKind.String,
        value: "x".repeat(20 * 1_024),
      },
    }],
  } as const;
  const prediction = predictFirstRollover(start, semanticProcess);
  assert.ok(prediction.commandCount > 1);
  assert.ok(prediction.beforeBytes + (2 * prediction.reserveBytes) <= retainedLimit);
  assert.ok(prediction.closedBytes + (2 * prediction.reserveBytes) > retainedLimit);
  assert.ok(prediction.closedBytes <= retainedLimit - prediction.reserveBytes);

  const workflowId = processWorkflowId(start.instanceId);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-run-retention",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Workflow Run-retention Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-run-retention",
    );
    const started = await startBpmnProcess(
      environment.client.workflow,
      start,
      semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    );
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      assert.fail(`Run-retention Workflow start was rejected: ${started.failure.code}`);
    }
    const firstHandle = getTestProcessHandle(
      environment.client.workflow,
      start.instanceId,
    );
    await waitForOpenUserTaskIds(firstHandle, ["Review"]);

    for (let index = 1; index < prediction.commandCount; index += 1) {
      await assertRejectedCompletion(
        environment.client.workflow,
        start.instanceId,
        staleCompletion(start.instanceId, index),
      );
    }
    assert.equal(await countWorkflowRuns(environment, workflowId), 1);

    const closingStimulus = staleCompletion(
      start.instanceId,
      prediction.commandCount,
    );
    await assertRejectedCompletion(
      environment.client.workflow,
      start.instanceId,
      closingStimulus,
    );
    await waitForRunCount(environment, workflowId, 2);

    const successor = getTestProcessHandle(
      environment.client.workflow,
      start.instanceId,
    );
    const open = await waitForOpenUserTaskIds(successor, ["Review"]);
    assert.deepEqual(open.map(({ id }) => id), [{
      processInstanceId: start.instanceId,
      elementId: "Review",
      activation: 1,
    }]);
    await assertRejectedCompletion(
      environment.client.workflow,
      start.instanceId,
      staleCompletion(start.instanceId, 1),
    );

    for (let index = 1; index <= 3; index += 1) {
      const original = requiredAt(scenario.stimuli, index, "cycle stimuli");
      if (original.kind !== StimulusKind.CompleteUserTaskInstance) {
        assert.fail(`cycle stimulus ${index} is not a User Task completion`);
      }
      const stimulus = {
        ...original,
        commandId: `retained-run-completion-${index}`,
        taskId: { ...original.taskId, processInstanceId: start.instanceId },
      };
      assert.deepEqual(
        await submitUserTaskCompletion(
          environment.client.workflow,
          start.instanceId,
          stimulus,
        ),
        {
          kind: "semantic",
          commandId: stimulus.commandId,
          outcome: CommandOutcome.Committed,
        },
      );
    }

    const terminal = await withDeadline(
      readTestProcessTerminalResult(firstHandle),
      operationDeadlineMs,
      "Run-retention terminal result",
    );
    assert.equal(isCompletedProcessReceipt(terminal.receipt), true);
    assert.equal(
      terminal.recoveryEntries.length,
      prediction.commandCount + 3,
    );

    const histories = await workflowRunHistories(environment, workflowId);
    assert.equal(histories.length, 2);
    let continuationCount = 0;
    for (const history of histories) {
      const typed = history as TemporalHistory;
      continuationCount += historyEvents(
        typed,
        "workflowExecutionContinuedAsNewEventAttributes",
      ).length;
      assert.equal(
        historyEvents(typed, "workflowExecutionFailedEventAttributes").length,
        0,
      );
      assert.ok(typed.events.length < workflowChainProductionLimit(
        WorkflowChainBudgetKind.EventHistoryEvents,
      ));
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.equal(continuationCount, 1);
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

function predictFirstRollover(
  start: StartProcessStimulus,
  semanticProcess: Parameters<typeof advanceScenario>[0],
) {
  const startStep = advanceScenario(semanticProcess, initialState, start);
  assert.equal(startStep.kind, ScenarioStepKind.Committed);
  if (startStep.kind !== ScenarioStepKind.Committed) {
    assert.fail("Run-retention Start did not commit");
  }
  const publicationBefore = createCommandPublicationState(
    semanticProcess,
    start.instanceId,
  );
  const publication = recordCommandPublicationOutcome(
    integrateCommandPublication(
      semanticProcess,
      publicationBefore,
      start,
      startStep,
      () => 1_000,
    ),
    start,
    startStep.observations,
  );
  const trace: CanonicalObservation[] = [{
    kind: CanonicalObservationKind.Deployment,
    outcome: CommandOutcome.Committed,
  }, ...startStep.observations];
  const reserveBytes = workflowRunRetentionCandidateReserveBytes();
  let state = startStep.state;
  let commandCount = 0;
  let beforeBytes = measureWorkflowRunRetention(trace, publication);
  let closedBytes = beforeBytes;
  while (closedBytes + (2 * reserveBytes) <= retainedLimit) {
    beforeBytes = closedBytes;
    commandCount += 1;
    const step = advanceScenario(
      semanticProcess,
      state,
      staleCompletion(start.instanceId, commandCount),
    );
    assert.equal(step.kind, ScenarioStepKind.Terminal);
    if (step.kind !== ScenarioStepKind.Terminal) {
      assert.fail("stale completion unexpectedly committed");
    }
    assert.equal(step.outcome.kind, ScenarioOutcomeKind.Semantic);
    if (step.outcome.kind !== ScenarioOutcomeKind.Semantic) {
      assert.fail("stale completion did not produce a semantic outcome");
    }
    assert.equal(step.outcome.outcome, CommandOutcome.Rejected);
    state = step.state;
    trace.push(...step.observations);
    closedBytes = measureWorkflowRunRetention(trace, publication);
  }
  return { commandCount, beforeBytes, closedBytes, reserveBytes };
}

function staleCompletion(
  processInstanceId: string,
  index: number,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `retained-run-rejection-${index}`,
    taskId: {
      processInstanceId,
      elementId: "Review",
      activation: 999,
    },
    submittedValues: [{
      name: "route",
      value: { kind: VariableValueKind.String, value: "repeat" },
    }],
  };
}

async function assertRejectedCompletion(
  client: Parameters<typeof submitUserTaskCompletion>[0],
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
): Promise<void> {
  assert.deepEqual(
    await submitUserTaskCompletion(client, processInstanceId, stimulus),
    {
      kind: "semantic",
      commandId: stimulus.commandId,
      outcome: CommandOutcome.Rejected,
    },
  );
}

async function waitForRunCount(
  environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>,
  workflowId: string,
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await countWorkflowRuns(environment, workflowId) === expected) return;
    await delay(25);
  }
  assert.fail(`Workflow chain did not reach ${expected} Runs`);
}

async function countWorkflowRuns(
  environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>,
  workflowId: string,
): Promise<number> {
  return withDeadline((async () => {
    let count = 0;
    for await (const execution of environment.client.workflow.list()) {
      if (execution.workflowId === workflowId) count += 1;
    }
    return count;
  })(), 1_000, "Run-retention Workflow listing");
}

async function workflowRunHistories(
  environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>,
  workflowId: string,
) {
  const histories = [];
  for await (const execution of environment.client.workflow.list()) {
    if (execution.workflowId === workflowId) {
      histories.push(await environment.client.workflow
        .getHandle(workflowId, execution.runId)
        .fetchHistory());
    }
  }
  return histories;
}
