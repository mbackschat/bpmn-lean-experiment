/**
 * Real-service refinement evidence for the Activity data-input family.
 *
 * The family is a passive host operation: it arms no deadline, schedules no Activity, and decides
 * readiness entirely inside the semantic core from committed Process data. What the host must
 * therefore preserve is not timing but *data*, so this witness runs all three registered scenarios
 * against one live service and one compiled program, replaces the Worker mid-flight, and requires
 * the published input collection and the terminal receipt to match the pure account exactly.
 *
 * The oracle is the pure `runScenario` result for each scenario. The discriminator that matters is
 * the absent-versus-explicit-null pair: the two runs share a definition, a program, and a start
 * command shape, and differ only in whether the source Property is bound, so a host that erased
 * null, or that treated absence as a falsy present value, would make their observations agree.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { CommandOutcome, VariableValueKind } from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
} from "@bpmn-lean/semantic-core";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowHandle } from "@temporalio/client";

import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  readBpmnProcessTrace,
  readTestProcessTerminalResult,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";

import {
  loadActivityDataInputFixture,
  reviewContextDataInputId,
  reviewTaskElementId,
} from "./activity-data-input-fixture.ts";
import type {
  ActivityDataInputFixture,
  DataInputScenarioFixture,
} from "./activity-data-input-fixture.ts";
import {
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

const operationDeadlineMs = 10_000;
const identity = "bpmn-lean-activity-data-input";

test("data-input readiness, copy, and absence survive a real host and Worker replacement", async () => {
  const fixture = await loadActivityDataInputFixture();
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Activity data-input Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    worker = await startBpmnTestWorker(environment, bundle, identity);

    // Started before the replacement and completed after it, so the copied Activity-local value has
    // to survive a Worker that never saw the activation which produced it.
    const present = await startScenario(environment, fixture, fixture.present);
    const presentTask = await requireOpenReviewTask(present.handle);
    assertPublishedInput(presentTask, {
      kind: VariableValueKind.String,
      value: "invoice-4711",
    });

    const explicitNull = await startScenario(
      environment,
      fixture,
      fixture.explicitNull,
    );
    const nullTask = await requireOpenReviewTask(explicitNull.handle);
    assertPublishedInput(nullTask, { kind: VariableValueKind.Null });

    const absent = await startScenario(environment, fixture, fixture.absent);
    await assertTraceMatchesAccount(environment, absent, fixture.absent);
    assert.deepEqual(await openTasks(absent.handle), []);

    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      `${identity}-replacement`,
    );

    const presentHistory = await completeAndSettle(
      environment,
      present,
      fixture.present,
      fixture.presentCompletion,
    );
    const nullHistory = await completeAndSettle(
      environment,
      explicitNull,
      fixture.explicitNull,
      fixture.explicitNullCompletion,
    );

    // The separating pair at the approved public boundary. Both ran the same program from the same
    // start shape; only the source binding differed.
    assert.notDeepEqual(
      fixture.explicitNull.expected.trace,
      fixture.absent.expected.trace,
    );

    await assertCancellationFabricatesNothing(environment, absent, fixture.absent);

    await stopBpmnTestWorker(worker);
    worker = undefined;
    await replayBpmnHistory(bundle, presentHistory, present.workflowId);
    await replayBpmnHistory(bundle, nullHistory, explicitNull.workflowId);
  } finally {
    try {
      if (worker !== undefined) {
        await stopBpmnTestWorker(worker);
      }
    } finally {
      await withDeadline(
        environment.teardown(),
        operationDeadlineMs,
        "Activity data-input Temporal environment teardown",
      );
    }
  }
});

type StartedScenario = Readonly<{
  handle: WorkflowHandle;
  workflowId: string;
  instanceId: string;
}>;

async function startScenario(
  environment: TestWorkflowEnvironment,
  fixture: ActivityDataInputFixture,
  scenario: DataInputScenarioFixture,
): Promise<StartedScenario> {
  const started = await withDeadline(
    startBpmnProcess(
      environment.client.workflow,
      scenario.start,
      fixture.semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    ),
    operationDeadlineMs,
    `Activity data-input Workflow start for ${scenario.scenario.id}`,
  );
  assert.equal(started.kind, BpmnProcessStartResultKind.Started);
  if (started.kind !== BpmnProcessStartResultKind.Started) {
    throw new TypeError(
      `Activity data-input Workflow ${scenario.scenario.id} was rejected`,
    );
  }
  const handle = getTestProcessHandle(
    environment.client.workflow,
    started.processInstanceId,
  );
  return {
    handle,
    workflowId: handle.workflowId,
    instanceId: scenario.start.instanceId,
  };
}

async function requireOpenReviewTask(
  handle: WorkflowHandle,
): Promise<OpenUserTask> {
  const tasks = await waitForOpenUserTaskIds(handle, [reviewTaskElementId]);
  const task = tasks[0];
  assert.ok(task !== undefined);
  return task;
}

async function openTasks(
  handle: WorkflowHandle,
): Promise<ReadonlyArray<OpenUserTask>> {
  return await waitForOpenUserTaskIds(handle, []);
}

/**
 * Requires the published input to be exactly the one selected DataInput.
 *
 * Asserted as the whole collection rather than by looking the name up, so a host that published a
 * second Activity-local value, or republished the source Property under its own name, fails here
 * instead of passing a lookup that ignores everything else.
 */
function assertPublishedInput(
  task: OpenUserTask,
  value: Readonly<{ kind: string; value?: string }>,
): void {
  assert.deepEqual(task.inputs, [
    { name: reviewContextDataInputId, value },
  ]);
}

async function assertTraceMatchesAccount(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  scenario: DataInputScenarioFixture,
): Promise<void> {
  assert.deepEqual(
    await readBpmnProcessTrace(environment.client.workflow, started.instanceId),
    scenario.expected.trace,
  );
}

/**
 * Terminating the host must publish no BPMN transition.
 *
 * The unavailable-source run is the sharp case: it is durably Running and unproductive by design, so
 * an adapter that treated host termination as a semantic outcome would have every excuse to dispose
 * the Activity context or publish a completion here. The committed trace is read after closure and
 * must still be the one the pure account produced for the start alone.
 */
async function assertCancellationFabricatesNothing(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  scenario: DataInputScenarioFixture,
): Promise<void> {
  await withDeadline(
    started.handle.terminate("Activity data-input unavailable-source host closure"),
    operationDeadlineMs,
    `Activity data-input termination for ${scenario.scenario.id}`,
  );
  await assertTraceMatchesAccount(environment, started, scenario);
}

async function completeAndSettle(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  scenario: DataInputScenarioFixture,
  completion: CompleteUserTaskInstanceStimulus,
): Promise<Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>> {
  await requireOpenReviewTask(started.handle);
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      started.instanceId,
      completion,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: completion.commandId,
      outcome: CommandOutcome.Committed,
    },
  );
  assert.equal(
    await started.handle.getUpdateHandle(contentBoundUpdateId(completion))
      .result(),
    CommandOutcome.Committed,
  );

  const receipt = (await withDeadline(
    readTestProcessTerminalResult(started.handle),
    operationDeadlineMs,
    `Activity data-input terminal result for ${scenario.scenario.id}`,
  )).receipt;
  assert.equal(isCompletedProcessReceipt(receipt), true);
  await assertTraceMatchesAccount(environment, started, scenario);

  return await withDeadline(
    started.handle.fetchHistory(),
    operationDeadlineMs,
    `Activity data-input history fetch for ${scenario.scenario.id}`,
  );
}

