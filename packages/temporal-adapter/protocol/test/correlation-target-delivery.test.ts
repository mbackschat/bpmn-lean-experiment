import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  MessageChannelKind,
  SemanticProcessCompilerId,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationCandidateRegistrationPhase,
  ProcessCommandResultKind,
  correlationCandidateRegistrationContentSha256,
  correlationTargetDeliveryStimulus,
  productionCorrelationIngressConfiguration,
  requireCorrelationTargetDeliveryActivityRequest,
  requireCorrelationTargetDeliveryCompletion,
} from "../dist/index.js";

const processInstanceId = "ProcessInstance_target";
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
  key: { kind: VariableValueKind.String, value: "settlement-42" },
} as const;
const registrationRequest = {
  transactionId: "Registration_target",
  candidate,
  processLocator: { workflowId: "bpmn-process-sha256:target" },
} as const;
const registration = {
  ...registrationRequest,
  contentSha256: correlationCandidateRegistrationContentSha256(
    registrationRequest,
  ),
  phase: CorrelationCandidateRegistrationPhase.Active,
} as const;
const request = {
  commandId: "Publication_target",
  ingressOrdinal: 7,
  address: candidate.address,
  payload: candidate.key,
  target: {
    processInstanceId,
    subscriptionId: candidate.subscriptionId,
  },
  registration,
  configuration: productionCorrelationIngressConfiguration,
} as const;

test("derives and validates one exact content-bound target stimulus", () => {
  assert.deepEqual(correlationTargetDeliveryStimulus(request), {
    kind: StimulusKind.DeliverCorrelatedPayloadMessage,
    commandId: request.commandId,
    address: request.address,
    ingressOrdinal: request.ingressOrdinal,
    subscriptionId: request.target.subscriptionId,
    correlationPropertyId: candidate.correlationPropertyId,
    processPropertyId: candidate.processPropertyId,
    payload: request.payload,
  });
  const stimulus = correlationTargetDeliveryStimulus(request);
  assert.deepEqual(requireCorrelationTargetDeliveryCompletion({
    stimulus,
    result: {
      kind: ProcessCommandResultKind.Semantic,
      commandId: request.commandId,
      outcome: CommandOutcome.Committed,
    },
  }, request), {
    stimulus,
    result: {
      kind: ProcessCommandResultKind.Semantic,
      commandId: request.commandId,
      outcome: CommandOutcome.Committed,
    },
  });
});

test("rejects a changed target, inactive locator, or widened completion", () => {
  assert.throws(() => requireCorrelationTargetDeliveryActivityRequest({
    ...request,
    target: {
      ...request.target,
      processInstanceId: "ProcessInstance_other",
    },
  }));
  assert.throws(() => requireCorrelationTargetDeliveryActivityRequest({
    ...request,
    registration: {
      ...registration,
      phase: CorrelationCandidateRegistrationPhase.Quarantined,
    },
  }));
  assert.throws(() => requireCorrelationTargetDeliveryCompletion({
    stimulus: correlationTargetDeliveryStimulus(request),
    result: {
      kind: ProcessCommandResultKind.ProcessUnknown,
      commandId: request.commandId,
      processInstanceId: "ProcessInstance_other",
    },
    extra: true,
  }, request));
});
