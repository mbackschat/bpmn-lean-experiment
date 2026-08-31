import {
  CommandOutcome,
  StimulusKind,
  isWellFormedStimulus,
  sameCorrelatedMessageAddress,
  sameOccurrenceId,
  sameStimulus,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
  DeepReadonly,
  DeliverCorrelatedPayloadMessageStimulus,
} from "@bpmn-lean/semantic-core";

import {
  CorrelationCandidateRegistrationPhase,
  correlationCandidateRegistrationContentSha256,
  requireCorrelationCandidateRegistrationRequest,
} from "./correlation-candidate-registration.js";
import type {
  CorrelationCandidateRegistrationRecord,
} from "./correlation-candidate-registration.js";
import {
  requireCorrelationIngressConfiguration,
} from "./correlation-ingress.js";
import type {
  CorrelationIngressConfiguration,
} from "./correlation-ingress.js";
import {
  requireCorrelationPublicationCommand,
  requireCorrelationPublicationTarget,
} from "./correlation-publication-admission.js";
import type {
  CorrelationPublicationPayload,
  CorrelationPublicationTarget,
} from "./correlation-publication-admission.js";
import {
  isTerminalProcessReceipt,
} from "./lifecycle-results.js";
import {
  ProcessCommandResultKind,
} from "./contracts.js";
import type {
  ProcessCommandResult,
} from "./contracts.js";
import {
  canonicalWorkflowChainJson,
} from "./workflow-chain.js";

export const bpmnDeliverCorrelatedMessageUpdateName =
  "bpmn-deliver-correlated-message";
export const bpmnResolveCorrelationTargetDeliveryActivityName =
  "resolveBpmnCorrelationTargetDelivery";

export type CorrelationTargetDeliveryActivityRequest = DeepReadonly<{
  commandId: string;
  ingressOrdinal: number;
  address: CorrelatedMessageAddress;
  payload: CorrelationPublicationPayload;
  target: CorrelationPublicationTarget;
  registration: CorrelationCandidateRegistrationRecord;
  configuration: CorrelationIngressConfiguration;
}>;

export type CorrelationTargetDeliveryCompletion = DeepReadonly<{
  stimulus: DeliverCorrelatedPayloadMessageStimulus;
  result: ProcessCommandResult;
}>;

export type CorrelationTargetDeliveryActivities = Readonly<{
  [bpmnResolveCorrelationTargetDeliveryActivityName]: (
    request: CorrelationTargetDeliveryActivityRequest,
  ) => Promise<CorrelationTargetDeliveryCompletion>;
}>;

export type BpmnDeliverCorrelatedMessageUpdateArguments = [
  stimulus: DeliverCorrelatedPayloadMessageStimulus,
];

export function requireCorrelationTargetDeliveryActivityRequest(
  value: unknown,
): CorrelationTargetDeliveryActivityRequest {
  if (!isRecordWithExactKeys(value, [
    "commandId",
    "ingressOrdinal",
    "address",
    "payload",
    "target",
    "registration",
    "configuration",
  ])) {
    throw new TypeError("Correlation target-delivery Activity request is malformed");
  }
  const configuration = requireCorrelationIngressConfiguration(value.configuration);
  const publication = requireCorrelationPublicationCommand({
    commandId: value.commandId,
    address: value.address,
    payload: value.payload,
  });
  const target = requireCorrelationPublicationTarget(value.target);
  const registration = requireActiveRegistration(value.registration);
  if (!Number.isSafeInteger(value.ingressOrdinal) ||
    Number(value.ingressOrdinal) < 1 ||
    !sameCorrelatedMessageAddress(registration.candidate.address, publication.address) ||
    registration.candidate.processInstanceId !== target.processInstanceId ||
    !sameOccurrenceId(registration.candidate.subscriptionId, target.subscriptionId)) {
    throw new TypeError("Correlation target-delivery identity changed");
  }
  const request = {
    commandId: publication.commandId,
    ingressOrdinal: Number(value.ingressOrdinal),
    address: publication.address,
    payload: publication.payload,
    target,
    registration,
    configuration,
  } satisfies CorrelationTargetDeliveryActivityRequest;
  requireActivityByteBound(request, configuration);
  return request;
}

export function correlationTargetDeliveryStimulus(
  requestValue: CorrelationTargetDeliveryActivityRequest,
): DeliverCorrelatedPayloadMessageStimulus {
  const request = requireCorrelationTargetDeliveryActivityRequest(requestValue);
  const stimulus = {
    kind: StimulusKind.DeliverCorrelatedPayloadMessage,
    commandId: request.commandId,
    address: request.address,
    ingressOrdinal: request.ingressOrdinal,
    subscriptionId: request.target.subscriptionId,
    correlationPropertyId: request.registration.candidate.correlationPropertyId,
    processPropertyId: request.registration.candidate.processPropertyId,
    payload: request.payload,
  } satisfies DeliverCorrelatedPayloadMessageStimulus;
  if (!isWellFormedStimulus(stimulus)) {
    throw new TypeError("Correlation target-delivery stimulus is malformed");
  }
  return stimulus;
}

export function requireCorrelationTargetDeliveryCompletion(
  value: unknown,
  requestValue: CorrelationTargetDeliveryActivityRequest,
): CorrelationTargetDeliveryCompletion {
  const request = requireCorrelationTargetDeliveryActivityRequest(requestValue);
  if (!isRecordWithExactKeys(value, ["stimulus", "result"]) ||
    !isWellFormedStimulus(value.stimulus) ||
    value.stimulus.kind !== StimulusKind.DeliverCorrelatedPayloadMessage ||
    !sameStimulus(value.stimulus, correlationTargetDeliveryStimulus(request))) {
    throw new TypeError("Correlation target-delivery completion changed its stimulus");
  }
  const result = requireTargetProcessResult(value.result, request);
  const completion = {
    stimulus: value.stimulus,
    result,
  } satisfies CorrelationTargetDeliveryCompletion;
  requireActivityByteBound(completion, request.configuration);
  return completion;
}

function requireActiveRegistration(
  value: unknown,
): CorrelationCandidateRegistrationRecord {
  if (!isRecordWithExactKeys(value, [
    "transactionId",
    "contentSha256",
    "phase",
    "candidate",
    "processLocator",
  ]) || value.phase !== CorrelationCandidateRegistrationPhase.Active) {
    throw new TypeError("Correlation target delivery requires one active registration");
  }
  const request = requireCorrelationCandidateRegistrationRequest({
    transactionId: value.transactionId,
    candidate: value.candidate,
    processLocator: value.processLocator,
  });
  if (value.contentSha256 !== correlationCandidateRegistrationContentSha256(request)) {
    throw new TypeError("Correlation target registration changed content identity");
  }
  return {
    ...request,
    contentSha256: value.contentSha256,
    phase: CorrelationCandidateRegistrationPhase.Active,
  };
}

function requireTargetProcessResult(
  value: unknown,
  request: CorrelationTargetDeliveryActivityRequest,
): ProcessCommandResult {
  if (!isRecord(value) || value.commandId !== request.commandId) {
    throw new TypeError("Correlation target Process result changed command identity");
  }
  switch (value.kind) {
    case ProcessCommandResultKind.Semantic:
      if (!isRecordWithExactKeys(value, ["kind", "commandId", "outcome"]) ||
        !Object.values(CommandOutcome).includes(value.outcome as CommandOutcome)) {
        break;
      }
      return value as ProcessCommandResult;
    case ProcessCommandResultKind.ProcessClosed:
      if (!isRecordWithExactKeys(value, ["kind", "commandId", "receipt"]) ||
        !isTerminalProcessReceipt(value.receipt) ||
        value.receipt.processInstanceId !== request.target.processInstanceId) {
        break;
      }
      return value as ProcessCommandResult;
    case ProcessCommandResultKind.ProcessUnknown:
      if (!isRecordWithExactKeys(value, [
        "kind",
        "commandId",
        "processInstanceId",
      ]) || value.processInstanceId !== request.target.processInstanceId) {
        break;
      }
      return value as ProcessCommandResult;
  }
  throw new TypeError("Correlation target Process result is malformed");
}

function requireActivityByteBound(
  value: unknown,
  configuration: CorrelationIngressConfiguration,
): void {
  const observedBytes = utf8ByteLength(canonicalWorkflowChainJson(value));
  if (observedBytes > configuration.maxActivityPayloadBytes) {
    throw new TypeError("Correlation target-delivery Activity payload exceeds its byte bound");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordWithExactKeys<const Key extends string>(
  value: unknown,
  keys: ReadonlyArray<Key>,
): value is Record<Key, unknown> {
  return isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}
