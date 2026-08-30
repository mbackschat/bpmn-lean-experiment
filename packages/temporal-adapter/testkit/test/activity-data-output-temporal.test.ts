/**
 * Real-service refinement evidence for the Activity data-output family.
 *
 * The family is a passive host operation: it arms no deadline, schedules no Activity, and decides
 * entirely inside the semantic core what an accepted completion writes and where. What the host must
 * therefore preserve is not timing but *routing*, so this witness runs all three registered
 * scenarios against one live service and one compiled program, replaces the Worker while a task is
 * open, and requires the canonical `variables` projection to name the associated Property rather
 * than the submitted `DataOutput` id.
 *
 * The oracle is the pure `runScenario` result for each scenario. The discriminator that matters is
 * that the two identities differ: a host that merged the submitted name into Process scope would
 * publish `DataOutput_Decision` where the association names `Property_UnderwritingOutcome`, and the
 * omitted-output run separates a refused completion from a committed one under the same program.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  OpenUserTask,
  VariableBinding,
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
  decideTaskElementId,
  decisionDataOutputId,
  loadActivityDataOutputFixture,
  underwritingOutcomePropertyId,
} from "./activity-data-output-fixture.ts";
import type {
  ActivityDataOutputFixture,
  DataOutputScenarioFixture,
} from "./activity-data-output-fixture.ts";
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
const identity = "bpmn-lean-activity-data-output";

test("data-output routing, refusal, and disposal survive a real host and Worker replacement", async () => {
  const fixture = await loadActivityDataOutputFixture();
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Activity data-output Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    worker = await startBpmnTestWorker(environment, bundle, identity);

    // Started before the replacement and completed after it, so the association has to execute in a
    // Worker that never saw the activation which armed the Activity.
    const supplied = await startScenario(environment, fixture, fixture.supplied);
    await requireOpenDecideTask(supplied.handle);
    const explicitNull = await startScenario(
      environment,
      fixture,
      fixture.explicitNull,
    );
    await requireOpenDecideTask(explicitNull.handle);
    const omitted = await startScenario(environment, fixture, fixture.omitted);
    await requireOpenDecideTask(omitted.handle);

    // The entry claim: all three activated with no Process data at all.
    for (const started of [supplied, explicitNull, omitted]) {
      assert.deepEqual(await committedVariables(environment, started), []);
    }

    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      `${identity}-replacement`,
    );

    const suppliedHistory = await completeAndSettle(
      environment,
      supplied,
      fixture.supplied,
      {
        kind: VariableValueKind.String,
        value: "approved",
      },
    );
    const nullHistory = await completeAndSettle(
      environment,
      explicitNull,
      fixture.explicitNull,
      { kind: VariableValueKind.Null },
    );

    await assertRefusalFabricatesNoWrite(environment, omitted, fixture.omitted);

    await stopBpmnTestWorker(worker);
    worker = undefined;
    await replayBpmnHistory(bundle, suppliedHistory, supplied.workflowId);
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
        "Activity data-output Temporal environment teardown",
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
  fixture: ActivityDataOutputFixture,
  scenario: DataOutputScenarioFixture,
): Promise<StartedScenario> {
  const started = await withDeadline(
    startBpmnProcess(
      environment.client.workflow,
      scenario.start,
      fixture.semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    ),
    operationDeadlineMs,
    `Activity data-output Workflow start for ${scenario.scenario.id}`,
  );
  assert.equal(started.kind, BpmnProcessStartResultKind.Started);
  if (started.kind !== BpmnProcessStartResultKind.Started) {
    throw new TypeError(
      `Activity data-output Workflow ${scenario.scenario.id} was rejected`,
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

async function requireOpenDecideTask(
  handle: WorkflowHandle,
): Promise<OpenUserTask> {
  const tasks = await waitForOpenUserTaskIds(handle, [decideTaskElementId]);
  const task = tasks[0];
  assert.ok(task !== undefined);
  // The armed Activity scope is empty, so this profile publishes no input collection.
  assert.equal(task.inputs, undefined);
  return task;
}

/**
 * The Process variables of the latest committed canonical state.
 *
 * Derived from the published trace rather than from a new Query, because this capsule adds no
 * observation surface: the routed write has to be visible in the contract the host already
 * publishes, or it is not visible at all.
 */
async function committedVariables(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
): Promise<ReadonlyArray<VariableBinding>> {
  const trace = await readBpmnProcessTrace(
    environment.client.workflow,
    started.instanceId,
  );
  const latest = [...trace].reverse().find(
    (observation: CanonicalObservation) =>
      observation.kind === CanonicalObservationKind.State,
  );
  assert.ok(latest !== undefined && latest.kind === CanonicalObservationKind.State);
  return latest.variables;
}

async function assertTraceMatchesAccount(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  scenario: DataOutputScenarioFixture,
): Promise<void> {
  assert.deepEqual(
    await readBpmnProcessTrace(environment.client.workflow, started.instanceId),
    scenario.expected.trace,
  );
}

/**
 * A refused completion must leave the Property unbound, and terminating the host must not write it
 * either.
 *
 * The omitted-output run is the sharp case: it is durably Running with an open task whose required
 * output was never supplied, so an adapter that treated the submission as data, or host termination
 * as a semantic outcome, would have every excuse to publish a value here.
 */
async function assertRefusalFabricatesNoWrite(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  scenario: DataOutputScenarioFixture,
): Promise<void> {
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      started.instanceId,
      scenario.completion,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: scenario.completion.commandId,
      outcome: CommandOutcome.Rejected,
    },
  );
  assert.deepEqual(await committedVariables(environment, started), []);
  await assertTraceMatchesAccount(environment, started, scenario);

  await withDeadline(
    started.handle.terminate("Activity data-output refused-completion host closure"),
    operationDeadlineMs,
    `Activity data-output termination for ${scenario.scenario.id}`,
  );
  await assertTraceMatchesAccount(environment, started, scenario);
}

async function completeAndSettle(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  scenario: DataOutputScenarioFixture,
  written: Readonly<{ kind: string; value?: string }>,
): Promise<Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>> {
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      started.instanceId,
      scenario.completion,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: scenario.completion.commandId,
      outcome: CommandOutcome.Committed,
    },
  );
  assert.equal(
    await started.handle.getUpdateHandle(
      contentBoundUpdateId(scenario.completion),
    ).result(),
    CommandOutcome.Committed,
  );

  // The routed write at the public boundary: the association's target name, never the submitted one.
  assert.deepEqual(await committedVariables(environment, started), [
    { name: underwritingOutcomePropertyId, value: written },
  ]);
  assert.notEqual(underwritingOutcomePropertyId, decisionDataOutputId);

  const receipt = (await withDeadline(
    readTestProcessTerminalResult(started.handle),
    operationDeadlineMs,
    `Activity data-output terminal result for ${scenario.scenario.id}`,
  )).receipt;
  assert.equal(isCompletedProcessReceipt(receipt), true);
  await assertTraceMatchesAccount(environment, started, scenario);

  return await withDeadline(
    started.handle.fetchHistory(),
    operationDeadlineMs,
    `Activity data-output history fetch for ${scenario.scenario.id}`,
  );
}
