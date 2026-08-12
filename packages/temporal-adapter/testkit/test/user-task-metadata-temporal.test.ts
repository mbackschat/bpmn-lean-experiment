/** Durable User Task metadata, replacement, mutation, and replay evidence. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  UserTaskLifecycleState,
  applyStimulus,
  initialState,
  projectOpenUserTasks,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  ScenarioResult,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";

import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  asArray,
  asRecord,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  decodeJsonPayload,
  durableUpdateOutcomes,
  historyEvents,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  readBpmnProcessTrace,
  reconcileHarnessTraceEvidence,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

import {
  expectedUserTaskMetadata,
  loadUserTaskMetadataFixture,
  loadUserTaskMetadataSourceVariation,
  sourceVariationUserTaskMetadata,
  withMetadataExecutionIdentity,
} from "./user-task-metadata-fixture.ts";
import type {
  MetadataFreeControlFixture,
  UserTaskMetadataFixture,
} from "./user-task-metadata-fixture.ts";
import {
  acceptedCompletionOrder,
  assertNoNonUpdateBpmnHostEvents,
  assertUpdatesCompleteBeforeWorkflow,
} from "./temporal-history-facts.ts";
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
import {
  reconcileOpenTaskMetadataEvidence,
  runUserTaskMetadataQueryMutation,
} from "./user-task-metadata-query-mutation.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const operationDeadlineMs = 10_000;
const identity = "bpmn-lean-user-task-metadata";

test("User Task metadata survives Worker replacement and replay", async () => {
  const fixture = await loadUserTaskMetadataFixture();
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "User Task metadata Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    worker = await startBpmnTestWorker(environment, bundle, identity);
    const started = await startMetadataProcess(environment, fixture);

    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      `${identity}-replacement`,
    );
    assert.deepEqual(
      await waitForOpenUserTaskIds(
        started.handle,
        [fixture.completion.taskId.elementId],
      ),
      exactOpenTask(fixture.completion),
    );

    const metadataEvidence = await completeMetadataProcess(
      environment,
      fixture,
      started.handle,
    );
    const oldEvidence = await runMetadataFreeControl(
      environment,
      fixture.metadataFreeControl,
    );
    await assertQueryMutationDiscriminator(environment, fixture);
    const sourceVariationEvidence = await runSourceVariationControl(
      environment,
      fixture,
    );

    await stopBpmnTestWorker(worker);
    worker = undefined;
    await replayBpmnHistory(
      bundle,
      metadataEvidence.replayHistory,
      started.handle.workflowId,
    );
    await replayBpmnHistory(
      bundle,
      oldEvidence.replayHistory,
      oldEvidence.workflowId,
    );
    await replayBpmnHistory(
      bundle,
      sourceVariationEvidence.replayHistory,
      sourceVariationEvidence.workflowId,
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
        "User Task metadata Temporal environment teardown",
      );
    }
  }
});

async function startMetadataProcess(
  environment: TestWorkflowEnvironment,
  fixture: UserTaskMetadataFixture,
) {
  const started = await withDeadline(
    startBpmnProcess(
      environment.client.workflow,
      fixture.start,
      fixture.semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    ),
    operationDeadlineMs,
    "User Task metadata Workflow start",
  );
  assert.equal(started.kind, BpmnProcessStartResultKind.Started);
  if (started.kind !== BpmnProcessStartResultKind.Started) {
    throw new TypeError("User Task metadata Workflow was rejected");
  }
  assert.deepEqual(
    await waitForOpenUserTaskIds(
      started.handle,
      [fixture.completion.taskId.elementId],
    ),
    exactOpenTask(fixture.completion),
  );
  assert.deepEqual(
    await readBpmnProcessTrace(
      environment.client.workflow,
      fixture.start.instanceId,
    ),
    fixture.expected.trace.slice(0, 3),
  );
  return { handle: started.handle };
}

async function completeMetadataProcess(
  environment: TestWorkflowEnvironment,
  fixture: UserTaskMetadataFixture,
  handle: WorkflowHandle,
): Promise<Readonly<{
  replayHistory: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>;
}>> {
  const commandResult = await submitUserTaskCompletion(
    environment.client.workflow,
    fixture.start.instanceId,
    fixture.completion,
  );
  assert.deepEqual(commandResult, {
    kind: ProcessCommandResultKind.Semantic,
    commandId: fixture.completion.commandId,
    outcome: CommandOutcome.Committed,
  });
  assert.equal(
    await handle.getUpdateHandle(
      contentBoundUpdateId(fixture.completion),
    ).result(),
    CommandOutcome.Committed,
  );
  const receipt = await withDeadline(
    handle.result(),
    operationDeadlineMs,
    "User Task metadata completed receipt",
  );
  assert.equal(isCompletedProcessReceipt(receipt), true);
  if (!isCompletedProcessReceipt(receipt)) {
    throw new TypeError("User Task metadata Workflow returned no receipt");
  }
  const trace = await readBpmnProcessTrace(
    environment.client.workflow,
    fixture.start.instanceId,
  );
  assert.deepEqual(trace, fixture.expected.trace);
  assert.deepEqual(receipt.finalState, expectedTerminal(fixture.expected));
  assert.deepEqual(receipt.finalState.openUserTasks, []);
  assert.equal(containsOwnKey(receipt.finalState, "metadata"), false);
  assert.deepEqual(
    receipt.finalState.variables.find(({ name }) => name === "approved"),
    { name: "approved", value: { kind: "boolean", value: true } },
  );

  const replayHistory = await handle.fetchHistory();
  const history = replayHistory as TemporalHistory;
  assertExactWorkflowStartHistory(
    history,
    fixture.start,
    fixture.semanticProcess,
  );
  assertExactAcceptedCompletion(history, fixture.completion);
  assert.deepEqual(
    durableUpdateOutcomes(history),
    new Map([[fixture.completion.commandId, CommandOutcome.Committed]]),
  );
  reconcileHarnessTraceEvidence(trace, receipt, history);
  assert.deepEqual(acceptedCompletionOrder(history), [
    fixture.completion.commandId,
  ]);
  assertUpdatesCompleteBeforeWorkflow(history, 1);
  assertNoNonUpdateBpmnHostEvents(history, "User Task metadata");
  return { replayHistory };
}

async function runMetadataFreeControl(
  environment: TestWorkflowEnvironment,
  fixture: MetadataFreeControlFixture,
): Promise<Readonly<{
  replayHistory: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>;
  workflowId: string;
}>> {
  const started = await startBpmnProcess(
    environment.client.workflow,
    fixture.start,
    fixture.semanticProcess,
    { taskQueue: bpmnSemanticTaskQueue },
  );
  assert.equal(started.kind, BpmnProcessStartResultKind.Started);
  if (started.kind !== BpmnProcessStartResultKind.Started) {
    throw new TypeError("metadata-free control Workflow was rejected");
  }
  const tasks = await waitForOpenUserTaskIds(
    started.handle,
    [fixture.completion.taskId.elementId],
  );
  assert.equal(Object.hasOwn(tasks[0] ?? {}, "metadata"), false);
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      fixture.start.instanceId,
      fixture.completion,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: fixture.completion.commandId,
      outcome: CommandOutcome.Committed,
    },
  );
  const receipt = await started.handle.result();
  assert.equal(isCompletedProcessReceipt(receipt), true);
  if (!isCompletedProcessReceipt(receipt)) {
    throw new TypeError("metadata-free control returned no receipt");
  }
  const trace = await readBpmnProcessTrace(
    environment.client.workflow,
    fixture.start.instanceId,
  );
  assert.deepEqual(trace, fixture.expected.trace);
  const replayHistory = await started.handle.fetchHistory();
  const history = replayHistory as TemporalHistory;
  assertExactWorkflowStartHistory(
    history,
    fixture.start,
    fixture.semanticProcess,
  );
  assert.equal(containsOwnKey(fixture.semanticProcess, "metadata"), false);
  reconcileHarnessTraceEvidence(trace, receipt, history);
  assertNoNonUpdateBpmnHostEvents(history, "metadata-free control");
  return { replayHistory, workflowId: started.handle.workflowId };
}

async function assertQueryMutationDiscriminator(
  environment: TestWorkflowEnvironment,
  fixture: UserTaskMetadataFixture,
): Promise<void> {
  const execution = withMetadataExecutionIdentity(
    fixture,
    "UserTaskMetadataMutation_1",
    "complete-user-task-metadata-query-mutation",
  );
  const evidence = await runUserTaskMetadataQueryMutation(
    environment,
    execution.start,
    fixture.semanticProcess,
    execution.completion,
  );
  assert.deepEqual(evidence.result, {
    kind: ProcessCommandResultKind.Semantic,
    commandId: execution.completion.commandId,
    outcome: CommandOutcome.Committed,
  });
  assert.equal(isCompletedProcessReceipt(evidence.receipt), true);
  assert.equal(evidence.replayed, true);
  reconcileHarnessTraceEvidence(
    evidence.trace,
    evidence.receipt,
    evidence.history,
  );
  assert.throws(
    () =>
      reconcileOpenTaskMetadataEvidence(
        evidence.openTasks,
        projectOpenUserTasks(
          applyStimulus(
            fixture.semanticProcess,
            initialState,
            execution.start,
          ).state,
        ),
      ),
    /Query open User Task metadata does not match committed semantic projection at metadata/u,
  );
  assert.equal(Object.hasOwn(evidence.openTasks[0] ?? {}, "metadata"), false);
  assertExactWorkflowStartHistory(
    evidence.history,
    execution.start,
    fixture.semanticProcess,
  );
  assertNoNonUpdateBpmnHostEvents(
    evidence.history,
    "User Task metadata Query mutation",
  );
}

async function runSourceVariationControl(
  environment: TestWorkflowEnvironment,
  fixture: UserTaskMetadataFixture,
): Promise<Readonly<{
  replayHistory: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>;
  workflowId: string;
}>> {
  const variation = await loadUserTaskMetadataSourceVariation(fixture);
  const execution = withMetadataExecutionIdentity(
    fixture,
    "UserTaskMetadataSourceVariation_1",
    "complete-user-task-metadata-source-variation",
  );
  assert.equal(execution.start.processId, fixture.start.processId);
  assert.equal(
    execution.completion.taskId.elementId,
    fixture.completion.taskId.elementId,
  );
  assert.deepEqual(
    execution.completion.submittedValues,
    fixture.completion.submittedValues,
  );
  assert.notDeepEqual(variation.metadata, expectedUserTaskMetadata);

  const started = await startBpmnProcess(
    environment.client.workflow,
    execution.start,
    variation.semanticProcess,
    { taskQueue: bpmnSemanticTaskQueue },
  );
  assert.equal(started.kind, BpmnProcessStartResultKind.Started);
  if (started.kind !== BpmnProcessStartResultKind.Started) {
    throw new TypeError("source-variation Workflow was rejected");
  }
  assert.deepEqual(
    await waitForOpenUserTaskIds(
      started.handle,
      [execution.completion.taskId.elementId],
    ),
    exactOpenTask(execution.completion, sourceVariationUserTaskMetadata),
  );
  assertExactWorkflowStartHistory(
    await started.handle.fetchHistory() as TemporalHistory,
    execution.start,
    variation.semanticProcess,
  );

  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      execution.start.instanceId,
      execution.completion,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: execution.completion.commandId,
      outcome: CommandOutcome.Committed,
    },
  );
  const receipt = await withDeadline(
    started.handle.result(),
    operationDeadlineMs,
    "source-variation completed receipt",
  );
  assert.equal(isCompletedProcessReceipt(receipt), true);
  if (!isCompletedProcessReceipt(receipt)) {
    throw new TypeError("source-variation Workflow returned no receipt");
  }
  const expected = runScenario({
    ...variation.scenario,
    stimuli: [execution.start, execution.completion],
  }, variation.semanticProcess);
  assert.deepEqual(receipt.finalState, expectedTerminal(expected));
  const trace = await readBpmnProcessTrace(
    environment.client.workflow,
    execution.start.instanceId,
  );
  assert.deepEqual(trace, expected.trace);
  const replayHistory = await started.handle.fetchHistory();
  const history = replayHistory as TemporalHistory;
  assertExactWorkflowStartHistory(
    history,
    execution.start,
    variation.semanticProcess,
  );
  assertExactAcceptedCompletion(history, execution.completion);
  reconcileHarnessTraceEvidence(trace, receipt, history);
  assertNoNonUpdateBpmnHostEvents(history, "source-variation control");
  return { replayHistory, workflowId: started.handle.workflowId };
}

function exactOpenTask(
  completion: CompleteUserTaskInstanceStimulus,
  metadata: OpenUserTask["metadata"] = expectedUserTaskMetadata,
): ReadonlyArray<OpenUserTask> {
  return [{
    id: completion.taskId,
    name: "Approve",
    state: UserTaskLifecycleState.Active,
    metadata,
  }];
}

function assertExactWorkflowStartHistory(
  history: TemporalHistory,
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): void {
  const started = historyEvents(
    history,
    "workflowExecutionStartedEventAttributes",
  );
  assert.equal(started.length, 1);
  const event = started[0];
  assert.ok(event !== undefined);
  const input = asRecord(event.attributes.input, "Workflow start input");
  const payloads = asArray(input.payloads, "Workflow start payloads");
  assert.equal(payloads.length, 2);
  assert.deepEqual(decodeJsonPayload(payloads[0], "Workflow start stimulus"), start);
  assert.deepEqual(
    decodeJsonPayload(payloads[1], "Workflow start Semantic Process"),
    semanticProcess,
  );
}

function assertExactAcceptedCompletion(
  history: TemporalHistory,
  expected: CompleteUserTaskInstanceStimulus,
): void {
  const accepted = historyEvents(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  );
  assert.equal(accepted.length, 1);
  const event = accepted[0];
  assert.ok(event !== undefined);
  const request = asRecord(event.attributes.acceptedRequest, "accepted Update");
  const input = asRecord(request.input, "accepted Update input");
  assert.equal(input.name, "bpmn-complete-user-task");
  const args = asRecord(input.args, "accepted Update arguments");
  const payloads = asArray(args.payloads, "accepted Update payloads");
  assert.deepEqual(
    decodeJsonPayload(payloads[0], "accepted User Task completion"),
    expected,
  );
}

function expectedTerminal(expected: ScenarioResult): StateObservation {
  const terminal = expected.trace.findLast(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  assert.ok(terminal !== undefined, "scenario has no terminal state");
  return terminal;
}

function containsOwnKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsOwnKey(item, key));
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return Object.hasOwn(record, key) ||
    Object.values(record).some((item) => containsOwnKey(item, key));
}
