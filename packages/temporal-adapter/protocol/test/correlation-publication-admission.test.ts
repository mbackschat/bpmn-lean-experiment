import assert from "node:assert/strict";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  canonicalCorrelationPublicationCommandEncoding,
  correlationPublicationContentSha256,
  correlationPublicationUpdateId,
  productionCorrelationIngressConfiguration,
  requireCorrelationPublicationCommand,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationPublicationCommand,
} from "@bpmn-lean/temporal-protocol";

const command = publication("Publication_1", "settlement-42");

test("content-binds command id, complete address, and payload", () => {
  assert.deepEqual(requireCorrelationPublicationCommand(command), command);
  assert.match(
    canonicalCorrelationPublicationCommandEncoding(command),
    /^\["bpmnCorrelationPublication",/u,
  );
  assert.match(
    correlationPublicationContentSha256(command),
    /^[0-9a-f]{64}$/u,
  );
  assert.match(
    correlationPublicationUpdateId(command),
    /^bpmn-correlation-publish-sha256:[0-9a-f]{64}$/u,
  );
  for (const changed of [
    { ...command, commandId: "Publication_2" },
    {
      ...command,
      address: { ...command.address, processId: "Process_Other" },
    },
    {
      ...command,
      payload: { kind: VariableValueKind.String, value: "settlement-43" },
    },
  ]) {
    assert.notEqual(
      correlationPublicationUpdateId(command),
      correlationPublicationUpdateId(changed),
    );
  }
});

test("rejects malformed and over-bound publication content before admission", () => {
  for (const malformed of [
    { ...command, commandId: "" },
    { ...command, commandId: "x".repeat(
      productionCorrelationIngressConfiguration.maxCommandIdUtf8Bytes + 1,
    ) },
    { ...command, payload: { kind: VariableValueKind.String, value: "" } },
    { ...command, payload: { kind: "integer", value: 42 } },
    { ...command, unexpected: true },
  ]) {
    assert.throws(() => requireCorrelationPublicationCommand(malformed));
  }
});

function publication(
  commandId: string,
  value: string,
): CorrelationPublicationCommand {
  return {
    commandId,
    address: {
      definition: {
        compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
        semanticProfile: "message-key-correlation-checkpoint",
        sourceId: "settlement-confirmation",
        sourceSha256: "a".repeat(64),
        sourceOverlay: null,
      },
      processId: "Process_SettlementConfirmation",
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId: "Interface_Settlement",
        interfaceOperationId: "Operation_ConfirmSettlement",
        messageId: "Message_SettlementConfirmed",
      },
      correlationKeyId: "CorrelationKey_Settlement",
    },
    payload: { kind: VariableValueKind.String, value },
  };
}
