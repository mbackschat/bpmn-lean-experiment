/**
 * Establishes the durable Signal refinement for direct-addressed Intermediate Catch Message delivery.
 *
 * The live witness separates transport acceptance from semantic delivery, preserves delivery while no Worker polls, records exact duplicate and identity-conflict behavior, recovers a closing delivery from the completed receipt, and replays both disposable histories.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type {
  WorkflowHandle,
} from "@temporalio/client";

import {
  BpmnCommandIdentityConflict,
  BpmnMessageIngressInvalid,
  BpmnProcessStartResultKind,
  MessageDeliveryResolutionKind,
  ProcessCommandResultKind,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  createCachedLocalEnvironment,
  isCompletedProcessReceipt,
  startBpmnProcess,
  submitMessageDelivery,
  submitUserTaskCompletion,
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
import {
  loadJson,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";

type WorkerLease = Readonly<{
  worker: Worker;
  completion: Promise<void>;
  failure: () => unknown;
}>;

const scenarioUrl = new URL(
  "../../../scenarios/intermediate-catch-message/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/intermediate-catch-message/process.bpmn",
  import.meta.url,
);
const reverseBpmnUrl = new URL(
  "../../bpmn-source/test/fixtures/intermediate-catch-message-reverse.bpmn",
  import.meta.url,
);
const workflowsPath = fileURLToPath(
  new URL("../dist/workflows.js", import.meta.url),
);
const operationDeadlineMs = 10_000;

test("Signal delivery survives Worker absence and resolves live or from the completed receipt", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const primaryProgram = await compileProgram(
    bpmnUrl,
    scenario.bpmn.id,
  );
  const reverseProgram = await compileProgram(
    reverseBpmnUrl,
    "intermediate-catch-message-reverse",
  );
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-message-probe",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Temporal Message environment startup",
  );
  let lease: WorkerLease | undefined;

  try {
    lease = await startWorker(environment);
    const startStimulus = requireStart(scenario);
    const delivery = requireDelivery(scenario);
    const taskCompletion = requireCompletion(scenario);
    const primaryHandle = await startWorkflow(
      environment,
      startStimulus,
      primaryProgram,
    );
    const waitingForMessage = await waitForState(
      primaryHandle,
      (state) => state.openMessageSubscriptions.length === 1,
    );
    assert.equal(waitingForMessage.openUserTasks.length, 0);

    const wrongChannel = {
      ...delivery,
      commandId: "deliver-message-wrong-channel",
      channel: {
        ...delivery.channel,
        messageId: "Message_Other",
      },
    } satisfies DeliverMessageStimulus;
    assert.deepEqual(
      await submitMessageDelivery(
        environment.client.workflow,
        startStimulus.instanceId,
        wrongChannel,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: wrongChannel.commandId,
        outcome: CommandOutcome.Rejected,
      },
    );
    assert.deepEqual(
      await waitForState(
        primaryHandle,
        (state) => state.openMessageSubscriptions.length === 1,
      ),
      waitingForMessage,
    );

    await stopWorker(lease);
    lease = undefined;
    const workerDownDelivery = submitMessageDelivery(
      environment.client.workflow,
      startStimulus.instanceId,
      delivery,
    );
    await waitForSignalCount(primaryHandle, 2);
    lease = await startWorker(environment);
    assert.deepEqual(await workerDownDelivery, {
      kind: ProcessCommandResultKind.Semantic,
      commandId: delivery.commandId,
      outcome: CommandOutcome.Committed,
    });
    const waitingForTask = await waitForState(
      primaryHandle,
      (state) => state.openUserTasks.length === 1,
    );
    assert.equal(waitingForTask.openMessageSubscriptions.length, 0);

    const stale = {
      ...delivery,
      commandId: "deliver-message-stale",
    } satisfies DeliverMessageStimulus;
    assert.deepEqual(
      await submitMessageDelivery(
        environment.client.workflow,
        startStimulus.instanceId,
        stale,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: stale.commandId,
        outcome: CommandOutcome.Rejected,
      },
    );
    assert.deepEqual(
      await waitForState(
        primaryHandle,
        (state) => state.openUserTasks.length === 1,
      ),
      waitingForTask,
    );
    assert.deepEqual(
      await submitMessageDelivery(
        environment.client.workflow,
        startStimulus.instanceId,
        delivery,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: delivery.commandId,
        outcome: CommandOutcome.Committed,
      },
    );

    const conflicting = {
      ...delivery,
      channel: {
        ...delivery.channel,
        messageId: "Message_Conflicting",
      },
    } satisfies DeliverMessageStimulus;
    await assert.rejects(
      submitMessageDelivery(
        environment.client.workflow,
        startStimulus.instanceId,
        conflicting,
      ),
      BpmnCommandIdentityConflict,
    );
    await assert.rejects(
      submitMessageDelivery(
        environment.client.workflow,
        startStimulus.instanceId,
        { ...delivery, extra: true },
      ),
      BpmnMessageIngressInvalid,
    );

    assert.equal(
      (
        await submitUserTaskCompletion(
          environment.client.workflow,
          startStimulus.instanceId,
          taskCompletion,
        )
      ).kind,
      ProcessCommandResultKind.Semantic,
    );
    const primaryReceipt = await completedReceipt(primaryHandle);
    assert.deepEqual(primaryReceipt.messageDeliveryRecords, [
      {
        kind: MessageDeliveryResolutionKind.Semantic,
        stimulus: wrongChannel,
        outcome: CommandOutcome.Rejected,
      },
      {
        kind: MessageDeliveryResolutionKind.Semantic,
        stimulus: delivery,
        outcome: CommandOutcome.Committed,
      },
      {
        kind: MessageDeliveryResolutionKind.Semantic,
        stimulus: stale,
        outcome: CommandOutcome.Rejected,
      },
      {
        kind: MessageDeliveryResolutionKind.RequestFailure,
        stimulus: conflicting,
        failure: "commandIdentityConflict",
      },
    ]);
    const primaryHistory = await fetchHistory(primaryHandle);
    const expectedSignals = [
      wrongChannel,
      delivery,
      stale,
      delivery,
      conflicting,
    ];
    assertExactMessageSignals(primaryHistory, expectedSignals);
    assert.throws(
      () =>
        assertExactMessageSignals(primaryHistory, [
          { ...wrongChannel, commandId: "payload-substitution" },
          ...expectedSignals.slice(1),
        ]),
      /deep-equal/u,
    );

    const reverseStart = {
      ...startStimulus,
      commandId: "start-reverse-message-process",
      processId: reverseProgram.processId,
      instanceId: "MessageReverseInstance_1",
    } satisfies StartProcessStimulus;
    const reverseHandle = await startWorkflow(
      environment,
      reverseStart,
      reverseProgram,
    );
    const reverseCompletion = {
      ...taskCompletion,
      commandId: "complete-reverse-user-task",
      taskId: {
        ...taskCompletion.taskId,
        processInstanceId: reverseStart.instanceId,
      },
    } satisfies CompleteUserTaskInstanceStimulus;
    assert.equal(
      (
        await submitUserTaskCompletion(
          environment.client.workflow,
          reverseStart.instanceId,
          reverseCompletion,
        )
      ).kind,
      ProcessCommandResultKind.Semantic,
    );
    await waitForState(
      reverseHandle,
      (state) => state.openMessageSubscriptions.length === 1,
    );
    const reverseDelivery = {
      ...delivery,
      commandId: "deliver-reverse-message",
      subscriptionId: {
        ...delivery.subscriptionId,
        processInstanceId: reverseStart.instanceId,
      },
    } satisfies DeliverMessageStimulus;
    assert.deepEqual(
      await submitMessageDelivery(
        environment.client.workflow,
        reverseStart.instanceId,
        reverseDelivery,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: reverseDelivery.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    const reverseReceipt = await completedReceipt(reverseHandle);
    assert.deepEqual(reverseReceipt.messageDeliveryRecords, [{
      kind: MessageDeliveryResolutionKind.Semantic,
      stimulus: reverseDelivery,
      outcome: CommandOutcome.Committed,
    }]);
    const reverseHistory = await fetchHistory(reverseHandle);
    assertExactMessageSignals(reverseHistory, [reverseDelivery]);

    await stopWorker(lease);
    lease = undefined;
    await replayHistories([
      { history: primaryHistory, workflowId: primaryHandle.workflowId },
      { history: reverseHistory, workflowId: reverseHandle.workflowId },
    ]);
  } finally {
    if (lease !== undefined) {
      await stopWorker(lease);
    }
    await withDeadline(
      environment.teardown(),
      operationDeadlineMs,
      "Temporal Message environment teardown",
    );
  }
});

async function compileProgram(
  url: URL,
  sourceId: string,
): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(url),
    sourceId,
    expectedSha256: undefined,
    semanticProfile: "bpmn-2.0.2-intermediate-catch-message-draft",
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(
      `Message source was rejected: ${JSON.stringify(compilation.diagnostics)}`,
    );
  }
  return compilation.semanticProcess;
}

async function startWorkflow(
  environment: TestWorkflowEnvironment,
  stimulus: StartProcessStimulus,
  program: SemanticProcessProgram,
): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
  const result = await startBpmnProcess(
    environment.client.workflow,
    stimulus,
    program,
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

function requireStart(scenario: Scenario): StartProcessStimulus {
  const stimulus = scenario.stimuli[0];
  assert.ok(stimulus?.kind === StimulusKind.StartProcess);
  return stimulus;
}

function requireDelivery(scenario: Scenario): DeliverMessageStimulus {
  const stimulus = scenario.stimuli[1];
  assert.ok(stimulus?.kind === StimulusKind.DeliverMessage);
  return stimulus;
}

function requireCompletion(
  scenario: Scenario,
): CompleteUserTaskInstanceStimulus {
  const stimulus = scenario.stimuli[2];
  assert.ok(stimulus?.kind === StimulusKind.CompleteUserTaskInstance);
  return stimulus;
}

async function startWorker(
  environment: TestWorkflowEnvironment,
): Promise<WorkerLease> {
  const worker = await Worker.create({
    connection: environment.nativeConnection,
    identity: "bpmn-lean-message-probe",
    taskQueue: bpmnSemanticTaskQueue,
    workflowsPath,
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

async function stopWorker(lease: WorkerLease): Promise<void> {
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

async function waitForState(
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

async function waitForSignalCount(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  minimum: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const history = await fetchHistory(handle);
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

async function completedReceipt(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<CompletedProcessReceipt> {
  const result = await handle.result();
  assert.equal(isCompletedProcessReceipt(result), true);
  if (!isCompletedProcessReceipt(result)) {
    throw new TypeError("Message Workflow returned a malformed receipt");
  }
  return result;
}

async function fetchHistory(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<TemporalHistory> {
  const history = await handle.fetchHistory();
  assert.ok(Array.isArray(history.events));
  return history as TemporalHistory;
}

function assertExactMessageSignals(
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
      assert.equal(attributes.signalName, "bpmn-deliver-message");
      const input = requireRecord(attributes.input, "Signal input");
      assert.ok(Array.isArray(input.payloads));
      assert.equal(input.payloads.length, 1);
      return decodeJsonPayload(input.payloads[0]);
    }),
    expected,
  );
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

async function replayHistories(
  items: ReadonlyArray<{
    history: TemporalHistory;
    workflowId: string;
  }>,
): Promise<void> {
  let replayed = 0;
  for await (
    const result of Worker.runReplayHistories(
      { workflowsPath },
      items,
    )
  ) {
    assert.equal(result.error, undefined);
    replayed += 1;
  }
  assert.equal(replayed, items.length);
}
