import assert from "node:assert/strict";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
  CorrelatedMessageCandidate,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationCandidateRegistrationPhase,
  CorrelationIngressInFlightPhase,
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationOrderResultKind,
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationStoredResolutionKind,
  bpmnCorrelationIngressContinuationV1,
  correlationCandidateRegistrationContentSha256,
  correlationIngressContinuationArgumentBytes,
  correlationIngressContinuationBudgetViolation,
  productionCorrelationIngressConfiguration,
  workflowChainCanonicalUtf8ByteLength,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationState,
  CorrelationIngressConfiguration,
  CorrelationIngressContinuationV1,
  CorrelationPublicationState,
} from "@bpmn-lean/temporal-protocol";
import { ApplicationFailure } from "@temporalio/workflow";

import {
  admitCorrelationPublication,
  beginCorrelationCandidateScan,
  buildCorrelationIngressSuccessor,
  emptyCorrelationCandidateRegistrationState,
  emptyCorrelationPublicationState,
  finalizeCorrelationCandidateRegistration,
  prepareCorrelationCandidateRegistration,
  reserveCorrelationPublicationTarget,
  restoreCorrelationIngressState,
  startNextCorrelationPublication,
} from "../dist/index.js";

const configuration = productionCorrelationIngressConfiguration;
const address: CorrelatedMessageAddress = {
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
};

test("accepts the exact separately encoded ingress aggregate and refuses one byte over", () => {
  const exact = aggregateArguments(configuration.maxContinuationArgumentBytes);
  assert.equal(correlationIngressContinuationBudgetViolation(...exact), null);

  const oneOver = aggregateArguments(
    configuration.maxContinuationArgumentBytes + 1,
  );
  assert.deepEqual(correlationIngressContinuationBudgetViolation(...oneOver), {
    configuredBound: configuration.maxContinuationArgumentBytes,
    observedValue: configuration.maxContinuationArgumentBytes + 1,
  });
});

test("restores the exact ingress aggregate and rejects one byte over", () => {
  const exact = restorableAggregateArguments(
    configuration.maxContinuationArgumentBytes,
  );
  assert.equal(
    correlationIngressContinuationArgumentBytes(...exact),
    configuration.maxContinuationArgumentBytes,
  );
  assert.deepEqual(
    restoreCorrelationIngressState(...exact),
    { ...stableRuntime(), runOrdinal: 2 },
  );

  const oneOver = restorableAggregateArguments(
    configuration.maxContinuationArgumentBytes + 1,
  );
  assertInvalidContinuationFor(...oneOver);
});

test("builds required Run 128 and refuses Run 129 before reading retained state", () => {
  const stable = stableRuntime();
  const run128 = buildCorrelationIngressSuccessor(
    address,
    configuration,
    { ...stable, runOrdinal: 127 },
  );
  assert.equal(run128[2].runOrdinal, 128);

  let stateRead = false;
  const exhausted = {
    runOrdinal: 128,
    get registrationState(): CorrelationCandidateRegistrationState {
      stateRead = true;
      throw new Error("retained state must not be read after Run exhaustion");
    },
    get publicationState(): CorrelationPublicationState {
      stateRead = true;
      throw new Error("retained state must not be read after Run exhaustion");
    },
    get inFlightPhase(): null {
      stateRead = true;
      throw new Error("retained state must not be read after Run exhaustion");
    },
  };
  assert.throws(
    () => buildCorrelationIngressSuccessor(address, configuration, exhausted),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === "BpmnCorrelationIngressRunCapacityExhausted" &&
      error.nonRetryable === true &&
      error.details?.[0]?.configuredBound === 128 &&
      error.details?.[0]?.observedValue === 129 &&
      error.details?.[0]?.runOrdinal === 128,
  );
  assert.equal(stateRead, false);
});

test("restores a failed fanout only when the barrier and reservation remain exact", () => {
  const runtime = candidateFanoutRuntime();
  const successor = buildCorrelationIngressSuccessor(
    address,
    configuration,
    runtime,
  );
  const restored = restoreCorrelationIngressState(
    address,
    configuration,
    successor[2],
  );
  assert.deepEqual(restored, { ...runtime, runOrdinal: 2 });

  const wrongBarrier = {
    ...successor[2],
    registrationState: {
      ...successor[2].registrationState,
      scanBarrier: {
        ...successor[2].registrationState.scanBarrier!,
        scanId: "f".repeat(64),
      },
    },
  };
  assertInvalidContinuation(wrongBarrier);

  assertInvalidContinuation(withQuarantinedRegistration(successor[2]));

  const changedQueuePayload = queuedSuccessor();
  changedQueuePayload.publicationState.queue[0]!.payload = {
    kind: VariableValueKind.String,
    value: "substituted",
  };
  assertInvalidContinuation(changedQueuePayload);
});

test("carries an assigned publication while pending registration blocks its barrier", () => {
  const pendingRegistration = prepareCorrelationCandidateRegistration(
    emptyCorrelationCandidateRegistrationState(),
    address,
    configuration,
    registrationRequest(),
  ).state;
  const started = startNextCorrelationPublication(
    admittedPublicationState("Publication_Pending", "settlement-42"),
    address,
    configuration,
  );
  assert.equal(started.result.kind, CorrelationPublicationOrderResultKind.Started);
  const runtime = {
    runOrdinal: 1,
    registrationState: pendingRegistration,
    publicationState: started.state,
    inFlightPhase: CorrelationIngressInFlightPhase.CandidateFanout,
  } as const;

  const successor = buildCorrelationIngressSuccessor(
    address,
    configuration,
    runtime,
  );
  assert.deepEqual(
    restoreCorrelationIngressState(address, configuration, successor[2]),
    { ...runtime, runOrdinal: 2 },
  );

  assertInvalidContinuation({
    ...successor[2],
    registrationState: emptyCorrelationCandidateRegistrationState(),
  });
});

test("rejects either half of a selected target and never permits a rematch", () => {
  const runtime = targetDeliveryRuntime();
  const successor = buildCorrelationIngressSuccessor(
    address,
    configuration,
    runtime,
  );
  assert.deepEqual(
    restoreCorrelationIngressState(address, configuration, successor[2]),
    { ...runtime, runOrdinal: 2 },
  );

  const ledgerTargetRemoved = structuredClone(successor[2]);
  const ledgerRecord = ledgerTargetRemoved.publicationState.ledger.find(
    ({ phase }) => phase === "inFlight",
  );
  assert.ok(ledgerRecord !== undefined);
  ledgerRecord.target = null;
  assertInvalidContinuation(ledgerTargetRemoved);

  const inFlightTargetRemoved = structuredClone(successor[2]);
  assert.ok(inFlightTargetRemoved.publicationState.inFlight !== null);
  inFlightTargetRemoved.publicationState.inFlight.target = null;
  assertInvalidContinuation(inFlightTargetRemoved);

  assertInvalidContinuation(withQuarantinedRegistration(successor[2]));

  assertInvalidContinuation({ ...successor[2], unexpected: true });
});

test("rejects a settled ordinal after an earlier in-flight reservation", () => {
  let publicationState = admittedPublicationState(
    "Publication_InFlight",
    "settlement-42",
  );
  publicationState = admitCorrelationPublication(
    publicationState,
    address,
    configuration,
    {
      commandId: "Publication_ImproperlySettled",
      address,
      payload: { kind: VariableValueKind.String, value: "settlement-43" },
    },
  ).state;
  publicationState = admitCorrelationPublication(
    publicationState,
    address,
    configuration,
    {
      commandId: "Publication_Queued",
      address,
      payload: { kind: VariableValueKind.String, value: "settlement-44" },
    },
  ).state;
  const started = startNextCorrelationPublication(
    publicationState,
    address,
    configuration,
  );
  assert.equal(started.result.kind, CorrelationPublicationOrderResultKind.Started);
  const runtime = candidateFanoutRuntimeWithPublicationState(started.state);
  const impossible = structuredClone(buildCorrelationIngressSuccessor(
    address,
    configuration,
    runtime,
  )[2]);
  const later = impossible.publicationState.ledger[1];
  assert.ok(later !== undefined);
  later.phase = CorrelationPublicationLedgerPhase.Settled;
  later.ordinal = 2;
  later.resolution = {
    kind: CorrelationPublicationStoredResolutionKind.Semantic,
    outcome: {
      kind: CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch,
    },
  };
  impossible.publicationState.nextOrdinal = 3;
  impossible.publicationState.queue.splice(0, 1);

  assertInvalidContinuation(impossible);
});

test("rejects a forged incoming Run 129 as continuation-invalid", () => {
  const continuation = buildCorrelationIngressSuccessor(
    address,
    configuration,
    { ...stableRuntime(), runOrdinal: 127 },
  )[2];
  assertInvalidContinuation({ ...continuation, runOrdinal: 129 });
});

function stableRuntime() {
  return {
    runOrdinal: 1,
    registrationState: emptyCorrelationCandidateRegistrationState(),
    publicationState: emptyCorrelationPublicationState(),
    inFlightPhase: null,
  } as const;
}

function candidateFanoutRuntime() {
  let publicationState = admittedPublicationState("Publication_1", "settlement-42");
  const started = startNextCorrelationPublication(
    publicationState,
    address,
    configuration,
  );
  assert.equal(started.result.kind, CorrelationPublicationOrderResultKind.Started);
  if (started.result.kind !== CorrelationPublicationOrderResultKind.Started) {
    assert.fail("publication did not start");
  }
  publicationState = started.state;
  return candidateFanoutRuntimeWithPublicationState(publicationState);
}

function candidateFanoutRuntimeWithPublicationState(
  publicationState: CorrelationPublicationState,
) {
  let registrationState = activeRegistrationState();
  assert.ok(publicationState.inFlight !== null);
  registrationState = beginCorrelationCandidateScan(
    registrationState,
    address,
    configuration,
    publicationState.inFlight.contentSha256,
  ).state;
  return {
    runOrdinal: 1,
    registrationState,
    publicationState,
    inFlightPhase: CorrelationIngressInFlightPhase.CandidateFanout,
  } as const;
}

function targetDeliveryRuntime() {
  const candidateFanout = candidateFanoutRuntime();
  const target = {
    processInstanceId: "ProcessInstance_1",
    subscriptionId: {
      processInstanceId: "ProcessInstance_1",
      elementId: "Catch_SettlementConfirmed",
      activation: 1,
    },
  };
  return {
    ...candidateFanout,
    publicationState: reserveCorrelationPublicationTarget(
      candidateFanout.publicationState,
      address,
      configuration,
      candidateFanout.publicationState.inFlight!.commandId,
      candidateFanout.publicationState.inFlight!.ordinal,
      target,
    ),
    inFlightPhase: CorrelationIngressInFlightPhase.TargetDelivery,
  } as const;
}

function activeRegistrationState(): CorrelationCandidateRegistrationState {
  const request = registrationRequest();
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

function registrationRequest() {
  return {
    transactionId: "Registration_1",
    candidate: candidate(),
    processLocator: { workflowId: "bpmn-process-sha256:process-1" },
  } as const;
}

function admittedPublicationState(
  commandId: string,
  key: string,
): CorrelationPublicationState {
  return admitCorrelationPublication(
    emptyCorrelationPublicationState(),
    address,
    configuration,
    {
      commandId,
      address,
      payload: { kind: VariableValueKind.String, value: key },
    },
  ).state;
}

function queuedSuccessor(): CorrelationIngressContinuationV1 & {
  publicationState: {
    queue: Array<{ payload: { kind: VariableValueKind.String; value: string } }>;
  };
} {
  const state = admittedPublicationState("Publication_Queued", "queued");
  return structuredClone(buildCorrelationIngressSuccessor(
    address,
    configuration,
    {
      runOrdinal: 1,
      registrationState: emptyCorrelationCandidateRegistrationState(),
      publicationState: state,
      inFlightPhase: null,
    },
  )[2]) as never;
}

function candidate(): CorrelatedMessageCandidate {
  return {
    address,
    processInstanceId: "ProcessInstance_1",
    subscriptionId: {
      processInstanceId: "ProcessInstance_1",
      elementId: "Catch_SettlementConfirmed",
      activation: 1,
    },
    correlationPropertyId: "CorrelationProperty_SettlementReference",
    processPropertyId: "Property_SettlementReference",
    key: { kind: VariableValueKind.String, value: "settlement-42" },
  };
}

function assertInvalidContinuation(value: unknown): void {
  assertInvalidContinuationFor(address, configuration, value);
}

function assertInvalidContinuationFor(
  selectedAddress: CorrelatedMessageAddress,
  selectedConfiguration: CorrelationIngressConfiguration,
  value: unknown,
): void {
  assert.throws(
    () => restoreCorrelationIngressState(
      selectedAddress,
      selectedConfiguration,
      value,
    ),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === "BpmnCorrelationIngressContinuationInvalid" &&
      error.nonRetryable === true,
  );
}

function restorableAggregateArguments(
  aggregateBytes: number,
): readonly [
  CorrelatedMessageAddress,
  CorrelationIngressConfiguration,
  CorrelationIngressContinuationV1,
] {
  const continuation: CorrelationIngressContinuationV1 = {
    protocol: bpmnCorrelationIngressContinuationV1,
    runOrdinal: 2,
    registrationState: emptyCorrelationCandidateRegistrationState(),
    publicationState: emptyCorrelationPublicationState(),
    inFlightPhase: null,
  };
  const baseBytes = correlationIngressContinuationArgumentBytes(
    address,
    configuration,
    continuation,
  );
  assert.ok(aggregateBytes >= baseBytes);
  return [
    {
      ...address,
      processId: address.processId + "x".repeat(aggregateBytes - baseBytes),
    },
    configuration,
    continuation,
  ];
}

function withQuarantinedRegistration(
  continuation: CorrelationIngressContinuationV1,
): CorrelationIngressContinuationV1 {
  const quarantinedRequest = {
    ...registrationRequest(),
    transactionId: "Registration_Quarantined",
  };
  return {
    ...continuation,
    registrationState: {
      ...continuation.registrationState,
      records: [
        ...continuation.registrationState.records,
        {
          transactionId: quarantinedRequest.transactionId,
          contentSha256: correlationCandidateRegistrationContentSha256(
            quarantinedRequest,
          ),
          phase: CorrelationCandidateRegistrationPhase.Quarantined,
          candidate: quarantinedRequest.candidate,
          processLocator: quarantinedRequest.processLocator,
        },
      ],
    },
  };
}

function aggregateArguments(
  aggregateBytes: number,
): readonly [
  CorrelatedMessageAddress,
  CorrelationIngressConfiguration,
  CorrelationIngressContinuationV1,
] {
  return [
    encodedString(2, "a") as unknown as CorrelatedMessageAddress,
    configuration,
    encodedString(
      aggregateBytes - 2 - workflowChainCanonicalUtf8ByteLength(configuration),
      "x",
    ) as unknown as CorrelationIngressContinuationV1,
  ];
}

function encodedString(bytes: number, character: string): string {
  assert.ok(bytes >= 2);
  return character.repeat(bytes - 2);
}
