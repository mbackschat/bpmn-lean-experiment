/** Temporal post-throw replacement, replay, zero-host-mechanism, and semantic-bypass evidence. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

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
  "../../../../scenarios/subprocess-error-propagation/",
  import.meta.url,
);
const scenarioUrl = new URL("trigger-first.scenario.json", capsuleUrl);
const staleScenarioUrl = new URL(
  "stale-sibling-after-error.scenario.json",
  capsuleUrl,
);
const bpmnUrl = new URL("process.bpmn", capsuleUrl);
const operationDeadlineMs = 10_000;
const identity = "bpmn-lean-subprocess-error-replacement";

test("committed Error cancellation survives an immediate Worker replacement", async () => {
  const scenario = await readScenario();
  const input = await compileExecutionInput(scenario, bpmnUrl);
  const expected = runScenario(scenario, input.semanticProcess);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Sub-Process Error Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, identity);
    const start = scenario.stimuli[0];
    if (start?.kind !== StimulusKind.StartProcess) {
      throw new TypeError("Sub-Process Error scenario has no start");
    }
    const started = await withDeadline(
      startBpmnProcess(
        environment.client.workflow,
        start,
        input.semanticProcess,
        { taskQueue: bpmnSemanticTaskQueue },
      ),
      operationDeadlineMs,
      "Sub-Process Error Workflow start",
    );
    assert.equal(started.kind, BpmnProcessStartResultKind.Started);
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      throw new Error("Sub-Process Error Workflow was rejected");
    }
    const handle = started.handle;
    await waitForOpenUserTaskIds(
      handle,
      ["UserTask_SiblingWork", "UserTask_TriggerError"],
    );

    const trigger = completionAt(scenario, 1);
    assert.deepEqual(
      await submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        trigger,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: trigger.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    await waitForOpenUserTaskIds(handle, ["UserTask_Recover"]);
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
      await handle.getUpdateHandle(contentBoundUpdateId(trigger)).result(),
      CommandOutcome.Committed,
    );
    await waitForOpenUserTaskIds(handle, ["UserTask_Recover"]);
    assert.deepEqual(
      await readBpmnProcessTrace(
        environment.client.workflow,
        start.instanceId,
      ),
      expected.trace.slice(0, 5),
    );

    const stale = staleSiblingCompletion(start.instanceId);
    assert.deepEqual(
      await submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        stale,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: stale.commandId,
        outcome: CommandOutcome.Rejected,
      },
    );
    await waitForOpenUserTaskIds(handle, ["UserTask_Recover"]);

    const recover = completionAt(scenario, 2);
    assert.equal(
      (
        await submitUserTaskCompletion(
          environment.client.workflow,
          start.instanceId,
          recover,
        )
      ).kind,
      ProcessCommandResultKind.Semantic,
    );
    const receipt = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "Sub-Process Error completed receipt",
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
      "Sub-Process Error history fetch",
    );
    assert.deepEqual(
      acceptedCompletionOrder(history as TemporalHistory),
      [trigger.commandId, stale.commandId, recover.commandId],
    );
    assertUpdatesCompleteBeforeWorkflow(history as TemporalHistory, 3);
    assertNoNonUpdateBpmnHostEvents(
      history as TemporalHistory,
      "Sub-Process Error",
    );

    await stopBpmnTestWorker(worker);
    worker = undefined;
    await withDeadline(
      replayBpmnHistory(bundle, history, handle.workflowId),
      operationDeadlineMs,
      "Sub-Process Error history replay",
    );
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await withDeadline(
      environment.teardown(),
      operationDeadlineMs,
      "Sub-Process Error Temporal environment teardown",
    );
  }
});

test("Error-bypass Workflow matches recovery then diverges on stale sibling", async () => {
  const scenario = await readScenario(staleScenarioUrl);
  const input = await compileExecutionInput(scenario, bpmnUrl);
  const expected = runScenario(scenario, input.semanticProcess);
  const runner = await TemporalScenarioRunner.create({
    downloadDirectory: temporalCacheDirectory,
  });
  try {
    const execution = await withDeadline(
      runner.probes.runErrorPropagationBypassMutation(
        scenario,
        input.semanticProcess,
        "subprocess-error-propagation-bypass",
      ),
      15_000,
      "Sub-Process Error bypass mutation",
    );
    assert.equal(execution.completionOutcome, CommandOutcome.Committed);
    assert.deepEqual(execution.trace.slice(0, 5), expected.trace.slice(0, 5));
    assert.equal(
      execution.discriminatorOutcome,
      CommandOutcome.Committed,
    );
    assert.deepEqual(expected.trace[5], {
      kind: "command",
      commandId: "refuse-stale-sibling-after-error",
      outcome: CommandOutcome.Rejected,
    });
    assert.deepEqual(execution.trace[5], {
      kind: "command",
      commandId: "refuse-stale-sibling-after-error",
      outcome: CommandOutcome.Committed,
    });
    assert.notDeepEqual(execution.trace, expected.trace);
    assert.equal(
      historyEvents(
        execution.history,
        "workflowExecutionUpdateAcceptedEventAttributes",
      ).length,
      2,
    );
    assert.equal(
      historyEvents(
        execution.history,
        "workflowExecutionUpdateCompletedEventAttributes",
      ).length,
      2,
    );
    assertNoNonUpdateBpmnHostEvents(
      execution.history,
      "Sub-Process Error",
    );
  } finally {
    await runner.shutdown();
  }
});

async function readScenario(url: URL = scenarioUrl): Promise<Scenario> {
  return JSON.parse(await readFile(url, "utf8")) as Scenario;
}

function completionAt(
  scenario: Scenario,
  index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = requiredAt(scenario.stimuli, index, "scenario stimuli");
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`scenario stimulus ${index} is not a completion`);
  }
  return stimulus;
}

function staleSiblingCompletion(
  processInstanceId: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "refuse-stale-sibling-after-error",
    taskId: {
      processInstanceId,
      elementId: "UserTask_SiblingWork",
      activation: 1,
    },
    submittedValues: [],
  };
}
