import assert from "node:assert/strict";
import test from "node:test";

import {
  MessageChannelKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationRegistrationFailureKind,
} from "@bpmn-lean/temporal-protocol";
import type {
  MessageDeliveryResolution,
} from "@bpmn-lean/temporal-protocol";

import {
  acceptMessageDelivery,
  recordCorrelationRegistrationFailure,
} from "../dist/index.js";

const stimulus = {
  kind: StimulusKind.DeliverPayloadMessage,
  commandId: "open-correlated-wait",
  subscriptionId: {
    processInstanceId: "ProcessInstance_1",
    elementId: "MessageCatch_Initial",
    activation: 1,
  },
  channel: {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_1",
    interfaceOperationId: "Operation_1",
    messageId: "Message_1",
  },
  payload: { kind: VariableValueKind.String, value: "key-1" },
} as const;

const address = {
  definition: {
    compiler: "bpmn-source-semantic-process",
    semanticProfile: "message-key-correlation-checkpoint",
    sourceId: "source-1",
    sourceSha256: "a".repeat(64),
    sourceOverlay: null,
  },
  processId: "Process_1",
  channel: stimulus.channel,
  correlationKeyId: "CorrelationKey_1",
} as const;

test("retained registration failure retries require the exact correlation address", () => {
  const resolutions: MessageDeliveryResolution[] = [];
  assert.deepEqual(acceptMessageDelivery(resolutions, stimulus), {
    enqueue: true,
  });
  recordCorrelationRegistrationFailure(
    resolutions,
    stimulus,
    CorrelationRegistrationFailureKind.CandidateCapacity,
    address,
    stimulus.commandId,
  );
  assert.doesNotThrow(() => recordCorrelationRegistrationFailure(
    resolutions,
    stimulus,
    CorrelationRegistrationFailureKind.CandidateCapacity,
    address,
    stimulus.commandId,
  ));
  assert.throws(
    () => recordCorrelationRegistrationFailure(
      resolutions,
      stimulus,
      CorrelationRegistrationFailureKind.CandidateCapacity,
      { ...address, correlationKeyId: "CorrelationKey_Changed" },
      stimulus.commandId,
    ),
    /no pending correlation registration/u,
  );
});
