import assert from "node:assert/strict";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageCandidate,
} from "@bpmn-lean/semantic-core";
import {
  canonicalCorrelationCandidateRegistrationEncoding,
  finalizeCorrelationCandidateRegistrationUpdateId,
  prepareCorrelationCandidateRegistrationUpdateId,
  requireCorrelationCandidateRegistrationRequest,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationRequest,
} from "@bpmn-lean/temporal-protocol";

const request = registration("Registration_1", "settlement-42");

test("validates one exact candidate-registration transaction and content-binds both Update phases", () => {
  assert.deepEqual(requireCorrelationCandidateRegistrationRequest(request), request);
  assert.match(
    canonicalCorrelationCandidateRegistrationEncoding(request),
    /^\["bpmnCorrelationCandidateRegistration",/u,
  );
  assert.match(
    prepareCorrelationCandidateRegistrationUpdateId(request),
    /^bpmn-correlation-prepare-sha256:[0-9a-f]{64}$/u,
  );
  assert.match(
    finalizeCorrelationCandidateRegistrationUpdateId(request),
    /^bpmn-correlation-finalize-sha256:[0-9a-f]{64}$/u,
  );
  assert.notEqual(
    prepareCorrelationCandidateRegistrationUpdateId(request),
    finalizeCorrelationCandidateRegistrationUpdateId(request),
  );

  const changed = registration("Registration_1", "settlement-43");
  assert.notEqual(
    prepareCorrelationCandidateRegistrationUpdateId(request),
    prepareCorrelationCandidateRegistrationUpdateId(changed),
  );
});

test("rejects incomplete, widened, and overlong transaction identities", () => {
  const missing = structuredClone(request) as Record<string, unknown>;
  delete missing.processLocator;
  assert.throws(() => requireCorrelationCandidateRegistrationRequest(missing));

  assert.throws(() =>
    requireCorrelationCandidateRegistrationRequest({
      ...request,
      unexpected: true,
    })
  );
  assert.throws(() =>
    requireCorrelationCandidateRegistrationRequest({
      ...request,
      transactionId: "x".repeat(129),
    })
  );
});

function registration(
  transactionId: string,
  key: string,
): CorrelationCandidateRegistrationRequest {
  return {
    transactionId,
    candidate: candidate(key),
    processLocator: { workflowId: "bpmn-process-sha256:process-1" },
  };
}

function candidate(key: string): CorrelatedMessageCandidate {
  const processInstanceId = "ProcessInstance_1";
  return {
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
    processInstanceId,
    subscriptionId: {
      processInstanceId,
      elementId: "Catch_SettlementConfirmed",
      activation: 1,
    },
    correlationPropertyId: "CorrelationProperty_SettlementReference",
    processPropertyId: "Property_SettlementReference",
    key: { kind: VariableValueKind.String, value: key },
  };
}
