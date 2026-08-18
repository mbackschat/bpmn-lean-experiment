/** Forced chain evidence for the registered standards-only Message catch semantics. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  deployProcess,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  DeliverMessageStimulus,
  Scenario,
  SemanticProcessProgram,
  StateObservation,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  BpmnCommandIdentityConflict,
  BpmnWorkflowHostInputKind,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  bpmnWorkflowContinuationV1,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  readTestProcessTerminalResult,
  submitMessageDelivery,
  submitUserTaskCompletion,
  WorkflowChainBudgetKind,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  assertExactMessageSignals,
  assertNoNonSignalMessageHostEvents,
  expectedWorkflowChainRecoveryEntry,
  requireMessageDelivery,
  requireMessageStart,
  waitForMessageState,
} from "./message-temporal-test-support.ts";
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
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import {
  waitForPublishedWorkflowChainState,
  waitForWorkflowChainRunCount,
  workflowChainRuns,
} from "./workflow-chain-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/intermediate-catch-message/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/intermediate-catch-message/process.bpmn",
  import.meta.url,
);
const operationDeadlineMs = 20_000;

test("a Message subscription and delivery cross forced Workflow Runs", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const originalStart = requireMessageStart(scenario);
  const start = {
    ...originalStart,
    commandId: "start-message-rollover",
    instanceId: `${originalStart.instanceId}-rollover`,
  } as const;
  const originalDelivery = requireMessageDelivery(scenario);
  const delivery = {
    ...originalDelivery,
    commandId: "deliver-message-after-rollover",
    subscriptionId: {
      ...originalDelivery.subscriptionId,
      processInstanceId: start.instanceId,
    },
  } satisfies DeliverMessageStimulus;
  const rejectedBeforeRollover = {
    ...delivery,
    commandId: "reject-message-before-rollover",
    channel: {
      ...delivery.channel,
      messageId: "Message_WrongBeforeRollover",
    },
  } satisfies DeliverMessageStimulus;
  const originalCompletion = requiredAt(scenario.stimuli, 2, "Message stimuli");
  assert.equal(originalCompletion.kind, StimulusKind.CompleteUserTaskInstance);
  if (originalCompletion.kind !== StimulusKind.CompleteUserTaskInstance) {
    assert.fail("Message scenario has no trailing User Task completion");
  }
  const completion = {
    ...originalCompletion,
    commandId: "complete-message-after-rollover",
    taskId: {
      ...originalCompletion.taskId,
      processInstanceId: start.instanceId,
    },
  } as const;
  const expected = expectedSemanticExecution(
    semanticProcess,
    [start, rejectedBeforeRollover, delivery, completion],
  );
  const workflowId = processWorkflowId(start.instanceId);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-message-rollover",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Message-rollover Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-chain-message-rollover",
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
            eventHistoryEventLimit: 4,
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
    const firstWaitingState = await waitForMessageState(
      getTestProcessHandle(environment.client.workflow, start.instanceId),
      (state) => state.openMessageSubscriptions.length === 1,
    );
    assert.deepEqual(firstWaitingState.openMessageSubscriptions, [{
      id: rejectedBeforeRollover.subscriptionId,
      channel: delivery.channel,
    }]);

    assert.deepEqual(
      await submitMessageDelivery(
        environment.client.workflow,
        start.instanceId,
        rejectedBeforeRollover,
      ),
      {
        kind: "semantic",
        commandId: rejectedBeforeRollover.commandId,
        outcome: CommandOutcome.Rejected,
      },
    );
    await waitForWorkflowChainRunCount(environment, workflowId, 2);

    const successorWaitingState = await waitForPublishedWorkflowChainState(
      environment,
      workflowId,
      semanticProcess,
      start.instanceId,
      (state) => state.openMessageSubscriptions.length === 1,
    );
    assert.deepEqual(successorWaitingState, firstWaitingState);

    assert.deepEqual(
      await submitMessageDelivery(
        environment.client.workflow,
        start.instanceId,
        delivery,
      ),
      {
        kind: "semantic",
        commandId: delivery.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    await waitForWorkflowChainRunCount(environment, workflowId, 3);
    const taskState = await waitForPublishedWorkflowChainState(
      environment,
      workflowId,
      semanticProcess,
      start.instanceId,
      (state) => state.openUserTasks.length === 1,
    );
    assert.deepEqual(taskState.openMessageSubscriptions, []);

    assert.deepEqual(
      await submitMessageDelivery(
        environment.client.workflow,
        start.instanceId,
        delivery,
      ),
      {
        kind: "semantic",
        commandId: delivery.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    const conflicting = {
      ...delivery,
      channel: {
        ...delivery.channel,
        messageId: "Message_ConflictingAfterRollover",
      },
    } satisfies DeliverMessageStimulus;
    await assert.rejects(
      submitMessageDelivery(
        environment.client.workflow,
        start.instanceId,
        conflicting,
      ),
      BpmnCommandIdentityConflict,
    );
    assert.deepEqual(
      await waitForPublishedWorkflowChainState(
        environment,
        workflowId,
        semanticProcess,
        start.instanceId,
        (state) => state.openUserTasks.length === 1,
      ),
      taskState,
    );

    assert.deepEqual(
      await submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        completion,
      ),
      {
        kind: "semantic",
        commandId: completion.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    const terminal = await withDeadline(
      readTestProcessTerminalResult(firstHandle),
      operationDeadlineMs,
      "Message-rollover terminal result",
    );
    assert.equal(isCompletedProcessReceipt(terminal.receipt), true);
    assert.deepEqual(
      terminal.receipt.finalState,
      expected.finalState,
    );
    assert.deepEqual(terminal.recoveryEntries, [
      expectedWorkflowChainRecoveryEntry(
        start.instanceId,
        rejectedBeforeRollover,
        CommandOutcome.Rejected,
      ),
      expectedWorkflowChainRecoveryEntry(
        start.instanceId,
        delivery,
        CommandOutcome.Committed,
      ),
      expectedWorkflowChainRecoveryEntry(
        start.instanceId,
        completion,
        CommandOutcome.Committed,
      ),
    ]);
    assert.deepEqual(terminal.legacyMessageDeliveryRecords, []);

    const runs = await workflowChainRuns(environment, workflowId);
    assert.equal(runs.length, 3);
    const histories: TemporalHistory[] = [];
    const trace = [];
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
    assert.equal(
      histories.reduce(
        (count, history) => count + historyEvents(
          history,
          "workflowExecutionContinuedAsNewEventAttributes",
        ).length,
        0,
      ),
      2,
    );
    assertExactMessageSignals(histories[0]!, [rejectedBeforeRollover]);
    assertExactMessageSignals(histories[1]!, [delivery]);
    assertExactMessageSignals(histories[2]!, [delivery, conflicting]);
    assertNoNonSignalMessageHostEvents({
      events: histories.flatMap((history) => [...history.events]),
    } as TemporalHistory);
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

function expectedSemanticExecution(
  semanticProcess: SemanticProcessProgram,
  stimuli: ReadonlyArray<Stimulus>,
): Readonly<{
  trace: ReadonlyArray<CanonicalObservation>;
  finalState: StateObservation;
}> {
  const start = stimuli[0];
  assert.ok(start?.kind === StimulusKind.StartProcess);
  const deployment = deployProcess(start, semanticProcess);
  assert.equal(deployment.outcome, CommandOutcome.Committed);
  const trace: CanonicalObservation[] = [deployment.observation];
  let state = initialState;
  let finalState: StateObservation | undefined;
  for (const stimulus of stimuli) {
    const step = advanceScenario(semanticProcess, state, stimulus);
    assert.notEqual(step.kind, ScenarioStepKind.HarnessFailure);
    if (step.kind === ScenarioStepKind.HarnessFailure) {
      assert.fail(`semantic oracle failed for ${stimulus.commandId}`);
    }
    state = step.state;
    trace.push(...step.observations);
    const observation = step.observations.at(-1);
    assert.equal(observation?.kind, CanonicalObservationKind.State);
    finalState = observation as StateObservation;
  }
  assert.ok(finalState !== undefined);
  return { trace, finalState };
}
