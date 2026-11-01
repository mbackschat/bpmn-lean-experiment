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
  Scenario,
} from "@bpmn-lean/semantic-core";
import {
  MessageDeliveryResolutionKind,
  acceptMessageDelivery,
  recordMessageDeliveryOutcome,
} from "@bpmn-lean/temporal-testkit";
import type {
  MessageDeliveryResolution,
} from "@bpmn-lean/temporal-testkit";

import { loadJson, requiredAt } from "./temporal-test-support.ts";

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

test("coalesces an exact structured-manifest redelivery and conflicts on one changed nested leaf (PBV-MSG-03)", async () => {
  const scenario = await loadJson<Scenario>(new URL(
    "../../../../scenarios/portable-business-message-payload/manifest-delivered.scenario.json",
    import.meta.url,
  ));
  const manifest = requiredAt(scenario.stimuli, 1, "manifest stimuli");
  if (manifest.kind !== StimulusKind.DeliverPayloadMessage) {
    assert.fail("the manifest scenario delivers its payload second");
  }
  // The last parcel's reference sits three levels below the root, so only a recursive identity encoding separates it.
  const changed = structuredClone(manifest);
  const parcels = changed.payload.kind === VariableValueKind.Map
    ? changed.payload.value.find(({ name }) => name === "parcels")?.value
    : undefined;
  const lastParcel = parcels?.kind === VariableValueKind.List ? parcels.value[2] : undefined;
  const reference = lastParcel?.kind === VariableValueKind.Map ? lastParcel.value[0]?.value : undefined;
  if (reference?.kind !== VariableValueKind.String) {
    assert.fail("the manifest's last parcel carries a String reference");
  }
  (reference as { value: string }).value = "P-3";

  const records: MessageDeliveryResolution[] = [];
  assert.equal(acceptMessageDelivery(records, manifest).enqueue, true);
  assert.equal(acceptMessageDelivery(records, structuredClone(manifest)).enqueue, false);
  assert.equal(acceptMessageDelivery(records, changed).enqueue, false);
  assert.deepEqual(records, [
    { kind: MessageDeliveryResolutionKind.Pending, stimulus: manifest },
    { kind: MessageDeliveryResolutionKind.RequestFailure, stimulus: changed, failure: "commandIdentityConflict" },
  ]);
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
