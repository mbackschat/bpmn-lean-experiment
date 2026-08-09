/**
 * Durable recovery evidence for an Inclusive Gateway occurrence whose selected
 * branches are only partly complete when the Temporal Worker is replaced.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  StimulusKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
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
  acceptedCompletionOrder,
  assertNoNonUpdateBpmnHostEvents,
  assertUpdatesCompleteBeforeWorkflow,
} from "./temporal-history-facts.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const capsuleUrl = new URL(
  "../../../../scenarios/inclusive-gateway-selected-branches/",
  import.meta.url,
);
const scenarioUrl = new URL("both-true-a-then-b.scenario.json", capsuleUrl);
const bpmnUrl = new URL("process.bpmn", capsuleUrl);
const operationDeadlineMs = 10_000;
const identity = "bpmn-lean-inclusive-gateway-replacement";

test("Inclusive Gateway preserves its selected set across Worker replacement", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const input = await compileExecutionInput(scenario, bpmnUrl);
  const expected = runScenario(scenario, input.semanticProcess);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Inclusive Gateway Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, identity);
    const start = requiredAt(scenario.stimuli, 0, "Inclusive Gateway stimuli");
    if (start.kind !== StimulusKind.StartProcess) {
      throw new TypeError("Inclusive Gateway scenario has no start");
    }
    const started = await withDeadline(
      startBpmnProcess(
        environment.client.workflow,
        start,
        input.semanticProcess,
        { taskQueue: bpmnSemanticTaskQueue },
      ),
      operationDeadlineMs,
      "Inclusive Gateway Workflow start",
    );
    assert.equal(started.kind, BpmnProcessStartResultKind.Started);
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      throw new Error("Inclusive Gateway Workflow was rejected");
    }
    const handle = started.handle;
    await waitForOpenUserTaskIds(handle, ["Task_A", "Task_B"]);

    const first = completionAt(scenario, 1);
    assert.deepEqual(
      await submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        first,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: first.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    await waitForOpenUserTaskIds(handle, ["Task_B"]);
    assert.deepEqual(
      await readBpmnProcessTrace(
        environment.client.workflow,
        start.instanceId,
      ),
      expected.trace.slice(0, 5),
    );

    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, identity);
    assert.equal(
      await handle.getUpdateHandle(contentBoundUpdateId(first)).result(),
      CommandOutcome.Committed,
    );
    await waitForOpenUserTaskIds(handle, ["Task_B"]);
    assert.deepEqual(
      await readBpmnProcessTrace(
        environment.client.workflow,
        start.instanceId,
      ),
      expected.trace.slice(0, 5),
    );

    const second = completionAt(scenario, 2);
    assert.deepEqual(
      await submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        second,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: second.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    const receipt = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "Inclusive Gateway completed receipt",
    );
    assert.equal(isCompletedProcessReceipt(receipt), true);
    const expectedFinalState = expected.trace.at(-1);
    assert.equal(expectedFinalState?.kind, "state");
    assert.deepEqual(
      receipt.finalState,
      expectedFinalState as StateObservation,
    );

    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "Inclusive Gateway history fetch",
    );
    assert.deepEqual(
      acceptedCompletionOrder(history as TemporalHistory),
      [first.commandId, second.commandId],
    );
    assertUpdatesCompleteBeforeWorkflow(history as TemporalHistory, 2);
    assertNoNonUpdateBpmnHostEvents(
      history as TemporalHistory,
      "Inclusive Gateway",
    );

    await stopBpmnTestWorker(worker);
    worker = undefined;
    await withDeadline(
      replayBpmnHistory(bundle, history, handle.workflowId),
      operationDeadlineMs,
      "Inclusive Gateway history replay",
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
        "Inclusive Gateway Temporal environment teardown",
      );
    }
  }
});

function completionAt(
  scenario: Scenario,
  index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = requiredAt(scenario.stimuli, index, "Inclusive stimuli");
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`scenario stimulus ${index} is not a completion`);
  }
  return stimulus;
}
