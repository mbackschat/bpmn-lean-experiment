import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  StimulusKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import { ApplicationFailure } from "@temporalio/workflow";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  bpmnProcessWorkflowType,
  bpmnCompleteUserTaskUpdateName,
  bpmnSemanticTaskQueue,
  bpmnWorkflowChainCommandRecoveryQueryName,
  bpmnWorkflowChainProtocolV1,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  submitUserTaskCompletion,
  WorkflowChainCommandRecoveryResponseKind,
  workflowCommandStimulusSha256,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

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
test("a cyclic User Task process crosses at least two Workflow Runs", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const expected = runScenario(scenario, semanticProcess);
  const start = requiredStart(scenario);
  const workflowId = processWorkflowId(start.instanceId);
  const completions = [1, 2, 3].map((index) => requiredCompletion(scenario, index));
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-chain-first-green",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Workflow-chain Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "workflow-chain-first-green");
    const firstHandle = await environment.client.workflow.start(
      bpmnProcessWorkflowType,
      {
        args: [
          start,
          semanticProcess,
          {
            protocol: "bpmn-lean.workflow-continuation.v1",
            kind: "initial",
            eventHistoryEventLimit: 4,
          },
        ],
        taskQueue: bpmnSemanticTaskQueue,
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      },
    );

    for (const [index, stimulus] of completions.entries()) {
      const open = await waitForOpenUserTaskIds(
        getTestProcessHandle(environment.client.workflow, start.instanceId),
        [stimulus.taskId.elementId],
      );
      assert.deepEqual(open.map(({ id }) => id), [stimulus.taskId]);
      const result = await submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        stimulus,
      );
      assert.equal(result.kind, "semantic");
      assert.equal(result.outcome, CommandOutcome.Committed);
      if (index === 0) {
        const successor = getTestProcessHandle(
          environment.client.workflow,
          start.instanceId,
        );
        await waitForOpenUserTaskIds(
          successor,
          [requiredAt(completions, 1, "cycle completions").taskId.elementId],
        );
        assert.deepEqual(
          await submitUserTaskCompletion(
            environment.client.workflow,
            start.instanceId,
            stimulus,
          ),
          result,
        );
        assert.deepEqual(
          await successor.query(bpmnWorkflowChainCommandRecoveryQueryName, {
            protocol: bpmnWorkflowChainProtocolV1,
            processInstanceId: start.instanceId,
            commandId: stimulus.commandId,
            stimulusSha256: workflowCommandStimulusSha256(stimulus),
          }),
          {
            protocol: bpmnWorkflowChainProtocolV1,
            processInstanceId: start.instanceId,
            commandId: stimulus.commandId,
            stimulusSha256: workflowCommandStimulusSha256(stimulus),
            kind: WorkflowChainCommandRecoveryResponseKind.Resolved,
            outcome: CommandOutcome.Committed,
          },
        );
        const conflicting = {
          ...stimulus,
          taskId: { ...stimulus.taskId, activation: 99 },
        };
        await assert.rejects(
          successor.executeUpdate(bpmnCompleteUserTaskUpdateName, {
            args: [conflicting],
            updateId: contentBoundUpdateId(conflicting),
          }),
          (error: unknown) =>
            error instanceof Error &&
            error.cause instanceof ApplicationFailure &&
            error.cause.type === "BpmnCommandIdentityConflict",
        );
      }
    }

    const receipt = await withDeadline(
      firstHandle.result(),
      operationDeadlineMs,
      "Workflow-chain terminal receipt",
    );
    assert.equal(isCompletedProcessReceipt(receipt), true);
    assert.deepEqual(receipt.definition, semanticProcess.identity);
    assert.equal(receipt.processId, semanticProcess.processId);
    assert.equal(receipt.processInstanceId, start.instanceId);
    const expectedFinalState = expected.trace.at(-1);
    assert.equal(expectedFinalState?.kind, CanonicalObservationKind.State);
    assert.deepEqual(receipt.finalState, expectedFinalState as StateObservation);

    const runIds: string[] = [];
    for await (const execution of environment.client.workflow.list()) {
      if (execution.workflowId === workflowId) {
        runIds.push(execution.runId);
      }
    }
    assert.equal(runIds.length, 3);
    let continuationCount = 0;
    for (const runId of runIds) {
      const runHandle = environment.client.workflow.getHandle(workflowId, runId);
      const history = await runHandle.fetchHistory();
      const typedHistory = history as TemporalHistory;
      continuationCount += historyEvents(
        typedHistory,
        "workflowExecutionContinuedAsNewEventAttributes",
      ).length;
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.equal(continuationCount, 2);
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

function requiredStart(scenario: Scenario) {
  const stimulus = requiredAt(scenario.stimuli, 0, "cycle stimuli");
  if (stimulus.kind !== StimulusKind.StartProcess) {
    throw new TypeError("cycle scenario has no Process start");
  }
  return stimulus;
}

function requiredCompletion(
  scenario: Scenario,
  index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = requiredAt(scenario.stimuli, index, "cycle stimuli");
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`cycle stimulus ${index} is not a User Task completion`);
  }
  return stimulus;
}
