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
  CorrelationCandidateRegistrationPhase,
  CorrelationCandidateScanCompletionKind,
  beginCorrelationCandidateScanUpdateId,
  canonicalCorrelationCandidateScanActivityRequestEncoding,
  correlationCandidateRegistrationContentSha256,
  finishCorrelationCandidateScanUpdateId,
  productionCorrelationIngressConfiguration,
  requireCorrelationCandidateScanActivityRequest,
  requireCorrelationCandidateScanCompletion,
  requireCorrelationCandidateScanRequest,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationRecord,
  CorrelationCandidateScanActivityRequest,
  CorrelationCandidateScanCompletion,
} from "@bpmn-lean/temporal-protocol";

const first = registration("Registration_1", "ProcessInstance_1", "settlement-42");
const second = registration("Registration_2", "ProcessInstance_2", "settlement-43");
const request: CorrelationCandidateScanActivityRequest = {
  scanId: "Scan_1",
  address: first.candidate.address,
  registrations: [first, second],
  configuration: productionCorrelationIngressConfiguration,
};
const completion: CorrelationCandidateScanCompletion = {
  kind: CorrelationCandidateScanCompletionKind.Complete,
  scanId: request.scanId,
  candidates: [first.candidate, second.candidate],
};

test("content-binds both scan Updates and one complete ordered Activity vector", () => {
  assert.deepEqual(
    requireCorrelationCandidateScanRequest(
      { scanId: request.scanId },
      productionCorrelationIngressConfiguration,
    ),
    { scanId: request.scanId },
  );
  assert.match(
    beginCorrelationCandidateScanUpdateId({ scanId: request.scanId }),
    /^bpmn-correlation-scan-begin-sha256:[0-9a-f]{64}$/u,
  );
  assert.match(
    finishCorrelationCandidateScanUpdateId(completion),
    /^bpmn-correlation-scan-finish-sha256:[0-9a-f]{64}$/u,
  );
  assert.notEqual(
    beginCorrelationCandidateScanUpdateId({ scanId: request.scanId }),
    beginCorrelationCandidateScanUpdateId({ scanId: "Scan_2" }),
  );
  assert.match(
    canonicalCorrelationCandidateScanActivityRequestEncoding(request),
    /^\["bpmnCorrelationCandidateScanActivity",/u,
  );
  assert.deepEqual(requireCorrelationCandidateScanActivityRequest(request), request);
  assert.deepEqual(
    requireCorrelationCandidateScanCompletion(completion, request),
    completion,
  );
});

test("rejects a partial, reordered, changed, or widened candidate vector", () => {
  for (const candidates of [
    [first.candidate],
    [second.candidate, first.candidate],
    [{
      ...first.candidate,
      key: { kind: VariableValueKind.String, value: "changed" },
    }, second.candidate],
  ]) {
    assert.throws(() =>
      requireCorrelationCandidateScanCompletion(
        { ...completion, candidates },
        request,
      )
    );
  }
  assert.throws(() =>
    requireCorrelationCandidateScanCompletion(
      { ...completion, unexpected: true },
      request,
    )
  );
});

test("rejects malformed scan identity and an Activity envelope beyond its bound", () => {
  assert.throws(() =>
    requireCorrelationCandidateScanRequest(
      { scanId: "x".repeat(129) },
      productionCorrelationIngressConfiguration,
    )
  );
  assert.throws(() =>
    requireCorrelationCandidateScanActivityRequest({
      ...request,
      configuration: {
        ...productionCorrelationIngressConfiguration,
        maxActivityPayloadBytes:
          canonicalCorrelationCandidateScanActivityRequestEncoding(request).length - 1,
      },
    })
  );
});

function registration(
  transactionId: string,
  processInstanceId: string,
  key: string,
): CorrelationCandidateRegistrationRecord {
  const candidate = correlatedCandidate(processInstanceId, key);
  const base = {
    transactionId,
    candidate,
    processLocator: { workflowId: `bpmn-process-sha256:${processInstanceId}` },
  };
  return {
    ...base,
    contentSha256: correlationCandidateRegistrationContentSha256(base),
    phase: CorrelationCandidateRegistrationPhase.Active,
  };
}

function correlatedCandidate(
  processInstanceId: string,
  key: string,
): CorrelatedMessageCandidate {
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
