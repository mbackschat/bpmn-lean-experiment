import assert from "node:assert/strict";
import { test } from "node:test";

import {
  verifyScenarioVariableValueContract,
} from "./scenario-variable-value-contract.ts";

const profile = "bpmn-2.0.2-message-payload-catch-draft";

function payloadStimulus(payload: unknown, commandId = "deliver-payload") {
  return {
    kind: "deliverPayloadMessage",
    commandId,
    subscriptionId: {
      processInstanceId: "MessagePayloadCatchContract",
      elementId: "MessageCatch_SettlementConfirmed",
      activation: 1,
    },
    channel: {
      kind: "operationMessage",
      interfaceId: "Interface_ClearingHouse",
      interfaceOperationId: "Operation_ConfirmSettlement",
      messageId: "Message_SettlementConfirmed",
    },
    payload,
  } as const;
}

function verifyPayload(payload: unknown, selectedProfile = profile): void {
  verifyScenarioVariableValueContract({
    profile: selectedProfile,
    stimuli: [payloadStimulus(payload)],
  });
}

test("admits the bounded scalar Message payload domain", () => {
  const scalarPayloads = [
    { kind: "boolean", value: true },
    { kind: "integer", value: Number.MAX_SAFE_INTEGER },
    { kind: "string", value: "settlement-reference-123" },
    { kind: "null" },
  ] as const;

  for (const payload of scalarPayloads) {
    assert.doesNotThrow(() => verifyPayload(payload), payload.kind);
  }
});

test("refuses collection, wrong-profile, invalid-integer, and oversized payload stimuli", () => {
  assert.throws(
    () => verifyPayload({ kind: "stringList", value: ["one"] }),
    /admits only Boolean, Integer, String, and Null payloads/u,
  );
  assert.throws(
    () => verifyPayload(
      { kind: "string", value: "settlement-reference-123" },
      "bpmn-2.0.2-intermediate-catch-message-draft",
    ),
    /only admitted for the Message payload catch profile/u,
  );
  for (const value of [-1, -0, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => verifyPayload({ kind: "integer", value }),
      /non-negative safe integer/u,
    );
  }
  assert.throws(
    () => verifyPayload({ kind: "string", value: "x".repeat(16_385) }),
    /tagged value exceeds 16384 UTF-8 bytes/u,
  );
  assert.throws(
    () =>
      verifyScenarioVariableValueContract({
        profile,
        stimuli: [payloadStimulus({ kind: "null" }, "x".repeat(65_537))],
      }),
    /stimulus exceeds 65536 UTF-8 bytes/u,
  );
});
