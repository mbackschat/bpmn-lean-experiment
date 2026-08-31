import assert from "node:assert/strict";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageCandidate,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationCandidateRegistrationPhase,
  CorrelationCandidateRegistrationResultKind,
  CorrelationCandidateCapacityMeasure,
  CorrelationCandidateScanResultKind,
  canonicalCorrelationCandidateLocatorSetEncoding,
  canonicalCorrelationCandidateRegistrationEncoding,
  canonicalCorrelationPublicationLedgerRecordEnvelopeEncoding,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationRequest,
} from "@bpmn-lean/temporal-protocol";
import {
  CorrelationCandidateRegistrationFault,
  CorrelationCandidateRegistrationFaultCode,
  beginCorrelationCandidateScan,
  emptyCorrelationCandidateRegistrationState,
  finalizeCorrelationCandidateRegistration,
  finishCorrelationCandidateScan,
  prepareCorrelationCandidateRegistration,
} from "../dist/index.js";

const first = registration("Registration_1", "ProcessInstance_1", "settlement-42");
const second = registration("Registration_2", "ProcessInstance_2", "settlement-43");
const address = first.candidate.address;
const configuration = productionCorrelationIngressConfiguration;

test("makes a pending registration and a scan barrier mutually exclusive", () => {
  const empty = emptyCorrelationCandidateRegistrationState();
  const scan = beginCorrelationCandidateScan(
    empty,
    address,
    configuration,
    "Scan_1",
  );
  assert.deepEqual(scan.result, {
    kind: CorrelationCandidateScanResultKind.Started,
    scanId: "Scan_1",
    candidates: [],
  });

  const deferred = prepareCorrelationCandidateRegistration(
    scan.state,
    address,
    configuration,
    first,
  );
  assert.deepEqual(deferred.result, {
    kind: CorrelationCandidateRegistrationResultKind.DeferredByScan,
    transactionId: first.transactionId,
    scanId: "Scan_1",
  });
  assert.strictEqual(deferred.state, scan.state);
  assert.deepEqual(deferred.state.records, []);

  const finished = finishCorrelationCandidateScan(
    deferred.state,
    address,
    configuration,
    "Scan_1",
  );
  const prepared = prepareCorrelationCandidateRegistration(
    finished.state,
    address,
    configuration,
    first,
  );
  assert.equal(
    prepared.result.kind,
    CorrelationCandidateRegistrationResultKind.Prepared,
  );

  const blocked = beginCorrelationCandidateScan(
    prepared.state,
    address,
    configuration,
    "Scan_2",
  );
  assert.deepEqual(blocked.result, {
    kind: CorrelationCandidateScanResultKind.BlockedByPendingRegistration,
    scanId: "Scan_2",
    pendingTransactionIds: [first.transactionId],
  });
  assert.strictEqual(blocked.state, prepared.state);
});

test("retains exact retries, rejects changed content, and activates only the prepared fact", () => {
  const prepared = prepareCorrelationCandidateRegistration(
    emptyCorrelationCandidateRegistrationState(),
    address,
    configuration,
    first,
  );
  assert.deepEqual(prepared.result, {
    kind: CorrelationCandidateRegistrationResultKind.Prepared,
    transactionId: first.transactionId,
    phase: CorrelationCandidateRegistrationPhase.Pending,
  });

  const retried = prepareCorrelationCandidateRegistration(
    prepared.state,
    address,
    configuration,
    first,
  );
  assert.deepEqual(retried.result, {
    kind: CorrelationCandidateRegistrationResultKind.Retained,
    transactionId: first.transactionId,
    phase: CorrelationCandidateRegistrationPhase.Pending,
  });
  assert.strictEqual(retried.state, prepared.state);

  assertIdentityConflict(() =>
    prepareCorrelationCandidateRegistration(
      prepared.state,
      address,
      configuration,
      { ...first, candidate: { ...first.candidate, key: { kind: VariableValueKind.String, value: "changed" } } },
    )
  );

  const finalized = finalizeCorrelationCandidateRegistration(
    prepared.state,
    address,
    configuration,
    first,
  );
  assert.deepEqual(finalized.result, {
    kind: CorrelationCandidateRegistrationResultKind.Finalized,
    transactionId: first.transactionId,
    phase: CorrelationCandidateRegistrationPhase.Active,
  });
  assert.deepEqual(finalized.state.records, [{
    transactionId: first.transactionId,
    contentSha256: finalized.state.records[0]?.contentSha256,
    phase: CorrelationCandidateRegistrationPhase.Active,
    candidate: first.candidate,
    processLocator: first.processLocator,
  }]);

  const finalizeRetry = finalizeCorrelationCandidateRegistration(
    finalized.state,
    address,
    configuration,
    first,
  );
  assert.deepEqual(finalizeRetry.result, {
    kind: CorrelationCandidateRegistrationResultKind.Retained,
    transactionId: first.transactionId,
    phase: CorrelationCandidateRegistrationPhase.Active,
  });
  assert.strictEqual(finalizeRetry.state, finalized.state);
});

test("returns address quarantine without recording a new transaction", () => {
  const prepared = prepareCorrelationCandidateRegistration(
    emptyCorrelationCandidateRegistrationState(),
    address,
    configuration,
    first,
  );
  const finalized = finalizeCorrelationCandidateRegistration(
    prepared.state,
    address,
    configuration,
    first,
  );
  const quarantined = {
    ...finalized.state,
    records: finalized.state.records.map((record) => ({
      ...record,
      phase: CorrelationCandidateRegistrationPhase.Quarantined,
    })),
  };

  const refused = prepareCorrelationCandidateRegistration(
    quarantined,
    address,
    configuration,
    second,
  );
  assert.deepEqual(refused.result, {
    kind: CorrelationCandidateRegistrationResultKind.AddressQuarantined,
    transactionId: second.transactionId,
  });
  assert.strictEqual(refused.state, quarantined);
  assert.equal(refused.state.records.length, 1);
});

test("admits exact capacity and refuses one-over count, locator, Activity, and result-envelope bounds", () => {
  const prepared = prepareCorrelationCandidateRegistration(
    emptyCorrelationCandidateRegistrationState(),
    address,
    configuration,
    first,
  );
  const locatorBytes = utf8ByteLength(
    canonicalCorrelationCandidateLocatorSetEncoding(prepared.state.records),
  );
  const activityBytes = utf8ByteLength(
    canonicalCorrelationCandidateRegistrationEncoding(first),
  );
  const resultEnvelopeBytes = utf8ByteLength(
    canonicalCorrelationPublicationLedgerRecordEnvelopeEncoding(
      first.candidate,
      configuration,
    ),
  );

  assert.equal(
    prepareCorrelationCandidateRegistration(
      emptyCorrelationCandidateRegistrationState(),
      address,
      { ...configuration, maxCandidateLocatorCanonicalBytes: locatorBytes },
      first,
    ).result.kind,
    CorrelationCandidateRegistrationResultKind.Prepared,
  );
  assertCapacity(
    prepareCorrelationCandidateRegistration(
      emptyCorrelationCandidateRegistrationState(),
      address,
      { ...configuration, maxCandidateLocatorCanonicalBytes: locatorBytes - 1 },
      first,
    ).result,
    CorrelationCandidateCapacityMeasure.CandidateLocatorCanonicalBytes,
    locatorBytes - 1,
    locatorBytes,
  );

  assert.equal(
    prepareCorrelationCandidateRegistration(
      emptyCorrelationCandidateRegistrationState(),
      address,
      { ...configuration, maxActivityPayloadBytes: activityBytes },
      first,
    ).result.kind,
    CorrelationCandidateRegistrationResultKind.Prepared,
  );
  assertCapacity(
    prepareCorrelationCandidateRegistration(
      emptyCorrelationCandidateRegistrationState(),
      address,
      { ...configuration, maxActivityPayloadBytes: activityBytes - 1 },
      first,
    ).result,
    CorrelationCandidateCapacityMeasure.ActivityRequestCanonicalBytes,
    activityBytes - 1,
    activityBytes,
  );

  assert.equal(
    prepareCorrelationCandidateRegistration(
      emptyCorrelationCandidateRegistrationState(),
      address,
      { ...configuration, publicationLedgerRecordBytes: resultEnvelopeBytes },
      first,
    ).result.kind,
    CorrelationCandidateRegistrationResultKind.Prepared,
  );
  assertCapacity(
    prepareCorrelationCandidateRegistration(
      emptyCorrelationCandidateRegistrationState(),
      address,
      { ...configuration, publicationLedgerRecordBytes: resultEnvelopeBytes - 1 },
      first,
    ).result,
    CorrelationCandidateCapacityMeasure.PublicationLedgerRecordBytes,
    resultEnvelopeBytes - 1,
    resultEnvelopeBytes,
  );

  assertCapacity(
    prepareCorrelationCandidateRegistration(
      prepared.state,
      address,
      { ...configuration, maxCandidateLocatorRecords: 1 },
      second,
    ).result,
    CorrelationCandidateCapacityMeasure.CandidateLocatorRecords,
    1,
    2,
  );
});

function assertCapacity(
  result: ReturnType<typeof prepareCorrelationCandidateRegistration>["result"],
  measure: CorrelationCandidateCapacityMeasure,
  configuredBound: number,
  observedValue: number,
): void {
  assert.deepEqual(result, {
    kind: CorrelationCandidateRegistrationResultKind.CandidateCapacity,
    transactionId: result.transactionId,
    failure: { measure, configuredBound, observedValue },
  });
}

function assertIdentityConflict(run: () => unknown): void {
  assert.throws(
    run,
    (error: unknown) =>
      error instanceof CorrelationCandidateRegistrationFault &&
      error.code === CorrelationCandidateRegistrationFaultCode.IdentityConflict,
  );
}

function registration(
  transactionId: string,
  processInstanceId: string,
  key: string,
): CorrelationCandidateRegistrationRequest {
  return {
    transactionId,
    candidate: candidate(processInstanceId, key),
    processLocator: { workflowId: `bpmn-process-sha256:${processInstanceId}` },
  };
}

function candidate(
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
