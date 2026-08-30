import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  CheckedProcess,
  SemanticOriginKind,
  SemanticProcessProgram,
} from "../packages/semantic-core/src/index.ts";
import { verifyDefinitionReferences } from "./contract-artifact-consistency.ts";
import { verifyPayloadMessageCatchBindings } from "./message-payload-catch-artifact-consistency.ts";

const channel = {
  kind: "operationMessage",
  interfaceId: "Interface_ClearingHouse",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
} as const;
const directOutput = {
  associationId: "DataOutputAssociation_SettlementReference",
  sourceDataOutputId: "DataOutput_ConfirmedReference",
  sourceDataOutputName: "Confirmed settlement reference",
  targetPropertyId: "Property_SettlementReference",
} as const;
const bpmnSequenceFlowOriginKind =
  "bpmnSequenceFlow" as SemanticOriginKind.BpmnSequenceFlow;
const checkedNode = {
  kind: "payloadMessageCatchEvent",
  id: "MessageCatch_SettlementConfirmed",
  channel,
  directOutput,
} as const;
const operation = {
  id: "operation:MessageCatch_SettlementConfirmed",
  kind: "awaitPayloadMessage",
  origin: {
    kind: "bpmnElement",
    elementId: checkedNode.id,
  },
  input: "place:Flow_Instructed_Confirm",
  output: "place:Flow_Confirm_Review",
  message: {
    elementId: checkedNode.id,
    channel,
  },
  directOutput,
} as const;

function artifacts(
  nodes: ReadonlyArray<unknown> = [checkedNode],
  operations: ReadonlyArray<unknown> = [operation],
): readonly [CheckedProcess, SemanticProcessProgram] {
  return [
    { nodes } as unknown as CheckedProcess,
    { operations } as unknown as SemanticProcessProgram,
  ];
}

test("binds one checked payload Message catch exactly to its IL wait", () => {
  assert.doesNotThrow(() => verifyPayloadMessageCatchBindings(...artifacts()));
});

test("includes payload Message catches in complete definition reference verification", () => {
  const [checkedProcess, semanticProcess] = artifacts();
  assert.doesNotThrow(() => verifyDefinitionReferences(
    {
      ...checkedProcess,
      definitionScopes: [],
      nodeScopes: [],
      sequenceFlowScopes: [],
      sequenceFlows: [
        {
          id: "Flow_Instructed_Confirm",
          sourceId: checkedNode.id,
          targetId: checkedNode.id,
          condition: null,
        },
        {
          id: "Flow_Confirm_Review",
          sourceId: checkedNode.id,
          targetId: checkedNode.id,
          condition: null,
        },
      ],
    },
    {
      ...semanticProcess,
      controlPlaces: [
        {
          id: operation.input,
          origin: {
            kind: bpmnSequenceFlowOriginKind,
            elementId: "Flow_Instructed_Confirm",
          },
        },
        {
          id: operation.output,
          origin: {
            kind: bpmnSequenceFlowOriginKind,
            elementId: "Flow_Confirm_Review",
          },
        },
      ],
      definitionScopes: [],
      operationScopes: [],
      controlPlaceScopes: [],
    },
  ));
});

test("rejects every checked-to-IL payload Message catch drift", () => {
  const operationMutations: ReadonlyArray<unknown> = [
    { ...operation, origin: { ...operation.origin, elementId: "MessageCatch_Other" } },
    { ...operation, message: { ...operation.message, elementId: "MessageCatch_Other" } },
    {
      ...operation,
      message: {
        ...operation.message,
        channel: { ...channel, messageId: "Message_Other" },
      },
    },
    {
      ...operation,
      directOutput: { ...directOutput, associationId: "Association_Other" },
    },
    {
      ...operation,
      directOutput: { ...directOutput, sourceDataOutputId: "DataOutput_Other" },
    },
    {
      ...operation,
      directOutput: { ...directOutput, sourceDataOutputName: "Other output" },
    },
    {
      ...operation,
      directOutput: { ...directOutput, targetPropertyId: "Property_Other" },
    },
  ];
  for (const mutation of operationMutations) {
    assert.throws(
      () => verifyPayloadMessageCatchBindings(...artifacts([checkedNode], [mutation])),
      /payload Message catch/u,
    );
  }

  assert.throws(
    () => verifyPayloadMessageCatchBindings(...artifacts([checkedNode], [])),
    /payload Message catch/u,
  );
  assert.throws(
    () => verifyPayloadMessageCatchBindings(...artifacts([], [operation])),
    /payload Message catch/u,
  );
  assert.throws(
    () => verifyPayloadMessageCatchBindings(
      ...artifacts([checkedNode], [operation, { ...operation, id: "operation:duplicate" }]),
    ),
    /payload Message catch/u,
  );
});
