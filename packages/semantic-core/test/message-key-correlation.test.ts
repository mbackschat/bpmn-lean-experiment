import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CorrelatedMessageMatchKind,
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
  matchCorrelatedMessageCandidates,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
  CorrelatedMessageCandidate,
} from "@bpmn-lean/semantic-core";

const channel = Object.freeze({
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_Settlement",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_Settlement",
} as const);

function address(
  sourceSha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
): CorrelatedMessageAddress {
  return {
    definition: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: "bpmn-2.0.2-message-key-correlation-draft",
      sourceId: "settlement-correlation",
      sourceSha256,
      sourceOverlay: null,
    },
    processId: "Process_SettlementCorrelation",
    channel,
    correlationKeyId: "CorrelationKey_SettlementReference",
  };
}

function candidate(
  processInstanceId: string,
  key: string,
  selectedAddress: CorrelatedMessageAddress = address(),
): CorrelatedMessageCandidate {
  return {
    address: selectedAddress,
    processInstanceId,
    subscriptionId: {
      processInstanceId,
      elementId: "MessageCatch_CorrelatedSettlement",
      activation: 1,
    },
    correlationPropertyId: "CorrelationProperty_SettlementReference",
    processPropertyId: "Property_SettlementReference",
    key: { kind: VariableValueKind.String, value: key },
  };
}

test("matches exact cardinality without using candidate order as a winner", () => {
  const selectedAddress = address();
  const payload = {
    kind: VariableValueKind.String,
    value: "settlement-42",
  } as const;

  assert.deepEqual(
    matchCorrelatedMessageCandidates(selectedAddress, payload, []),
    { kind: CorrelatedMessageMatchKind.NoMatch },
  );
  assert.deepEqual(
    matchCorrelatedMessageCandidates(selectedAddress, payload, [
      candidate("ProcessInstance_A", "settlement-42"),
    ]),
    {
      kind: CorrelatedMessageMatchKind.Unique,
      candidate: candidate("ProcessInstance_A", "settlement-42"),
    },
  );
  assert.deepEqual(
    matchCorrelatedMessageCandidates(selectedAddress, payload, [
      candidate("ProcessInstance_B", "settlement-42"),
      candidate("ProcessInstance_A", "settlement-42"),
    ]),
    { kind: CorrelatedMessageMatchKind.Ambiguous },
  );
});

test("excludes an equal-local-id candidate from a different immutable definition", () => {
  const selectedAddress = address();
  const otherDefinition = address(
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  );

  assert.deepEqual(
    matchCorrelatedMessageCandidates(
      selectedAddress,
      { kind: VariableValueKind.String, value: "settlement-42" },
      [
        candidate("ProcessInstance_Other", "settlement-42", otherDefinition),
        candidate("ProcessInstance_Selected", "settlement-42"),
      ],
    ),
    {
      kind: CorrelatedMessageMatchKind.Unique,
      candidate: candidate("ProcessInstance_Selected", "settlement-42"),
    },
  );
});

test("refuses incomplete candidate facts instead of manufacturing uniqueness", () => {
  const malformed = {
    ...candidate("ProcessInstance_Malformed", "settlement-42"),
    correlationPropertyId: "",
  } as CorrelatedMessageCandidate;

  assert.equal(
    matchCorrelatedMessageCandidates(
      address(),
      { kind: VariableValueKind.String, value: "settlement-42" },
      [malformed],
    ),
    null,
  );
});
