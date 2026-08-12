/** Durable Boolean completion, refusal, mutation, replacement, and replay evidence. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  ScenarioResult,
  StateObservation,
  VariableValue,
} from "@bpmn-lean/semantic-core";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowHandle } from "@temporalio/client";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  asArray,
  asRecord,
  decodeJsonPayload,
  durableUpdateOutcomes,
  historyEvents as decodedHistoryEvents,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  readBpmnProcessTrace,
  reconcileHarnessTraceEvidence,
  runCompletionDataBypassMutation,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  loadBooleanProcessDataFixture,
  withExecutionIdentity,
  withSubmittedValue,
} from "./boolean-process-data-fixture.ts";
import type {
  BooleanProcessDataFixture,
  OldProfileBooleanRefusalFixture,
} from "./boolean-process-data-fixture.ts";
import {
  acceptedCompletionOrder,
  assertUpdatesCompleteBeforeWorkflow,
  historyEvents,
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
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import {
  runBooleanStringificationMutation,
} from "./boolean-process-data-stringification-mutation.ts";

const operationDeadlineMs = 10_000;
const identity = "bpmn-lean-boolean-process-data";

test("Boolean completion survives Worker replacement and old-profile refusal", async () => {
  const fixture = await loadBooleanProcessDataFixture();
  assertContentBoundBooleanIdentities(fixture.completion);
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Boolean Process-data Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    worker = await startBpmnTestWorker(environment, bundle, identity);
    const newProfile = await executeNewProfileUntilWait(
      environment,
      fixture,
    );

    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      `${identity}-replacement`,
    );
    const newEvidence = await finishNewProfileAfterReplacement(
      environment,
      fixture,
      newProfile.handle,
    );

    const oldEvidence = await executeOldProfileRefusal(
      environment,
      fixture.oldProfile,
    );
    await assertMutationDiscriminators(environment, fixture);

    await stopBpmnTestWorker(worker);
    worker = undefined;
    await replayBpmnHistory(
      bundle,
      newEvidence.replayHistory,
      newProfile.handle.workflowId,
    );
    await replayBpmnHistory(
      bundle,
      oldEvidence.replayHistory,
      oldEvidence.workflowId,
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
        "Boolean Process-data Temporal environment teardown",
      );
    }
  }
});

async function executeNewProfileUntilWait(
  environment: TestWorkflowEnvironment,
  fixture: BooleanProcessDataFixture,
) {
  const started = await withDeadline(
    startBpmnProcess(
      environment.client.workflow,
      fixture.start,
      fixture.semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    ),
    operationDeadlineMs,
    "Boolean Process-data Workflow start",
  );
  assert.equal(started.kind, BpmnProcessStartResultKind.Started);
  if (started.kind !== BpmnProcessStartResultKind.Started) {
    throw new TypeError("Boolean Process-data Workflow was rejected");
  }
  const openTasks = await waitForOpenUserTaskIds(
    started.handle,
    [fixture.completion.taskId.elementId],
  );
  assert.deepEqual(openTasks.map(({ id }) => id), [fixture.completion.taskId]);
  assert.deepEqual(
    await readBpmnProcessTrace(
      environment.client.workflow,
      fixture.start.instanceId,
    ),
    fixture.expected.trace.slice(0, 3),
  );
  return { handle: started.handle };
}

async function finishNewProfileAfterReplacement(
  environment: TestWorkflowEnvironment,
  fixture: BooleanProcessDataFixture,
  handle: Awaited<ReturnType<typeof executeNewProfileUntilWait>>["handle"],
): Promise<Readonly<{
  history: TemporalHistory;
  replayHistory: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>;
}>> {
  const openTasks = await waitForOpenUserTaskIds(
    handle,
    [fixture.completion.taskId.elementId],
  );
  assert.deepEqual(openTasks.map(({ id }) => id), [fixture.completion.taskId]);
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
    "Boolean Process-data completed receipt",
  );
  assert.equal(isCompletedProcessReceipt(receipt), true);
  if (!isCompletedProcessReceipt(receipt)) {
    throw new TypeError("Boolean Process-data Workflow returned no receipt");
  }
  assert.equal(JSON.stringify(commandResult).includes("boolean"), false);
  const trace = await readBpmnProcessTrace(
    environment.client.workflow,
    fixture.start.instanceId,
  );
  assert.deepEqual(trace, fixture.expected.trace);
  assert.deepEqual(receipt.finalState, expectedTerminal(fixture.expected));
  assertExactBooleanProjection(receipt.finalState);
  assertExactBooleanProjection(trace);

  const rawHistory = await withDeadline(
    handle.fetchHistory(),
    operationDeadlineMs,
    "Boolean Process-data history fetch",
  );
  const history = rawHistory as TemporalHistory;
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
  assertNoAddedHostMechanism(history, "Boolean completion");
  return { history, replayHistory: rawHistory };
}

async function executeOldProfileRefusal(
  environment: TestWorkflowEnvironment,
  fixture: OldProfileBooleanRefusalFixture,
): Promise<Readonly<{
  history: TemporalHistory;
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
    throw new TypeError("old-profile refusal Workflow was rejected at start");
  }
  const handle = started.handle;
  await waitForOpenUserTaskIds(
    handle,
    [fixture.refusedBooleanCompletion.taskId.elementId],
  );
  const beforeRefusal = await readBpmnProcessTrace(
    environment.client.workflow,
    fixture.start.instanceId,
  );
  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      fixture.start.instanceId,
      fixture.refusedBooleanCompletion,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: fixture.refusedBooleanCompletion.commandId,
      outcome: CommandOutcome.Rejected,
    },
  );
  await waitForOpenUserTaskIds(
    handle,
    [fixture.refusedBooleanCompletion.taskId.elementId],
  );
  const afterRefusal = await readBpmnProcessTrace(
    environment.client.workflow,
    fixture.start.instanceId,
  );
  assert.deepEqual(lastState(afterRefusal), lastState(beforeRefusal));

  assert.deepEqual(
    await submitUserTaskCompletion(
      environment.client.workflow,
      fixture.start.instanceId,
      fixture.validCompletion,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: fixture.validCompletion.commandId,
      outcome: CommandOutcome.Committed,
    },
  );
  const receipt = await handle.result();
  assert.equal(isCompletedProcessReceipt(receipt), true);
  if (!isCompletedProcessReceipt(receipt)) {
    throw new TypeError("old-profile refusal Workflow returned no receipt");
  }
  const trace = await readBpmnProcessTrace(
    environment.client.workflow,
    fixture.start.instanceId,
  );
  assert.deepEqual(trace, fixture.expected.trace);
  assert.deepEqual(receipt.finalState, expectedTerminal(fixture.expected));
  assert.equal(containsTaggedBoolean(trace), false);

  const replayHistory = await handle.fetchHistory();
  const history = replayHistory as TemporalHistory;
  assert.deepEqual(durableUpdateOutcomes(history), new Map([
    [fixture.refusedBooleanCompletion.commandId, CommandOutcome.Rejected],
    [fixture.validCompletion.commandId, CommandOutcome.Committed],
  ]));
  reconcileHarnessTraceEvidence(trace, receipt, history);
  assert.deepEqual(acceptedCompletionOrder(history), [
    fixture.refusedBooleanCompletion.commandId,
    fixture.validCompletion.commandId,
  ]);
  assertUpdatesCompleteBeforeWorkflow(history, 2);
  assertNoAddedHostMechanism(history, "old-profile Boolean refusal");
  return { history, replayHistory, workflowId: handle.workflowId };
}

async function assertMutationDiscriminators(
  environment: TestWorkflowEnvironment,
  fixture: BooleanProcessDataFixture,
): Promise<void> {
  const stringification = await runBooleanStringificationMutation(
    environment,
    fixture.start,
    fixture.semanticProcess,
    fixture.completion,
  );
  assert.deepEqual(stringification.result, {
    kind: ProcessCommandResultKind.Semantic,
    commandId: fixture.completion.commandId,
    outcome: CommandOutcome.Committed,
  });
  assertExactAcceptedCompletion(
    stringification.history,
    fixture.completion,
  );
  assert.deepEqual(
    durableUpdateOutcomes(stringification.history),
    new Map([[fixture.completion.commandId, CommandOutcome.Committed]]),
  );
  reconcileHarnessTraceEvidence(
    stringification.trace,
    stringification.receipt,
    stringification.history,
  );
  assert.notDeepEqual(stringification.trace, fixture.expected.trace);
  assert.notDeepEqual(
    stringification.receipt.finalState,
    expectedTerminal(fixture.expected),
  );
  assertHistoryReceiptMatches(
    stringification.history,
    stringification.receipt,
  );
  assert.equal(containsTaggedBoolean(stringification.trace), false);
  assert.equal(containsTaggedStringTrue(stringification.trace), true);
  assert.deepEqual(
    acceptedCompletionOrder(stringification.history),
    [fixture.completion.commandId],
  );
  assertUpdatesCompleteBeforeWorkflow(stringification.history, 1);
  assertNoAddedHostMechanism(
    stringification.history,
    "Boolean stringification mutation",
  );
  assert.equal(stringification.replayed, true);

  const outsideCore = withExecutionIdentity(
    fixture.scenario,
    "BooleanInstance_OutsideCoreMutation",
    "write-boolean-outside-core",
  );
  await assert.rejects(
    runCompletionDataBypassMutation(
      environment,
      outsideCore,
      fixture.semanticProcess,
      "boolean-outside-core-binding-mutation",
      waitForCompletionTask,
    ),
    /Query trace and durable Event History contain different completed Update commands/u,
  );
}

async function waitForCompletionTask(
  handle: Parameters<
    Parameters<typeof runCompletionDataBypassMutation>[4]
  >[0],
  completion: CompleteUserTaskInstanceStimulus,
): Promise<void> {
  await waitForOpenUserTaskIds(handle, [completion.taskId.elementId]);
}

function assertContentBoundBooleanIdentities(
  completion: CompleteUserTaskInstanceStimulus,
): void {
  const variants: ReadonlyArray<VariableValue> = [
    { kind: VariableValueKind.Boolean, value: true },
    { kind: VariableValueKind.Boolean, value: false },
    { kind: VariableValueKind.String, value: "true" },
    { kind: VariableValueKind.Null },
  ];
  assert.equal(
    new Set(
      variants.map((value) =>
        contentBoundUpdateId(
          withSubmittedValue(completion, "approved", value),
        )
      ),
    ).size,
    variants.length,
  );
}

function assertExactAcceptedCompletion(
  history: TemporalHistory,
  expected: CompleteUserTaskInstanceStimulus,
): void {
  const accepted = decodedHistoryEvents(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  );
  assert.equal(accepted.length, 1);
  const event = accepted[0];
  assert.ok(event !== undefined);
  const request = asRecord(
    event.attributes.acceptedRequest,
    "accepted Boolean Update request",
  );
  const input = asRecord(request.input, "accepted Boolean Update input");
  assert.equal(input.name, "bpmn-complete-user-task");
  const args = asRecord(input.args, "accepted Boolean Update arguments");
  const payloads = asArray(
    args.payloads,
    "accepted Boolean Update argument payloads",
  );
  assert.equal(payloads.length, 1);
  assert.deepEqual(
    decodeJsonPayload(payloads[0], "accepted Boolean completion"),
    expected,
  );
}

function assertHistoryReceiptMatches(
  history: TemporalHistory,
  expected: unknown,
): void {
  const completed = decodedHistoryEvents(
    history,
    "workflowExecutionCompletedEventAttributes",
  );
  assert.equal(completed.length, 1);
  const event = completed[0];
  assert.ok(event !== undefined);
  const result = asRecord(
    event.attributes.result,
    "Boolean mutation Workflow result",
  );
  const payloads = asArray(
    result.payloads,
    "Boolean mutation Workflow result payloads",
  );
  assert.equal(payloads.length, 1);
  assert.deepEqual(
    decodeJsonPayload(payloads[0], "Boolean mutation terminal receipt"),
    expected,
  );
}

function assertExactBooleanProjection(value: unknown): void {
  assert.equal(containsTaggedBoolean(value), true);
  assert.equal(containsTaggedStringTrue(value), false);
}

function containsTaggedBoolean(value: unknown): boolean {
  return containsTaggedValue(value, VariableValueKind.Boolean, true);
}

function containsTaggedStringTrue(value: unknown): boolean {
  return containsTaggedValue(value, VariableValueKind.String, "true");
}

function containsTaggedValue(
  value: unknown,
  kind: VariableValueKind,
  expected: unknown,
): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsTaggedValue(item, kind, expected));
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record.kind === kind && record.value === expected) {
    return true;
  }
  return Object.values(record).some((item) =>
    containsTaggedValue(item, kind, expected)
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

function lastState(trace: ScenarioResult["trace"]): StateObservation {
  const state = trace.findLast(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State,
  );
  assert.ok(state !== undefined, "trace has no state observation");
  return state;
}

function assertNoAddedHostMechanism(
  history: TemporalHistory,
  label: string,
): void {
  for (const attributesName of [
    "workflowExecutionSignaledEventAttributes",
    "timerStartedEventAttributes",
    "timerFiredEventAttributes",
    "timerCanceledEventAttributes",
    "activityTaskScheduledEventAttributes",
    "activityTaskStartedEventAttributes",
    "activityTaskCompletedEventAttributes",
    "activityTaskFailedEventAttributes",
    "startChildWorkflowExecutionInitiatedEventAttributes",
    "childWorkflowExecutionStartedEventAttributes",
    "childWorkflowExecutionCompletedEventAttributes",
    "childWorkflowExecutionFailedEventAttributes",
    "childWorkflowExecutionCanceledEventAttributes",
    "childWorkflowExecutionTerminatedEventAttributes",
    "workflowExecutionCancelRequestedEventAttributes",
    "workflowExecutionCanceledEventAttributes",
    "requestCancelExternalWorkflowExecutionInitiatedEventAttributes",
    "externalWorkflowExecutionCancelRequestedEventAttributes",
    "upsertWorkflowSearchAttributesEventAttributes",
  ]) {
    assert.equal(
      historyEvents(history, attributesName).length,
      0,
      `${label} unexpectedly contains ${attributesName}`,
    );
  }
}
