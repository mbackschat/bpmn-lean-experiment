import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  StartProcessStimulus,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import { ApplicationFailure } from "@temporalio/workflow";
import {
  BpmnProcessStartResultKind,
  BpmnWorkflowChainCapacityExhausted,
  ExecutionPublicationResultKind,
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  bpmnSemanticTaskQueue,
  bpmnExecutionPublicationQueryName,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  bpmnWorkflowChainCommandRecoveryQueryName,
  bpmnWorkflowChainProtocolV1,
  createCachedLocalEnvironment,
  createCommandPublicationState,
  getTestProcessHandle,
  loadBpmnWorkflowBundle,
  integrateCommandPublication,
  processWorkflowId,
  recordCommandPublicationOutcome,
  requireExecutionPublicationTransportResult,
  startBpmnProcess,
  submitUserTaskCompletion,
  workflowChainProductionLimit,
  workflowChainCanonicalUtf8ByteLength,
  workflowCommandStimulusSha256,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalHistory,
  WorkflowChainCapacityFailureDetails,
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
const recoveryEntryLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
);

test("a ledger-filling command resolves before the retained Run reports capacity", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const start = requiredStart(scenario);
  const workflowId = processWorkflowId(start.instanceId);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-recovery-capacity",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Workflow recovery-capacity Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-recovery-capacity",
    );
    const started = await startBpmnProcess(
      environment.client.workflow,
      start,
      semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    );
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      assert.fail(`capacity Workflow start was rejected: ${started.failure.code}`);
    }
    const handle = getTestProcessHandle(
      environment.client.workflow,
      started.processInstanceId,
    );
    await waitForOpenUserTaskIds(handle, ["Review"]);

    let fillingCommand = completion(start.instanceId, recoveryEntryLimit);
    for (let activation = 1; activation <= recoveryEntryLimit; activation += 1) {
      const stimulus = completion(start.instanceId, activation);
      const result = await submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        stimulus,
      );
      assert.deepEqual(result, {
        kind: "semantic",
        commandId: stimulus.commandId,
        outcome: CommandOutcome.Committed,
      });
      fillingCommand = stimulus;
    }

    const expectedFailure = {
      budget: WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
      configuredBound: recoveryEntryLimit,
      observedValue: recoveryEntryLimit,
      processInstanceId: start.instanceId,
      publicRevision: 4 + 4 * recoveryEntryLimit,
      runOrdinal: 2,
    } as const;
    await assert.rejects(
      withDeadline(
        handle.result(),
        operationDeadlineMs,
        "Workflow recovery-capacity failure",
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

    assert.deepEqual(
      await queryRecovery(handle, start.instanceId, fillingCommand),
      {
        ...recoveryRequest(start.instanceId, fillingCommand),
        kind: WorkflowChainCommandRecoveryResponseKind.Resolved,
        outcome: CommandOutcome.Committed,
      },
    );
    const conflicting = {
      ...fillingCommand,
      submittedValues: [{
        name: "route",
        value: { kind: VariableValueKind.String, value: "rework" },
      }],
    } as const;
    assert.deepEqual(
      await queryRecovery(handle, start.instanceId, conflicting),
      {
        ...recoveryRequest(start.instanceId, conflicting),
        kind: WorkflowChainCommandRecoveryResponseKind.IdentityConflict,
      },
    );
    const unseen = completion(start.instanceId, recoveryEntryLimit + 1);
    const capacityResponse = await queryRecovery(handle, start.instanceId, unseen);
    assert.deepEqual(capacityResponse, {
      ...recoveryRequest(start.instanceId, unseen),
      kind: WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry,
      failure: expectedFailure,
    });
    assertNoPrivateCapacityData(capacityResponse);
    await assert.rejects(
      submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        unseen,
      ),
      (error: unknown) => {
        assert.equal(error instanceof BpmnWorkflowChainCapacityExhausted, true);
        assert.deepEqual(
          (error as BpmnWorkflowChainCapacityExhausted).details,
          expectedFailure,
        );
        return true;
      },
    );

    const executions = [];
    for await (const execution of environment.client.workflow.list()) {
      if (execution.workflowId === workflowId) {
        executions.push(execution);
      }
    }
    assert.equal(executions.length, 2);
    let failures = 0;
    let continuations = 0;
    for (const execution of executions) {
      const history = await environment.client.workflow
        .getHandle(workflowId, execution.runId)
        .fetchHistory();
      const typedHistory = history as TemporalHistory;
      failures += historyEvents(
        typedHistory,
        "workflowExecutionFailedEventAttributes",
      ).length;
      continuations += historyEvents(
        typedHistory,
        "workflowExecutionContinuedAsNewEventAttributes",
      ).length;
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.equal(failures, 1);
    assert.equal(continuations, 1);
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

test("state and paired-publication capacity fail before a speculative start is visible", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const baseStart = requiredStart(scenario);
  const publicationLimit = workflowChainProductionLimit(
    WorkflowChainBudgetKind.PublicationBatchBytes,
  );
  const stateLimit = workflowChainProductionLimit(
    WorkflowChainBudgetKind.CommittedRuntimeStateBytes,
  );
  const exactPublication = boundaryStart(
    baseStart,
    semanticProcess,
    `${baseStart.instanceId}-pub0`,
    WorkflowChainBudgetKind.PublicationBatchBytes,
    0,
  );
  const oversizedPublication = boundaryStart(
    baseStart,
    semanticProcess,
    `${baseStart.instanceId}-pub1`,
    WorkflowChainBudgetKind.PublicationBatchBytes,
    1,
  );
  const oversizedState = boundaryStart(
    baseStart,
    semanticProcess,
    `${baseStart.instanceId}-stat`,
    WorkflowChainBudgetKind.CommittedRuntimeStateBytes,
    1,
  );
  assert.equal(candidateMeasurements(exactPublication, semanticProcess).batchBytes, publicationLimit);
  assert.equal(candidateMeasurements(oversizedPublication, semanticProcess).batchBytes, publicationLimit + 1);
  assert.equal(candidateMeasurements(oversizedState, semanticProcess).stateBytes, stateLimit + 1);

  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-semantic-candidate-capacity",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "semantic-candidate capacity Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-semantic-candidate-capacity",
    );
    const exactHandle = await startCapacityCandidate(
      environment.client.workflow,
      exactPublication,
      semanticProcess,
    );
    await waitForOpenUserTaskIds(exactHandle, ["Review"]);
    const exactPage = await queryExecution(exactHandle, semanticProcess, exactPublication);
    assert.equal(exactPage.kind, ExecutionPublicationResultKind.Available);
    if (exactPage.kind !== ExecutionPublicationResultKind.Available) {
      assert.fail("exact publication boundary did not publish");
    }
    assert.ok(exactPage.page.headRevision > 0);
    await exactHandle.terminate("exact publication-capacity boundary observed");

    await assertCandidateCapacity(
      environment.client.workflow,
      bundle,
      semanticProcess,
      oversizedPublication,
      {
        budget: WorkflowChainBudgetKind.PublicationBatchBytes,
        configuredBound: publicationLimit,
        observedValue: publicationLimit + 1,
      },
    );
    const stateMeasurement = candidateMeasurements(oversizedState, semanticProcess);
    await assertCandidateCapacity(
      environment.client.workflow,
      bundle,
      semanticProcess,
      oversizedState,
      {
        budget: WorkflowChainBudgetKind.CommittedRuntimeStateBytes,
        configuredBound: stateLimit,
        observedValue: stateMeasurement.stateBytes,
      },
    );
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

function requiredStart(scenario: Scenario) {
  const stimulus = requiredAt(scenario.stimuli, 0, "cycle stimuli");
  if (stimulus.kind !== StimulusKind.StartProcess) {
    throw new TypeError("cycle scenario has no Process start");
  }
  return stimulus;
}

function boundaryStart(
  base: StartProcessStimulus,
  program: SemanticProcessProgram,
  instanceId: string,
  budget:
    | WorkflowChainBudgetKind.CommittedRuntimeStateBytes
    | WorkflowChainBudgetKind.PublicationBatchBytes,
  offset: 0 | 1,
): StartProcessStimulus {
  const bound = workflowChainProductionLimit(budget);
  let lower = 0;
  let upper = bound;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    const candidate = startWithPayload(base, instanceId, middle);
    const measured = candidateMeasurement(candidate, program, budget);
    if (measured <= bound) {
      lower = middle;
    } else {
      upper = middle - 1;
    }
  }
  const result = startWithPayload(base, instanceId, lower + offset);
  assert.equal(candidateMeasurement(result, program, budget), bound + offset);
  assert.ok(
    workflowChainCanonicalUtf8ByteLength(result) <= workflowChainProductionLimit(
      WorkflowChainBudgetKind.InitialStartStimulusBytes,
    ),
  );
  return result;
}

function startWithPayload(
  base: StartProcessStimulus,
  instanceId: string,
  payloadLength: number,
): StartProcessStimulus {
  return {
    ...base,
    commandId: `start-${instanceId}`,
    instanceId,
    initialVariables: [{
      name: "payload",
      value: {
        kind: VariableValueKind.String,
        value: "x".repeat(payloadLength),
      },
    }],
  };
}

function candidateMeasurement(
  start: StartProcessStimulus,
  program: SemanticProcessProgram,
  budget:
    | WorkflowChainBudgetKind.CommittedRuntimeStateBytes
    | WorkflowChainBudgetKind.PublicationBatchBytes,
): number {
  const measured = candidateMeasurements(start, program);
  switch (budget) {
    case WorkflowChainBudgetKind.CommittedRuntimeStateBytes:
      return measured.stateBytes;
    case WorkflowChainBudgetKind.PublicationBatchBytes:
      return measured.batchBytes;
    default:
      return assertNever(budget);
  }
}

function candidateMeasurements(
  start: StartProcessStimulus,
  program: SemanticProcessProgram,
) {
  const step = advanceScenario(program, initialState, start);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) {
    assert.fail("capacity Start did not reach a committed stable state");
  }
  const before = createCommandPublicationState(program, start.instanceId);
  const publication = recordCommandPublicationOutcome(
    integrateCommandPublication(
      program,
      before,
      start,
      step,
      () => 1_700_000_000_000,
    ),
    start,
    step.observations,
  );
  return {
    stateBytes: workflowChainCanonicalUtf8ByteLength(step.state),
    batchBytes: workflowChainCanonicalUtf8ByteLength({
      execution: publication.execution.batches.at(-1),
      flowNodeOccurrences: publication.flowNodeOccurrences.batches.at(-1),
    }),
  };
}

async function startCapacityCandidate(
  client: Parameters<typeof startBpmnProcess>[0],
  start: StartProcessStimulus,
  program: SemanticProcessProgram,
) {
  const started = await startBpmnProcess(
    client,
    start,
    program,
    { taskQueue: bpmnSemanticTaskQueue },
  );
  if (started.kind !== BpmnProcessStartResultKind.Started) {
    assert.fail(`capacity Workflow start was rejected: ${started.failure.code}`);
  }
  return getTestProcessHandle(client, started.processInstanceId);
}

async function queryExecution(
  handle: ReturnType<typeof getTestProcessHandle>,
  program: SemanticProcessProgram,
  start: StartProcessStimulus,
) {
  const request = { afterRevision: 0 } as const;
  const raw = await withDeadline(
    handle.query(bpmnExecutionPublicationQueryName, request),
    operationDeadlineMs,
    "capacity execution-publication Query",
  );
  return requireExecutionPublicationTransportResult(raw, {
    definition: program.identity,
    processId: program.processId,
    processInstanceId: start.instanceId,
    afterRevision: request.afterRevision,
  });
}

async function assertCandidateCapacity(
  client: Parameters<typeof startBpmnProcess>[0],
  bundle: Awaited<ReturnType<typeof loadBpmnWorkflowBundle>>,
  program: SemanticProcessProgram,
  start: StartProcessStimulus,
  expected: Readonly<{
    budget:
      | WorkflowChainBudgetKind.CommittedRuntimeStateBytes
      | WorkflowChainBudgetKind.PublicationBatchBytes;
    configuredBound: number;
    observedValue: number;
  }>,
): Promise<void> {
  const handle = await startCapacityCandidate(client, start, program);
  const expectedFailure = {
    ...expected,
    processInstanceId: start.instanceId,
    publicRevision: 0,
    runOrdinal: 1,
  } as const;
  await assert.rejects(
    withDeadline(
      handle.result(),
      operationDeadlineMs,
      `${expected.budget} Workflow failure`,
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
  assert.deepEqual(
    await queryExecution(handle, program, start),
    { kind: ExecutionPublicationResultKind.NotReady },
  );
  const history = await handle.fetchHistory();
  const typedHistory = history as TemporalHistory;
  assert.equal(
    historyEvents(typedHistory, "workflowExecutionFailedEventAttributes").length,
    1,
  );
  await replayBpmnHistory(bundle, history, processWorkflowId(start.instanceId));
}

function completion(
  processInstanceId: string,
  activation: number,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `capacity-${activation}`,
    taskId: {
      processInstanceId,
      elementId: "Review",
      activation,
    },
    submittedValues: [{
      name: "route",
      value: { kind: VariableValueKind.String, value: "repeat" },
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

function assertNever(value: never): never {
  throw new TypeError(`Unsupported capacity witness variant: ${String(value)}`);
}
