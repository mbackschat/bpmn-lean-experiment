/** Durable cases for the direct-Message Receive Task profile and its nearest bypass. */
import assert from "node:assert/strict";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  DeliverMessageStimulus,
  Scenario,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  BpmnMessageIngressInvalid,
  MessageDeliveryResolutionKind,
  ProcessCommandResultKind,
  submitMessageDelivery,
} from "@bpmn-lean/temporal-testkit";

import {
  assertExactMessageSignals,
  assertNoNonSignalMessageHostEvents,
  completedMessageReceipt,
  eraseDirectMessageChannel,
  fetchMessageHistory,
  requireMessageDelivery,
  requireMessageStart,
  startMessageWorkflow,
  waitForMessageSignalCount,
  waitForMessageState,
  withoutFirstMessageSignal,
} from "./message-temporal-test-support.ts";
import type {
  MessageTemporalCaseContext,
} from "./message-temporal-test-support.ts";
import {
  compileExecutionInput,
  loadJson,
} from "./temporal-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/message-addressed-receive-task/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/message-addressed-receive-task/process.bpmn",
  import.meta.url,
);

export async function exerciseReceiveTaskPrimary(
  context: MessageTemporalCaseContext,
): Promise<void> {
  const input = await compileExecutionInput(
    await loadJson<Scenario>(scenarioUrl),
    bpmnUrl,
  );
  const start = requireMessageStart(input.scenario);
  const delivery = requireMessageDelivery(input.scenario);
  assert.equal(delivery.channel.kind, "directMessage");
  if (delivery.channel.kind !== "directMessage") {
    throw new TypeError(
      "Receive Task scenario requires one direct Message delivery",
    );
  }
  const handle = await startMessageWorkflow(
    context.environment,
    start,
    input.semanticProcess,
  );
  const waiting = await waitForMessageState(
    handle,
    (state) => state.openMessageSubscriptions.length === 1,
  );
  assert.deepEqual(waiting, {
    kind: CanonicalObservationKind.State,
    instanceId: start.instanceId,
    status: ProcessStatus.Running,
    activeWaits: [{
      elementId: "ReceiveTask_WaitForInvoice",
      kind: "message",
      multiplicity: 1,
    }],
    openUserTasks: [],
    openMessageSubscriptions: [{
      id: delivery.subscriptionId,
      channel: delivery.channel,
    }],
    openTimers: [],
    openEffects: [],
    variables: [],
    enabledInteractions: [{
      kind: StimulusKind.DeliverMessage,
      subscriptionId: delivery.subscriptionId,
      channel: delivery.channel,
    }],
    logicalTimeMs: 0,
  });

  const wrongKind = {
    ...delivery,
    commandId: "deliver-receive-task-wrong-kind",
    channel: {
      kind: "operationMessage",
      interfaceId: "Interface_WrongLocus",
      interfaceOperationId: "Operation_WrongLocus",
      messageId: delivery.channel.messageId,
    },
  } satisfies DeliverMessageStimulus;
  assert.deepEqual(
    await submitMessageDelivery(
      context.environment.client.workflow,
      start.instanceId,
      wrongKind,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: wrongKind.commandId,
      outcome: CommandOutcome.Rejected,
    },
  );
  await assert.rejects(
    submitMessageDelivery(
      context.environment.client.workflow,
      start.instanceId,
      { ...delivery, unexpected: true },
    ),
    BpmnMessageIngressInvalid,
  );
  assert.deepEqual(
    await waitForMessageState(
      handle,
      (state) => state.openMessageSubscriptions.length === 1,
    ),
    waiting,
  );

  await context.suspendWorker();
  const workerDownDelivery = submitMessageDelivery(
    context.environment.client.workflow,
    start.instanceId,
    delivery,
  );
  try {
    await waitForMessageSignalCount(handle, 2);
  } finally {
    await context.resumeWorker();
  }
  assert.deepEqual(await workerDownDelivery, {
    kind: ProcessCommandResultKind.Semantic,
    commandId: delivery.commandId,
    outcome: CommandOutcome.Committed,
  });

  const receipt = await completedMessageReceipt(handle);
  assert.deepEqual(receipt.finalState, {
    kind: CanonicalObservationKind.State,
    instanceId: start.instanceId,
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
  assert.deepEqual(receipt.messageDeliveryRecords, [
    {
      kind: MessageDeliveryResolutionKind.Semantic,
      stimulus: wrongKind,
      outcome: CommandOutcome.Rejected,
    },
    {
      kind: MessageDeliveryResolutionKind.Semantic,
      stimulus: delivery,
      outcome: CommandOutcome.Committed,
    },
  ]);
  const history = await fetchMessageHistory(handle);
  context.retainHistory(history, handle.workflowId);
  assertExactMessageSignals(history, [wrongKind, delivery]);
  assertNoNonSignalMessageHostEvents(history);
  assert.throws(() =>
    assertExactMessageSignals(
      withoutFirstMessageSignal(history),
      [wrongKind, delivery],
    )
  );
}

export async function exerciseReceiveTaskChannelErasure(
  context: MessageTemporalCaseContext,
): Promise<void> {
  const input = await compileExecutionInput(
    await loadJson<Scenario>(scenarioUrl),
    bpmnUrl,
  );
  const primaryStart = requireMessageStart(input.scenario);
  const primaryDelivery = requireMessageDelivery(input.scenario);
  const start = {
    ...primaryStart,
    commandId: "start-receive-task-channel-erasure",
    instanceId: "ReceiveTaskChannelErasureInstance_1",
  } satisfies StartProcessStimulus;
  const handle = await startMessageWorkflow(
    context.environment,
    start,
    eraseDirectMessageChannel(input.semanticProcess),
  );
  const wait = await waitForMessageState(
    handle,
    (state) => state.openMessageSubscriptions.length === 1,
  );
  const erasedSubscription = wait.openMessageSubscriptions[0];
  assert.ok(erasedSubscription !== undefined);
  assert.equal(erasedSubscription.channel.kind, "operationMessage");
  assert.notDeepEqual(
    erasedSubscription.channel,
    primaryDelivery.channel,
  );
  const directDelivery = {
    ...primaryDelivery,
    commandId: "deliver-direct-to-erased-channel",
    subscriptionId: {
      ...primaryDelivery.subscriptionId,
      processInstanceId: start.instanceId,
    },
  } satisfies DeliverMessageStimulus;
  assert.deepEqual(
    await submitMessageDelivery(
      context.environment.client.workflow,
      start.instanceId,
      directDelivery,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: directDelivery.commandId,
      outcome: CommandOutcome.Rejected,
    },
  );
  const operationDelivery = {
    ...directDelivery,
    commandId: "deliver-operation-to-erased-channel",
    channel: erasedSubscription.channel,
  } satisfies DeliverMessageStimulus;
  assert.deepEqual(
    await submitMessageDelivery(
      context.environment.client.workflow,
      start.instanceId,
      operationDelivery,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: operationDelivery.commandId,
      outcome: CommandOutcome.Committed,
    },
  );
  const receipt = await completedMessageReceipt(handle);
  assert.deepEqual(receipt.messageDeliveryRecords, [
    {
      kind: MessageDeliveryResolutionKind.Semantic,
      stimulus: directDelivery,
      outcome: CommandOutcome.Rejected,
    },
    {
      kind: MessageDeliveryResolutionKind.Semantic,
      stimulus: operationDelivery,
      outcome: CommandOutcome.Committed,
    },
  ]);
  const history = await fetchMessageHistory(handle);
  context.retainHistory(history, handle.workflowId);
  assertExactMessageSignals(history, [
    directDelivery,
    operationDelivery,
  ]);
  assertNoNonSignalMessageHostEvents(history);
}
