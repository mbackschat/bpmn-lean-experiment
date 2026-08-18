import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  initialState,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import { ApplicationFailure } from "@temporalio/workflow";
import {
  BpmnProcessStartResultKind,
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  bpmnSemanticTaskQueue,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  bpmnWorkflowChainCommandRecoveryQueryName,
  bpmnWorkflowChainProtocolV1,
  createCachedLocalEnvironment,
  createCommandPublicationState,
  getTestProcessHandle,
  integrateCommandPublication,
  loadBpmnWorkflowBundle,
  processTerminalReceiptFormatV1,
  processWorkflowId,
  recordCommandPublicationOutcome,
  startBpmnProcess,
  submitUserTaskCompletion,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
  workflowCommandStimulusSha256,
  workflowTerminalResultFormatV1,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalHistory,
  WorkflowChainRecoveryEntry,
} from "@bpmn-lean/temporal-testkit";

import {
  compileExecutionInput,
  loadJson,
  requiredAt,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import { historyEvents } from "./temporal-history-facts.ts";
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
const operationDeadlineMs = 20_000;
const terminalLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.TerminalResultEnvelopeBytes,
);

test("a one-byte oversized terminal envelope fails typed after its closing result is recoverable", async () => {
  const baseScenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess: baseProgram } = await compileExecutionInput(
    baseScenario,
    bpmnUrl,
  );
  const fixture = exactOversizedTerminalFixture(baseScenario, baseProgram);
  assertFixtureBudgets(fixture);

  const workflowId = processWorkflowId(fixture.start.instanceId);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-terminal-capacity",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Workflow terminal-capacity Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-terminal-capacity",
    );
    const started = await startBpmnProcess(
      environment.client.workflow,
      fixture.start,
      fixture.program,
      { taskQueue: bpmnSemanticTaskQueue },
    );
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      assert.fail(`terminal-capacity start was rejected: ${started.failure.code}`);
    }
    const handle = getTestProcessHandle(
      environment.client.workflow,
      started.processInstanceId,
    );

    for (const stimulus of fixture.completions) {
      await waitForOpenUserTaskIds(handle, [stimulus.taskId.elementId]);
      assert.deepEqual(
        await submitUserTaskCompletion(
          environment.client.workflow,
          fixture.start.instanceId,
          stimulus,
        ),
        {
          kind: "semantic",
          commandId: stimulus.commandId,
          outcome: CommandOutcome.Committed,
        },
      );
    }

    const expectedFailure = {
      budget: WorkflowChainBudgetKind.TerminalResultEnvelopeBytes,
      configuredBound: terminalLimit,
      observedValue: terminalLimit + 1,
      processInstanceId: fixture.start.instanceId,
      publicRevision: fixture.publicRevision,
      runOrdinal: 1,
    } as const;
    await assert.rejects(
      withDeadline(
        handle.result(),
        operationDeadlineMs,
        "Workflow terminal-envelope capacity failure",
      ),
      (error: unknown) => {
        const failure = applicationFailure(error);
        assert.equal(failure.type, bpmnWorkflowChainCapacityExhaustedFailureType);
        assert.equal(failure.nonRetryable, true);
        assert.deepEqual(failure.details, [expectedFailure]);
        assertNoPrivateCapacityData(failure.details);
        return true;
      },
    );

    const closing = requiredAt(
      fixture.completions,
      fixture.completions.length - 1,
      "terminal completions",
    );
    assert.deepEqual(
      await queryRecovery(handle, fixture.start.instanceId, closing),
      {
        ...recoveryRequest(fixture.start.instanceId, closing),
        kind: WorkflowChainCommandRecoveryResponseKind.Resolved,
        outcome: CommandOutcome.Committed,
      },
    );
    const conflicting = {
      ...closing,
      submittedValues: [{
        name: "route",
        value: { kind: VariableValueKind.String, value: "repeat" },
      }],
    } as const;
    assert.deepEqual(
      await queryRecovery(handle, fixture.start.instanceId, conflicting),
      {
        ...recoveryRequest(fixture.start.instanceId, conflicting),
        kind: WorkflowChainCommandRecoveryResponseKind.IdentityConflict,
      },
    );
    const unseen = completion(
      fixture.start.instanceId,
      fixture.completions.length + 1,
      "terminal-envelope-unseen",
      "exit",
    );
    assert.deepEqual(
      await queryRecovery(handle, fixture.start.instanceId, unseen),
      {
        ...recoveryRequest(fixture.start.instanceId, unseen),
        kind: WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry,
        receipt: fixture.receipt,
      },
    );

    const executions = [];
    for await (const execution of environment.client.workflow.list()) {
      if (execution.workflowId === workflowId) {
        executions.push(execution);
      }
    }
    assert.equal(executions.length, 1);
    const history = await handle.fetchHistory();
    const typedHistory = history as TemporalHistory;
    assert.equal(
      historyEvents(typedHistory, "workflowExecutionFailedEventAttributes").length,
      1,
    );
    assert.equal(
      historyEvents(
        typedHistory,
        "workflowExecutionContinuedAsNewEventAttributes",
      ).length,
      0,
    );
    await replayBpmnHistory(bundle, history, workflowId);
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

type TerminalCapacityFixture = ReturnType<typeof buildTerminalFixture>;

function exactOversizedTerminalFixture(
  baseScenario: Scenario,
  baseProgram: SemanticProcessProgram,
): TerminalCapacityFixture {
  const preliminary = buildTerminalFixture(baseScenario, baseProgram, 76 * 1_024);
  const remaining = terminalLimit + 1 - preliminary.envelopeBytes;
  assert.ok(remaining > 0, "preliminary terminal envelope must fit production");
  const fixture = buildTerminalFixture(
    baseScenario,
    baseProgram,
    76 * 1_024 + remaining,
  );
  assert.equal(fixture.envelopeBytes, terminalLimit + 1);
  return fixture;
}

function buildTerminalFixture(
  baseScenario: Scenario,
  baseProgram: SemanticProcessProgram,
  sourcePayloadLength: number,
) {
  const baseStart = requiredStart(baseScenario);
  const sourceId = `${baseProgram.identity.sourceId}-terminal-${"s".repeat(
    sourcePayloadLength,
  )}`;
  const instanceId = `${baseStart.instanceId}-terminal-envelope`;
  const start = {
    ...baseStart,
    commandId: "terminal-envelope-start",
    instanceId,
  };
  const completionCount = 16;
  const completions = Array.from({ length: completionCount }, (_, index) =>
    completion(
      instanceId,
      index + 1,
      `terminal-envelope-${index + 1}-${"c".repeat(5_800)}`,
      index + 1 === completionCount ? "exit" : "repeat",
    )
  );
  const program = {
    ...baseProgram,
    identity: { ...baseProgram.identity, sourceId },
  } as SemanticProcessProgram;
  const scenario = {
    ...baseScenario,
    bpmn: { ...baseScenario.bpmn, id: sourceId },
    stimuli: [start, ...completions],
  } as Scenario;
  const outcome = runScenario(scenario, program);
  assert.deepEqual(outcome.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  });
  const finalState = outcome.trace.at(-1);
  assert.equal(finalState?.kind, CanonicalObservationKind.State);
  assert.equal((finalState as StateObservation).status, ProcessStatus.Completed);

  const entries: WorkflowChainRecoveryEntry[] = completions.map((stimulus) => ({
    commandId: stimulus.commandId,
    stimulusSha256: workflowCommandStimulusSha256(stimulus),
    outcome: CommandOutcome.Committed,
  }));
  const receipt = {
    format: processTerminalReceiptFormatV1,
    definition: program.identity,
    processId: program.processId,
    processInstanceId: instanceId,
    finalState: finalState as StateObservation & { status: ProcessStatus.Completed },
  } as const;
  const envelope = {
    format: workflowTerminalResultFormatV1,
    receipt,
    entries,
  } as const;
  const executed = executeStimuli(program, [start, ...completions]);
  assert.deepEqual(executed.finalObservation, receipt.finalState);
  return {
    program,
    scenario,
    start,
    completions,
    entries,
    receipt,
    runtimeState: executed.state,
    publicRevision: executed.publicRevision,
    maximumPublicationBatchBytes: executed.maximumPublicationBatchBytes,
    envelopeBytes: workflowChainCanonicalUtf8ByteLength(envelope),
  };
}

function executeStimuli(
  program: SemanticProcessProgram,
  stimuli: ReadonlyArray<Stimulus>,
) {
  let state = initialState;
  let maximumPublicationBatchBytes = 0;
  let publication = createCommandPublicationState(
    program,
    requiredStartFromStimuli(stimuli).instanceId,
  );
  let finalObservation: StateObservation | undefined;
  for (const stimulus of stimuli) {
    const step = advanceScenario(program, state, stimulus);
    assert.equal(step.kind, ScenarioStepKind.Committed);
    if (step.kind !== ScenarioStepKind.Committed) {
      assert.fail("terminal-capacity stimulus did not commit");
    }
    state = step.state;
    publication = recordCommandPublicationOutcome(
      integrateCommandPublication(
        program,
        publication,
        stimulus,
        step,
        () => 1_700_000_000_000,
      ),
      stimulus,
      step.observations,
    );
    maximumPublicationBatchBytes = Math.max(
      maximumPublicationBatchBytes,
      workflowChainCanonicalUtf8ByteLength({
        execution: publication.execution.batches.at(-1),
        flowNodeOccurrences: publication.flowNodeOccurrences.batches.at(-1),
      }),
    );
    const observed = step.observations.findLast(
      (candidate): candidate is StateObservation =>
        candidate.kind === CanonicalObservationKind.State,
    );
    if (observed !== undefined) {
      finalObservation = observed;
    }
  }
  assert.ok(finalObservation !== undefined);
  return {
    state,
    finalObservation,
    publicRevision: publication.execution.headRevision,
    maximumPublicationBatchBytes,
  };
}

function assertFixtureBudgets(fixture: TerminalCapacityFixture): void {
  assert.ok(
    workflowChainCanonicalUtf8ByteLength(fixture.program) <=
      workflowChainProductionLimit(WorkflowChainBudgetKind.SemanticProcessProgramBytes),
  );
  assert.ok(
    workflowChainCanonicalUtf8ByteLength(fixture.start) <=
      workflowChainProductionLimit(WorkflowChainBudgetKind.InitialStartStimulusBytes),
  );
  for (const stimulus of fixture.completions) {
    assert.ok(
      workflowChainCanonicalUtf8ByteLength(stimulus) <=
        workflowChainProductionLimit(WorkflowChainBudgetKind.SemanticStimulusBytes),
    );
  }
  assert.ok(
    workflowChainCanonicalUtf8ByteLength(fixture.runtimeState) <=
      workflowChainProductionLimit(WorkflowChainBudgetKind.CommittedRuntimeStateBytes),
  );
  assert.ok(
    fixture.maximumPublicationBatchBytes <=
      workflowChainProductionLimit(WorkflowChainBudgetKind.PublicationBatchBytes),
    `paired publication batch is ${fixture.maximumPublicationBatchBytes} bytes`,
  );
  assert.ok(
    workflowChainCanonicalUtf8ByteLength(fixture.entries) <=
      workflowChainProductionLimit(WorkflowChainBudgetKind.CommandRecoveryLedgerBytes),
  );
  assert.ok(
    workflowChainCanonicalUtf8ByteLength(fixture.receipt) <= terminalLimit,
  );
  assert.equal(fixture.envelopeBytes, terminalLimit + 1);
}

function requiredStart(scenario: Scenario): StartProcessStimulus {
  const stimulus = requiredAt(scenario.stimuli, 0, "cycle stimuli");
  if (stimulus.kind !== StimulusKind.StartProcess) {
    throw new TypeError("cycle scenario has no Process start");
  }
  return stimulus;
}

function requiredStartFromStimuli(
  stimuli: ReadonlyArray<Stimulus>,
): StartProcessStimulus {
  const stimulus = requiredAt(stimuli, 0, "terminal-capacity stimuli");
  if (stimulus.kind !== StimulusKind.StartProcess) {
    throw new TypeError("terminal-capacity fixture has no Process start");
  }
  return stimulus;
}

function completion(
  processInstanceId: string,
  activation: number,
  commandId: string,
  route: "repeat" | "rework" | "exit",
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: {
      processInstanceId,
      elementId: "Review",
      activation,
    },
    submittedValues: [{
      name: "route",
      value: { kind: VariableValueKind.String, value: route },
    }],
  };
}

function recoveryRequest(
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
) {
  return {
    protocol: bpmnWorkflowChainProtocolV1,
    processInstanceId,
    commandId: stimulus.commandId,
    stimulusSha256: workflowCommandStimulusSha256(stimulus),
  } as const;
}

async function queryRecovery(
  handle: ReturnType<typeof getTestProcessHandle>,
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
) {
  return handle.query(
    bpmnWorkflowChainCommandRecoveryQueryName,
    recoveryRequest(processInstanceId, stimulus),
  );
}

function applicationFailure(error: unknown): ApplicationFailure {
  let current = error;
  while (current instanceof Error) {
    if (current instanceof ApplicationFailure) {
      return current;
    }
    current = current.cause;
  }
  throw new TypeError("Workflow failure has no ApplicationFailure cause");
}

function assertNoPrivateCapacityData(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoPrivateCapacityData(item);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    assert.equal(
      ["runId", "firstExecutionRunId", "program", "state", "command"].includes(key),
      false,
      `capacity data exposed ${key}`,
    );
    assertNoPrivateCapacityData(item);
  }
}
