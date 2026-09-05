import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ProcessStatus,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import { ApplicationFailure } from "@temporalio/workflow";
import {
  BpmnWorkflowChainCapacityExhausted,
  ExecutionPublicationResultKind,
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  bpmnExecutionPublicationQueryName,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  bpmnWorkflowChainCommandRecoveryQueryName,
  bpmnWorkflowChainProtocolV1,
  bpmnWorkflowContinuationV1,
  createCachedLocalEnvironment,
  createCommandPublicationState,
  getTestProcessHandle,
  integrateCommandPublication,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  recordCommandPublicationOutcome,
  requireExecutionPublicationTransportResult,
  submitUserTaskCompletion,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
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
const initialHost = {
  protocol: bpmnWorkflowContinuationV1,
  kind: "initial",
  eventHistoryEventLimit: 4,
  eventHistoryByteLimit: workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryBytes,
  ),
} as const;

test("outgoing continuation capacity survives failed-Run replay without a semantic terminal receipt", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const fixture = outgoingCapacityFixture(scenario, semanticProcess);
  const { start, program, completion, publication } = fixture;
  const workflowId = processWorkflowId(start.instanceId);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-outgoing-capacity",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "outgoing-capacity Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-outgoing-capacity-before-failure",
    );
    const firstHandle = await environment.client.workflow.start(
      bpmnProcessWorkflowType,
      {
        args: [start, program, initialHost],
        taskQueue: bpmnSemanticTaskQueue,
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      },
    );
    const handle = getTestProcessHandle(environment.client.workflow, start.instanceId);
    const tasks = await waitForOpenUserTaskIds(handle, [completion.taskId.elementId]);
    assert.deepEqual(tasks.map(({ id }) => id), [completion.taskId]);
    assert.deepEqual(
      await submitUserTaskCompletion(environment.client.workflow, start.instanceId, completion),
      { kind: "semantic", commandId: completion.commandId, outcome: CommandOutcome.Committed },
    );

    const expectedFailure = {
      budget: WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes,
      configuredBound: workflowChainProductionLimit(
        WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes,
      ),
      observedValue: outgoingHostBytes(fixture, firstHandle.firstExecutionRunId),
      processInstanceId: start.instanceId,
      publicRevision: publication.execution.headRevision,
      runOrdinal: 1,
    } as const;
    assert.ok(expectedFailure.observedValue > expectedFailure.configuredBound);
    await assert.rejects(
      withDeadline(handle.result(), operationDeadlineMs, "outgoing continuation capacity failure"),
      (error: unknown) => {
        const failure = applicationFailure(error);
        assert.equal(failure.type, bpmnWorkflowChainCapacityExhaustedFailureType);
        assert.equal(failure.nonRetryable, true);
        assert.deepEqual(failure.details, [expectedFailure]);
        return true;
      },
    );

    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-outgoing-capacity-after-failure",
    );
    await assertRetainedRecovery(environment.client.workflow, fixture, expectedFailure);

    const raw = await withDeadline(
      handle.query(bpmnExecutionPublicationQueryName, { afterRevision: 0 }),
      operationDeadlineMs,
      "failed-Run committed execution publication",
    );
    const observed = requireExecutionPublicationTransportResult(raw, {
      definition: program.identity,
      processId: program.processId,
      processInstanceId: start.instanceId,
      afterRevision: 0,
    });
    assert.equal(observed.kind, ExecutionPublicationResultKind.Available);
    if (observed.kind !== ExecutionPublicationResultKind.Available) {
      assert.fail("failed Run lost its committed publication");
    }
    assert.equal(observed.page.headRevision, publication.execution.headRevision);
    assert.deepEqual(observed.page.current, publication.execution.current);
    assert.equal(observed.page.current?.state.status, ProcessStatus.Running);

    const executions = [];
    for await (const execution of environment.client.workflow.list()) {
      if (execution.workflowId === workflowId) executions.push(execution);
    }
    assert.equal(executions.length, 1);
    const history = await handle.fetchHistory();
    const typedHistory = history as TemporalHistory;
    assert.equal(historyEvents(typedHistory, "workflowExecutionFailedEventAttributes").length, 1);
    assert.equal(historyEvents(typedHistory, "workflowExecutionCompletedEventAttributes").length, 0);
    assert.equal(historyEvents(typedHistory, "workflowExecutionContinuedAsNewEventAttributes").length, 0);
    await replayBpmnHistory(bundle, history, workflowId);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

type OutgoingCapacityFixture = ReturnType<typeof outgoingCapacityFixture>;

function outgoingCapacityFixture(scenario: Scenario, baseProgram: SemanticProcessProgram) {
  const baseStart = requiredAt(scenario.stimuli, 0, "cycle stimuli");
  const baseCompletion = requiredAt(scenario.stimuli, 1, "cycle stimuli");
  if (baseStart.kind !== StimulusKind.StartProcess ||
    baseCompletion.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError("cycle fixture requires a start and User Task completion");
  }
  const program: SemanticProcessProgram = {
    ...baseProgram,
    identity: { ...baseProgram.identity, sourceId: `${baseProgram.identity.sourceId}-${"s".repeat(70 * 1_024)}` },
  };
  const start: StartProcessStimulus = {
    ...baseStart,
    commandId: "outgoing-capacity-start",
    instanceId: `${baseStart.instanceId}-outgoing-capacity`,
  };
  const completion: CompleteUserTaskInstanceStimulus = {
    ...baseCompletion,
    commandId: "outgoing-capacity-repeat",
    taskId: { ...baseCompletion.taskId, processInstanceId: start.instanceId },
  };
  assertWithinBudget(program, WorkflowChainBudgetKind.SemanticProcessProgramBytes);
  assertWithinBudget(start, WorkflowChainBudgetKind.InitialStartStimulusBytes);
  assertWithinBudget(initialHost, WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes);
  assertWithinBudget(completion, WorkflowChainBudgetKind.SemanticStimulusBytes);
  let state = initialState;
  let publication = createCommandPublicationState(program, start.instanceId);
  for (const stimulus of [start, completion]) {
    const step = advanceScenario(program, state, stimulus);
    assert.equal(step.kind, ScenarioStepKind.Committed);
    if (step.kind !== ScenarioStepKind.Committed) {
      assert.fail("outgoing-capacity fixture must commit each core step");
    }
    state = step.state;
    publication = recordCommandPublicationOutcome(
      integrateCommandPublication(program, publication, stimulus, step, () => 1_700_000_000_000),
      stimulus,
      step.observations,
    );
    assertWithinBudget(state, WorkflowChainBudgetKind.CommittedRuntimeStateBytes);
    assertWithinBudget({
      execution: publication.execution.batches.at(-1),
      flowNodeOccurrences: publication.flowNodeOccurrences.batches.at(-1),
    }, WorkflowChainBudgetKind.PublicationBatchBytes);
  }
  assert.equal(publication.execution.headRevision, 8);
  assert.equal(publication.execution.current?.state.status, ProcessStatus.Running);
  return { program, start, completion, publication };
}

function outgoingHostBytes(fixture: OutgoingCapacityFixture, firstExecutionRunId: string): number {
  assert.notEqual(firstExecutionRunId, "");
  // The lifecycle contract binds these transported fields; a SHA-256 hex digest has fixed encoded length.
  const host = {
    protocol: bpmnWorkflowContinuationV1,
    kind: "continuation",
    eventHistoryEventLimit: initialHost.eventHistoryEventLimit,
    eventHistoryByteLimit: initialHost.eventHistoryByteLimit,
    runOrdinal: 2,
    firstExecutionRunId,
    definition: fixture.program.identity,
    processId: fixture.program.processId,
    processInstanceId: fixture.start.instanceId,
    startCommandId: fixture.start.commandId,
    publicationSegmentDirectorySha256: "0".repeat(64),
    completedMessageDeliveryRecords: [],
  };
  return workflowChainCanonicalUtf8ByteLength(host);
}

async function assertRetainedRecovery(
  client: Parameters<typeof submitUserTaskCompletion>[0],
  fixture: OutgoingCapacityFixture,
  failure: WorkflowChainCapacityFailureDetails,
): Promise<void> {
  const { start, completion } = fixture;
  const handle = getTestProcessHandle(client, start.instanceId);
  const conflicting = {
    ...completion,
    submittedValues: [{ name: "route", value: { kind: VariableValueKind.String, value: "exit" } }],
  } as const;
  const unseen = {
    ...completion,
    commandId: "outgoing-capacity-unseen",
    taskId: { ...completion.taskId, activation: completion.taskId.activation + 1 },
  };
  for (const [stimulus, expected] of [
    [completion, { kind: WorkflowChainCommandRecoveryResponseKind.Resolved, outcome: CommandOutcome.Committed }],
    [conflicting, { kind: WorkflowChainCommandRecoveryResponseKind.IdentityConflict }],
    [unseen, { kind: WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry, failure }],
  ] as const) {
    const request = recoveryRequest(start.instanceId, stimulus);
    assert.deepEqual(
      await withDeadline(
        handle.query(bpmnWorkflowChainCommandRecoveryQueryName, request),
        operationDeadlineMs,
        `failed-Run recovery ${expected.kind}`,
      ),
      { ...request, ...expected },
    );
  }
  assert.deepEqual(
    await submitUserTaskCompletion(client, start.instanceId, completion),
    { kind: "semantic", commandId: completion.commandId, outcome: CommandOutcome.Committed },
  );
  await assert.rejects(
    submitUserTaskCompletion(client, start.instanceId, conflicting),
    { name: "BpmnCommandIdentityConflict" },
  );
  await assert.rejects(
    submitUserTaskCompletion(client, start.instanceId, unseen),
    (error: unknown) => {
      assert.ok(error instanceof BpmnWorkflowChainCapacityExhausted);
      assert.deepEqual(error.details, failure);
      return true;
    },
  );
}

function recoveryRequest(processInstanceId: string, stimulus: CompleteUserTaskInstanceStimulus) {
  return {
    protocol: bpmnWorkflowChainProtocolV1,
    processInstanceId,
    commandId: stimulus.commandId,
    stimulusSha256: workflowCommandStimulusSha256(stimulus),
  } as const;
}

function assertWithinBudget(value: unknown, budget: WorkflowChainBudgetKind): void {
  const bytes = workflowChainCanonicalUtf8ByteLength(value);
  assert.ok(bytes <= workflowChainProductionLimit(budget), `${budget} unexpectedly uses ${bytes} bytes`);
}

function applicationFailure(error: unknown): ApplicationFailure {
  let current = error;
  while (current instanceof Error) {
    if (current instanceof ApplicationFailure) return current;
    current = current.cause;
  }
  throw new TypeError("Workflow failure has no ApplicationFailure cause");
}
