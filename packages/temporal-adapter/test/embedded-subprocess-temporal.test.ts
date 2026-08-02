/** Temporal replacement, passive-wait, and replay evidence for ordinary embedded Sub-Process completion. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
  TemporalScenarioRunner,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  readBpmnProcessTrace,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-adapter";
import type {
  TemporalHistory,
} from "@bpmn-lean/temporal-adapter";

import {
  compileExecutionInput,
  requiredAt,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  acceptedCompletionOrder,
  assertNoNonUpdateBpmnHostEvents,
  assertUpdatesCompleteBeforeWorkflow,
  historyEvents,
} from "./temporal-history-facts.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const capsuleUrl = new URL(
  "../../../scenarios/embedded-subprocess-completion/",
  import.meta.url,
);
const scenarioUrl = new URL("a-then-b.scenario.json", capsuleUrl);
const bpmnUrl = new URL("process.bpmn", capsuleUrl);
const operationDeadlineMs = 10_000;
const identity = "bpmn-lean-embedded-subprocess-replacement";

test("embedded Sub-Process survives Worker replacement after its first child completion", async () => {
  const scenario = JSON.parse(
    await readFile(scenarioUrl, "utf8"),
  ) as Scenario;
  const input = await compileExecutionInput(scenario, bpmnUrl);
  const expected = runScenario(scenario, input.semanticProcess);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "embedded Sub-Process Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, identity);
    const start = scenario.stimuli[0];
    assert.equal(start?.kind, StimulusKind.StartProcess);
    if (start?.kind !== StimulusKind.StartProcess) {
      throw new TypeError("embedded Sub-Process scenario has no start");
    }
    const started = await withDeadline(
      startBpmnProcess(
        environment.client.workflow,
        start,
        input.semanticProcess,
        { taskQueue: bpmnSemanticTaskQueue },
      ),
      operationDeadlineMs,
      "embedded Sub-Process Workflow start",
    );
    assert.equal(started.kind, BpmnProcessStartResultKind.Started);
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      throw new Error("embedded Sub-Process Workflow was rejected");
    }
    const handle = started.handle;
    await waitForOpenUserTaskIds(
      handle,
      ["UserTask_ChildA", "UserTask_ChildB"],
    );

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
    await waitForOpenUserTaskIds(handle, ["UserTask_ChildB"]);
    assert.deepEqual(
      await readBpmnProcessTrace(
        environment.client.workflow,
        start.instanceId,
      ),
      expected.trace.slice(0, 5),
    );

    await stopBpmnTestWorker(worker);
    worker = await startBpmnTestWorker(environment, bundle, identity);
    assert.equal(
      await handle.getUpdateHandle(contentBoundUpdateId(first)).result(),
      CommandOutcome.Committed,
    );
    await waitForOpenUserTaskIds(handle, ["UserTask_ChildB"]);

    const second = completionAt(scenario, 2);
    assert.equal(
      (
        await submitUserTaskCompletion(
          environment.client.workflow,
          start.instanceId,
          second,
        )
      ).kind,
      ProcessCommandResultKind.Semantic,
    );
    await waitForOpenUserTaskIds(handle, ["UserTask_AfterScope"]);

    const afterScope = completionAt(scenario, 3);
    assert.equal(
      (
        await submitUserTaskCompletion(
          environment.client.workflow,
          start.instanceId,
          afterScope,
        )
      ).kind,
      ProcessCommandResultKind.Semantic,
    );
    const receipt = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "embedded Sub-Process completed receipt",
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
      "embedded Sub-Process history fetch",
    );
    assert.deepEqual(
      acceptedCompletionOrder(history as TemporalHistory),
      [first.commandId, second.commandId, afterScope.commandId],
    );
    assertUpdatesCompleteBeforeWorkflow(history as TemporalHistory, 3);
    assertNoNonUpdateBpmnHostEvents(
      history as TemporalHistory,
      "embedded Sub-Process",
    );

    await stopBpmnTestWorker(worker);
    worker = undefined;
    await withDeadline(
      replayBpmnHistory(bundle, history, handle.workflowId),
      operationDeadlineMs,
      "embedded Sub-Process history replay",
    );
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await withDeadline(
      environment.teardown(),
      operationDeadlineMs,
      "embedded Sub-Process Temporal environment teardown",
    );
  }
});

test("scope-bypass Workflow fabricates premature exit outside the semantic core", async () => {
  const scenario = JSON.parse(
    await readFile(scenarioUrl, "utf8"),
  ) as Scenario;
  const input = await compileExecutionInput(scenario, bpmnUrl);
  const expected = runScenario(scenario, input.semanticProcess);
  const runner = await TemporalScenarioRunner.create({
    downloadDirectory: temporalCacheDirectory,
  });
  try {
    const execution = await withDeadline(
      runner.runScopeBypassMutation(
        scenario,
        input.semanticProcess,
        "embedded-subprocess-scope-bypass",
      ),
      15_000,
      "embedded Sub-Process scope-bypass mutation",
    );
    assert.equal(execution.completionOutcome, CommandOutcome.Committed);
    const expectedAfterFirst = stateAt(expected.trace, 4);
    const fabricatedAfterFirst = stateAt(execution.trace, 4);
    assert.equal(
      expectedAfterFirst.openUserTasks[0]?.id.elementId,
      "UserTask_ChildB",
    );
    assert.equal(
      fabricatedAfterFirst.openUserTasks[0]?.id.elementId,
      "UserTask_AfterScope",
    );
    assert.notDeepEqual(execution.trace, expected.trace.slice(0, 5));
    assert.equal(
      historyEvents(
        execution.history,
        "workflowExecutionUpdateAcceptedEventAttributes",
      ).length,
      1,
    );
    assert.equal(
      historyEvents(
        execution.history,
        "workflowExecutionUpdateCompletedEventAttributes",
      ).length,
      1,
    );
    assertNoNonUpdateBpmnHostEvents(
      execution.history,
      "embedded Sub-Process",
    );
  } finally {
    await runner.shutdown();
  }
});

function completionAt(
  scenario: Scenario,
  index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = requiredAt(scenario.stimuli, index, "scenario stimuli");
  assert.equal(stimulus.kind, StimulusKind.CompleteUserTaskInstance);
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`scenario stimulus ${index} is not a User Task completion`);
  }
  return stimulus;
}

function stateAt(
  trace: ReadonlyArray<import("@bpmn-lean/semantic-core").CanonicalObservation>,
  index: number,
): StateObservation {
  const observation = requiredAt(trace, index, "canonical trace");
  assert.equal(observation.kind, "state");
  if (observation.kind !== "state") {
    throw new TypeError(`canonical trace ${index} is not a state`);
  }
  return observation;
}
