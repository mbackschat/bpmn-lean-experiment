/** ADIO-SCOPE/OBSERVE/ROUTE: preserve one data-bearing lifetime across real host boundaries. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  ProcessStatus,
  VariableValueKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  ScenarioResult,
  SemanticProcessProgram,
  StateObservation,
  VariableValue,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";

import {
  BpmnProcessStartResultKind,
  BpmnWorkflowHostInputKind,
  FlowNodeOccurrencePublicationResultKind,
  FlowNodeOccurrenceTerminalKind,
  ProcessCommandResultKind,
  WorkflowChainBudgetKind,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  bpmnWorkflowContinuationV1,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  observeTemporalFlowNodeOccurrences,
  processWorkflowId,
  readTestProcessTerminalResult,
  startBpmnProcess,
  submitUserTaskCompletion,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  FlowNodeOccurrenceBatch,
  OpenFlowNodeOccurrence,
  TemporalFlowNodeOccurrencePublicationClient,
} from "@bpmn-lean/temporal-testkit";

import {
  claimDecisionDataOutputId,
  claimDecisionPropertyId,
  claimSummaryDataInputId,
  claimSummaryPropertyId,
  claimTaskElementId,
  finalClaimObservation,
  loadActivityDataInputOutputFixture,
  requireClaimCompletion,
} from "./activity-data-input-output-fixture.ts";
import type { DataInputOutputScenarioFixture } from "./activity-data-input-output-fixture.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
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

const operationDeadlineMs = 20_000;
const identity = "bpmn-lean-activity-data-input-output";
const presentInput = { kind: VariableValueKind.String, value: "claim-4711" } as const;

type StartedScenario = Readonly<{
  handle: WorkflowHandle;
  workflowId: string;
  instanceId: string;
}>;

type OccurrenceSnapshot = DeepReadonly<{
  headRevision: number;
  batches: FlowNodeOccurrenceBatch[];
  currentOpen: OpenFlowNodeOccurrence[];
}>;

test("composed Activity data survives refusal, rollover, Worker replacement, recovery, and termination", async () => {
  const fixture = await loadActivityDataInputOutputFixture();
  const program = fixture.semanticProcess;
  const completion = requireClaimCompletion(fixture.present.scenario);
  const refused = {
    ...completion,
    commandId: `${completion.commandId}-omitted-before-rollover`,
    submittedValues: [],
  } as const satisfies CompleteUserTaskInstanceStimulus;
  const expected = runScenario({
    ...fixture.present.scenario,
    stimuli: [fixture.present.start, refused, completion],
  }, program);

  // ADIO-OBSERVE-01: final variables alone would miss a rollover that lost the copied input.
  assertActiveInput(fixture.present.startedObservation, presentInput);
  assert.throws(() => assertActiveInput({
    ...fixture.present.startedObservation,
    openUserTasks: fixture.present.startedObservation.openUserTasks.map(
      ({ inputs: _inputs, ...task }) => task,
    ),
  }, presentInput), assert.AssertionError);

  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity,
    downloadDirectory: temporalCacheDirectory,
  }), 40_000, "composed Activity-data Temporal startup");
  let worker: WorkerLease | undefined;

  try {
    worker = await startBpmnTestWorker(environment, bundle, identity);
    const present = await startWithForcedRollover(environment, program, fixture.present);
    const before = await publishedState(environment, present, program, 1);
    assert.deepEqual(before, fixture.present.startedObservation);
    assertActiveInput(before, presentInput);
    assert.deepEqual(before.openUserTasks[0]?.id, completion.taskId);
    const occurrenceBefore = await occurrences(environment, present, program);
    const activity = requireActiveClaim(occurrenceBefore);

    await assertCompletion(environment, present, refused, CommandOutcome.Rejected);
    await waitForWorkflowChainRunCount(environment, present.workflowId, 2);
    assert.deepEqual(await publishedState(environment, present, program, 1), before);
    assert.deepEqual(await occurrences(environment, present, program), occurrenceBefore);

    const explicitNull = await startScenario(environment, program, fixture.explicitNull);
    const nullBefore = await publishedState(environment, explicitNull, program, 1);
    assert.deepEqual(nullBefore, fixture.explicitNull.startedObservation);
    assertActiveInput(nullBefore, { kind: VariableValueKind.Null });
    const absent = await startScenario(environment, program, fixture.absent);
    const absentBefore = await publishedState(environment, absent, program, 0);
    assert.deepEqual(absentBefore, fixture.absent.startedObservation);
    assert.equal(absentBefore.status, ProcessStatus.Running);
    const absentOccurrences = await occurrences(environment, absent, program);
    assert.deepEqual(absentOccurrences.currentOpen, []);
    assert.equal(claimStarts(absentOccurrences).length, 0);

    const omitted = await startScenario(environment, program, fixture.omitted);
    const omittedBefore = await publishedState(environment, omitted, program, 1);
    assertActiveInput(omittedBefore, presentInput);
    const omittedOccurrences = await occurrences(environment, omitted, program);
    requireActiveClaim(omittedOccurrences);

    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, `${identity}-replacement`);
    assert.deepEqual(await publishedState(environment, present, program, 1), before);
    assert.deepEqual(await occurrences(environment, present, program), occurrenceBefore);
    assert.deepEqual(await publishedState(environment, explicitNull, program, 1), nullBefore);

    await completeAndRecover(environment, present, program, completion, expected);
    const completed = await occurrences(environment, present, program);
    assert.deepEqual(completed.currentOpen, []);
    assert.deepEqual(claimStarts(completed), claimStarts(occurrenceBefore));
    assert.deepEqual(completed.batches.map(({ commandId }) => commandId), [
      fixture.present.start.commandId,
      completion.commandId,
    ]);
    const ended = completed.batches.flatMap(({ transitions }) =>
      transitions.flatMap(({ lifecycle }) => lifecycle.ended)
    ).filter(({ id }) =>
      id.processInstanceId === activity.id.processInstanceId &&
      id.startRevision === activity.id.startRevision &&
      id.startIndex === activity.id.startIndex
    );
    assert.deepEqual(ended, [{ id: activity.id, terminal: FlowNodeOccurrenceTerminalKind.Completed }]);
    await completeAndRecover(
      environment,
      explicitNull,
      program,
      requireClaimCompletion(fixture.explicitNull.scenario),
      fixture.explicitNull.expected,
    );

    await assertCompletion(environment, omitted,
      requireClaimCompletion(fixture.omitted.scenario), CommandOutcome.Rejected);
    assert.deepEqual(await publishedState(environment, omitted, program, 1), omittedBefore);
    assert.deepEqual(await occurrences(environment, omitted, program), omittedOccurrences);

    // ADIO preflight: host termination cannot fill the output or end the still-active Activity.
    await terminateAndPreserve(environment, omitted, program, omittedBefore, omittedOccurrences);
    await terminateAndPreserve(environment, absent, program, absentBefore, absentOccurrences);

    for (const [started, result, runCount] of [
      [present, expected, 2],
      [explicitNull, fixture.explicitNull.expected, 1],
      [absent, fixture.absent.expected, 1],
      [omitted, fixture.omitted.expected, 1],
    ] as const) {
      const runs = await workflowChainRuns(environment, started.workflowId);
      assert.equal(runs.length, runCount);
      const trace: CanonicalObservation[] = [];
      let rolloverCount = 0;
      for (const run of runs) {
        const handle = environment.client.workflow.getHandle<BpmnProcessWorkflow>(
          started.workflowId, run.runId,
        );
        trace.push(...await withDeadline(
          handle.query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName),
          operationDeadlineMs, "composed Activity-data retained trace",
        ));
        const history = await withDeadline(handle.fetchHistory(), operationDeadlineMs,
          "composed Activity-data retained history");
        assert.ok(history.events !== undefined && history.events !== null);
        for (const event of history.events) {
          assert.equal(event.activityTaskScheduledEventAttributes ?? null, null);
          assert.equal(event.timerStartedEventAttributes ?? null, null);
          assert.equal(event.workflowExecutionSignaledEventAttributes ?? null, null);
          assert.equal(event.startChildWorkflowExecutionInitiatedEventAttributes ?? null, null);
          if (event.workflowExecutionContinuedAsNewEventAttributes != null) {
            rolloverCount += 1;
          }
        }
        await replayBpmnHistory(bundle, history, started.workflowId);
      }
      assert.equal(rolloverCount, runCount - 1);
      assert.deepEqual(trace, result.trace);
    }
  } finally {
    try {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
    } finally {
      await withDeadline(environment.teardown(), operationDeadlineMs,
        "composed Activity-data Temporal teardown");
    }
  }
});

async function startWithForcedRollover(
  environment: TestWorkflowEnvironment,
  program: SemanticProcessProgram,
  fixture: DataInputOutputScenarioFixture,
): Promise<StartedScenario> {
  const workflowId = processWorkflowId(fixture.start.instanceId);
  const handle = await withDeadline(environment.client.workflow.start(bpmnProcessWorkflowType, {
    args: [fixture.start, program, {
      protocol: bpmnWorkflowContinuationV1,
      kind: BpmnWorkflowHostInputKind.Initial,
      eventHistoryEventLimit: 4,
      eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes),
    }],
    taskQueue: bpmnSemanticTaskQueue,
    workflowId,
    workflowIdReusePolicy: "REJECT_DUPLICATE",
  }), operationDeadlineMs, "composed Activity-data forced-rollover start");
  return { handle, workflowId, instanceId: fixture.start.instanceId };
}

async function startScenario(
  environment: TestWorkflowEnvironment,
  program: SemanticProcessProgram,
  fixture: DataInputOutputScenarioFixture,
): Promise<StartedScenario> {
  const result = await withDeadline(startBpmnProcess(
    environment.client.workflow, fixture.start, program, { taskQueue: bpmnSemanticTaskQueue },
  ), operationDeadlineMs, `composed Activity-data start ${fixture.scenario.id}`);
  assert.ok(result.kind === BpmnProcessStartResultKind.Started);
  const handle = getTestProcessHandle(environment.client.workflow, result.processInstanceId);
  return { handle, workflowId: handle.workflowId, instanceId: fixture.start.instanceId };
}

function publishedState(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  program: SemanticProcessProgram,
  taskCount: number,
): Promise<StateObservation> {
  return waitForPublishedWorkflowChainState(environment, started.workflowId, program,
    started.instanceId, (state) => state.openUserTasks.length === taskCount);
}

function assertActiveInput(state: StateObservation, value: VariableValue): void {
  assert.equal(state.status, ProcessStatus.Running);
  assert.deepEqual(state.variables, [{ name: claimSummaryPropertyId, value }]);
  assert.equal(state.openUserTasks.length, 1);
  const task = state.openUserTasks[0];
  assert.ok(task !== undefined);
  assert.equal(task.id.elementId, claimTaskElementId);
  assert.deepEqual(task.inputs, [{ name: claimSummaryDataInputId, value }]);
}

async function assertCompletion(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  completion: CompleteUserTaskInstanceStimulus,
  outcome: CommandOutcome,
): Promise<void> {
  assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow,
    started.instanceId, completion), {
    kind: ProcessCommandResultKind.Semantic,
    commandId: completion.commandId,
    outcome,
  });
}

async function completeAndRecover(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  program: SemanticProcessProgram,
  completion: CompleteUserTaskInstanceStimulus,
  expected: ScenarioResult,
): Promise<void> {
  const active = await publishedState(environment, started, program, 1);
  assert.deepEqual(active.openUserTasks[0]?.id, completion.taskId);
  await assertCompletion(environment, started, completion, CommandOutcome.Committed);
  const terminal = await withDeadline(readTestProcessTerminalResult(started.handle),
    operationDeadlineMs, "composed Activity-data terminal receipt");
  assert.ok(isCompletedProcessReceipt(terminal.receipt));
  assert.deepEqual(terminal.receipt.definition, program.identity);
  assert.equal(terminal.receipt.processId, program.processId);
  assert.equal(terminal.receipt.processInstanceId, started.instanceId);
  const finalState = finalClaimObservation(expected);
  assert.deepEqual(terminal.receipt.finalState, finalState);
  assert.deepEqual(await publishedState(environment, started, program, 0), finalState);
  const submitted = completion.submittedValues[0];
  assert.ok(submitted !== undefined);
  assert.equal(submitted.name, claimDecisionDataOutputId);
  assert.deepEqual(finalState.variables, [
    { name: claimDecisionPropertyId, value: submitted.value },
    ...active.variables,
  ]);
  assert.deepEqual(finalState.openUserTasks, []);
  const beforeRecovery = await occurrences(environment, started, program);
  await assertCompletion(environment, started, completion, CommandOutcome.Committed);
  assert.deepEqual(await occurrences(environment, started, program), beforeRecovery);
  assert.equal(terminal.recoveryEntries.filter((entry) =>
    entry.commandId === completion.commandId && entry.outcome === CommandOutcome.Committed
  ).length, 1);
}

async function terminateAndPreserve(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  program: SemanticProcessProgram,
  state: StateObservation,
  lifecycle: OccurrenceSnapshot,
): Promise<void> {
  await withDeadline(started.handle.terminate("ADIO unfinished host closure"),
    operationDeadlineMs, "composed Activity-data host termination");
  assert.deepEqual(await publishedState(environment, started, program, state.openUserTasks.length), state);
  assert.deepEqual(await occurrences(environment, started, program), lifecycle);
}

async function occurrences(
  environment: TestWorkflowEnvironment,
  started: StartedScenario,
  program: SemanticProcessProgram,
): Promise<OccurrenceSnapshot> {
  const batches: FlowNodeOccurrenceBatch[] = [];
  let afterRevision = 0;
  for (let pageIndex = 0; pageIndex < 16; pageIndex += 1) {
    const result = await observeTemporalFlowNodeOccurrences(
      environment.client.workflow as unknown as TemporalFlowNodeOccurrencePublicationClient,
      started.workflowId,
      { definition: program.identity, processId: program.processId, processInstanceId: started.instanceId },
      { afterRevision },
    );
    assert.ok(result.kind === FlowNodeOccurrencePublicationResultKind.Available);
    batches.push(...result.page.batches);
    if (result.page.currentOpen !== null) {
      return { headRevision: result.page.headRevision, batches, currentOpen: result.page.currentOpen };
    }
    assert.ok(result.page.pageThroughRevision > afterRevision);
    afterRevision = result.page.pageThroughRevision;
  }
  assert.fail("composed Activity-data occurrence publication exceeded its bounded page count");
}

function claimStarts(snapshot: OccurrenceSnapshot) {
  return snapshot.batches.flatMap(({ transitions }) =>
    transitions.flatMap(({ lifecycle }) => lifecycle.started)
  ).filter(({ elementId }) => elementId === claimTaskElementId);
}

function requireActiveClaim(snapshot: OccurrenceSnapshot): OpenFlowNodeOccurrence {
  const starts = claimStarts(snapshot);
  assert.equal(starts.length, 1);
  assert.equal(snapshot.currentOpen.length, 1);
  const active = snapshot.currentOpen[0];
  assert.ok(active !== undefined);
  assert.equal(active.elementId, claimTaskElementId);
  assert.deepEqual(active.id, starts[0]?.id);
  assert.deepEqual(snapshot.batches.flatMap(({ transitions }) =>
    transitions.flatMap(({ lifecycle }) => lifecycle.ended)
  ).filter(({ id }) => id.startRevision === active.id.startRevision &&
    id.startIndex === active.id.startIndex && id.processInstanceId === active.id.processInstanceId), []);
  return active;
}
