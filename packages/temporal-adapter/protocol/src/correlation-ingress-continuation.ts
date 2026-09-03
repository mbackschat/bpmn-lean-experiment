import type {
  CorrelatedMessageAddress,
  DeepReadonly,
} from "@bpmn-lean/semantic-core";

import {
  workflowChainCanonicalUtf8ByteLength,
} from "./workflow-chain.js";
import type {
  CorrelationCandidateRegistrationState,
} from "./correlation-candidate-registration.js";
import type {
  CorrelationIngressConfiguration,
} from "./correlation-ingress.js";
import type {
  CorrelationPublicationState,
} from "./correlation-publication-admission.js";

export const bpmnCorrelationIngressContinuationV1 =
  "bpmn-lean.correlation-ingress-continuation.v1" as const;

export enum CorrelationIngressInFlightPhase {
  CandidateFanout = "candidateFanout",
  TargetDelivery = "targetDelivery",
}

export type CorrelationIngressContinuationV1 = DeepReadonly<{
  protocol: typeof bpmnCorrelationIngressContinuationV1;
  runOrdinal: number;
  registrationState: CorrelationCandidateRegistrationState;
  publicationState: CorrelationPublicationState;
  inFlightPhase: CorrelationIngressInFlightPhase | null;
}>;

export type CorrelationIngressContinuationBudgetViolation = Readonly<{
  configuredBound: number;
  observedValue: number;
}>;

/** Measures Temporal's three separate payloads without charging synthetic tuple punctuation. */
export function correlationIngressContinuationArgumentBytes(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  continuation: CorrelationIngressContinuationV1,
): number {
  return [address, configuration, continuation].reduce(
    (total, value) =>
      total + workflowChainCanonicalUtf8ByteLength(value),
    0,
  );
}

export function correlationIngressContinuationBudgetViolation(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  continuation: CorrelationIngressContinuationV1,
): CorrelationIngressContinuationBudgetViolation | null {
  const observedValue = correlationIngressContinuationArgumentBytes(
    address,
    configuration,
    continuation,
  );
  return observedValue <= configuration.maxContinuationArgumentBytes
    ? null
    : {
        configuredBound: configuration.maxContinuationArgumentBytes,
        observedValue,
      };
}
