/** Production Workflow-chain refinement for parallel Multi-Instance User Task. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind, CommandOutcome, VariableValueKind, runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation, CompleteUserTaskInstanceStimulus,
  Scenario, SemanticProcessProgram, StartProcessStimulus, StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind, ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind, FlowNodeOccurrenceTerminalKind,
  ProcessCommandResultKind, WorkflowChainBudgetKind,
  assessBpmnProcessAdmission, bpmnCompleteUserTaskUpdateName,
  bpmnProcessWorkflowType, bpmnSemanticTaskQueue, bpmnTraceQueryName,
  bpmnWorkflowContinuationV1, contentBoundUpdateId,
  createCachedLocalEnvironment, getTestProcessHandle, isCompletedProcessReceipt,
  loadBpmnWorkflowBundle, observeTemporalExecutionPublication,
  observeTemporalFlowNodeOccurrences, processTerminalReceiptFormatV1,
  processWorkflowId, readTestProcessTerminalResult, submitUserTaskCompletion,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow, ExecutionPublicationPage, FlowNodeOccurrencePage,
  TemporalExecutionPublicationClient, TemporalFlowNodeOccurrencePublicationClient,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";
import { WorkflowUpdateStage } from "@temporalio/client";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import { historyEvents } from "./temporal-history-facts.ts";
import {
  derivedCompletion, derivedStart, derivedTimer, escalationCompletion,
  expectedInterruptedTrace, requireCompletion, requireParallelOperation,
  requireStart, requireTimer,
} from "./parallel-multi-instance-derived-schedules.ts";
import type { ParallelOperation } from "./parallel-multi-instance-derived-schedules.ts";
import { assertHostClockDeadlineMargin } from "./host-clock-deadline-margin.ts";
import {
  compileExecutionInput, loadJson, temporalCacheDirectory, withDeadline,
} from "./temporal-test-support.ts";
import {
  replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import {
  waitForPublishedWorkflowChainState, waitForWorkflowChainRunCount,
  workflowChainRuns,
} from "./workflow-chain-test-support.ts";

const scenarioRoot = new URL("../../../../scenarios/parallel-multi-instance/", import.meta.url);
const allScenarioUrl = new URL("all.scenario.json", scenarioRoot);
const firstScenarioUrl = new URL("first.scenario.json", scenarioRoot);
const interruptedScenarioUrl = new URL("interrupted.scenario.json", scenarioRoot);
const bpmnUrl = new URL("process.bpmn", scenarioRoot);
const operationDeadlineMs = 20_000;

test("production PMI preserves indexed results and child lifecycles through every schedule", async () => {
  const [allScenario, firstScenario, interruptedScenario] = await Promise.all([
    loadJson<Scenario>(allScenarioUrl),
    loadJson<Scenario>(firstScenarioUrl),
    loadJson<Scenario>(interruptedScenarioUrl),
  ]);
  const [allInput, firstInput, interruptedInput] = await Promise.all([
    compileExecutionInput(allScenario, bpmnUrl),
    compileExecutionInput(firstScenario, bpmnUrl),
    compileExecutionInput(interruptedScenario, bpmnUrl),
  ]);
  assert.deepEqual(allInput.semanticProcess, firstInput.semanticProcess);
  assert.deepEqual(allInput.semanticProcess, interruptedInput.semanticProcess);

  const program = allInput.semanticProcess;
  const operation = requireParallelOperation(program);
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-parallel-multi-instance-refinement",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "PMI refinement Temporal environment startup",
  );
  const worker: WorkerSlot = {};

  try {
    worker.lease = await startBpmnTestWorker(
      environment, bundle, "parallel-multi-instance-refinement-initial",
    );
    await runNaturalRecovery(environment, bundle, worker, allScenario, program, operation);
    await runZeroItems(environment, bundle, allScenario, program, operation);
    await runOneItemFirst(environment, bundle, firstScenario, program, operation);
    await runTaskFirstInterruption(environment, bundle, interruptedScenario, program, operation);
    await runTimerFirstInterruption(environment, bundle, interruptedScenario, program, operation);
  } finally {
    if (worker.lease !== undefined) {
      await stopBpmnTestWorker(worker.lease);
    }
    await environment.teardown();
  }
});

async function runNaturalRecovery(
  environment: TestWorkflowEnvironment, bundle: WorkflowBundleWithSourceMap,
  worker: WorkerSlot, source: Scenario, program: SemanticProcessProgram,
  operation: ParallelOperation,
): Promise<void> {
  const originalStart = requireStart(source);
  const sourceCompletions = [1, 2, 3].map((index) => requireCompletion(source, index));
  const completions = [sourceCompletions[2]!, sourceCompletions[0]!, sourceCompletions[1]!];
  const scenario = { ...source, stimuli: [originalStart, ...completions] };
  const expected = runScenario(scenario, program);
  const firstHandle = await startProductionWitness(environment, originalStart, program, 3);
  const workflowId = processWorkflowId(originalStart.instanceId);
  // The outer deadline is armed on entry and logical time never advances here, so the completions
  // below race a real host timer. Arming happens in the second Run, after the pre-arming rollover, so
  // this instant precedes it and the measured span is an upper bound on what the timer actually
  // bounded; the margin assertion fails early rather than late.
  const armedAtMs = Date.now();

  await waitForWorkflowChainRunCount(environment, workflowId, 2);
  const preArmingRuns = await workflowChainRuns(environment, workflowId);
  const firstRun = preArmingRuns[0];
  assert.ok(firstRun !== undefined);
  const firstHistory = await environment.client.workflow
    .getHandle(workflowId, firstRun.runId).fetchHistory() as TemporalHistory;
  assert.equal(
    historyEvents(firstHistory, "workflowExecutionContinuedAsNewEventAttributes").length, 1,
  );
  assert.equal(historyEvents(firstHistory, "timerStartedEventAttributes").length, 0);

  const armed = await waitForParallelState(
    environment, workflowId, program, originalStart.instanceId, 0, [1, 2, 3],
  );
  const lifetimeTimer = requireLifetimeTimer(armed);
  const handle = getTestProcessHandle(environment.client.workflow, originalStart.instanceId);
  const outOfIndex = completions[0]!;
  await withDeadline(
    handle.startUpdate(bpmnCompleteUserTaskUpdateName, {
      args: [outOfIndex],
      updateId: contentBoundUpdateId(outOfIndex),
      waitForStage: WorkflowUpdateStage.ACCEPTED,
    }),
    operationDeadlineMs,
    "PMI activation-3 Update acceptance",
  );
  await replaceWorker(environment, bundle, worker);

  const successor = await waitForParallelState(
    environment, workflowId, program, originalStart.instanceId, 1, [1, 2],
  );
  assert.deepEqual(requireLifetimeTimer(successor), lifetimeTimer);
  const historyBeforeRecovery = await runHistoryLengths(environment, workflowId);
  await submit(environment, originalStart.instanceId, outOfIndex, CommandOutcome.Committed);
  assert.deepEqual(
    await runHistoryLengths(environment, workflowId),
    historyBeforeRecovery,
    "content-bound recovery must not append Event History",
  );

  for (const [index, completion] of completions.slice(1).entries()) {
    await submit(environment, originalStart.instanceId, completion, CommandOutcome.Committed);
    if (index === 0) {
      const progress = await waitForParallelState(
        environment, workflowId, program, originalStart.instanceId, 2, [1],
      );
      assert.deepEqual(requireLifetimeTimer(progress), lifetimeTimer);
    }
  }
  assertHostClockDeadlineMargin({
    label: "parallel Multi-Instance natural path",
    elapsedMs: Date.now() - armedAtMs,
    deadlineMs: lifetimeTimer.deadlineMs,
  });

  const terminal = await withDeadline(
    readTestProcessTerminalResult(firstHandle),
    operationDeadlineMs,
    "natural PMI terminal result",
  );
  requireExactTerminal(terminal.receipt, expected.trace, program, originalStart);
  const output = terminal.receipt.finalState.variables.find(({ name }) =>
    name === operation.data.output.dataObjectReferenceId
  );
  assert.deepEqual(output, {
    name: operation.data.output.dataObjectReferenceId,
    value: {
      kind: VariableValueKind.StringList,
      value: ["security-high", "privacy-low", "financial-medium"],
    },
  });
  assert.deepEqual(terminal.receipt.finalState.openMultiInstances, []);
  assert.deepEqual(terminal.receipt.finalState.openTimers, []);
  const recovered = terminal.recoveryEntries.filter(({ commandId }) =>
    commandId === outOfIndex.commandId
  );
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0]?.outcome, CommandOutcome.Committed);

  const closure = await closeProductionEvidence(
    environment, bundle, workflowId, program, originalStart.instanceId,
  );
  assert.deepEqual(closure.trace, expected.trace);
  requirePublicFacts(closure, {
    commandIds: scenario.stimuli.map(({ commandId }) => commandId),
    childCount: 3,
    terminals: [
      FlowNodeOccurrenceTerminalKind.Completed,
      FlowNodeOccurrenceTerminalKind.Completed,
      FlowNodeOccurrenceTerminalKind.Completed,
    ],
  });
  assertHostTimers(closure.histories, { started: 1, fired: 0, cancelled: 1 });
}

async function runZeroItems(
  environment: TestWorkflowEnvironment, bundle: WorkflowBundleWithSourceMap,
  source: Scenario, program: SemanticProcessProgram, operation: ParallelOperation,
): Promise<void> {
  const start = derivedStart(
    requireStart(source), operation, "ParallelRiskReview_Zero",
    "start-parallel-risk-review-zero", [], "all",
  );
  const scenario = { ...source, id: "parallel-multi-instance-zero", stimuli: [start] };
  const firstHandle = await startProductionWitness(environment, start, program);
  const terminal = await closeSchedule({
    environment,
    bundle,
    firstHandle,
    program,
    scenario,
    start,
    label: "zero-item PMI",
    publicFacts: { commandIds: [start.commandId], childCount: 0, terminals: [] },
    timerFacts: { started: 0, fired: 0, cancelled: 0 },
  });
  assert.deepEqual(
    terminal.receipt.finalState.variables.find(({ name }) =>
      name === operation.data.output.dataObjectReferenceId
    ),
    {
      name: operation.data.output.dataObjectReferenceId,
      value: { kind: VariableValueKind.StringList, value: [] },
    },
  );
}

async function runOneItemFirst(
  environment: TestWorkflowEnvironment, bundle: WorkflowBundleWithSourceMap,
  source: Scenario, program: SemanticProcessProgram, operation: ParallelOperation,
): Promise<void> {
  const start = derivedStart(
    requireStart(source), operation, "ParallelRiskReview_First_One",
    "start-parallel-risk-review-first-one", ["security"], "first",
  );
  const sourceCompletion = requireCompletion(source, 1);
  const completion = derivedCompletion(
    sourceCompletion, start.instanceId, "complete-parallel-risk-review-first-one",
    1, "security-high",
  );
  const scenario = {
    ...source,
    id: "parallel-multi-instance-first-one",
    stimuli: [start, completion],
  };
  const firstHandle = await startProductionWitness(environment, start, program);
  await requireOpenParallelChildren(environment, program, start.instanceId, [1]);
  await submit(environment, start.instanceId, completion, CommandOutcome.Committed);
  const terminal = await closeSchedule({
    environment,
    bundle,
    firstHandle,
    program,
    scenario,
    start,
    label: "one-item first PMI",
    publicFacts: {
      commandIds: [start.commandId, completion.commandId],
      childCount: 1,
      terminals: [FlowNodeOccurrenceTerminalKind.Completed],
    },
    timerFacts: { started: 1, fired: 0, cancelled: 1 },
  });
  assert.deepEqual(
    terminal.receipt.finalState.variables.find(({ name }) =>
      name === operation.data.output.dataObjectReferenceId
    ),
    {
      name: operation.data.output.dataObjectReferenceId,
      value: { kind: VariableValueKind.StringList, value: ["security-high"] },
    },
  );
}

async function runTaskFirstInterruption(
  environment: TestWorkflowEnvironment, bundle: WorkflowBundleWithSourceMap,
  source: Scenario, program: SemanticProcessProgram, operation: ParallelOperation,
): Promise<void> {
  const start = requireStart(source);
  const completion = requireCompletion(source, 1);
  const timer = requireTimer(source);
  const stale = requireCompletion(source, 3);
  const escalation = escalationCompletion(start.instanceId, "complete-task-first-escalation");
  const firstHandle = await startProductionWitness(environment, start, program);
  const entered = await requireOpenParallelChildren(
    environment, program, start.instanceId, [1, 2, 3],
  );
  const lifetimeTimer = requireLifetimeTimer(entered);
  await submit(environment, start.instanceId, completion, CommandOutcome.Committed);
  const progressed = await waitForParallelState(
    environment, processWorkflowId(start.instanceId), program, start.instanceId, 1, [1, 2],
  );
  assert.equal(
    progressed.variables.some(({ name }) =>
      name === operation.data.output.dataObjectReferenceId
    ),
    false,
  );
  await waitForEscalation(
    environment, program, start.instanceId, operation, lifetimeTimer.deadlineMs,
  );
  await submit(environment, start.instanceId, stale, CommandOutcome.Rejected);
  await submit(environment, start.instanceId, escalation, CommandOutcome.Committed);
  const expectedTrace = expectedInterruptedTrace(source, program, escalation);
  const terminal = await closeSchedule({
    environment,
    bundle,
    firstHandle,
    program,
    scenario: source,
    expectedTrace,
    start,
    label: "task-first interrupted PMI",
    publicFacts: {
      commandIds: [start.commandId, completion.commandId, timer.commandId, escalation.commandId],
      excludedCommandIds: [stale.commandId],
      childCount: 3,
      terminals: [
        FlowNodeOccurrenceTerminalKind.Cancelled,
        FlowNodeOccurrenceTerminalKind.Cancelled,
        FlowNodeOccurrenceTerminalKind.Completed,
      ],
    },
    timerFacts: { started: 1, fired: 1, cancelled: 0 },
  });
  requireNoPartialOutput(terminal.receipt.finalState, operation);
}

async function runTimerFirstInterruption(
  environment: TestWorkflowEnvironment, bundle: WorkflowBundleWithSourceMap,
  source: Scenario, program: SemanticProcessProgram, operation: ParallelOperation,
): Promise<void> {
  const originalStart = requireStart(source);
  const start = derivedStart(
    originalStart, operation, "ParallelRiskReview_TimerFirst",
    "start-parallel-risk-review-timer-first", ["security", "privacy", "financial"], "all",
  );
  const timer = derivedTimer(requireTimer(source), start.instanceId);
  const escalation = escalationCompletion(start.instanceId, "complete-timer-first-escalation");
  const scenario = {
    ...source,
    id: "parallel-multi-instance-timer-first",
    stimuli: [start, timer, escalation],
  };
  const firstHandle = await startProductionWitness(environment, start, program);

  const armed = await requireOpenParallelChildren(
    environment, program, start.instanceId, [1, 2, 3],
  );
  assert.equal(armed.openTimers.length, 1);
  assert.equal(armed.openUserTasks.length, 3);
  await waitForEscalation(
    environment, program, start.instanceId, operation,
    requireLifetimeTimer(armed).deadlineMs,
  );
  await submit(environment, start.instanceId, escalation, CommandOutcome.Committed);
  const terminal = await closeSchedule({
    environment,
    bundle,
    firstHandle,
    program,
    scenario,
    start,
    label: "Timer-first interrupted PMI",
    publicFacts: {
      commandIds: [start.commandId, timer.commandId, escalation.commandId],
      childCount: 3,
      terminals: [
        FlowNodeOccurrenceTerminalKind.Cancelled,
        FlowNodeOccurrenceTerminalKind.Cancelled,
        FlowNodeOccurrenceTerminalKind.Cancelled,
      ],
    },
    timerFacts: { started: 1, fired: 1, cancelled: 0 },
  });
  requireNoPartialOutput(terminal.receipt.finalState, operation);
}

async function closeSchedule(input: CloseScheduleInput) {
  const expectedTrace = input.expectedTrace ?? runScenario(input.scenario, input.program).trace;
  const terminal = await withDeadline(
    readTestProcessTerminalResult(input.firstHandle),
    operationDeadlineMs,
    `${input.label} terminal result`,
  );
  requireExactTerminal(terminal.receipt, expectedTrace, input.program, input.start);
  const closure = await closeProductionEvidence(
    input.environment, input.bundle, processWorkflowId(input.start.instanceId),
    input.program, input.start.instanceId,
  );
  assert.deepEqual(closure.trace, expectedTrace);
  requirePublicFacts(closure, input.publicFacts);
  assertHostTimers(closure.histories, input.timerFacts);
  return terminal;
}

async function startProductionWitness(
  environment: TestWorkflowEnvironment, start: StartProcessStimulus,
  program: SemanticProcessProgram,
  eventHistoryEventLimit = workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryEvents,
  ),
): Promise<WorkflowHandle> {
  assert.deepEqual(assessBpmnProcessAdmission(start, program), { kind: "admitted" });
  return environment.client.workflow.start(bpmnProcessWorkflowType, {
    args: [
      start,
      program,
      {
        protocol: bpmnWorkflowContinuationV1,
        kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit,
        eventHistoryByteLimit: workflowChainProductionLimit(
          WorkflowChainBudgetKind.EventHistoryBytes,
        ),
      },
    ],
    taskQueue: bpmnSemanticTaskQueue,
    workflowId: processWorkflowId(start.instanceId),
    workflowIdReusePolicy: "REJECT_DUPLICATE",
  });
}

async function requireOpenParallelChildren(
  environment: TestWorkflowEnvironment, program: SemanticProcessProgram,
  processInstanceId: string, activations: readonly number[],
): Promise<StateObservation> {
  const handle = getTestProcessHandle(environment.client.workflow, processInstanceId);
  const tasks = await waitForOpenUserTaskIds(
    handle,
    activations.map(() => "UserTask_Review"),
  );
  assert.deepEqual(tasks.map(({ id }) => id.activation), activations);
  return waitForParallelState(
    environment,
    processWorkflowId(processInstanceId),
    program,
    processInstanceId,
    0,
    activations,
  );
}

async function waitForParallelState(
  environment: TestWorkflowEnvironment, workflowId: string,
  program: SemanticProcessProgram, processInstanceId: string,
  completed: number, activeActivations: readonly number[],
): Promise<StateObservation> {
  const state = await waitForPublishedWorkflowChainState(
    environment,
    workflowId,
    program,
    processInstanceId,
    (candidate) => {
      const controller = candidate.openMultiInstances?.[0];
      return controller?.mode === "parallel" &&
        controller.numberOfCompletedInstances === completed &&
        controller.activeIterations.map(({ taskId }) => taskId.activation)
          .every((activation, index) => activation === activeActivations[index]) &&
        controller.activeIterations.length === activeActivations.length;
    },
  );
  const controller = state.openMultiInstances?.[0];
  assert.ok(controller?.mode === "parallel");
  assert.equal(controller.plannedInstanceCount, completed + activeActivations.length);
  assert.equal(controller.numberOfCompletedInstances, completed);
  assert.deepEqual(
    controller.activeIterations.map(({ taskId }) => taskId.activation),
    activeActivations,
  );
  return state;
}

async function waitForEscalation(
  environment: TestWorkflowEnvironment, program: SemanticProcessProgram,
  processInstanceId: string, operation: ParallelOperation,
  armedDeadlineMs: number,
): Promise<StateObservation> {
  const handle = getTestProcessHandle(environment.client.workflow, processInstanceId);
  await waitForOpenUserTaskIds(handle, ["UserTask_Escalation"], undefined, armedDeadlineMs);
  const state = await waitForPublishedWorkflowChainState(
    environment,
    processWorkflowId(processInstanceId),
    program,
    processInstanceId,
    (candidate) =>
      candidate.openUserTasks.length === 1 &&
      candidate.openUserTasks[0]?.id.elementId === "UserTask_Escalation" &&
      candidate.openTimers.length === 0 &&
      candidate.openMultiInstances?.length === 0,
  );
  requireNoPartialOutput(state, operation);
  return state;
}

async function replaceWorker(
  environment: TestWorkflowEnvironment, bundle: WorkflowBundleWithSourceMap,
  worker: WorkerSlot,
): Promise<void> {
  const current = worker.lease;
  assert.ok(current !== undefined);
  delete worker.lease;
  await stopBpmnTestWorker(current);
  worker.lease = await startBpmnTestWorker(
    environment, bundle, "parallel-multi-instance-refinement-replacement",
  );
}

async function closeProductionEvidence(
  environment: TestWorkflowEnvironment, bundle: WorkflowBundleWithSourceMap,
  workflowId: string, program: SemanticProcessProgram, processInstanceId: string,
): Promise<ProductionClosure> {
  const runs = await workflowChainRuns(environment, workflowId);
  const trace: CanonicalObservation[] = [];
  const histories: TemporalHistory[] = [];
  for (const run of runs) {
    const handle = environment.client.workflow.getHandle<BpmnProcessWorkflow>(
      workflowId, run.runId,
    );
    const history = await handle.fetchHistory();
    histories.push(history as TemporalHistory);
    trace.push(...await handle.query<ReadonlyArray<CanonicalObservation>>(
      bpmnTraceQueryName,
    ));
    await replayBpmnHistory(bundle, history, workflowId);
  }
  return {
    trace,
    histories,
    ...await readPairedPublication(environment, workflowId, program, processInstanceId),
  };
}

async function readPairedPublication(
  environment: TestWorkflowEnvironment, workflowId: string,
  program: SemanticProcessProgram, processInstanceId: string,
): Promise<Pick<ProductionClosure, "execution" | "occurrences">> {
  const executionBatches: ExecutionPublicationPage["batches"][number][] = [];
  const occurrenceBatches: FlowNodeOccurrencePage["batches"][number][] = [];
  let afterRevision = 0;
  for (let pageIndex = 0; pageIndex < 32; pageIndex += 1) {
    const identity = {
      definition: program.identity,
      processId: program.processId,
      processInstanceId,
    };
    const [execution, occurrences] = await Promise.all([
      observeTemporalExecutionPublication(
        environment.client.workflow as unknown as TemporalExecutionPublicationClient,
        workflowId, identity, { afterRevision, limit: 100 },
      ),
      observeTemporalFlowNodeOccurrences(
        environment.client.workflow as unknown as TemporalFlowNodeOccurrencePublicationClient,
        workflowId, identity, { afterRevision, limit: 100 },
      ),
    ]);
    assert.equal(execution.kind, ExecutionPublicationResultKind.Available);
    assert.equal(occurrences.kind, FlowNodeOccurrencePublicationResultKind.Available);
    if (
      execution.kind !== ExecutionPublicationResultKind.Available ||
      occurrences.kind !== FlowNodeOccurrencePublicationResultKind.Available
    ) {
      assert.fail("PMI paired publication is unavailable");
    }
    assert.deepEqual(publicationShape(occurrences.page), publicationShape(execution.page));
    executionBatches.push(...execution.page.batches);
    occurrenceBatches.push(...occurrences.page.batches);
    if (execution.page.pageThroughRevision === execution.page.headRevision) {
      return { execution: executionBatches, occurrences: occurrenceBatches };
    }
    assert.ok(execution.page.pageThroughRevision > afterRevision);
    afterRevision = execution.page.pageThroughRevision;
  }
  throw new Error("PMI paired publication did not reach its head");
}

function requirePublicFacts(closure: ProductionClosure, expected: PublicFacts): void {
  assert.deepEqual(closure.execution.map(({ commandId }) => commandId), expected.commandIds);
  for (const excluded of expected.excludedCommandIds ?? []) {
    assert.equal(
      closure.execution.some(({ commandId }) => commandId === excluded),
      false,
      `${excluded} must publish no committed E1 batch`,
    );
    assert.equal(
      closure.occurrences.some(({ commandId }) => commandId === excluded),
      false,
      `${excluded} must publish no E2 batch`,
    );
  }
  const starts = closure.occurrences.flatMap(({ transitions }) =>
    transitions.flatMap(({ lifecycle }) => lifecycle.started)
  ).filter(({ elementId }) => elementId === "UserTask_Review");
  assert.equal(starts.length, expected.childCount);
  assert.equal(new Set(starts.map(({ id }) => occurrenceKey(id))).size, starts.length);
  const startKeys = starts.map(({ id }) => occurrenceKey(id));
  const ends = closure.occurrences.flatMap(({ transitions }) =>
    transitions.flatMap(({ lifecycle }) => lifecycle.ended)
  ).filter(({ id }) => startKeys.includes(occurrenceKey(id)));
  assert.equal(ends.length, expected.childCount);
  assert.deepEqual(
    startKeys.map((key) => {
      const matching = ends.filter(({ id }) => occurrenceKey(id) === key);
      assert.equal(matching.length, 1);
      return matching[0]!.terminal;
    }),
    expected.terminals,
  );
}

function requireExactTerminal(
  receipt: Awaited<ReturnType<typeof readTestProcessTerminalResult>>["receipt"],
  expectedTrace: readonly CanonicalObservation[], program: SemanticProcessProgram,
  start: StartProcessStimulus,
): void {
  assert.equal(isCompletedProcessReceipt(receipt), true);
  const final = expectedTrace.at(-1);
  assert.equal(final?.kind, CanonicalObservationKind.State);
  assert.deepEqual(receipt, {
    format: processTerminalReceiptFormatV1,
    definition: program.identity,
    processId: program.processId,
    processInstanceId: start.instanceId,
    finalState: final as StateObservation,
  });
}

function assertHostTimers(
  histories: readonly TemporalHistory[], expected: TimerFacts,
): void {
  assert.deepEqual({
    started: countHistory(histories, "timerStartedEventAttributes"),
    fired: countHistory(histories, "timerFiredEventAttributes"),
    cancelled: countHistory(histories, "timerCanceledEventAttributes"),
  }, expected);
}






function requireNoPartialOutput(
  state: StateObservation, operation: ParallelOperation,
): void {
  assert.equal(
    state.variables.some(({ name }) =>
      name === operation.data.output.dataObjectReferenceId
    ),
    false,
  );
  assert.deepEqual(state.openMultiInstances, []);
}

function requireLifetimeTimer(state: StateObservation) {
  assert.equal(state.openTimers.length, 1);
  const timer = state.openTimers[0];
  assert.ok(timer !== undefined);
  return timer;
}

function semanticResult(
  completion: CompleteUserTaskInstanceStimulus, outcome: CommandOutcome,
) {
  return {
    kind: ProcessCommandResultKind.Semantic,
    commandId: completion.commandId,
    outcome,
  } as const;
}

async function submit(
  environment: TestWorkflowEnvironment, processInstanceId: string,
  completion: CompleteUserTaskInstanceStimulus, outcome: CommandOutcome,
): Promise<void> {
  assert.deepEqual(
    await submitUserTaskCompletion(environment.client.workflow, processInstanceId, completion),
    semanticResult(completion, outcome),
  );
}





function publicationShape(page: ExecutionPublicationPage | FlowNodeOccurrencePage) {
  return {
    requestedAfterRevision: page.requestedAfterRevision,
    pageThroughRevision: page.pageThroughRevision,
    headRevision: page.headRevision,
    batches: page.batches.map(({ commandId, fromRevision, throughRevision }) => ({
      commandId,
      fromRevision,
      throughRevision,
    })),
  };
}

function occurrenceKey(id: Readonly<{
  processInstanceId: string; startRevision: number; startIndex: number;
}>): string {
  return `${id.processInstanceId}:${String(id.startRevision)}:${String(id.startIndex)}`;
}

function countHistory(
  histories: readonly TemporalHistory[], attribute: string,
): number {
  return histories.reduce(
    (count, history) => count + historyEvents(history, attribute).length,
    0,
  );
}

async function runHistoryLengths(
  environment: TestWorkflowEnvironment, workflowId: string,
): Promise<ReadonlyArray<number>> {
  const runs = await workflowChainRuns(environment, workflowId);
  return Promise.all(runs.map(async ({ runId }) => {
    const history = await environment.client.workflow
      .getHandle(workflowId, runId).fetchHistory();
    assert.ok(history.events !== null && history.events !== undefined);
    return history.events.length;
  }));
}

type WorkerSlot = { lease?: WorkerLease };
type TimerFacts = Readonly<{ started: number; fired: number; cancelled: number }>;
type ProductionClosure = Readonly<{
  trace: ReadonlyArray<CanonicalObservation>; histories: ReadonlyArray<TemporalHistory>;
  execution: ReadonlyArray<ExecutionPublicationPage["batches"][number]>;
  occurrences: ReadonlyArray<FlowNodeOccurrencePage["batches"][number]>;
}>;
type PublicFacts = Readonly<{
  commandIds: readonly string[]; excludedCommandIds?: readonly string[];
  childCount: number; terminals: readonly FlowNodeOccurrenceTerminalKind[];
}>;
type CloseScheduleInput = Readonly<{
  environment: TestWorkflowEnvironment; bundle: WorkflowBundleWithSourceMap;
  firstHandle: WorkflowHandle; program: SemanticProcessProgram; scenario: Scenario;
  expectedTrace?: readonly CanonicalObservation[]; start: StartProcessStimulus;
  label: string; publicFacts: PublicFacts; timerFacts: TimerFacts;
}>;
