/**
 * Locks the Workflow-local Message delivery ledger independently of Temporal transport.
 *
 * The ledger preserves accepted Signal order, coalesces exact retries, records identity conflicts without throwing, and binds semantic results to the exact attempted stimulus.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  MessageChannelKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  DeliverMessageStimulus,
  DeliverPayloadMessageStimulus,
} from "@bpmn-lean/semantic-core";
import {
  MessageDeliveryResolutionKind,
  acceptMessageDelivery,
  recordMessageDeliveryOutcome,
} from "@bpmn-lean/temporal-testkit";
import type {
  MessageDeliveryResolution,
} from "@bpmn-lean/temporal-testkit";

const delivery = {
  kind: StimulusKind.DeliverMessage,
  commandId: "deliver-message",
  subscriptionId: {
    processInstanceId: "Instance_1",
    elementId: "MessageCatch_1",
    activation: 1,
  },
  channel: {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "MessageInterface_1",
    interfaceOperationId: "ReceiveMessage_1",
    messageId: "Message_1",
  },
} as const satisfies DeliverMessageStimulus;

test("preserves first acceptance and coalesces an exact duplicate", () => {
  const records: MessageDeliveryResolution[] = [];
  const first = acceptMessageDelivery(records, delivery);
  const duplicate = acceptMessageDelivery(records, delivery);

  assert.equal(first.enqueue, true);
  assert.equal(duplicate.enqueue, false);
  assert.deepEqual(records, [{
    kind: MessageDeliveryResolutionKind.Pending,
    stimulus: delivery,
  }]);

  recordMessageDeliveryOutcome(
    records,
    delivery,
    CommandOutcome.Committed,
  );
  assert.deepEqual(records, [{
    kind: MessageDeliveryResolutionKind.Semantic,
    stimulus: delivery,
    outcome: CommandOutcome.Committed,
  }]);
});

test("records conflicting content in Signal order without replacing the first command", () => {
  const records: MessageDeliveryResolution[] = [];
  const conflicting = {
    ...delivery,
    channel: {
      ...delivery.channel,
      messageId: "OtherMessage",
    },
  } satisfies DeliverMessageStimulus;

  acceptMessageDelivery(records, delivery);
  const conflict = acceptMessageDelivery(records, conflicting);

  assert.equal(conflict.enqueue, false);
  assert.deepEqual(records, [
    {
      kind: MessageDeliveryResolutionKind.Pending,
      stimulus: delivery,
    },
    {
      kind: MessageDeliveryResolutionKind.RequestFailure,
      stimulus: conflicting,
      failure: "commandIdentityConflict",
    },
  ]);
  assert.doesNotThrow(() =>
    recordMessageDeliveryOutcome(
      records,
      delivery,
      CommandOutcome.Rejected,
    )
  );
});

test("treats a payload change under one command identity as a conflict", () => {
  const records: MessageDeliveryResolution[] = [];
  const first = {
    ...delivery,
    kind: StimulusKind.DeliverPayloadMessage,
    payload: {
      kind: VariableValueKind.String,
      value: "payload-a",
    },
  } as const satisfies DeliverPayloadMessageStimulus;
  const changed = {
    ...first,
    payload: {
      kind: VariableValueKind.String,
      value: "payload-b",
    },
  } as const satisfies DeliverPayloadMessageStimulus;

  assert.equal(acceptMessageDelivery(records, first).enqueue, true);
  assert.equal(acceptMessageDelivery(records, first).enqueue, false);
  assert.equal(acceptMessageDelivery(records, changed).enqueue, false);
  assert.deepEqual(records, [
    {
      kind: MessageDeliveryResolutionKind.Pending,
      stimulus: first,
    },
    {
      kind: MessageDeliveryResolutionKind.RequestFailure,
      stimulus: changed,
      failure: "commandIdentityConflict",
    },
  ]);
});
