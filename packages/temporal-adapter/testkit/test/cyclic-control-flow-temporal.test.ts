/**
 * Finite durability evidence for the registered User-Task-crossing cycle.
 *
 * Temporal hosts the semantic core's accepted schedule and must preserve exact occurrence identity
 * across Worker replacement. Event History is inspected only as host evidence, never as BPMN state.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  StimulusKind,
  VariableValueKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import { parseWorkflowCode } from "@temporalio/worker/lib/worker.js";
import { defaultPayloadConverter } from "@temporalio/workflow";
import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  bpmnCompleteUserTaskUpdateName,
  bpmnProcessWorkflowType,
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
  commands,
  runDirectVmActivations,
  workflowFailureType,
} from "./direct-vm-activation-harness.ts";
import type {
  Activation,
  Completion,
} from "./direct-vm-activation-harness.ts";
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
  decodeJsonPayload,
  historyEvents,
  temporalInt64ToBigInt,
} from "./temporal-history-facts.ts";
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
const operationDeadlineMs = 10_000;
const identity = "bpmn-lean-user-task-cycle";
const staleCommandId = "reject-stale-review-activation-1";

const exactHistoryEventCount = 25;

const fixture = loadCycleFixture();

/** A host keyed only by BPMN element ID, or one that resets activation to one, commits the stale job. */
test("the direct VM refuses an element-ID-only completion after the first cycle", async () => {
  const { scenario, semanticProcess } = await fixture;
  const repeat = completionAt(scenario, 1);
  const stale = staleCompletion(repeat);
  const start = startAt(scenario);
  const bundle = parseWorkflowCode((await loadBpmnWorkflowBundle()).code);
  const completions = await runDirectVmActivations({
    bundle,
    workflowType: bpmnProcessWorkflowType,
    replaying: false,
    taskQueue: bpmnSemanticTaskQueue,
    args: [
      defaultPayloadConverter.toPayload(start),
      defaultPayloadConverter.toPayload(semanticProcess),
    ],
    readyJobs: [completionUpdateJob(repeat)],
    assertInitialization: (completion) => {
      assert.equal(workflowFailureType(completion), undefined);
      assert.equal(
        commands(completion).some(
          ({ completeWorkflowExecution }) => completeWorkflowExecution !== undefined,
        ),
        false,
      );
    },
  }, [[completionUpdateJob(stale)]]);

  assert.deepEqual(
    completions.map(completedUpdateOutcome),
    [CommandOutcome.Committed, CommandOutcome.Rejected],
  );
  for (const completion of completions) {
    assert.equal(workflowFailureType(completion), undefined);
  }
});

test("the finite cycle survives Worker replacement and replays exact history", async (context) => {
  const { scenario, semanticProcess } = await fixture;
  const expected = runScenario(scenario, semanticProcess);
  const start = startAt(scenario);
  const repeat = completionAt(scenario, 1);
  const rework = completionAt(scenario, 2);
  const exit = completionAt(scenario, 3);
  assert.deepEqual(
    [repeat.taskId.activation, rework.taskId.activation, exit.taskId.activation],
    [1, 2, 3],
  );
  assert.deepEqual(
    [submittedRoute(repeat), submittedRoute(rework), submittedRoute(exit)],
    ["repeat", "rework", "exit"],
  );

  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "cyclic control-flow Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, identity);
    const started = await withDeadline(
      startBpmnProcess(
        environment.client.workflow,
        start,
        semanticProcess,
        { taskQueue: bpmnSemanticTaskQueue },
      ),
      operationDeadlineMs,
      "cyclic control-flow Workflow start",
    );
    assert.equal(started.kind, BpmnProcessStartResultKind.Started);
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      throw new Error("cyclic control-flow Workflow was rejected");
    }
    const handle = started.handle;
    await assertOpenOccurrence(handle, repeat);
    assert.deepEqual(
      await readBpmnProcessTrace(environment.client.workflow, start.instanceId),
      expected.trace.slice(0, 3),
    );

    await assertCompletion(environment.client.workflow, start.instanceId, repeat);
    await assertOpenOccurrence(handle, rework);
    assert.deepEqual(
      await readBpmnProcessTrace(environment.client.workflow, start.instanceId),
      expected.trace.slice(0, 5),
    );

    await stopBpmnTestWorker(worker);
    worker = undefined;
    assert.equal(
      (await withDeadline(
        handle.describe(),
        operationDeadlineMs,
        "cyclic control-flow description while Worker is absent",
      )).status.name,
      "RUNNING",
    );

    worker = await startBpmnTestWorker(environment, bundle, identity);
    assert.equal(
      await handle.getUpdateHandle(contentBoundUpdateId(repeat)).result(),
      CommandOutcome.Committed,
    );
    const beforeStaleTasks = await assertOpenOccurrence(handle, rework);
    const beforeStaleTrace = await readBpmnProcessTrace(
      environment.client.workflow,
      start.instanceId,
    );

    const stale = staleCompletion(repeat);
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
    assert.deepEqual(await assertOpenOccurrence(handle, rework), beforeStaleTasks);
    const afterStaleTrace = await readBpmnProcessTrace(
      environment.client.workflow,
      start.instanceId,
    );
    const unchangedState = requiredAt(
      beforeStaleTrace,
      beforeStaleTrace.length - 1,
      "pre-stale trace",
    );
    assert.deepEqual(afterStaleTrace, [
      ...beforeStaleTrace,
      {
        kind: CanonicalObservationKind.Command,
        commandId: stale.commandId,
        outcome: CommandOutcome.Rejected,
      },
      unchangedState,
    ]);

    await assertCompletion(environment.client.workflow, start.instanceId, rework);
    await assertOpenOccurrence(handle, exit);
    await assertCompletion(environment.client.workflow, start.instanceId, exit);

    const receipt = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "cyclic control-flow completed receipt",
    );
    assert.equal(isCompletedProcessReceipt(receipt), true);
    const expectedFinalState = expected.trace.at(-1);
    assert.equal(expectedFinalState?.kind, CanonicalObservationKind.State);
    assert.deepEqual(receipt.finalState, expectedFinalState as StateObservation);

    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "cyclic control-flow history fetch",
    );
    const typedHistory = history as TemporalHistory;
    const commandOrder = [
      repeat.commandId,
      stale.commandId,
      rework.commandId,
      exit.commandId,
    ];
    assert.deepEqual(acceptedCompletionOrder(typedHistory), commandOrder);
    assert.deepEqual(completedUpdateOutcomes(typedHistory), [
      CommandOutcome.Committed,
      CommandOutcome.Rejected,
      CommandOutcome.Committed,
      CommandOutcome.Committed,
    ]);
    assertUpdatesCompleteBeforeWorkflow(typedHistory, commandOrder.length);
    assertNoNonUpdateBpmnHostEvents(typedHistory, "cyclic control-flow");
    assertContinueAsNewNotSuggested(typedHistory);

    const description = await withDeadline(
      handle.describe(),
      operationDeadlineMs,
      "cyclic control-flow completed description",
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
      "cyclic control-flow exact history replay",
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
        "cyclic control-flow Temporal environment teardown",
      );
    }
  }
});

async function loadCycleFixture() {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  return compileExecutionInput(scenario, bpmnUrl);
}

function startAt(scenario: Scenario) {
  const stimulus = requiredAt(scenario.stimuli, 0, "cycle stimuli");
  if (stimulus.kind !== StimulusKind.StartProcess) {
    throw new TypeError("cycle scenario has no start");
  }
  return stimulus;
}

function completionAt(
  scenario: Scenario,
  index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = requiredAt(scenario.stimuli, index, "cycle stimuli");
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`cycle stimulus ${index} is not a completion`);
  }
  return stimulus;
}

function staleCompletion(
  first: CompleteUserTaskInstanceStimulus,
): CompleteUserTaskInstanceStimulus {
  return { ...first, commandId: staleCommandId };
}

function submittedRoute(stimulus: CompleteUserTaskInstanceStimulus): string {
  assert.equal(stimulus.submittedValues.length, 1);
  const binding = requiredAt(
    stimulus.submittedValues,
    0,
    `${stimulus.commandId} submitted values`,
  );
  assert.equal(binding.name, "route");
  assert.equal(binding.value.kind, VariableValueKind.String);
  if (binding.value.kind !== VariableValueKind.String) {
    throw new TypeError(`${stimulus.commandId} route is not a string`);
  }
  return binding.value.value;
}

async function assertOpenOccurrence(
  handle: WorkflowHandle,
  expected: CompleteUserTaskInstanceStimulus,
) {
  const tasks = await waitForOpenUserTaskIds(handle, [expected.taskId.elementId]);
  assert.deepEqual(tasks.map(({ id }) => id), [expected.taskId]);
  return tasks;
}

async function assertCompletion(
  client: Parameters<typeof submitUserTaskCompletion>[0],
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
): Promise<void> {
  assert.deepEqual(
    await submitUserTaskCompletion(client, processInstanceId, stimulus),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: stimulus.commandId,
      outcome: CommandOutcome.Committed,
    },
  );
}

function completionUpdateJob(
  stimulus: CompleteUserTaskInstanceStimulus,
): NonNullable<Activation["jobs"]>[number] {
  return {
    doUpdate: {
      id: contentBoundUpdateId(stimulus),
      protocolInstanceId: contentBoundUpdateId(stimulus),
      name: bpmnCompleteUserTaskUpdateName,
      input: [defaultPayloadConverter.toPayload(stimulus)],
      runValidator: false,
    },
  };
}

function completedUpdateOutcome(completion: Completion): CommandOutcome {
  const completed = commands(completion).flatMap(({ updateResponse }) =>
    updateResponse?.completed === undefined || updateResponse.completed === null
      ? []
      : [updateResponse.completed]
  );
  assert.equal(completed.length, 1);
  const payload = requiredAt(completed, 0, "completed Update responses");
  const outcome = defaultPayloadConverter.fromPayload(payload);
  assert.equal(Object.values(CommandOutcome).includes(outcome as CommandOutcome), true);
  return outcome as CommandOutcome;
}

function completedUpdateOutcomes(
  history: TemporalHistory,
): ReadonlyArray<CommandOutcome> {
  const accepted = historyEvents(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  );
  const completed = historyEvents(
    history,
    "workflowExecutionUpdateCompletedEventAttributes",
  );
  const outcomeByAcceptedId = new Map<string, CommandOutcome>();
  for (const event of completed) {
    const attributes = requiredNestedRecord(
      event,
      "workflowExecutionUpdateCompletedEventAttributes",
    );
    const acceptedEventId = temporalInt64ToBigInt(
      attributes["acceptedEventId"],
    ).toString();
    const success = requiredNestedRecord(attributes["outcome"], "success");
    const payloads = success["payloads"];
    assert.ok(Array.isArray(payloads), "completed Update payloads is not a list");
    const outcome = decodeJsonPayload(requiredAt(
      payloads,
      0,
      "completed Update outcome payloads",
    ));
    assert.equal(Object.values(CommandOutcome).includes(outcome as CommandOutcome), true);
    outcomeByAcceptedId.set(acceptedEventId, outcome as CommandOutcome);
  }
  return accepted.map((event) => {
    const acceptedEventId = temporalInt64ToBigInt(event["eventId"]).toString();
    const outcome = outcomeByAcceptedId.get(acceptedEventId);
    assert.ok(outcome !== undefined, `accepted Update ${acceptedEventId} has no result`);
    return outcome;
  });
}

function assertContinueAsNewNotSuggested(history: TemporalHistory): void {
  const startedTasks = historyEvents(
    history,
    "workflowTaskStartedEventAttributes",
  );
  assert.ok(startedTasks.length > 0, "history has no started Workflow Task");
  for (const event of startedTasks) {
    const attributes = requiredNestedRecord(
      event,
      "workflowTaskStartedEventAttributes",
    );
    assert.equal(attributes["suggestContinueAsNew"] ?? false, false);
    assert.deepEqual(attributes["suggestContinueAsNewReasons"] ?? [], []);
  }
}

function requiredNestedRecord(
  value: unknown,
  key: string,
): Readonly<Record<string, unknown>> {
  return requireRecord(requireRecord(value, "record")[key], key);
}

function requireRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} is not a record`);
  }
  return value as Readonly<Record<string, unknown>>;
}
