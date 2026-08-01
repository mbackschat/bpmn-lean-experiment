/**
 * Establishes the durable Signal refinement for the two admitted passive Message-wait loci.
 *
 * The live witness separates transport acceptance from semantic delivery, preserves delivery while no Worker polls, distinguishes operation-addressed Catch Events from direct-Message Receive Tasks, recovers closing delivery from the completed receipt, and replays every disposable history.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import {
  BpmnCommandIdentityConflict,
  BpmnMessageIngressInvalid,
  MessageDeliveryResolutionKind,
  ProcessCommandResultKind,
  createCachedLocalEnvironment,
  loadBpmnWorkflowBundle,
  submitMessageDelivery,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-adapter";

import {
  compileExecutionInput,
  loadJson,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  assertExactMessageSignals,
  assertNoNonSignalMessageHostEvents,
  completedMessageReceipt,
  eraseDirectMessageChannel,
  fetchMessageHistory,
  replayMessageHistories,
  requireMessageDelivery,
  requireMessageStart,
  startMessageWorker,
  startMessageWorkflow,
  stopMessageWorker,
  waitForMessageSignalCount,
  waitForMessageState,
  withoutFirstMessageSignal,
} from "./message-temporal-test-support.ts";
import type {
  MessageWorkerLease,
} from "./message-temporal-test-support.ts";

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
const receiveScenarioUrl = new URL(
  "../../../scenarios/message-addressed-receive-task/scenario.json",
  import.meta.url,
);
const receiveBpmnUrl = new URL(
  "../../../scenarios/message-addressed-receive-task/process.bpmn",
  import.meta.url,
);
const operationDeadlineMs = 10_000;

test("Message Signal delivery preserves both admitted channel loci through Worker absence and replay", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const primaryProgram = await compileProgram(
    bpmnUrl,
    scenario.bpmn.id,
  );
  const reverseProgram = await compileProgram(
    reverseBpmnUrl,
    "intermediate-catch-message-reverse",
  );
  const receiveInput = await compileExecutionInput(
    await loadJson<Scenario>(receiveScenarioUrl),
    receiveBpmnUrl,
  );
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-message-probe",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Temporal Message environment startup",
  );
  let lease: MessageWorkerLease | undefined;

  try {
    const workflowBundle = await loadBpmnWorkflowBundle();
    lease = await startMessageWorker(environment, workflowBundle);
    const startStimulus = requireMessageStart(scenario);
    const delivery = requireMessageDelivery(scenario);
    const taskCompletion = requireCompletion(scenario);
    const primaryHandle = await startMessageWorkflow(
      environment,
      startStimulus,
      primaryProgram,
    );
    const waitingForMessage = await waitForMessageState(
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
      await waitForMessageState(
        primaryHandle,
        (state) => state.openMessageSubscriptions.length === 1,
      ),
      waitingForMessage,
    );

    const receiveStart = requireMessageStart(receiveInput.scenario);
    const receiveDelivery = requireMessageDelivery(receiveInput.scenario);
    assert.equal(receiveDelivery.channel.kind, "directMessage");
    if (receiveDelivery.channel.kind !== "directMessage") {
      throw new TypeError(
        "Receive Task scenario requires one direct Message delivery",
      );
    }
    const receiveHandle = await startMessageWorkflow(
      environment,
      receiveStart,
      receiveInput.semanticProcess,
    );
    const waitingForDirectMessage = await waitForMessageState(
      receiveHandle,
      (state) => state.openMessageSubscriptions.length === 1,
    );
    assert.deepEqual(waitingForDirectMessage, {
      kind: CanonicalObservationKind.State,
      instanceId: receiveStart.instanceId,
      status: ProcessStatus.Running,
      activeWaits: [{
        elementId: "ReceiveTask_WaitForInvoice",
        kind: "message",
        multiplicity: 1,
      }],
      openUserTasks: [],
      openMessageSubscriptions: [{
        id: receiveDelivery.subscriptionId,
        channel: receiveDelivery.channel,
      }],
      openTimers: [],
      openEffects: [],
      variables: [],
      enabledInteractions: [{
        kind: StimulusKind.DeliverMessage,
        subscriptionId: receiveDelivery.subscriptionId,
        channel: receiveDelivery.channel,
      }],
      logicalTimeMs: 0,
    });
    const receiveWrongKind = {
      ...receiveDelivery,
      commandId: "deliver-receive-task-wrong-kind",
      channel: {
        kind: "operationMessage",
        interfaceId: "Interface_WrongLocus",
        interfaceOperationId: "Operation_WrongLocus",
        messageId: receiveDelivery.channel.messageId,
      },
    } satisfies DeliverMessageStimulus;
    assert.deepEqual(
      await submitMessageDelivery(
        environment.client.workflow,
        receiveStart.instanceId,
        receiveWrongKind,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: receiveWrongKind.commandId,
        outcome: CommandOutcome.Rejected,
      },
    );
    assert.deepEqual(
      await waitForMessageState(
        receiveHandle,
        (state) => state.openMessageSubscriptions.length === 1,
      ),
      waitingForDirectMessage,
    );

    await stopMessageWorker(lease);
    lease = undefined;
    const workerDownDelivery = submitMessageDelivery(
      environment.client.workflow,
      startStimulus.instanceId,
      delivery,
    );
    const receiveWorkerDownDelivery = submitMessageDelivery(
      environment.client.workflow,
      receiveStart.instanceId,
      receiveDelivery,
    );
    await waitForMessageSignalCount(primaryHandle, 2);
    await waitForMessageSignalCount(receiveHandle, 2);
    lease = await startMessageWorker(environment, workflowBundle);
    assert.deepEqual(await workerDownDelivery, {
      kind: ProcessCommandResultKind.Semantic,
      commandId: delivery.commandId,
      outcome: CommandOutcome.Committed,
    });
    assert.deepEqual(await receiveWorkerDownDelivery, {
      kind: ProcessCommandResultKind.Semantic,
      commandId: receiveDelivery.commandId,
      outcome: CommandOutcome.Committed,
    });
    const receiveReceipt = await completedMessageReceipt(receiveHandle);
    assert.deepEqual(receiveReceipt.finalState, {
      kind: CanonicalObservationKind.State,
      instanceId: receiveStart.instanceId,
      status: ProcessStatus.Completed,
      activeWaits: [],
      openUserTasks: [],
      openMessageSubscriptions: [],
      openTimers: [],
      openEffects: [],
      variables: [],
      enabledInteractions: [],
      logicalTimeMs: 0,
    });
    assert.deepEqual(receiveReceipt.messageDeliveryRecords, [
      {
        kind: MessageDeliveryResolutionKind.Semantic,
        stimulus: receiveWrongKind,
        outcome: CommandOutcome.Rejected,
      },
      {
        kind: MessageDeliveryResolutionKind.Semantic,
        stimulus: receiveDelivery,
        outcome: CommandOutcome.Committed,
      },
    ]);
    const receiveHistory = await fetchMessageHistory(receiveHandle);
    assertExactMessageSignals(receiveHistory, [
      receiveWrongKind,
      receiveDelivery,
    ]);
    assertNoNonSignalMessageHostEvents(receiveHistory);
    assert.throws(() =>
      assertExactMessageSignals(
        withoutFirstMessageSignal(receiveHistory),
        [receiveWrongKind, receiveDelivery],
      )
    );
    const waitingForTask = await waitForMessageState(
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
      await waitForMessageState(
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
    const primaryReceipt = await completedMessageReceipt(primaryHandle);
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
    const primaryHistory = await fetchMessageHistory(primaryHandle);
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
    const reverseHandle = await startMessageWorkflow(
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
    await waitForMessageState(
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
    const reverseReceipt = await completedMessageReceipt(reverseHandle);
    assert.deepEqual(reverseReceipt.messageDeliveryRecords, [{
      kind: MessageDeliveryResolutionKind.Semantic,
      stimulus: reverseDelivery,
      outcome: CommandOutcome.Committed,
    }]);
    const reverseHistory = await fetchMessageHistory(reverseHandle);
    assertExactMessageSignals(reverseHistory, [reverseDelivery]);

    const bypassStart = {
      ...receiveStart,
      commandId: "start-receive-task-channel-erasure",
      instanceId: "ReceiveTaskChannelErasureInstance_1",
    } satisfies StartProcessStimulus;
    const bypassHandle = await startMessageWorkflow(
      environment,
      bypassStart,
      eraseDirectMessageChannel(receiveInput.semanticProcess),
    );
    const bypassWait = await waitForMessageState(
      bypassHandle,
      (state) => state.openMessageSubscriptions.length === 1,
    );
    const erasedSubscription = bypassWait.openMessageSubscriptions[0];
    assert.ok(erasedSubscription !== undefined);
    assert.equal(erasedSubscription.channel.kind, "operationMessage");
    assert.notDeepEqual(
      erasedSubscription.channel,
      waitingForDirectMessage.openMessageSubscriptions[0]?.channel,
    );
    const bypassDirectDelivery = {
      ...receiveDelivery,
      commandId: "deliver-direct-to-erased-channel",
      subscriptionId: {
        ...receiveDelivery.subscriptionId,
        processInstanceId: bypassStart.instanceId,
      },
    } satisfies DeliverMessageStimulus;
    assert.deepEqual(
      await submitMessageDelivery(
        environment.client.workflow,
        bypassStart.instanceId,
        bypassDirectDelivery,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: bypassDirectDelivery.commandId,
        outcome: CommandOutcome.Rejected,
      },
    );
    const bypassOperationDelivery = {
      ...bypassDirectDelivery,
      commandId: "deliver-operation-to-erased-channel",
      channel: erasedSubscription.channel,
    } satisfies DeliverMessageStimulus;
    assert.deepEqual(
      await submitMessageDelivery(
        environment.client.workflow,
        bypassStart.instanceId,
        bypassOperationDelivery,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: bypassOperationDelivery.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    const bypassReceipt = await completedMessageReceipt(bypassHandle);
    assert.deepEqual(bypassReceipt.messageDeliveryRecords, [
      {
        kind: MessageDeliveryResolutionKind.Semantic,
        stimulus: bypassDirectDelivery,
        outcome: CommandOutcome.Rejected,
      },
      {
        kind: MessageDeliveryResolutionKind.Semantic,
        stimulus: bypassOperationDelivery,
        outcome: CommandOutcome.Committed,
      },
    ]);
    const bypassHistory = await fetchMessageHistory(bypassHandle);
    assertExactMessageSignals(bypassHistory, [
      bypassDirectDelivery,
      bypassOperationDelivery,
    ]);
    assertNoNonSignalMessageHostEvents(bypassHistory);

    await stopMessageWorker(lease);
    lease = undefined;
    await replayMessageHistories(workflowBundle, [
      { history: primaryHistory, workflowId: primaryHandle.workflowId },
      { history: reverseHistory, workflowId: reverseHandle.workflowId },
      { history: receiveHistory, workflowId: receiveHandle.workflowId },
      { history: bypassHistory, workflowId: bypassHandle.workflowId },
    ]);
  } finally {
    if (lease !== undefined) {
      await stopMessageWorker(lease);
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

function requireCompletion(
  scenario: Scenario,
): CompleteUserTaskInstanceStimulus {
  const stimulus = scenario.stimuli[2];
  assert.ok(stimulus?.kind === StimulusKind.CompleteUserTaskInstance);
  return stimulus;
}
