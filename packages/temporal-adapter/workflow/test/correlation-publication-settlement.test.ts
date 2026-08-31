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
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationOrderResultKind,
  CorrelationPublicationScanResolutionKind,
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationStoredResolutionKind,
  correlationCandidateRegistrationContentSha256,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationRecord,
  CorrelationCandidateRegistrationState,
  CorrelationCandidateScanCompletion,
  CorrelationPublicationCommand,
} from "@bpmn-lean/temporal-protocol";
import {
  admitCorrelationPublication,
  beginCorrelationCandidateScan,
  emptyCorrelationCandidateRegistrationState,
  emptyCorrelationPublicationState,
  finalizeCorrelationCandidateRegistration,
  prepareCorrelationCandidateRegistration,
  resolveCorrelationPublicationScan,
  startNextCorrelationPublication,
} from "../dist/index.js";

const configuration = productionCorrelationIngressConfiguration;
const candidateOne = candidate("Process_1", "settlement-42");
const candidateTwo = candidate("Process_2", "settlement-42");
const address = candidateOne.address;

test("settles no-match in place, releases its barrier, then starts the next ordinal", () => {
  const first = publication("Publication_1", "absent");
  const second = publication("Publication_2", "settlement-42");
  let publications = admitCorrelationPublication(
    emptyCorrelationPublicationState(),
    address,
    configuration,
    first,
  ).state;
  publications = admitCorrelationPublication(
    publications,
    address,
    configuration,
    second,
  ).state;
  const started = startNextCorrelationPublication(
    publications,
    address,
    configuration,
  );
  assert.equal(started.result.kind, CorrelationPublicationOrderResultKind.Started);
  const registrations = scanState(
    [registration(candidateOne)],
    started.state.inFlight!.contentSha256,
  );

  const resolved = resolveCorrelationPublicationScan(
    started.state,
    registrations,
    address,
    configuration,
    completion(registrations),
  );
  assert.equal(
    resolved.result.kind,
    CorrelationPublicationScanResolutionKind.RejectedNoMatch,
  );
  assert.equal(resolved.registrationState.scanBarrier, null);
  assert.deepEqual(resolved.publicationState.ledger[0], {
    ...started.state.ledger[0],
    phase: CorrelationPublicationLedgerPhase.Settled,
    resolution: {
      kind: CorrelationPublicationStoredResolutionKind.Semantic,
      outcome: { kind: CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch },
    },
  });
  const next = startNextCorrelationPublication(
    resolved.publicationState,
    address,
    configuration,
  );
  assert.equal(next.result.kind, CorrelationPublicationOrderResultKind.Started);
  assert.equal(next.result.command.commandId, second.commandId);
  assert.equal(next.result.ordinal, 2);
});

test("settles ambiguity without selecting by candidate order", () => {
  const command = publication("Publication_ambiguous", "settlement-42");
  const started = start(command);
  for (const records of [
    [registration(candidateOne), registration(candidateTwo)],
    [registration(candidateTwo), registration(candidateOne)],
  ]) {
    const registrations = scanState(records, started.inFlight!.contentSha256);
    const resolved = resolveCorrelationPublicationScan(
      started,
      registrations,
      address,
      configuration,
      completion(registrations),
    );
    assert.equal(
      resolved.result.kind,
      CorrelationPublicationScanResolutionKind.RejectedAmbiguous,
    );
    assert.equal(resolved.registrationState.scanBarrier, null);
  }
});

test("retains the unique target and barrier without delivering", () => {
  const command = publication("Publication_unique", "settlement-42");
  const started = start(command);
  const registrations = scanState(
    [registration(candidateOne)],
    started.inFlight!.contentSha256,
  );
  const exactCompletion = completion(registrations);
  const selected = resolveCorrelationPublicationScan(
    started,
    registrations,
    address,
    configuration,
    exactCompletion,
  );
  assert.equal(
    selected.result.kind,
    CorrelationPublicationScanResolutionKind.TargetSelected,
  );
  assert.strictEqual(selected.registrationState, registrations);
  assert.deepEqual(selected.publicationState.inFlight?.target, {
    processInstanceId: candidateOne.processInstanceId,
    subscriptionId: candidateOne.subscriptionId,
  });
  assert.equal(selected.publicationState.ledger[0]?.resolution, null);
  assert.equal(selected.registrationState.scanBarrier?.scanId, exactCompletion.scanId);

  const retained = resolveCorrelationPublicationScan(
    selected.publicationState,
    selected.registrationState,
    address,
    configuration,
    { ...exactCompletion, candidates: [] },
  );
  assert.strictEqual(retained.publicationState, selected.publicationState);
  assert.strictEqual(retained.registrationState, selected.registrationState);
  assert.deepEqual(retained.result, selected.result);

  assert.throws(() =>
    resolveCorrelationPublicationScan(
      started,
      registrations,
      address,
      configuration,
      { ...exactCompletion, candidates: [] },
    )
  );
  assert.equal(started.inFlight?.target, null);
  assert.notEqual(registrations.scanBarrier, null);
});

function start(command: CorrelationPublicationCommand) {
  const admitted = admitCorrelationPublication(
    emptyCorrelationPublicationState(),
    address,
    configuration,
    command,
  );
  const started = startNextCorrelationPublication(
    admitted.state,
    address,
    configuration,
  );
  assert.equal(started.result.kind, CorrelationPublicationOrderResultKind.Started);
  return started.state;
}

function publication(commandId: string, value: string): CorrelationPublicationCommand {
  return {
    commandId,
    address,
    payload: { kind: VariableValueKind.String, value },
  };
}

function scanState(
  records: CorrelationCandidateRegistrationRecord[],
  scanId: string,
): CorrelationCandidateRegistrationState {
  let state = emptyCorrelationCandidateRegistrationState();
  for (const record of records) {
    const request = {
      transactionId: record.transactionId,
      candidate: record.candidate,
      processLocator: record.processLocator,
    };
    state = prepareCorrelationCandidateRegistration(
      state,
      address,
      configuration,
      request,
    ).state;
    state = finalizeCorrelationCandidateRegistration(
      state,
      address,
      configuration,
      request,
    ).state;
  }
  return beginCorrelationCandidateScan(
    state,
    address,
    configuration,
    scanId,
  ).state;
}

function completion(
  state: CorrelationCandidateRegistrationState,
): CorrelationCandidateScanCompletion {
  assert.notEqual(state.scanBarrier, null);
  return {
    kind: CorrelationCandidateScanCompletionKind.Complete,
    scanId: state.scanBarrier!.scanId,
    candidates: state.scanBarrier!.candidates.map(({ candidate }) => candidate),
  };
}

function registration(
  correlated: CorrelatedMessageCandidate,
): CorrelationCandidateRegistrationRecord {
  const base = {
    transactionId: `Registration_${correlated.processInstanceId}`,
    candidate: correlated,
    processLocator: { workflowId: `bpmn-process-sha256:${correlated.processInstanceId}` },
  };
  return {
    ...base,
    contentSha256: correlationCandidateRegistrationContentSha256(base),
    phase: CorrelationCandidateRegistrationPhase.Active,
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
