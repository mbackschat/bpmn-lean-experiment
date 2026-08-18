import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  StimulusKind,
  VariableValueKind,
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
  readTestProcessTerminalResult,
  submitUserTaskCompletion,
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  requireWorkflowChainEventHistoryMargin,
  workflowChainProductionLimit,
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
const productionHistoryEvents = workflowChainProductionLimit(
  WorkflowChainBudgetKind.EventHistoryEvents,
);
const productionHistoryBytes = workflowChainProductionLimit(
  WorkflowChainBudgetKind.EventHistoryBytes,
);

for (const rolloverCase of [
  {
    title: "a cyclic User Task process crosses two event-triggered Run boundaries",
    eventHistoryEventLimit: 4,
    eventHistoryByteLimit: productionHistoryBytes,
    expectedRunCount: 3,
    trigger: "event",
  },
  {
    title: "a cyclic User Task process crosses a byte-triggered Run boundary",
    eventHistoryEventLimit: productionHistoryEvents,
    eventHistoryByteLimit: 48 * 1_024,
    expectedRunCount: 2,
    historyPressureCommands: 4,
    trigger: "byte",
  },
] as const) {
  test(rolloverCase.title, async (context) => {
    await runRolloverCase(context, rolloverCase);
  });
}

async function runRolloverCase(
  context: Readonly<{ diagnostic(message: string): void }>,
  rolloverCase: Readonly<{
    eventHistoryEventLimit: number;
    eventHistoryByteLimit: number;
    expectedRunCount: number;
    historyPressureCommands?: number;
    trigger: "event" | "byte";
  }>,
): Promise<void> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const expected = runScenario(scenario, semanticProcess);
  const start = requiredStart(scenario);
  const workflowId = processWorkflowId(start.instanceId);
  const completions = [1, 2, 3].map((index) => requiredCompletion(scenario, index));
  const expectedRecoveryCommandIds: string[] = [];
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
            eventHistoryEventLimit: rolloverCase.eventHistoryEventLimit,
            eventHistoryByteLimit: rolloverCase.eventHistoryByteLimit,
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
      expectedRecoveryCommandIds.push(stimulus.commandId);
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
        for (let conflictIndex = 0;
          conflictIndex < (rolloverCase.historyPressureCommands ?? 0);
          conflictIndex += 1) {
          const historyPressureStimulus: CompleteUserTaskInstanceStimulus = {
            ...stimulus,
            commandId: `history-pressure-${conflictIndex}`,
            taskId: { ...stimulus.taskId, activation: 100 + conflictIndex },
            submittedValues: [
              {
                name: "route",
                value: {
                  kind: VariableValueKind.String,
                  value: `${conflictIndex}:${"x".repeat(12 * 1_024)}`,
                },
              },
            ],
          };
          const pressureResult = await submitUserTaskCompletion(
            environment.client.workflow,
            start.instanceId,
            historyPressureStimulus,
          );
          assert.equal(pressureResult.kind, "semantic");
          assert.equal(pressureResult.outcome, CommandOutcome.Rejected);
          expectedRecoveryCommandIds.push(historyPressureStimulus.commandId);
        }
      }
    }

    const terminalResult = await withDeadline(
      readTestProcessTerminalResult(firstHandle),
      operationDeadlineMs,
      "Workflow-chain terminal result",
    );
    const receipt = terminalResult.receipt;
    assert.equal(isCompletedProcessReceipt(receipt), true);
    assert.deepEqual(receipt.definition, semanticProcess.identity);
    assert.equal(receipt.processId, semanticProcess.processId);
    assert.equal(receipt.processInstanceId, start.instanceId);
    const expectedFinalState = expected.trace.at(-1);
    assert.equal(expectedFinalState?.kind, CanonicalObservationKind.State);
    assert.deepEqual(receipt.finalState, expectedFinalState as StateObservation);
    assert.equal(
      terminalResult.recoveryEntries.length,
      expectedRecoveryCommandIds.length,
    );
    assert.deepEqual(
      terminalResult.recoveryEntries.map((entry) => entry.commandId),
      expectedRecoveryCommandIds,
    );
    assert.deepEqual(terminalResult.legacyMessageDeliveryRecords, []);

    const runIds: string[] = [];
    for await (const execution of environment.client.workflow.list()) {
      if (execution.workflowId === workflowId) {
        runIds.push(execution.runId);
      }
    }
    let continuationCount = 0;
    const margin = requireWorkflowChainEventHistoryMargin();
    for (const runId of runIds) {
      const runHandle = environment.client.workflow.getHandle(workflowId, runId);
      const history = await runHandle.fetchHistory();
      const typedHistory = history as TemporalHistory;
      const description = await runHandle.describe();
      assert.equal(description.historyLength, typedHistory.events.length);
      assert.ok(
        typeof description.historySize === "number" &&
          Number.isSafeInteger(description.historySize) &&
          description.historySize > 0,
      );
      context.diagnostic(
        `Workflow-chain Run history: ${typedHistory.events.length} events, ${description.historySize} bytes`,
      );
      assert.ok(typedHistory.events.length < margin.eventWarningLimit);
      assert.ok(description.historySize < margin.byteWarningLimit);
      assertContinueAsNewNotSuggested(typedHistory);
      const runContinuations = historyEvents(
        typedHistory,
        "workflowExecutionContinuedAsNewEventAttributes",
      ).length;
      continuationCount += runContinuations;
      if (runContinuations === 1) {
        if (rolloverCase.trigger === "event") {
          assert.ok(
            typedHistory.events.length >= rolloverCase.eventHistoryEventLimit,
          );
          assert.ok(
            typedHistory.events.length - rolloverCase.eventHistoryEventLimit <=
              margin.maximumActivationEvents,
          );
          assert.ok(
            description.historySize < rolloverCase.eventHistoryByteLimit,
          );
        } else {
          assert.ok(
            typedHistory.events.length < rolloverCase.eventHistoryEventLimit,
          );
          assert.ok(
            description.historySize >= rolloverCase.eventHistoryByteLimit,
          );
          assert.ok(
            description.historySize - rolloverCase.eventHistoryByteLimit <=
              margin.maximumActivationBytes,
          );
        }
      }
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.equal(runIds.length, rolloverCase.expectedRunCount);
    assert.equal(continuationCount, rolloverCase.expectedRunCount - 1);
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
}

function assertContinueAsNewNotSuggested(history: TemporalHistory): void {
  const startedTasks = historyEvents(
    history,
    "workflowTaskStartedEventAttributes",
  );
  assert.ok(startedTasks.length > 0, "history has no started Workflow Task");
  for (const event of startedTasks) {
    const attributes = event["workflowTaskStartedEventAttributes"];
    assert.ok(
      attributes !== null &&
        typeof attributes === "object" &&
        !Array.isArray(attributes),
    );
    assert.equal(
      (attributes as Readonly<Record<string, unknown>>)["suggestContinueAsNew"] ??
        false,
      false,
    );
    assert.deepEqual(
      (attributes as Readonly<Record<string, unknown>>)[
        "suggestContinueAsNewReasons"
      ] ?? [],
      [],
    );
  }
}

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
