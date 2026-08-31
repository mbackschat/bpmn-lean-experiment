import {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationStoredResolutionKind,
  ProcessCommandResultKind,
  requireCorrelationTargetDeliveryActivityRequest,
  requireCorrelationTargetDeliveryCompletion,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationState,
  CorrelationIngressConfiguration,
  CorrelationPublicationState,
  CorrelationPublicationTarget,
  CorrelationTargetDeliveryActivityRequest,
  CorrelationTargetDeliveryCompletion,
} from "@bpmn-lean/temporal-protocol";

import {
  CorrelationCandidateTargetDisposition,
  requireCorrelationActiveTargetRegistration,
  settleCorrelationCandidateTarget,
} from "./correlation-candidate-registration.js";
import {
  requireCorrelationPublicationSelectedTarget,
  settleCorrelationPublication,
} from "./correlation-publication-admission.js";

export enum CorrelationTargetSettlementKind {
  Committed = "committed",
  TargetInconsistent = "targetInconsistent",
}

export type CorrelationTargetSettlementTransition = Readonly<{
  publicationState: CorrelationPublicationState;
  registrationState: CorrelationCandidateRegistrationState;
  result: Readonly<{
    kind: CorrelationTargetSettlementKind;
    commandId: string;
    ordinal: number;
    target: CorrelationPublicationTarget;
  }>;
}>;

export function correlationTargetDeliveryActivityRequest(
  publicationState: CorrelationPublicationState,
  registrationState: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
): CorrelationTargetDeliveryActivityRequest {
  const inFlight = requireCorrelationPublicationSelectedTarget(
    publicationState,
    address,
    configuration,
  );
  const barrier = registrationState.scanBarrier;
  if (barrier === null || barrier.scanId !== inFlight.contentSha256) {
    throw new TypeError(
      "Correlation target delivery requires one selected in-flight barrier",
    );
  }
  const registration = requireCorrelationActiveTargetRegistration(
    registrationState,
    address,
    configuration,
    inFlight.target,
  );
  return requireCorrelationTargetDeliveryActivityRequest({
    commandId: inFlight.commandId,
    ingressOrdinal: inFlight.ordinal,
    address,
    payload: inFlight.payload,
    target: inFlight.target,
    registration,
    configuration,
  });
}

export function settleCorrelationTargetDelivery(
  publicationState: CorrelationPublicationState,
  registrationState: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  completionValue: CorrelationTargetDeliveryCompletion,
): CorrelationTargetSettlementTransition {
  const request = correlationTargetDeliveryActivityRequest(
    publicationState,
    registrationState,
    address,
    configuration,
  );
  const completion = requireCorrelationTargetDeliveryCompletion(
    completionValue,
    request,
  );
  const scanId = registrationState.scanBarrier?.scanId;
  if (scanId === undefined) {
    throw new TypeError("Correlation target settlement lost its scan barrier");
  }
  const committed = completion.result.kind === ProcessCommandResultKind.Semantic &&
    completion.result.outcome === CommandOutcome.Committed;
  const disposition = committed
    ? CorrelationCandidateTargetDisposition.Removed
    : CorrelationCandidateTargetDisposition.Quarantined;
  const resolution = committed
    ? {
        kind: CorrelationPublicationStoredResolutionKind.Semantic,
        outcome: {
          kind: CorrelationPublicationSemanticOutcomeKind.Committed,
          target: request.target,
        },
      } as const
    : {
        kind: CorrelationPublicationStoredResolutionKind.TargetInconsistent,
        target: request.target,
      } as const;
  const settledPublication = settleCorrelationPublication(
    publicationState,
    address,
    configuration,
    {
      commandId: request.commandId,
      ordinal: request.ingressOrdinal,
      resolution,
    },
  );
  const settledRegistration = settleCorrelationCandidateTarget(
    registrationState,
    address,
    configuration,
    scanId,
    request.target,
    disposition,
  );
  return {
    publicationState: settledPublication.state,
    registrationState: settledRegistration,
    result: {
      kind: committed
        ? CorrelationTargetSettlementKind.Committed
        : CorrelationTargetSettlementKind.TargetInconsistent,
      commandId: request.commandId,
      ordinal: request.ingressOrdinal,
      target: request.target,
    },
  };
}
