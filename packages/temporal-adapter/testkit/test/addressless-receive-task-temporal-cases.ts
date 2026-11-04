/**
 * Durable witness of the addressless Receive Task account (ARECV-*): the unspecified wait survives Worker
 * absence, refuses a named Message delivery, and commits exactly one occurrence-addressed delivery whose
 * Signal history replays.
 */
import assert from "node:assert/strict";

import {
  CanonicalObservationKind,
  CommandOutcome,
  MessageChannelKind,
  ProcessStatus,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type { DeliverMessageStimulus, Scenario } from "@bpmn-lean/semantic-core";
import { ProcessCommandResultKind, submitMessageDelivery } from "@bpmn-lean/temporal-testkit";

import {
  assertExactMessageSignals,
  assertNoNonSignalMessageHostEvents,
  completedMessageResult,
  expectedWorkflowChainRecoveryEntry,
  fetchMessageHistory,
  requireMessageDelivery,
  requireMessageStart,
  startMessageWorkflow,
  waitForMessageSignalCount,
  waitForMessageState,
} from "./message-temporal-test-support.ts";
import type { MessageTemporalCaseContext } from "./message-temporal-test-support.ts";
import { assertWorkflowChainPatchHistory } from "./temporal-history-facts.ts";
import { compileExecutionInput, loadJson } from "./temporal-test-support.ts";

const scenarioUrl = new URL("../../../../scenarios/addressless-receive-task/scenario.json", import.meta.url);
const bpmnUrl = new URL("../../../../scenarios/addressless-receive-task/process.bpmn", import.meta.url);

export async function exerciseAddresslessReceiveTask(context: MessageTemporalCaseContext): Promise<void> {
  const input = await compileExecutionInput(await loadJson<Scenario>(scenarioUrl), bpmnUrl);
  const start = requireMessageStart(input.scenario);
  const delivery = requireMessageDelivery(input.scenario);
  assert.deepEqual(delivery.channel, { kind: MessageChannelKind.UnspecifiedMessage });
  const handle = await startMessageWorkflow(context.environment, start, input.semanticProcess);
  const waiting = await waitForMessageState(handle, (state) => state.openMessageSubscriptions.length === 1);
  assert.deepEqual(waiting.openMessageSubscriptions, [{ id: delivery.subscriptionId, channel: delivery.channel }]);
  assert.deepEqual(waiting.enabledInteractions, [{
    kind: StimulusKind.DeliverMessage,
    subscriptionId: delivery.subscriptionId,
    channel: delivery.channel,
  }]);

  const named = {
    ...delivery,
    commandId: "named-message-first",
    channel: { kind: MessageChannelKind.DirectMessage, messageId: "Message_CourierPickup" },
  } satisfies DeliverMessageStimulus;
  assert.deepEqual(await submitMessageDelivery(context.environment.client.workflow, start.instanceId, named), {
    kind: ProcessCommandResultKind.Semantic,
    commandId: named.commandId,
    outcome: CommandOutcome.Rejected,
  });
  assert.deepEqual(await waitForMessageState(handle, (state) => state.openMessageSubscriptions.length === 1), waiting);

  await context.suspendWorker();
  const workerDownDelivery = submitMessageDelivery(context.environment.client.workflow, start.instanceId, delivery);
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

  const terminalResult = await completedMessageResult(handle);
  assert.equal(terminalResult.receipt.finalState.kind, CanonicalObservationKind.State);
  assert.equal(terminalResult.receipt.finalState.status, ProcessStatus.Completed);
  assert.deepEqual(terminalResult.receipt.finalState.openMessageSubscriptions, []);
  assert.deepEqual(terminalResult.recoveryEntries, [
    expectedWorkflowChainRecoveryEntry(start.instanceId, named, CommandOutcome.Rejected),
    expectedWorkflowChainRecoveryEntry(start.instanceId, delivery, CommandOutcome.Committed),
  ]);
  const history = await fetchMessageHistory(handle);
  assertWorkflowChainPatchHistory(history, 1);
  context.retainHistory(history, handle.workflowId);
  assertExactMessageSignals(history, [named, delivery]);
  assertNoNonSignalMessageHostEvents(history);
}
