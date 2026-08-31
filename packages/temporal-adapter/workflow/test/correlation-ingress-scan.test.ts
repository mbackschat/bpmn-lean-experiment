import assert from "node:assert/strict";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationCandidateRegistrationPhase,
  CorrelationCandidateRegistrationResultKind,
  CorrelationCandidateScanCompletionKind,
  CorrelationCandidateScanResultKind,
  correlationCandidateRegistrationContentSha256,
  correlationCandidateRegistrationRequestFromRecord,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationRecord,
  CorrelationCandidateRegistrationState,
  CorrelationCandidateScanCompletion,
} from "@bpmn-lean/temporal-protocol";
import {
  CorrelationCandidateScanCoordinator,
  emptyCorrelationCandidateRegistrationState,
  finalizeCorrelationCandidateRegistration,
  prepareCorrelationCandidateRegistration,
} from "../dist/index.js";

const first = registration("Registration_1", "ProcessInstance_1", "settlement-42");
const second = registration("Registration_2", "ProcessInstance_2", "settlement-43");
const address = first.candidate.address;
const configuration = productionCorrelationIngressConfiguration;

test("installs the barrier before fanout and clears it only after exact finish", async () => {
  let state = activeState(first);
  let release!: (completion: CorrelationCandidateScanCompletion) => void;
  const fanout = new Promise<CorrelationCandidateScanCompletion>((resolve) => {
    release = resolve;
  });
  let observedBarrier = false;
  const coordinator = new CorrelationCandidateScanCoordinator({
    address,
    configuration,
    currentState: () => state,
    replaceState: (successor) => {
      state = successor;
    },
    resolve: async (request) => {
      observedBarrier = state.scanBarrier?.scanId === request.scanId;
      return fanout;
    },
  });

  const resolving = coordinator.begin({ scanId: "Scan_1" });
  assert.equal(observedBarrier, true);
  const deferred = prepareCorrelationCandidateRegistration(
    state,
    address,
    configuration,
    correlationCandidateRegistrationRequestFromRecord(second),
  );
  assert.deepEqual(deferred.result, {
    kind: CorrelationCandidateRegistrationResultKind.DeferredByScan,
    transactionId: second.transactionId,
    scanId: "Scan_1",
  });
  assert.strictEqual(deferred.state, state);

  const completion = complete("Scan_1", [first]);
  release(completion);
  assert.deepEqual(await resolving, completion);
  assert.equal(state.scanBarrier?.scanId, "Scan_1");
  assert.deepEqual(coordinator.finish(completion), {
    kind: CorrelationCandidateScanResultKind.Finished,
    scanId: "Scan_1",
  });
  assert.equal(state.scanBarrier, null);
});

test("retains one scan identity and barrier across failed all-or-infrastructure fanout", async () => {
  let state = activeState(first);
  let attempts = 0;
  const coordinator = new CorrelationCandidateScanCoordinator({
    address,
    configuration,
    currentState: () => state,
    replaceState: (successor) => {
      state = successor;
    },
    resolve: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("one Process Query failed");
      }
      return complete("Scan_1", [first]);
    },
  });

  await assert.rejects(coordinator.begin({ scanId: "Scan_1" }));
  assert.equal(state.scanBarrier?.scanId, "Scan_1");
  assert.deepEqual(
    await coordinator.begin({ scanId: "Scan_1" }),
    complete("Scan_1", [first]),
  );
  assert.equal(attempts, 2);

  const changed = complete("Scan_1", [{
    ...first,
    candidate: {
      ...first.candidate,
      key: { kind: VariableValueKind.String, value: "changed" },
    },
  }]);
  assert.throws(() => coordinator.finish(changed));
  assert.equal(state.scanBarrier?.scanId, "Scan_1");
});

test("does not schedule fanout while one registration is pending", async () => {
  let state = prepareCorrelationCandidateRegistration(
    emptyCorrelationCandidateRegistrationState(),
    address,
    configuration,
    correlationCandidateRegistrationRequestFromRecord(first),
  ).state;
  let attempts = 0;
  const coordinator = new CorrelationCandidateScanCoordinator({
    address,
    configuration,
    currentState: () => state,
    replaceState: (successor) => {
      state = successor;
    },
    resolve: async () => {
      attempts += 1;
      return complete("Scan_2", []);
    },
  });

  assert.deepEqual(await coordinator.begin({ scanId: "Scan_2" }), {
    kind: CorrelationCandidateScanResultKind.BlockedByPendingRegistration,
    scanId: "Scan_2",
    pendingTransactionIds: [first.transactionId],
  });
  assert.equal(attempts, 0);
  assert.equal(state.scanBarrier, null);
});

function activeState(
  record: CorrelationCandidateRegistrationRecord,
): CorrelationCandidateRegistrationState {
  const request = correlationCandidateRegistrationRequestFromRecord(record);
  const prepared = prepareCorrelationCandidateRegistration(
    emptyCorrelationCandidateRegistrationState(),
    address,
    configuration,
    request,
  );
  return finalizeCorrelationCandidateRegistration(
    prepared.state,
    address,
    configuration,
    request,
  ).state;
}

function complete(
  scanId: string,
  registrations: ReadonlyArray<CorrelationCandidateRegistrationRecord>,
): CorrelationCandidateScanCompletion {
  return {
    kind: CorrelationCandidateScanCompletionKind.Complete,
    scanId,
    candidates: registrations.map(({ candidate }) => candidate),
  };
}

function registration(
  transactionId: string,
  processInstanceId: string,
  key: string,
): CorrelationCandidateRegistrationRecord {
  const candidate = {
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
  } as const;
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
