import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationCandidateRegistrationPhase,
  CorrelationPublicationAdmissionResultKind,
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationOrderResultKind,
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationStoredResolutionKind,
  ProcessCommandResultKind,
  correlationCandidateRegistrationContentSha256,
  correlationPublicationContentSha256,
  correlationTargetDeliveryStimulus,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationRecord,
  CorrelationCandidateRegistrationState,
  CorrelationPublicationCommand,
  CorrelationPublicationState,
} from "@bpmn-lean/temporal-protocol";
import {
  CorrelationTargetSettlementKind,
  admitCorrelationPublication,
  correlationQuarantinedTarget,
  correlationTargetDeliveryActivityRequest,
  settleCorrelationPublicationAtQuarantinedAddress,
  settleCorrelationTargetDelivery,
  startNextCorrelationPublication,
} from "../dist/index.js";

const configuration = productionCorrelationIngressConfiguration;
const processInstanceId = "ProcessInstance_target";
const candidate = correlatedCandidate();
const registration = activeRegistration();
const command: CorrelationPublicationCommand = {
  commandId: "Publication_target",
  address: candidate.address,
  payload: candidate.key,
};
const target = {
  processInstanceId,
  subscriptionId: candidate.subscriptionId,
};

test("committed delivery removes the exact locator and settles its reserved result", () => {
  const states = selectedStates();
  const request = correlationTargetDeliveryActivityRequest(
    states.publications,
    states.registrations,
    command.address,
    configuration,
  );
  const settled = settleCorrelationTargetDelivery(
    states.publications,
    states.registrations,
    command.address,
    configuration,
    {
      stimulus: correlationTargetDeliveryStimulus(request),
      result: {
        kind: ProcessCommandResultKind.Semantic,
        commandId: command.commandId,
        outcome: CommandOutcome.Committed,
      },
    },
  );

  assert.equal(settled.result.kind, CorrelationTargetSettlementKind.Committed);
  assert.equal(settled.registrationState.scanBarrier, null);
  assert.deepEqual(settled.registrationState.records, []);
  assert.deepEqual(settled.publicationState.ledger[0], {
    ...states.publications.ledger[0],
    phase: CorrelationPublicationLedgerPhase.Settled,
    resolution: {
      kind: CorrelationPublicationStoredResolutionKind.Semantic,
      outcome: {
        kind: CorrelationPublicationSemanticOutcomeKind.Committed,
        target,
      },
    },
  });
});

test("semantic refusal quarantines in place and later admission consumes no slot", () => {
  const states = selectedStates();
  const request = correlationTargetDeliveryActivityRequest(
    states.publications,
    states.registrations,
    command.address,
    configuration,
  );
  const settled = settleCorrelationTargetDelivery(
    states.publications,
    states.registrations,
    command.address,
    configuration,
    {
      stimulus: correlationTargetDeliveryStimulus(request),
      result: {
        kind: ProcessCommandResultKind.Semantic,
        commandId: command.commandId,
        outcome: CommandOutcome.Rejected,
      },
    },
  );

  assert.equal(
    settled.result.kind,
    CorrelationTargetSettlementKind.TargetInconsistent,
  );
  assert.equal(settled.registrationState.records.length, 1);
  assert.equal(
    settled.registrationState.records[0]?.phase,
    CorrelationCandidateRegistrationPhase.Quarantined,
  );
  assert.deepEqual(settled.publicationState.ledger[0]?.resolution, {
    kind: CorrelationPublicationStoredResolutionKind.TargetInconsistent,
    target,
  });
  const before = settled.publicationState;
  const later = admitCorrelationPublication(
    before,
    command.address,
    configuration,
    { ...command, commandId: "Publication_later" },
    correlationQuarantinedTarget(
      settled.registrationState,
      command.address,
      configuration,
    ),
  );
  assert.strictEqual(later.state, before);
  assert.deepEqual(later.result, {
    kind: CorrelationPublicationAdmissionResultKind.AddressQuarantined,
    commandId: "Publication_later",
    target,
  });
});

test("settles an already accepted queued publication when an earlier target quarantines the address", () => {
  const states = selectedStates();
  const queuedCommand = { ...command, commandId: "Publication_already_queued" };
  const withQueued = admitCorrelationPublication(
    states.publications,
    command.address,
    configuration,
    queuedCommand,
  ).state;
  const request = correlationTargetDeliveryActivityRequest(
    withQueued,
    states.registrations,
    command.address,
    configuration,
  );
  const quarantined = settleCorrelationTargetDelivery(
    withQueued,
    states.registrations,
    command.address,
    configuration,
    {
      stimulus: correlationTargetDeliveryStimulus(request),
      result: {
        kind: ProcessCommandResultKind.Semantic,
        commandId: command.commandId,
        outcome: CommandOutcome.Rejected,
      },
    },
  );
  const started = startNextCorrelationPublication(
    quarantined.publicationState,
    command.address,
    configuration,
  );
  assert.equal(started.result.kind, CorrelationPublicationOrderResultKind.Started);

  const settled = settleCorrelationPublicationAtQuarantinedAddress(
    started.state,
    quarantined.registrationState,
    command.address,
    configuration,
  );
  assert.equal(settled.inFlight, null);
  assert.deepEqual(settled.ledger[1], {
    ...started.state.ledger[1],
    phase: CorrelationPublicationLedgerPhase.Settled,
    ordinal: 2,
    target,
    resolution: {
      kind: CorrelationPublicationStoredResolutionKind.TargetInconsistent,
      target,
    },
  });
});

test("malformed recovery cannot clear the retained target or barrier", () => {
  const states = selectedStates();
  const request = correlationTargetDeliveryActivityRequest(
    states.publications,
    states.registrations,
    command.address,
    configuration,
  );
  assert.throws(() => settleCorrelationTargetDelivery(
    states.publications,
    states.registrations,
    command.address,
    configuration,
    {
      stimulus: correlationTargetDeliveryStimulus(request),
      result: {
        kind: ProcessCommandResultKind.ProcessUnknown,
        commandId: command.commandId,
        processInstanceId: "ProcessInstance_other",
      },
    },
  ));
  assert.deepEqual(states.publications.inFlight?.target, target);
  assert.notEqual(states.registrations.scanBarrier, null);
});

function selectedStates(): Readonly<{
  publications: CorrelationPublicationState;
  registrations: CorrelationCandidateRegistrationState;
}> {
  const contentSha256 = correlationPublicationContentSha256(command);
  return {
    publications: {
      nextOrdinal: 2,
      queue: [],
      ledger: [{
        commandId: command.commandId,
        contentSha256,
        phase: CorrelationPublicationLedgerPhase.InFlight,
        ordinal: 1,
        target,
        resolution: null,
      }],
      inFlight: {
        commandId: command.commandId,
        contentSha256,
        ordinal: 1,
        payload: command.payload,
        target,
      },
    },
    registrations: {
      records: [registration],
      scanBarrier: {
        scanId: contentSha256,
        candidates: [registration],
      },
    },
  };
}

function activeRegistration(): CorrelationCandidateRegistrationRecord {
  const base = {
    transactionId: "Registration_target",
    candidate,
    processLocator: { workflowId: "bpmn-process-sha256:target" },
  };
  return {
    ...base,
    contentSha256: correlationCandidateRegistrationContentSha256(base),
    phase: CorrelationCandidateRegistrationPhase.Active,
  };
}

function correlatedCandidate() {
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
    key: { kind: VariableValueKind.String, value: "settlement-42" },
  } as const;
}
