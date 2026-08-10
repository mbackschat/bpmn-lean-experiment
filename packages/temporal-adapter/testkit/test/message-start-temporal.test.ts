/** Durable Workflow-start, Worker-absence, Update, history, and replay evidence for Message Start. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  StimulusKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  StateObservation,
  TriggerMessageStartStimulus,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  createCachedLocalEnvironment,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  readBpmnProcessTrace,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

import {
  compileExecutionInput,
  loadJson,
  requiredAt,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  assertExactCompletionUpdateHistory,
  assertNoNonUpdateBpmnHostEvents,
  expectedTemporalIdentity,
  historyEvents,
} from "./temporal-history-facts.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/message-start-event/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/message-start-event/process.bpmn",
  import.meta.url,
);
const operationDeadlineMs = 10_000;
const signalWithStartMutationName = "message-start-signal-with-start-mutation";
const exactHistoryEventCount = 10;

const fixture = loadFixture();

test("Message Start survives Worker absence and replays without Signal ingress", async (context) => {
  const { scenario, semanticProcess } = await fixture;
  const start = requireMessageStart(scenario);
  const completion = requireCompletion(scenario);
  const expected = runScenario(scenario, semanticProcess);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: expectedTemporalIdentity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Message Start Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    const started = await withDeadline(
      startBpmnProcess(
        environment.client.workflow,
        start,
        semanticProcess,
        { taskQueue: bpmnSemanticTaskQueue },
      ),
      operationDeadlineMs,
      "Message Start Workflow creation without a Worker",
    );
    assert.equal(started.kind, BpmnProcessStartResultKind.Started);
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      throw new Error("Message Start Workflow was rejected");
    }
    const handle = started.handle;
    const beforeWorker = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "Message Start history before Worker startup",
    );
    assert.equal(
      historyEvents(
        beforeWorker as TemporalHistory,
        "workflowExecutionStartedEventAttributes",
      ).length,
      1,
    );
    assert.equal(
      historyEvents(
        beforeWorker as TemporalHistory,
        "workflowTaskStartedEventAttributes",
      ).length,
      0,
    );
    assert.equal(
      (await withDeadline(
        handle.describe(),
        operationDeadlineMs,
        "Message Start description before Worker startup",
      )).status.name,
      "RUNNING",
    );

    worker = await startBpmnTestWorker(
      environment,
      bundle,
      expectedTemporalIdentity,
    );
    const openTasks = await waitForOpenUserTaskIds(
      handle,
      [completion.taskId.elementId],
    );
    assert.deepEqual(openTasks.map(({ id }) => id), [completion.taskId]);
    assert.deepEqual(
      await submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        completion,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: completion.commandId,
        outcome: CommandOutcome.Committed,
      },
    );

    const receipt = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "Message Start completed receipt",
    );
    assert.equal(isCompletedProcessReceipt(receipt), true);
    if (!isCompletedProcessReceipt(receipt)) {
      throw new TypeError("Message Start Workflow returned a malformed receipt");
    }
    const expectedFinalState = expected.trace.at(-1);
    assert.equal(expectedFinalState?.kind, CanonicalObservationKind.State);
    assert.deepEqual(
      receipt.finalState,
      expectedFinalState as StateObservation,
    );
    assert.deepEqual(
      await readBpmnProcessTrace(
        environment.client.workflow,
        start.instanceId,
      ),
      expected.trace,
    );

    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "Message Start completed history",
    );
    const typedHistory = history as TemporalHistory;
    assertExactCompletionUpdateHistory(typedHistory, {
      scenario,
      semanticProcess,
    });
    assertNoNonUpdateBpmnHostEvents(typedHistory, "Message Start");
    assert.equal(
      historyEvents(
        typedHistory,
        "workflowExecutionUpdateAcceptedEventAttributes",
      ).length,
      1,
    );
    assert.equal(
      historyEvents(
        typedHistory,
        "workflowExecutionUpdateCompletedEventAttributes",
      ).length,
      1,
    );
    const description = await withDeadline(
      handle.describe(),
      operationDeadlineMs,
      "Message Start completed description",
    );
    assert.equal(description.status.name, "COMPLETED");
    assert.equal(description.historyLength, typedHistory.events.length);
    assert.equal(typedHistory.events.length, exactHistoryEventCount);
    const historySizeBytes = description.historySize;
    assert.equal(
      typeof historySizeBytes === "number" &&
        Number.isSafeInteger(historySizeBytes) &&
        historySizeBytes > 0,
      true,
    );
    context.diagnostic(
      `exact Temporal history: ${typedHistory.events.length} events, ${historySizeBytes} bytes`,
    );

    await stopBpmnTestWorker(worker);
    worker = undefined;
    await withDeadline(
      replayBpmnHistory(bundle, history, handle.workflowId),
      operationDeadlineMs,
      "Message Start exact history replay",
    );

    const mutationStart: TriggerMessageStartStimulus = {
      ...start,
      commandId: `${start.commandId}-signal-with-start-mutation`,
      instanceId: `${start.instanceId}-signal-with-start-mutation`,
    };
    const mutationHandle = await withDeadline(
      environment.client.workflow.signalWithStart(
        bpmnProcessWorkflowType,
        {
          taskQueue: bpmnSemanticTaskQueue,
          workflowId: processWorkflowId(mutationStart.instanceId),
          workflowIdReusePolicy: "REJECT_DUPLICATE",
          args: [mutationStart, semanticProcess],
          signal: signalWithStartMutationName,
          signalArgs: [],
        },
      ),
      operationDeadlineMs,
      "Signal-With-Start mutation",
    );
    const mutationHistory = await withDeadline(
      mutationHandle.fetchHistory(),
      operationDeadlineMs,
      "Signal-With-Start mutation history",
    ) as TemporalHistory;
    assert.equal(
      historyEvents(
        mutationHistory,
        "workflowExecutionSignaledEventAttributes",
      ).length,
      1,
    );
    assert.throws(
      () => assertNoNonUpdateBpmnHostEvents(
        mutationHistory,
        "Signal-With-Start mutation",
      ),
      /workflowExecutionSignaledEventAttributes/,
    );
  } finally {
    try {
      if (worker !== undefined) {
        await stopBpmnTestWorker(worker);
      }
    } finally {
      await withDeadline(
        environment.teardown(),
        operationDeadlineMs,
        "Message Start Temporal environment teardown",
      );
    }
  }
});

async function loadFixture() {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  return compileExecutionInput(scenario, bpmnUrl);
}

function requireMessageStart(scenario: Scenario): TriggerMessageStartStimulus {
  const stimulus = requiredAt(scenario.stimuli, 0, "Message Start stimuli");
  if (stimulus.kind !== StimulusKind.TriggerMessageStart) {
    throw new TypeError("Message Start scenario has no Message start");
  }
  return stimulus;
}

function requireCompletion(
  scenario: Scenario,
): CompleteUserTaskInstanceStimulus {
  const stimulus = requiredAt(scenario.stimuli, 1, "Message Start stimuli");
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError("Message Start scenario has no User Task completion");
  }
  return stimulus;
}
