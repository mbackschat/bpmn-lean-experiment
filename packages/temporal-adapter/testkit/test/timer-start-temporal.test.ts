/**
 * Live one-action Temporal Schedule evidence for the exact registered PT1S Timer Start profile.
 *
 * This test deliberately excludes accepted-and-response-lost retry, recurrence, other calendar
 * forms, overlap, catch-up, backfill, pause, definition-version replacement, Product 2 scheduling,
 * public Schedule APIs, and Workflow Timer or Signal ingress. Schedule identity and wall-clock time
 * are test-host facts, never semantic inputs or observations.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  SemanticProfileId,
  StimulusKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  StateObservation,
  TriggerTimerStartStimulus,
} from "@bpmn-lean/semantic-core";
import { WorkflowNotFoundError } from "@temporalio/client";
import type { WorkflowHandle } from "@temporalio/client";
import { ApplicationFailure } from "@temporalio/workflow";

import {
  ProcessCommandResultKind,
  bpmnCompleteUserTaskUpdateName,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  assertNoNonUpdateBpmnHostEvents,
  historyEvents,
} from "./temporal-history-facts.ts";
import {
  allServiceResourceCounts,
  createAdmittedTimerStartSchedule,
  exactServiceResourceCounts,
  nextHostActivationTime,
  waitForExactScheduleAction,
  waitForExhaustedSchedule,
} from "./timer-start-schedule-test-support.ts";
import {
  compileExecutionInput,
  loadJson,
  requiredAt,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/timer-start-event/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);
const operationDeadlineMs = 10_000;
const exactHistoryEventCount = 10;
const fixture = loadFixture();

test("one PT1S Schedule action durably starts and replays the exact Timer Start execution", async (context) => {
  const { scenario, semanticProcess } = await fixture;
  const start = requireTimerStart(scenario);
  const completion = requireCompletion(scenario);
  const expected = runScenario(scenario, semanticProcess);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-timer-start-schedule",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Timer Start Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    for (const wrong of [
      {
        label: "wrong Process",
        start: timerStartForInstance(start, "TimerStartInstance_WrongProcess", {
          processId: "OtherProcess",
        }),
      },
      {
        label: "wrong Start Event",
        start: timerStartForInstance(start, "TimerStartInstance_WrongStart", {
          startEventId: "OtherTimerStart",
        }),
      },
    ]) {
      const scheduleId = `timer-start-rejected-${wrong.start.instanceId}`;
      assert.equal(
        await createAdmittedTimerStartSchedule(environment.client, {
          scheduleId,
          activationTime: nextHostActivationTime(),
          admittedStart: wrong.start,
          storedStart: wrong.start,
          semanticProcess,
        }),
        null,
        wrong.label,
      );
      assert.deepEqual(
        await allServiceResourceCounts(environment.client),
        { schedules: 0, workflows: 0 },
        `${wrong.label} must create no service resource`,
      );
    }

    const scheduleId = `timer-start-${start.instanceId}`;
    const scheduled = await createAdmittedTimerStartSchedule(
      environment.client,
      {
        scheduleId,
        activationTime: nextHostActivationTime(),
        admittedStart: start,
        storedStart: start,
        semanticProcess,
      },
    );
    assert.ok(scheduled !== null);
    const stored = await withDeadline(
      scheduled.handle.describe(),
      operationDeadlineMs,
      "stored Timer Start Schedule description",
    );
    assert.equal(stored.action.type, "startWorkflow");
    assert.equal(stored.action.workflowType, bpmnProcessWorkflowType);
    assert.equal(stored.action.taskQueue, bpmnSemanticTaskQueue);
    assert.equal(
      stored.action.workflowId,
      scheduled.configuredWorkflowId,
    );
    assert.deepEqual(stored.action.args, [start, semanticProcess]);

    const execution = await waitForExactScheduleAction(
      scheduled.handle,
      scheduled.dueTime,
    );
    assert.equal(execution.description.info.numActionsTaken, 1);
    await assertConfiguredBaseIsNotExecution(
      environment.client,
      scheduled.configuredWorkflowId,
    );
    const handle = environment.client.workflow.getHandle<BpmnProcessWorkflow>(
      execution.workflowId,
      execution.firstExecutionRunId,
    );
    const beforeWorker = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "Timer Start history while Worker is absent",
    ) as TemporalHistory;
    assert.equal(
      historyEvents(
        beforeWorker,
        "workflowExecutionStartedEventAttributes",
      ).length,
      1,
    );
    assert.equal(
      historyEvents(beforeWorker, "workflowTaskStartedEventAttributes").length,
      0,
    );
    assert.equal(
      (await withDeadline(
        handle.describe(),
        operationDeadlineMs,
        "Timer Start description while Worker is absent",
      )).status.name,
      "RUNNING",
    );

    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "bpmn-lean-timer-start-schedule",
    );
    const openTasks = await waitForOpenUserTaskIds(
      handle,
      [completion.taskId.elementId],
    );
    assert.deepEqual(openTasks.map(({ id }) => id), [completion.taskId]);
    assert.deepEqual(
      await submitCompletionAtExecution(
        handle,
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
      "Timer Start completed receipt",
    );
    assert.equal(isCompletedProcessReceipt(receipt), true);
    if (!isCompletedProcessReceipt(receipt)) {
      throw new TypeError("Timer Start Workflow returned a malformed receipt");
    }
    const expectedFinalState = expected.trace.at(-1);
    assert.equal(expectedFinalState?.kind, CanonicalObservationKind.State);
    assert.deepEqual(receipt.finalState, expectedFinalState as StateObservation);
    assert.deepEqual(
      await withDeadline(
        handle.query(bpmnTraceQueryName),
        operationDeadlineMs,
        "Timer Start trace Query",
      ),
      expected.trace,
    );

    const rawHistory = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "Timer Start completed history",
    );
    const history = rawHistory as TemporalHistory;
    assertNoNonUpdateBpmnHostEvents(history, "Timer Start Schedule");
    assert.equal(
      historyEvents(history, "timerStartedEventAttributes").length,
      0,
    );
    assert.equal(
      historyEvents(
        history,
        "workflowExecutionSignaledEventAttributes",
      ).length,
      0,
    );
    assert.equal(history.events.length, exactHistoryEventCount);
    const workflowDescription = await withDeadline(
      handle.describe(),
      operationDeadlineMs,
      "Timer Start completed Workflow description",
    );
    assert.equal(
      typeof workflowDescription.historySize === "number" &&
        Number.isSafeInteger(workflowDescription.historySize) &&
        workflowDescription.historySize > 0,
      true,
    );
    context.diagnostic(
      `exact Timer Start history: ${history.events.length} events, ${workflowDescription.historySize} bytes`,
    );
    await waitForExhaustedSchedule(scheduled.handle);

    await stopBpmnTestWorker(worker);
    worker = undefined;
    await withDeadline(
      replayBpmnHistory(bundle, rawHistory, execution.workflowId),
      operationDeadlineMs,
      "Timer Start exact history replay",
    );
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "bpmn-lean-timer-start-schedule-mutations",
    );

    await assertStoredActionTampering(
      environment.client,
      semanticProcess,
      start,
    );
    await assertDirectWorkflowTimingMutation(
      environment.client,
      semanticProcess,
      start,
      completion,
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
        "Timer Start Temporal environment teardown",
      );
    }
  }
});

async function assertStoredActionTampering(
  client: Awaited<ReturnType<typeof createCachedLocalEnvironment>>["client"],
  semanticProcess: Awaited<typeof fixture>["semanticProcess"],
  sourceStart: TriggerTimerStartStimulus,
): Promise<void> {
  const admittedStart = timerStartForInstance(
    sourceStart,
    "TimerStartInstance_StoredMutation",
    {},
  );
  const corruptedStart = {
    ...admittedStart,
    processId: "OtherProcess",
  } satisfies TriggerTimerStartStimulus;
  const scheduleId = `timer-start-stored-mutation-${admittedStart.instanceId}`;
  const scheduled = await createAdmittedTimerStartSchedule(client, {
    scheduleId,
    activationTime: nextHostActivationTime(),
    admittedStart,
    storedStart: corruptedStart,
    semanticProcess,
  });
  assert.ok(scheduled !== null);
  const execution = await waitForExactScheduleAction(
    scheduled.handle,
    scheduled.dueTime,
  );
  assert.equal(execution.description.info.numActionsTaken, 1);
  const handle = client.workflow.getHandle<BpmnProcessWorkflow>(
    execution.workflowId,
    execution.firstExecutionRunId,
  );
  await assert.rejects(
    withDeadline(
      handle.result(),
      operationDeadlineMs,
      "stored Timer Start action rejection",
    ),
    (error: unknown) =>
      hasApplicationFailureType(error, "BpmnProcessAdmissionFailure"),
  );
  assert.deepEqual(
    await exactServiceResourceCounts(
      client,
      scheduleId,
      execution.workflowId,
    ),
    { schedules: 1, workflows: 1 },
  );
  await waitForExhaustedSchedule(scheduled.handle);
}

async function assertConfiguredBaseIsNotExecution(
  client: Awaited<ReturnType<typeof createCachedLocalEnvironment>>["client"],
  configuredWorkflowId: string,
): Promise<void> {
  const configuredBaseHandle = client.workflow.getHandle(
    configuredWorkflowId,
  );
  await assert.rejects(
    withDeadline(
      configuredBaseHandle.describe(),
      operationDeadlineMs,
      "configured Schedule Workflow-ID base lookup",
    ),
    WorkflowNotFoundError,
  );
}

async function submitCompletionAtExecution(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  completion: CompleteUserTaskInstanceStimulus,
): Promise<Readonly<{
  kind: ProcessCommandResultKind.Semantic;
  commandId: string;
  outcome: CommandOutcome;
}>> {
  const outcome = await withDeadline(
    handle.executeUpdate<
      CommandOutcome,
      [CompleteUserTaskInstanceStimulus]
    >(bpmnCompleteUserTaskUpdateName, {
      args: [completion],
      updateId: contentBoundUpdateId(completion),
    }),
    operationDeadlineMs,
    "Timer Start User Task completion Update",
  );
  return {
    kind: ProcessCommandResultKind.Semantic,
    commandId: completion.commandId,
    outcome,
  };
}

async function assertDirectWorkflowTimingMutation(
  client: Awaited<ReturnType<typeof createCachedLocalEnvironment>>["client"],
  semanticProcess: Awaited<typeof fixture>["semanticProcess"],
  sourceStart: TriggerTimerStartStimulus,
  sourceCompletion: CompleteUserTaskInstanceStimulus,
): Promise<void> {
  const directStart = timerStartForInstance(
    sourceStart,
    "TimerStartInstance_DirectMutation",
    {},
  );
  const workflowId = processWorkflowId(directStart.instanceId);
  const activationTime = nextHostActivationTime();
  const expectedDueTime = new Date(activationTime.getTime() + 1_000);
  const direct = await withDeadline(
    client.workflow.start(bpmnProcessWorkflowType, {
      taskQueue: bpmnSemanticTaskQueue,
      workflowId,
      workflowIdReusePolicy: "REJECT_DUPLICATE",
      args: [directStart, semanticProcess],
    }),
    operationDeadlineMs,
    "direct Timer Start timing mutation",
  );
  await assert.rejects(
    waitForExactScheduleAction(
      client.schedule.getHandle(`missing-schedule-${directStart.instanceId}`),
      expectedDueTime,
    ),
    (error: unknown) =>
      error instanceof Error && /schedule.*not found|not found.*schedule/iu.test(
        error.message,
      ),
  );

  const directCompletion = completionForInstance(
    sourceCompletion,
    directStart.instanceId,
  );
  await waitForOpenUserTaskIds(direct, [directCompletion.taskId.elementId]);
  assert.deepEqual(
    await submitUserTaskCompletion(
      client.workflow,
      directStart.instanceId,
      directCompletion,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: directCompletion.commandId,
      outcome: CommandOutcome.Committed,
    },
  );
  await withDeadline(
    direct.result(),
    operationDeadlineMs,
    "direct Timer Start timing mutation completion",
  );
  assert.deepEqual(
    await exactServiceResourceCounts(
      client,
      `missing-schedule-${directStart.instanceId}`,
      workflowId,
    ),
    { schedules: 0, workflows: 1 },
  );
}

async function loadFixture() {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  assert.equal(scenario.profile, SemanticProfileId.TimerStart);
  return compileExecutionInput(scenario, bpmnUrl);
}

function requireTimerStart(scenario: Scenario): TriggerTimerStartStimulus {
  const stimulus = requiredAt(scenario.stimuli, 0, "Timer Start stimuli");
  if (stimulus.kind !== StimulusKind.TriggerTimerStart) {
    throw new TypeError("Timer Start scenario has no Timer Start trigger");
  }
  return stimulus;
}

function requireCompletion(
  scenario: Scenario,
): CompleteUserTaskInstanceStimulus {
  const stimulus = requiredAt(scenario.stimuli, 1, "Timer Start stimuli");
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError("Timer Start scenario has no User Task completion");
  }
  return stimulus;
}

function timerStartForInstance(
  source: TriggerTimerStartStimulus,
  instanceId: string,
  replacement: Readonly<{
    processId?: string;
    startEventId?: string;
  }>,
): TriggerTimerStartStimulus {
  return {
    ...source,
    commandId: `${source.commandId}-${instanceId}`,
    instanceId,
    processId: replacement.processId ?? source.processId,
    startEventId: replacement.startEventId ?? source.startEventId,
  };
}

function completionForInstance(
  source: CompleteUserTaskInstanceStimulus,
  instanceId: string,
): CompleteUserTaskInstanceStimulus {
  return {
    ...source,
    commandId: `${source.commandId}-${instanceId}`,
    taskId: { ...source.taskId, processInstanceId: instanceId },
  };
}

function hasApplicationFailureType(error: unknown, type: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof ApplicationFailure && current.type === type) {
      return true;
    }
    current = current.cause;
  }
  return false;
}
