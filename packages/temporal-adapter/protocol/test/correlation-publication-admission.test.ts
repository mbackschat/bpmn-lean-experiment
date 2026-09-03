import assert from "node:assert/strict";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  canonicalCorrelationPublicationCommandEncoding,
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationStatusKind,
  correlationPublicationContentSha256,
  correlationPublicationUpdateId,
  productionCorrelationIngressConfiguration,
  requireCorrelationPublicationAdmissionResult,
  requireCorrelationPublicationCommand,
  requireCorrelationPublicationStatus,
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

test("admits only closed admission and phase-consistent status responses", () => {
  const contentSha256 = correlationPublicationContentSha256(command);
  assert.deepEqual(requireCorrelationPublicationAdmissionResult({
    kind: "admitted",
    commandId: command.commandId,
    contentSha256,
    phase: CorrelationPublicationLedgerPhase.Queued,
    ordinal: null,
  }), {
    kind: "admitted",
    commandId: command.commandId,
    contentSha256,
    phase: CorrelationPublicationLedgerPhase.Queued,
    ordinal: null,
  });
  assert.deepEqual(requireCorrelationPublicationStatus({
    kind: CorrelationPublicationStatusKind.Accepted,
    record: {
      commandId: command.commandId,
      contentSha256,
      phase: CorrelationPublicationLedgerPhase.Settled,
      ordinal: 1,
      target: null,
      resolution: {
        kind: "semantic",
        outcome: { kind: "rejectedNoMatch" },
      },
    },
  }).kind, CorrelationPublicationStatusKind.Accepted);
  assert.deepEqual(requireCorrelationPublicationStatus({
    kind: CorrelationPublicationStatusKind.IdentityConflict,
    commandId: command.commandId,
    requestedContentSha256: contentSha256,
  }), {
    kind: CorrelationPublicationStatusKind.IdentityConflict,
    commandId: command.commandId,
    requestedContentSha256: contentSha256,
  });

  for (const malformed of [
    {
      kind: "admitted",
      commandId: command.commandId,
      contentSha256,
      phase: CorrelationPublicationLedgerPhase.Queued,
      ordinal: 1,
    },
    {
      kind: "admitted",
      commandId: command.commandId,
      contentSha256,
      phase: CorrelationPublicationLedgerPhase.Settled,
      ordinal: 1,
    },
    {
      kind: CorrelationPublicationStatusKind.Accepted,
      record: {
        commandId: command.commandId,
        contentSha256,
        phase: CorrelationPublicationLedgerPhase.Settled,
        ordinal: 1,
        target: null,
        resolution: null,
      },
    },
    {
      kind: CorrelationPublicationStatusKind.Absent,
      commandId: command.commandId,
      contentSha256,
      privateLocator: "must-not-cross",
    },
  ]) {
    assert.throws(() =>
      "record" in malformed || malformed.kind === CorrelationPublicationStatusKind.Absent
        ? requireCorrelationPublicationStatus(malformed)
        : requireCorrelationPublicationAdmissionResult(malformed)
    );
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
