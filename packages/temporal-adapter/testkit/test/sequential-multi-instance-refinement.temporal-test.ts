/** Production Workflow-chain refinement for sequential Multi-Instance User Task. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind, CommandOutcome, SemanticOperationKind,
  StimulusKind, VariableValueKind, runScenario,
  type CanonicalObservation, type CompleteUserTaskInstanceStimulus,
  type OpenTimer, type Scenario, type SemanticProcessProgram,
  type StartProcessStimulus, type StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind,
  ProcessCommandResultKind, WorkflowChainBudgetKind,
  assessBpmnProcessAdmission, bpmnCompleteUserTaskUpdateName,
  bpmnProcessWorkflowType, bpmnSemanticTaskQueue,
  bpmnWorkflowContinuationV1, contentBoundUpdateId,
  createCachedLocalEnvironment, getTestProcessHandle,
  isCompletedProcessReceipt, loadBpmnWorkflowBundle,
  processWorkflowId,
  readTestProcessTerminalResult, submitUserTaskCompletion,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import { WorkflowUpdateStage } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";
import { SequentialMultiInstanceHistoryRunRole, SequentialMultiInstanceHistoryTopology } from "@bpmn-lean/temporal-workflow";

import {
  compileExecutionInput, loadJson, temporalCacheDirectory, withDeadline,
} from "./temporal-test-support.ts";
import {
  startBpmnTestWorker, stopBpmnTestWorker,
  waitForOpenUserTaskIds, type WorkerLease,
} from "./temporal-worker-test-support.ts";
import {
  waitForPublishedWorkflowChainState, waitForWorkflowChainRunCount,
} from "./workflow-chain-test-support.ts";
import {
  requireInterruptedSequentialMultiInstanceOccurrences,
  requireNaturalSequentialMultiInstanceOccurrences,
} from "./sequential-multi-instance-history-evidence.ts";
import {
  closeSequentialMultiInstanceProductionEvidence,
  sequentialMultiInstanceRunHistoryLengths,
} from "./sequential-multi-instance-production-evidence.ts";
import { assertHostClockDeadlineMargin } from "./host-clock-deadline-margin.ts";

const naturalScenarioUrl = new URL("../../../../scenarios/sequential-multi-instance/natural.scenario.json", import.meta.url);
const interruptedScenarioUrl = new URL("../../../../scenarios/sequential-multi-instance/interrupted.scenario.json", import.meta.url);
const bpmnUrl = new URL("../../../../scenarios/sequential-multi-instance/process.bpmn", import.meta.url);
const operationDeadlineMs = 20_000;

test("production SMI preserves one lifetime Timer through rollover, replacement, recovery, interruption, and replay", async () => {
  const [naturalScenario, interruptedScenario] = await Promise.all([
    loadJson<Scenario>(naturalScenarioUrl),
    loadJson<Scenario>(interruptedScenarioUrl),
  ]);
  const [naturalInput, interruptedInput] = await Promise.all([
    compileExecutionInput(naturalScenario, bpmnUrl),
    compileExecutionInput(interruptedScenario, bpmnUrl),
  ]);
  assert.deepEqual(
    naturalInput.semanticProcess.identity,
    interruptedInput.semanticProcess.identity,
  );
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-sequential-multi-instance-refinement",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "SMI refinement Temporal environment startup",
  );
  const worker: WorkerSlot = {};

  try {
    worker.lease = await startBpmnTestWorker(
      environment,
      bundle,
      "sequential-multi-instance-refinement-initial",
    );
    await runNaturalRefinement(
      environment,
      bundle,
      worker,
      naturalScenario,
      naturalInput.semanticProcess,
    );
    await runInterruptedRefinement(
      environment,
      bundle,
      interruptedScenario,
      interruptedInput.semanticProcess,
    );
  } finally {
    if (worker.lease !== undefined) {
      await stopBpmnTestWorker(worker.lease);
    }
    await environment.teardown();
  }
});

async function runNaturalRefinement(
  environment: TestWorkflowEnvironment, bundle: WorkflowBundleWithSourceMap,
  worker: WorkerSlot, scenario: Scenario, semanticProcess: SemanticProcessProgram,
): Promise<void> {
  const start = requireStart(scenario);
  const completions = [1, 2, 3].map((index) =>
    requireCompletion(scenario, index)
  );
  const expected = runScenario(scenario, semanticProcess);
  const operation = requireSequentialOperation(semanticProcess);
  const firstHandle = await startProductionWitness(
    environment,
    start,
    semanticProcess,
  );
  const workflowId = processWorkflowId(start.instanceId);
  // The outer deadline is armed on entry and logical time never advances here, so the iterations
  // below race a real host timer. Arming happens in the second Run, after the pre-arming rollover, so
  // this instant precedes it and the measured span is an upper bound on what the timer actually
  // bounded; the margin assertion fails early rather than late.
  const armedAtMs = Date.now();
  await waitForWorkflowChainRunCount(environment, workflowId, 2);

  const firstState = await waitForIteration(
    environment,
    workflowId,
    semanticProcess,
    start.instanceId,
    completions[0]!,
    operation.data.input.taskDataInputId,
    "contract",
  );
  const lifetimeTimer = requireLifetimeTimer(firstState);
  assert.equal(lifetimeTimer.deadlineMs, 5_000);

  const currentHandle = getTestProcessHandle(
    environment.client.workflow,
    start.instanceId,
  );
  await withDeadline(
    currentHandle.startUpdate(bpmnCompleteUserTaskUpdateName, {
      args: [completions[0]!],
      updateId: contentBoundUpdateId(completions[0]!),
      waitForStage: WorkflowUpdateStage.ACCEPTED,
    }),
    operationDeadlineMs,
    "SMI task-1 Update acceptance",
  );
  // Deliberately discard the Update handle. Recovery below must use the public command path.
  await replaceWorker(environment, bundle, worker);

  const secondState = await waitForIteration(
    environment,
    workflowId,
    semanticProcess,
    start.instanceId,
    completions[1]!,
    operation.data.input.taskDataInputId,
    "invoice",
  );
  assert.deepEqual(requireLifetimeTimer(secondState), lifetimeTimer);
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      start.instanceId,
      completions[1]!,
    ),
    semanticResult(completions[1]!, CommandOutcome.Committed),
  );

  const thirdState = await waitForIteration(
    environment,
    workflowId,
    semanticProcess,
    start.instanceId,
    completions[2]!,
    operation.data.input.taskDataInputId,
    "receipt",
  );
  assert.deepEqual(requireLifetimeTimer(thirdState), lifetimeTimer);
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      start.instanceId,
      completions[2]!,
    ),
    semanticResult(completions[2]!, CommandOutcome.Committed),
  );
  // Measured after the closing completion, because that round trip races the deadline like the
  // others: had it lost, interruption would have withdrawn the task it completes.
  assertHostClockDeadlineMargin({
    label: "sequential Multi-Instance natural path",
    elapsedMs: Date.now() - armedAtMs,
    remainingMs: lifetimeTimer.deadlineMs - firstState.logicalTimeMs,
  });

  const terminal = await withDeadline(
    readTestProcessTerminalResult(firstHandle),
    operationDeadlineMs,
    "natural SMI terminal result",
  );
  requireExactTerminal(terminal.receipt, expected.trace, semanticProcess, start);
  const finalState = terminal.receipt.finalState;
  assert.deepEqual(finalState.openMultiInstances, []);
  assert.deepEqual(finalState.openTimers, []);
  assert.deepEqual(
    finalState.variables.find(({ name }) =>
      name === operation.data.output.dataObjectReferenceId
    ),
    {
      name: operation.data.output.dataObjectReferenceId,
      value: {
        kind: VariableValueKind.StringList,
        value: ["accepted", "flagged", "archived"],
      },
    },
  );
  const recoveredFirst = terminal.recoveryEntries.filter(({ commandId }) =>
    commandId === completions[0]!.commandId
  );
  assert.equal(recoveredFirst.length, 1);
  assert.equal(recoveredFirst[0]?.outcome, CommandOutcome.Committed);
  assert.match(recoveredFirst[0]?.stimulusSha256 ?? "", /^[0-9a-f]{64}$/u);

  const historyLengthsBeforeRecovery = await sequentialMultiInstanceRunHistoryLengths(
    environment,
    workflowId,
  );
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      start.instanceId,
      completions[0]!,
    ),
    semanticResult(completions[0]!, CommandOutcome.Committed),
  );
  assert.deepEqual(
    await sequentialMultiInstanceRunHistoryLengths(environment, workflowId),
    historyLengthsBeforeRecovery,
  );

  const closure = await closeSequentialMultiInstanceProductionEvidence(
    environment,
    bundle,
    workflowId,
    semanticProcess,
    start.instanceId,
    SequentialMultiInstanceHistoryTopology.Natural,
  );
  assert.deepEqual(closure.trace, expected.trace);
  requireNaturalSequentialMultiInstanceOccurrences(
    closure.occurrenceBatches,
    [completions[0]!.commandId, completions[1]!.commandId],
  );
}

async function runInterruptedRefinement(
  environment: TestWorkflowEnvironment, bundle: WorkflowBundleWithSourceMap,
  scenario: Scenario, semanticProcess: SemanticProcessProgram,
): Promise<void> {
  const start = requireStart(scenario);
  const firstCompletion = requireCompletion(scenario, 1);
  const staleCompletion = requireCompletion(scenario, 3);
  const escalationCompletion = escalationCompletionFor(start.instanceId);
  const expectedTrace = expectedTraceAfterEscalation(
    scenario,
    semanticProcess,
    escalationCompletion,
  );
  const operation = requireSequentialOperation(semanticProcess);
  const firstHandle = await startProductionWitness(
    environment,
    start,
    semanticProcess,
  );
  const workflowId = processWorkflowId(start.instanceId);
  await waitForWorkflowChainRunCount(environment, workflowId, 2);

  const firstState = await waitForIteration(
    environment,
    workflowId,
    semanticProcess,
    start.instanceId,
    firstCompletion,
    operation.data.input.taskDataInputId,
    "contract",
  );
  const lifetimeTimer = requireLifetimeTimer(firstState);
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      start.instanceId,
      firstCompletion,
    ),
    semanticResult(firstCompletion, CommandOutcome.Committed),
  );
  const secondState = await waitForIteration(
    environment,
    workflowId,
    semanticProcess,
    start.instanceId,
    staleCompletion,
    operation.data.input.taskDataInputId,
    "invoice",
  );
  assert.deepEqual(requireLifetimeTimer(secondState), lifetimeTimer);

  await waitForWorkflowChainRunCount(environment, workflowId, 3);
  const liveHandle = getTestProcessHandle(
    environment.client.workflow,
    start.instanceId,
  );
  await waitForOpenUserTaskIds(
    liveHandle,
    [escalationCompletion.taskId.elementId],
    undefined,
    lifetimeTimer.deadlineMs,
  );
  const interruptedState = await waitForPublishedWorkflowChainState(
    environment,
    workflowId,
    semanticProcess,
    start.instanceId,
    (state) =>
      state.openUserTasks.length === 1 &&
      state.openUserTasks[0]?.id.elementId === escalationCompletion.taskId.elementId &&
      state.openMultiInstances?.length === 0 &&
      state.openTimers.length === 0,
  );
  assert.equal(
    interruptedState.variables.some(({ name }) =>
      name === operation.data.output.dataObjectReferenceId
    ),
    false,
  );

  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      start.instanceId,
      staleCompletion,
    ),
    semanticResult(staleCompletion, CommandOutcome.Rejected),
  );
  const afterStale = await waitForPublishedWorkflowChainState(
    environment,
    workflowId,
    semanticProcess,
    start.instanceId,
    (state) =>
      state.openUserTasks.length === 1 &&
      state.openUserTasks[0]?.id.elementId === escalationCompletion.taskId.elementId,
  );
  assert.deepEqual(afterStale, interruptedState);
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      start.instanceId,
      escalationCompletion,
    ),
    semanticResult(escalationCompletion, CommandOutcome.Committed),
  );

  const terminal = await withDeadline(
    readTestProcessTerminalResult(firstHandle),
    operationDeadlineMs,
    "interrupted SMI terminal result",
  );
  requireExactTerminal(terminal.receipt, expectedTrace, semanticProcess, start);
  assert.equal(
    terminal.receipt.finalState.variables.some(({ name }) =>
      name === operation.data.output.dataObjectReferenceId
    ),
    false,
  );
  assert.deepEqual(terminal.receipt.finalState.openMultiInstances, []);

  const closure = await closeSequentialMultiInstanceProductionEvidence(
    environment,
    bundle,
    workflowId,
    semanticProcess,
    start.instanceId,
    SequentialMultiInstanceHistoryTopology.Interrupted,
  );
  assert.deepEqual(closure.trace, expectedTrace);
  requireInterruptedSequentialMultiInstanceOccurrences(
    closure.occurrenceBatches,
    {
      firstCompletion: firstCompletion.commandId,
      timerFiring: requireCommandId(scenario, 2),
      staleCompletion: staleCompletion.commandId,
    },
  );
}

async function startProductionWitness(
  environment: TestWorkflowEnvironment, start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
) {
  assert.deepEqual(assessBpmnProcessAdmission(start, semanticProcess), {
    kind: "admitted",
  });
  return environment.client.workflow.start(bpmnProcessWorkflowType, {
    args: [
      start,
      semanticProcess,
      {
        protocol: bpmnWorkflowContinuationV1,
        kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: 3,
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

async function waitForIteration(
  environment: TestWorkflowEnvironment, workflowId: string,
  semanticProcess: SemanticProcessProgram, processInstanceId: string,
  completion: CompleteUserTaskInstanceStimulus, taskInputName: string,
  taskInputValue: string,
): Promise<StateObservation> {
  const handle = getTestProcessHandle(
    environment.client.workflow,
    processInstanceId,
  );
  const tasks = await waitForOpenUserTaskIds(handle, [completion.taskId.elementId]);
  assert.deepEqual(tasks.map(({ id }) => id), [completion.taskId]);
  const state = await waitForPublishedWorkflowChainState(
    environment,
    workflowId,
    semanticProcess,
    processInstanceId,
    (candidate) =>
      candidate.openMultiInstances?.[0]?.activeIterations[0]?.taskId.activation ===
        completion.taskId.activation,
  );
  const controller = state.openMultiInstances?.[0];
  assert.ok(controller !== undefined);
  assert.equal(controller.mode, "sequential");
  assert.equal(controller.activeIterations.length, 1);
  assert.deepEqual(controller.activeIterations[0], {
    loopCounter: completion.taskId.activation - 1,
    taskId: completion.taskId,
    taskInput: {
      name: taskInputName,
      value: { kind: VariableValueKind.String, value: taskInputValue },
    },
    completionBindingName: completion.submittedValues[0]?.name ?? "",
  });
  return state;
}

function requireLifetimeTimer(state: StateObservation): OpenTimer {
  assert.equal(state.openTimers.length, 1);
  const timer = state.openTimers[0];
  assert.ok(timer !== undefined);
  return timer;
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
    environment,
    bundle,
    "sequential-multi-instance-refinement-replacement",
  );
}

function requireExactTerminal(
  receipt: Awaited<ReturnType<typeof readTestProcessTerminalResult>>["receipt"],
  expectedTrace: readonly CanonicalObservation[], semanticProcess: SemanticProcessProgram,
  start: StartProcessStimulus,
): void {
  assert.equal(isCompletedProcessReceipt(receipt), true);
  assert.deepEqual(receipt.definition, semanticProcess.identity);
  assert.equal(receipt.processId, semanticProcess.processId);
  assert.equal(receipt.processInstanceId, start.instanceId);
  const expectedFinal = expectedTrace.at(-1);
  assert.equal(expectedFinal?.kind, CanonicalObservationKind.State);
  assert.deepEqual(receipt.finalState, expectedFinal as StateObservation);
}

function semanticResult(
  completion: CompleteUserTaskInstanceStimulus,
  outcome: CommandOutcome,
) {
  return {
    kind: ProcessCommandResultKind.Semantic,
    commandId: completion.commandId,
    outcome,
  } as const;
}

function escalationCompletionFor(
  processInstanceId: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-escalation-after-interruption",
    taskId: {
      processInstanceId,
      elementId: "UserTask_Escalation",
      activation: 1,
    },
    submittedValues: [],
  };
}

function expectedTraceAfterEscalation(
  rejectedScenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  escalationCompletion: CompleteUserTaskInstanceStimulus,
): ReadonlyArray<CanonicalObservation> {
  const rejected = runScenario(rejectedScenario, semanticProcess);
  const completed = runScenario({
    ...rejectedScenario,
    stimuli: [
      ...rejectedScenario.stimuli.slice(0, -1),
      escalationCompletion,
    ],
  }, semanticProcess);
  assert.deepEqual(rejected.trace.slice(0, -2), completed.trace.slice(0, -2));
  assert.deepEqual(rejected.trace.at(-1), completed.trace.at(-3));
  return [...rejected.trace, ...completed.trace.slice(-2)];
}

function requireStart(scenario: Scenario): StartProcessStimulus {
  const stimulus = scenario.stimuli[0];
  if (stimulus?.kind !== StimulusKind.StartProcess) {
    throw new TypeError("SMI scenario has no Process start");
  }
  return stimulus;
}

function requireCompletion(
  scenario: Scenario,
  index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = scenario.stimuli[index];
  if (stimulus?.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`SMI scenario has no completion ${String(index)}`);
  }
  return stimulus;
}

function requireCommandId(scenario: Scenario, index: number): string {
  const stimulus = scenario.stimuli[index];
  if (stimulus === undefined) {
    throw new TypeError(`SMI scenario has no stimulus ${String(index)}`);
  }
  return stimulus.commandId;
}

function requireSequentialOperation(semanticProcess: SemanticProcessProgram) {
  const operation = semanticProcess.operations.find(({ kind }) =>
    kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
  );
  if (
    operation?.kind !== SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
  ) {
    throw new TypeError("SMI program has no sequential Multi-Instance operation");
  }
  return operation;
}

type WorkerSlot = { lease?: WorkerLease };
