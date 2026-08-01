/** Shared Worker, state, Signal-history, receipt, and replay helpers for passive Message waits. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import {
  CanonicalObservationKind,
  MessageChannelKind,
  ProcessStatus,
  SemanticOperationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  DeliverMessageStimulus,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";
import type { WorkflowHandle } from "@temporalio/client";

import {
  BpmnProcessStartResultKind,
  bpmnDeliverMessageSignalName,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  isCompletedProcessReceipt,
  startBpmnProcess,
} from "@bpmn-lean/temporal-adapter";
import type {
  BpmnProcessWorkflow,
  CompletedProcessReceipt,
  TemporalHistory,
} from "@bpmn-lean/temporal-adapter";

import {
  decodeJsonPayload,
  historyEvents,
} from "./temporal-history-facts.ts";
import { withDeadline } from "./temporal-test-support.ts";

export type MessageWorkerLease = Readonly<{
  worker: Worker;
  completion: Promise<void>;
  failure: () => unknown;
}>;

const operationDeadlineMs = 10_000;

/** Test-only adapter mutation proving that the direct channel is observable before delivery. */
export function eraseDirectMessageChannel(
  program: SemanticProcessProgram,
): SemanticProcessProgram {
  let messageWaitCount = 0;
  const operations = program.operations.map((operation) => {
    if (operation.kind !== SemanticOperationKind.AwaitMessage) {
      return operation;
    }
    messageWaitCount += 1;
    if (operation.message.channel.kind !== MessageChannelKind.DirectMessage) {
      throw new TypeError(
        "direct-channel erasure requires one direct Message wait",
      );
    }
    return {
      ...operation,
      message: {
        ...operation.message,
        channel: {
          kind: MessageChannelKind.OperationMessage,
          interfaceId: "Interface_ErasedDirectChannel",
          interfaceOperationId: "Operation_ErasedDirectChannel",
          messageId: operation.message.channel.messageId,
        },
      },
    };
  });
  if (messageWaitCount !== 1) {
    throw new TypeError(
      "direct-channel erasure requires exactly one Message wait",
    );
  }
  return { ...program, operations };
}

export function requireMessageStart(
  scenario: Scenario,
): StartProcessStimulus {
  const stimulus = scenario.stimuli[0];
  assert.ok(stimulus?.kind === StimulusKind.StartProcess);
  return stimulus;
}

export function requireMessageDelivery(
  scenario: Scenario,
): DeliverMessageStimulus {
  const stimulus = scenario.stimuli[1];
  assert.ok(stimulus?.kind === StimulusKind.DeliverMessage);
  return stimulus;
}

export async function startMessageWorkflow(
  environment: TestWorkflowEnvironment,
  stimulus: StartProcessStimulus,
  program: SemanticProcessProgram,
): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
  const result = await startBpmnProcess(
    environment.client.workflow,
    stimulus,
    program,
    { taskQueue: bpmnSemanticTaskQueue },
  );
  switch (result.kind) {
    case BpmnProcessStartResultKind.Started:
      return result.handle;
    case BpmnProcessStartResultKind.Rejected:
      throw new Error(
        `Message Process was rejected: ${result.failure.code}`,
      );
  }
}

export async function startMessageWorker(
  environment: TestWorkflowEnvironment,
  workflowBundle: WorkflowBundleWithSourceMap,
): Promise<MessageWorkerLease> {
  const worker = await Worker.create({
    connection: environment.nativeConnection,
    identity: "bpmn-lean-message-probe",
    taskQueue: bpmnSemanticTaskQueue,
    workflowBundle,
  });
  let failure: unknown;
  const completion = worker.run().catch((error: unknown) => {
    failure = error;
  });
  await delay(0);
  if (failure !== undefined) {
    throw failure;
  }
  return {
    worker,
    completion,
    failure: () => failure,
  };
}

export async function stopMessageWorker(
  lease: MessageWorkerLease,
): Promise<void> {
  lease.worker.shutdown();
  await withDeadline(
    lease.completion,
    operationDeadlineMs,
    "Temporal Message Worker shutdown",
  );
  if (lease.failure() !== undefined) {
    throw lease.failure();
  }
}

export async function waitForMessageState(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  predicate: (state: StateObservation) => boolean,
): Promise<StateObservation> {
  let latestError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const trace = await handle.query<
        ReadonlyArray<CanonicalObservation>
      >(bpmnTraceQueryName);
      const state = trace.findLast(
        (observation): observation is StateObservation =>
          observation.kind === CanonicalObservationKind.State &&
          observation.status === ProcessStatus.Running,
      );
      if (state !== undefined && predicate(state)) {
        return state;
      }
    } catch (error: unknown) {
      latestError = error;
    }
    await delay(25);
  }
  throw latestError instanceof Error
    ? latestError
    : new Error("Message Workflow did not reach the expected state");
}

export async function waitForMessageSignalCount(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  minimum: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const history = await fetchMessageHistory(handle);
    if (
      historyEvents(
        history,
        "workflowExecutionSignaledEventAttributes",
      ).length >= minimum
    ) {
      return;
    }
    await delay(25);
  }
  throw new Error(`Message Workflow did not record ${minimum} Signals`);
}

export async function completedMessageReceipt(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<CompletedProcessReceipt> {
  const result = await handle.result();
  assert.equal(isCompletedProcessReceipt(result), true);
  if (!isCompletedProcessReceipt(result)) {
    throw new TypeError("Message Workflow returned a malformed receipt");
  }
  return result;
}

export async function fetchMessageHistory(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<TemporalHistory> {
  const history = await handle.fetchHistory();
  assert.ok(Array.isArray(history.events));
  return history as TemporalHistory;
}

export function assertExactMessageSignals(
  history: TemporalHistory,
  expected: ReadonlyArray<DeliverMessageStimulus>,
): void {
  const signals = historyEvents(
    history,
    "workflowExecutionSignaledEventAttributes",
  );
  assert.equal(signals.length, expected.length);
  assert.deepEqual(
    signals.map((event) => {
      const attributes = requireRecord(
        event.workflowExecutionSignaledEventAttributes,
        "Signal attributes",
      );
      assert.equal(attributes.signalName, bpmnDeliverMessageSignalName);
      const input = requireRecord(attributes.input, "Signal input");
      assert.ok(Array.isArray(input.payloads));
      assert.equal(input.payloads.length, 1);
      return decodeJsonPayload(input.payloads[0]);
    }),
    expected,
  );
}

export function assertNoNonSignalMessageHostEvents(
  history: TemporalHistory,
): void {
  for (const attributesName of [
    "timerStartedEventAttributes",
    "activityTaskScheduledEventAttributes",
    "startChildWorkflowExecutionInitiatedEventAttributes",
    "workflowExecutionCancelRequestedEventAttributes",
    "workflowExecutionCanceledEventAttributes",
    "requestCancelExternalWorkflowExecutionInitiatedEventAttributes",
    "externalWorkflowExecutionCancelRequestedEventAttributes",
    "childWorkflowExecutionCanceledEventAttributes",
  ]) {
    assert.equal(
      historyEvents(history, attributesName).length,
      0,
      `Message history unexpectedly contains ${attributesName}`,
    );
  }
}

export function withoutFirstMessageSignal(
  history: TemporalHistory,
): TemporalHistory {
  const firstSignal = historyEvents(
    history,
    "workflowExecutionSignaledEventAttributes",
  )[0];
  if (firstSignal === undefined) {
    throw new TypeError("Message history contains no Signal to remove");
  }
  return {
    events: history.events.filter((event) => event !== firstSignal),
  };
}

export async function replayMessageHistories(
  workflowBundle: WorkflowBundleWithSourceMap,
  items: ReadonlyArray<{
    history: TemporalHistory;
    workflowId: string;
  }>,
): Promise<void> {
  let replayed = 0;
  for await (
    const result of Worker.runReplayHistories(
      { workflowBundle },
      items,
    )
  ) {
    assert.equal(result.error, undefined);
    replayed += 1;
  }
  assert.equal(replayed, items.length);
}

function requireRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} is not a record`);
  }
  return value as Readonly<Record<string, unknown>>;
}
